import "server-only";
import type { Db, Q } from "./driver";
import type { Session, User } from "../../types";
import { Forbidden, UserError } from "../errors";
import { isAdmin } from "../security";
import { newId, slugify } from "../../util";
import { searchText } from "../../search-norm";
import { normalizeTitle } from "../../spotify-import";
import { artistHue, dateOrNull, generatedCover, rawId } from "../import-helpers";
import type { ExternalTrack } from "../catalogue-core";
import type { ImportedEntry } from "../commands-types";
import type { ListData, LogData, ProfileData } from "../commands-json";
import { toUser } from "./mappers";
import { C } from "./helpers";

// Every write, as SQL. Each command is one transaction and mirrors its twin in
// commands-json.ts check for check: existence, ownership, visibility, blocks, limits,
// notifications and activity. song_stats is kept by database triggers, so unlike the
// JSON store nothing here recomputes it. tests/sql-writes-parity runs the same
// scenario against both and compares the resulting databases.

const now = () => new Date().toISOString();
const isUnique = (e: unknown) => (e as { code?: string })?.code === "23505" || /duplicate key|unique constraint/i.test((e as Error)?.message ?? "");

type NotificationType = "follow" | "review_like" | "review_comment" | "list_like" | "list_comment" | "comment_reply" | "friend_reviewed";

// ── Shared checks (the SQL twins of the helpers in commands-json.ts) ────

async function exists(q: Q, sql: string, params: unknown[]): Promise<boolean> {
  return (await q.query(sql, params)).length > 0;
}

/** True when either user has blocked the other. (Muting doesn't count.) */
const blocked = (q: Q, a: string, b: string) =>
  exists(q, "select 1 from user_blocks where kind = 'block' and ((user_id = $1 and target_id = $2) or (user_id = $2 and target_id = $1))", [a, b]);

/** Can `viewerId` see content owned by `ownerId`? (privacy + blocks + suspension) */
async function canSeeOwner(q: Q, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const owner = (await q.query<{ suspended: boolean; profile_visibility: string }>("select suspended, profile_visibility from users where id = $1", [ownerId]))[0];
  if (!owner || owner.suspended || (await blocked(q, viewerId, ownerId))) return false;
  if (owner.profile_visibility === "private") return false;
  if (owner.profile_visibility === "followers") return exists(q, "select 1 from follows where follower_id = $1 and following_id = $2", [viewerId, ownerId]);
  return true;
}

async function visibleEntry(q: Q, viewerId: string, entryId: string) {
  const e = (await q.query<{ id: string; user_id: string }>("select id, user_id from diary_entries where id = $1 and not removed", [entryId]))[0];
  if (!e || !(await canSeeOwner(q, viewerId, e.user_id))) throw new UserError("That review is no longer available.");
  return e;
}

async function visibleList(q: Q, viewerId: string, listId: string) {
  const l = (await q.query<{ id: string; user_id: string; visibility: string; title: string; description: string; is_ranked: boolean }>("select id, user_id, visibility, title, description, is_ranked from lists where id = $1 and not removed", [listId]))[0];
  if (!l || (l.visibility === "private" && l.user_id !== viewerId) || !(await canSeeOwner(q, viewerId, l.user_id))) throw new UserError("That list is unavailable.");
  return l;
}

async function ownedEntry(q: Q, user: User, entryId: string, allowAdmin = false) {
  const e = (await q.query<{ id: string; user_id: string; song_id: string; removed: boolean }>("select id, user_id, song_id, removed from diary_entries where id = $1", [entryId]))[0];
  if (!e) throw new UserError("That entry no longer exists.");
  if (e.user_id !== user.id && !(allowAdmin && isAdmin(user))) throw new Forbidden("You can only change your own entries.");
  return e;
}

async function ownedList(q: Q, user: User, listId: string, allowAdmin = false) {
  const l = (await q.query<{ id: string; user_id: string; title: string; removed: boolean; visibility: string }>("select id, user_id, title, removed, visibility from lists where id = $1", [listId]))[0];
  if (!l) throw new UserError("That list no longer exists.");
  if (l.user_id !== user.id && !(allowAdmin && isAdmin(user))) throw new Forbidden("You can only change your own lists.");
  return l;
}

async function notify(q: Q, userId: string, actorId: string, type: NotificationType, targetId?: string) {
  if (userId === actorId || (await blocked(q, userId, actorId))) return;
  if (await exists(q, "select 1 from user_blocks where user_id = $1 and target_id = $2", [userId, actorId])) return; // muted
  await q.query("insert into notifications (id, user_id, actor_id, type, target_id, created_at) values ($1, $2, $3, $4, $5, $6)", [newId("no"), userId, actorId, type, targetId ?? null, now()]);
}

const songExists = async (q: Q, songId: string) => { if (!(await exists(q, "select 1 from songs where id = $1", [songId]))) throw new UserError("That song is unavailable."); };
const artistExists = async (q: Q, artistId: string) => { if (!(await exists(q, "select 1 from artists where id = $1", [artistId]))) throw new UserError("That artist is unavailable."); };

/** Deletes the row if it's there and says whether it was. The toggle commands use this so two taps at once can't both "add". */
async function removed(q: Q, sql: string, params: unknown[]): Promise<boolean> {
  return (await q.query(`${sql} returning 1 as x`, params)).length > 0;
}

/** Adds or removes a like. `quiet` = no feed event (a like made while logging is already shown by the log card). */
async function setLike(q: Q, userId: string, songId: string, liked: boolean, at: string, quiet = false) {
  if (liked) {
    const added = await q.query("insert into likes (user_id, song_id, created_at) values ($1, $2, $3) on conflict do nothing returning 1 as x", [userId, songId, at]);
    if (added.length && !quiet) await q.query("insert into activity_events (id, actor_id, event_type, song_id, created_at) values ($1, $2, 'song_liked', $3, $4)", [newId("ac"), userId, songId, at]);
  } else if (await removed(q, "delete from likes where user_id = $1 and song_id = $2", [userId, songId])) {
    await q.query("delete from activity_events where actor_id = $1 and event_type = 'song_liked' and song_id = $2", [userId, songId]);
  }
}

async function upsertRating(q: Q, userId: string, songId: string, rating: number, at: string) {
  await q.query(
    `insert into ratings (user_id, song_id, rating, created_at, updated_at) values ($1, $2, $3, $4, $4)
     on conflict (user_id, song_id) do update set rating = excluded.rating, updated_at = excluded.updated_at`, [userId, songId, rating, at]);
}

/** The first free slug starting from `base` (base, base-2, base-3 …) in `table`. */
async function uniqueSlug(q: Q, table: "songs" | "albums" | "artists", base: string): Promise<string> {
  const taken = new Set((await q.query<{ slug: string }>(`select slug from ${table} where slug = $1 or slug like $2`, [base, `${base.replace(/[\\%_]/g, "\\$&")}-%`])).map((r) => r.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

const insertItems = (q: Q, listId: string, items: { songId: string; note?: string }[]) =>
  items.length
    ? q.query("insert into list_items (list_id, position, song_id, note) select $1, (x.p - 1)::int, x.s, x.n from unnest($2::text[], $3::text[]) with ordinality as x(s, n, p)", [listId, items.map((i) => i.songId), items.map((i) => i.note ?? null)])
    : Promise.resolve([]);

async function existingSongs(q: Q, items: { songId: string; note?: string }[]) {
  if (!items.length) return items;
  const have = new Set((await q.query<{ id: string }>("select id from songs where id = any($1::text[])", [items.map((i) => i.songId)])).map((r) => r.id));
  return items.filter((it) => have.has(it.songId));
}

export function createSqlCommands(db: Db) {
  const tx = <T,>(fn: (q: Q) => Promise<T>) => db.tx(fn);

  return {
    // ── Accounts and sessions ──────────────────────────────────────────

    async createUser(user: User): Promise<void> {
      try {
        await tx((q) => q.query(
          `insert into users (id, username, display_name, bio, location, website, avatar_hue, avatar_url, password_hash, created_at, favorite_song_ids, favorite_artist_ids,
                              profile_visibility, role, suspended, onboarded, search_text)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [user.id, user.username, user.displayName, user.bio ?? "", user.location ?? null, user.website ?? null, user.avatarHue, user.avatarUrl ?? null, user.passwordHash, user.createdAt,
            user.favoriteSongIds, user.favoriteArtistIds, user.profileVisibility, user.role, !!user.suspended, user.onboarded, searchText(user.username, user.displayName)]));
      } catch (e) {
        if (isUnique(e)) throw new UserError("That username is taken.");
        throw e;
      }
    },

    async setPasswordHash(userId: string, hash: string): Promise<void> {
      await db.query("update users set password_hash = $2 where id = $1", [userId, hash]);
    },

    async sessionUser(tokenHash: string): Promise<User | null> {
      const row = (await db.query("select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at >= $2::timestamptz and not u.suspended", [tokenHash, now()]))[0];
      return row ? toUser(row) : null;
    },

    async createSession(session: Session): Promise<void> {
      await tx(async (q) => {
        await q.query("delete from sessions where expires_at <= $1::timestamptz", [session.createdAt]);
        await q.query("insert into sessions (token_hash, user_id, created_at, expires_at) values ($1, $2, $3, $4)", [session.tokenHash, session.userId, session.createdAt, session.expiresAt]);
      });
    },

    async deleteSession(tokenHash: string): Promise<void> {
      await db.query("delete from sessions where token_hash = $1", [tokenHash]);
    },

    async deleteOtherSessions(userId: string, keepHash: string | null): Promise<void> {
      await db.query("delete from sessions where user_id = $1 and ($2::text is null or token_hash <> $2::text)", [userId, keepHash]);
    },

    // ── Taste ──────────────────────────────────────────────────────────

    async rateSong(user: User, songId: string, rating: number | null): Promise<void> {
      await tx(async (q) => {
        await songExists(q, songId);
        if (rating == null) await q.query("delete from ratings where user_id = $1 and song_id = $2", [user.id, songId]);
        else await upsertRating(q, user.id, songId, rating, now());
      });
    },

    async toggleLike(user: User, songId: string): Promise<boolean> {
      return tx(async (q) => {
        await songExists(q, songId);
        const has = await exists(q, "select 1 from likes where user_id = $1 and song_id = $2", [user.id, songId]);
        await setLike(q, user.id, songId, !has, now());
        return !has;
      });
    },

    async toggleListenLater(user: User, songId: string): Promise<boolean> {
      return tx(async (q) => {
        await songExists(q, songId);
        if (await removed(q, "delete from listen_later where user_id = $1 and song_id = $2", [user.id, songId])) return false;
        const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from listen_later where user_id = $1", [user.id]);
        if (n >= 5000) throw new UserError("Your Listen Later is full (5,000 songs).");
        await q.query("insert into listen_later (user_id, song_id, created_at) values ($1, $2, $3) on conflict do nothing", [user.id, songId, now()]);
        return true;
      });
    },

    async logSong(user: User, songId: string, p: LogData): Promise<{ id: string; firstEver: boolean }> {
      return tx(async (q) => {
        await songExists(q, songId);
        const firstEver = !(await exists(q, "select 1 from diary_entries where user_id = $1", [user.id]));
        const t = now();
        const id = newId("en");
        await q.query(
          `insert into diary_entries (id, user_id, song_id, rating_at_time, liked, review_text, has_spoiler, listened_at, is_relisten, tags, context, memory, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
          [id, user.id, songId, p.rating ?? null, !!p.liked, p.review ?? null, !!p.hasSpoiler, p.listenedAt, !!p.isRelisten, p.tags, p.context ?? null, p.memory ?? null, t]);
        await q.query("insert into activity_events (id, actor_id, event_type, song_id, entry_id, created_at) values ($1, $2, $3, $4, $5, $6)", [newId("ac"), user.id, p.review ? "song_reviewed" : "song_logged", songId, id, t]);
        if (p.rating != null) await upsertRating(q, user.id, songId, p.rating, t);
        if (p.liked != null) await setLike(q, user.id, songId, p.liked, t, true);
        await q.query("delete from listen_later where user_id = $1 and song_id = $2", [user.id, songId]);
        if (p.review) {
          const friends = await q.query<{ user_id: string }>(
            "select r.user_id from ratings r join follows f on f.follower_id = r.user_id and f.following_id = $1 where r.song_id = $2 order by r.created_at, r.user_id " + C, [user.id, songId]);
          for (const f of friends) await notify(q, f.user_id, user.id, "friend_reviewed", id);
        }
        return { id, firstEver };
      });
    },

    async updateEntry(user: User, entryId: string, p: LogData): Promise<void> {
      await tx(async (q) => {
        const e = await ownedEntry(q, user, entryId);
        if (e.removed) throw new UserError("That entry was removed by a moderator.");
        // Explicit allow-list of editable fields (no mass assignment).
        await q.query(
          `update diary_entries set listened_at = $2, rating_at_time = $3, liked = $4, review_text = $5, has_spoiler = $6, tags = $7, is_relisten = $8, context = $9, memory = $10, updated_at = $11 where id = $1`,
          [entryId, p.listenedAt, p.rating ?? null, !!p.liked, p.review ?? null, !!p.hasSpoiler, p.tags, !!p.isRelisten, p.context ?? null, p.memory ?? null, now()]);
        await q.query("update activity_events set event_type = $2 where id = (select id from activity_events where entry_id = $1 order by created_at, id " + C + " limit 1)", [entryId, p.review ? "song_reviewed" : "song_logged"]);
      });
    },

    async deleteEntry(user: User, entryId: string): Promise<{ byAdmin: boolean }> {
      return tx(async (q) => {
        const e = await ownedEntry(q, user, entryId, true);
        // Review likes and activity go with the entry (foreign keys); comments point at it by id only.
        await q.query("delete from comments where target_type = 'entry' and target_id = $1", [entryId]);
        await q.query("delete from diary_entries where id = $1", [entryId]);
        return { byAdmin: e.user_id !== user.id };
      });
    },

    // ── Social ─────────────────────────────────────────────────────────

    async toggleReviewLike(user: User, entryId: string): Promise<boolean> {
      return tx(async (q) => {
        const e = await visibleEntry(q, user.id, entryId);
        if (await removed(q, "delete from review_likes where user_id = $1 and entry_id = $2", [user.id, entryId])) return false;
        await q.query("insert into review_likes (user_id, entry_id, created_at) values ($1, $2, $3) on conflict do nothing", [user.id, entryId, now()]);
        await notify(q, e.user_id, user.id, "review_like", entryId);
        return true;
      });
    },

    async addComment(user: User, type: "entry" | "list", targetId: string, text: string, parentId?: string): Promise<string> {
      return tx(async (q) => {
        const owner = type === "entry" ? (await visibleEntry(q, user.id, targetId)).user_id : (await visibleList(q, user.id, targetId)).user_id;
        if (await blocked(q, owner, user.id)) throw new Forbidden("You can't comment here.");
        // Anti-spam: identical comment twice in a row on the same target.
        const last = (await q.query<{ body: string; created_at: string }>("select body, created_at from comments where user_id = $1 and target_id = $2 order by created_at desc, id desc limit 1", [user.id, targetId]))[0];
        if (last && last.body === text && Date.now() - Date.parse(last.created_at) < 600_000) throw new UserError("You just posted that.");
        type C = { id: string; user_id: string; parent_id: string | null };
        let parent: C | undefined;
        if (parentId) {
          parent = (await q.query<C>("select id, user_id, parent_id from comments where id = $1 and target_id = $2 and target_type = $3 and not removed", [parentId, targetId, type]))[0];
          if (!parent) throw new UserError("That comment is no longer available.");
          if (parent.parent_id) parent = (await q.query<C>("select id, user_id, parent_id from comments where id = $1", [parent.parent_id]))[0]; // one reply depth max
        }
        const id = newId("co");
        await q.query("insert into comments (id, user_id, target_type, target_id, parent_id, body, created_at) values ($1, $2, $3, $4, $5, $6, $7)", [id, user.id, type, targetId, parent?.id ?? null, text, now()]);
        await notify(q, owner, user.id, type === "entry" ? "review_comment" : "list_comment", targetId);
        if (parent && parent.user_id !== owner) await notify(q, parent.user_id, user.id, "comment_reply", targetId);
        return id;
      });
    },

    async deleteComment(user: User, commentId: string): Promise<{ byAdmin: boolean }> {
      return tx(async (q) => {
        const c = (await q.query<{ user_id: string }>("select user_id from comments where id = $1", [commentId]))[0];
        if (!c) throw new UserError("That comment no longer exists.");
        if (c.user_id !== user.id && !isAdmin(user)) throw new Forbidden("You can only delete your own comments.");
        await q.query("delete from comments where id = $1", [commentId]); // replies and their likes go with it
        return { byAdmin: c.user_id !== user.id };
      });
    },

    async toggleCommentLike(user: User, commentId: string): Promise<boolean> {
      return tx(async (q) => {
        const c = (await q.query<{ target_type: string; target_id: string }>("select target_type, target_id from comments where id = $1 and not removed", [commentId]))[0];
        if (!c) throw new UserError("That comment is no longer available.");
        if (c.target_type === "entry") await visibleEntry(q, user.id, c.target_id);
        else await visibleList(q, user.id, c.target_id);
        if (await removed(q, "delete from comment_likes where user_id = $1 and comment_id = $2", [user.id, commentId])) return false;
        await q.query("insert into comment_likes (user_id, comment_id) values ($1, $2) on conflict do nothing", [user.id, commentId]);
        return true;
      });
    },

    async toggleFollow(user: User, targetId: string): Promise<boolean> {
      return tx(async (q) => {
        if (targetId === user.id) throw new UserError("You can't follow yourself.");
        if (!(await exists(q, "select 1 from users where id = $1 and not suspended", [targetId]))) throw new UserError("That account doesn't exist.");
        if (await removed(q, "delete from follows where follower_id = $1 and following_id = $2", [user.id, targetId])) {
          await q.query("delete from activity_events where event_type = 'user_followed' and actor_id = $1 and target_user_id = $2", [user.id, targetId]);
          return false;
        }
        if (await blocked(q, user.id, targetId)) throw new Forbidden("You can't follow this account.");
        const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from follows where follower_id = $1", [user.id]);
        if (n >= 5000) throw new UserError("You're following the maximum number of accounts.");
        const t = now();
        await q.query("insert into follows (follower_id, following_id, created_at) values ($1, $2, $3) on conflict do nothing", [user.id, targetId, t]);
        await q.query("insert into activity_events (id, actor_id, event_type, target_user_id, created_at) values ($1, $2, 'user_followed', $3, $4)", [newId("ac"), user.id, targetId, t]);
        await notify(q, targetId, user.id, "follow");
        return true;
      });
    },

    // ── Artists and profile ────────────────────────────────────────────

    async toggleArtistFollow(user: User, artistId: string): Promise<boolean> {
      return tx(async (q) => {
        await artistExists(q, artistId);
        if (await removed(q, "delete from artist_follows where user_id = $1 and artist_id = $2", [user.id, artistId])) return false;
        await q.query("insert into artist_follows (user_id, artist_id, created_at) values ($1, $2, $3) on conflict do nothing", [user.id, artistId, now()]);
        return true;
      });
    },

    async toggleFavoriteArtist(user: User, artistId: string): Promise<boolean> {
      return tx(async (q) => {
        await artistExists(q, artistId);
        const favs = (await q.query<{ f: string[] }>("select favorite_artist_ids as f from users where id = $1 for update", [user.id]))[0].f;
        const has = favs.includes(artistId);
        if (!has && favs.length >= 8) throw new UserError("You can pin up to 8 favourite artists.");
        await q.query("update users set favorite_artist_ids = $2 where id = $1", [user.id, has ? favs.filter((a) => a !== artistId) : [...favs, artistId]]);
        return !has;
      });
    },

    async toggleFavoriteSong(user: User, songId: string): Promise<boolean> {
      return tx(async (q) => {
        await songExists(q, songId);
        const favs = (await q.query<{ f: string[] }>("select favorite_song_ids as f from users where id = $1 for update", [user.id]))[0].f;
        const has = favs.includes(songId);
        if (!has && favs.length >= 8) throw new UserError("You can pin up to 8 favourite songs. Unpin one first.");
        await q.query("update users set favorite_song_ids = $2 where id = $1", [user.id, has ? favs.filter((a) => a !== songId) : [...favs, songId]]);
        return !has;
      });
    },

    async reorderFavoriteSongs(user: User, ids: string[]): Promise<void> {
      await tx(async (q) => {
        const favs = (await q.query<{ f: string[] }>("select favorite_song_ids as f from users where id = $1 for update", [user.id]))[0].f;
        await q.query("update users set favorite_song_ids = $2 where id = $1", [user.id, [...new Set(ids)].filter((id) => favs.includes(id))]);
      });
    },

    async setProfileLyric(user: User, songId: string, text: string, startMs?: number | null): Promise<void> {
      await tx(async (q) => {
        await songExists(q, songId);
        await q.query("update users set profile_lyric_song_id = $2, profile_lyric_text = $3, profile_lyric_start_ms = $4, profile_lyric_updated_at = $5 where id = $1", [user.id, songId, text, startMs ?? null, now()]);
      });
    },

    async clearProfileLyric(user: User): Promise<void> {
      await db.query("update users set profile_lyric_song_id = null, profile_lyric_text = null, profile_lyric_start_ms = null, profile_lyric_updated_at = null where id = $1", [user.id]);
    },

    // ── Lists ──────────────────────────────────────────────────────────

    async createList(user: User, n: ListData): Promise<string> {
      return tx(async (q) => {
        const items = await existingSongs(q, n.items);
        const [{ c }] = await q.query<{ c: number }>("select count(*)::int as c from lists where user_id = $1", [user.id]);
        if (c >= 1000) throw new UserError("You've reached the maximum number of lists.");
        const t = now();
        const id = newId("li");
        await q.query("insert into lists (id, user_id, title, description, is_ranked, visibility, created_at, updated_at, search_text) values ($1, $2, $3, $4, $5, $6, $7, $7, $8)",
          [id, user.id, n.title, n.description, n.isRanked, n.visibility, t, searchText(n.title, n.description)]);
        await insertItems(q, id, items);
        if (n.visibility === "public") await q.query("insert into activity_events (id, actor_id, event_type, list_id, count, created_at) values ($1, $2, 'list_created', $3, $4, $5)", [newId("ac"), user.id, id, items.length, t]);
        return id;
      });
    },

    async updateList(user: User, listId: string, n: ListData): Promise<void> {
      await tx(async (q) => {
        const l = await ownedList(q, user, listId);
        if (l.removed) throw new UserError("That list was removed by a moderator.");
        const items = await existingSongs(q, n.items);
        const before = new Set((await q.query<{ song_id: string }>("select song_id from list_items where list_id = $1", [listId])).map((r) => r.song_id));
        const added = items.filter((it) => !before.has(it.songId)).length;
        const t = now();
        await q.query("update lists set title = $2, description = $3, is_ranked = $4, visibility = $5, updated_at = $6, search_text = $7 where id = $1", [listId, n.title, n.description, n.isRanked, n.visibility, t, searchText(n.title, n.description)]);
        await q.query("delete from list_items where list_id = $1", [listId]);
        await insertItems(q, listId, items);
        if (n.visibility !== "public") await q.query("delete from activity_events where list_id = $1", [listId]);
        else if (added) await q.query("insert into activity_events (id, actor_id, event_type, list_id, count, created_at) values ($1, $2, 'list_updated', $3, $4, $5)", [newId("ac"), user.id, listId, added, t]);
      });
    },

    async addToList(user: User, listId: string, songId: string): Promise<string> {
      return tx(async (q) => {
        const l = await ownedList(q, user, listId);
        if (l.removed) throw new UserError("That list was removed by a moderator.");
        await songExists(q, songId);
        if (await exists(q, "select 1 from list_items where list_id = $1 and song_id = $2", [listId, songId])) throw new UserError(`Already in “${l.title}”.`);
        const [{ n, next }] = await q.query<{ n: number; next: number }>("select count(*)::int as n, coalesce(max(position), -1) + 1 as next from list_items where list_id = $1", [listId]);
        if (n >= 500) throw new UserError("Lists can hold up to 500 songs.");
        const t = now();
        await q.query("insert into list_items (list_id, position, song_id) values ($1, $2, $3)", [listId, next, songId]);
        await q.query("update lists set updated_at = $2 where id = $1", [listId, t]);
        const recent = (await q.query<{ id: string }>(
          "select id from activity_events where list_id = $1 and event_type = 'list_updated' and actor_id = $2 and created_at > $3::timestamptz - interval '1 hour' order by created_at, id " + C + " limit 1", [listId, user.id, t]))[0];
        if (recent) await q.query("update activity_events set count = coalesce(count, 0) + 1, created_at = $2 where id = $1", [recent.id, t]);
        else if (l.visibility === "public") await q.query("insert into activity_events (id, actor_id, event_type, list_id, count, created_at) values ($1, $2, 'list_updated', $3, 1, $4)", [newId("ac"), user.id, listId, t]);
        return l.title;
      });
    },

    async deleteList(user: User, listId: string): Promise<{ username: string; byAdmin: boolean }> {
      return tx(async (q) => {
        const l = await ownedList(q, user, listId, true);
        const username = (await q.query<{ username: string }>("select username::text as username from users where id = $1", [l.user_id]))[0].username;
        await q.query("delete from comments where target_type = 'list' and target_id = $1", [listId]);
        await q.query("delete from lists where id = $1", [listId]); // items, likes and activity go with it
        return { username, byAdmin: l.user_id !== user.id };
      });
    },

    async cloneList(user: User, listId: string): Promise<string> {
      return tx(async (q) => {
        const l = await visibleList(q, user.id, listId);
        const [{ c }] = await q.query<{ c: number }>("select count(*)::int as c from lists where user_id = $1", [user.id]);
        if (c >= 1000) throw new UserError("You've reached the maximum number of lists.");
        const t = now();
        const id = newId("li");
        const title = `${l.title} (copy)`.slice(0, 120);
        // Explicit fields only: never copy ownership/moderation fields.
        await q.query("insert into lists (id, user_id, title, description, is_ranked, visibility, cloned_from_id, created_at, updated_at, search_text) values ($1, $2, $3, $4, $5, 'private', $6, $7, $7, $8)",
          [id, user.id, title, l.description, l.is_ranked, l.id, t, searchText(title, l.description)]);
        await q.query("insert into list_items (list_id, position, song_id, note) select $1, position, song_id, note from list_items where list_id = $2", [id, listId]);
        return id;
      });
    },

    async toggleListLike(user: User, listId: string): Promise<boolean> {
      return tx(async (q) => {
        const l = await visibleList(q, user.id, listId);
        if (await removed(q, "delete from list_likes where user_id = $1 and list_id = $2", [user.id, listId])) return false;
        await q.query("insert into list_likes (user_id, list_id, created_at) values ($1, $2, $3) on conflict do nothing", [user.id, listId, now()]);
        await notify(q, l.user_id, user.id, "list_like", listId);
        return true;
      });
    },

    // ── Moderation ─────────────────────────────────────────────────────

    async report(user: User, type: "entry" | "comment" | "list" | "user", targetId: string, reason: string): Promise<void> {
      await tx(async (q) => {
        const table = { entry: "diary_entries", comment: "comments", list: "lists", user: "users" }[type];
        if (!(await exists(q, `select 1 from ${table} where id = $1`, [targetId]))) throw new UserError("That content no longer exists.");
        if (await exists(q, "select 1 from reports where reporter_id = $1 and target_id = $2 and status = 'open'", [user.id, targetId])) throw new UserError("You've already reported this. Our moderators will take a look.");
        await q.query("insert into reports (id, reporter_id, target_type, target_id, reason, status, created_at) values ($1, $2, $3, $4, $5, 'open', $6)", [newId("re"), user.id, type, targetId, reason, now()]);
      });
    },

    async toggleBlock(user: User, targetId: string, kind: "block" | "mute"): Promise<boolean> {
      return tx(async (q) => {
        if (targetId === user.id) throw new UserError("You can't do that to yourself.");
        if (!(await exists(q, "select 1 from users where id = $1", [targetId]))) throw new UserError("That account doesn't exist.");
        if (await removed(q, "delete from user_blocks where user_id = $1 and target_id = $2 and kind = $3", [user.id, targetId, kind])) return false;
        await q.query("insert into user_blocks (user_id, target_id, kind) values ($1, $2, $3) on conflict do nothing", [user.id, targetId, kind]);
        if (kind === "block") await q.query("delete from follows where (follower_id = $1 and following_id = $2) or (follower_id = $2 and following_id = $1)", [user.id, targetId]);
        return true;
      });
    },

    async moderate(reportId: string, act: "remove" | "dismiss" | "suspend"): Promise<{ targetId: string; targetType: string }> {
      return tx(async (q) => {
        const r = (await q.query<{ target_id: string; target_type: string }>("select target_id, target_type from reports where id = $1", [reportId]))[0];
        if (!r) throw new UserError("Report not found.");
        const about = { targetId: r.target_id, targetType: r.target_type };
        if (act === "dismiss") { await q.query("update reports set status = 'dismissed' where id = $1", [reportId]); return about; }
        await q.query("update reports set status = 'resolved' where id = $1", [reportId]);
        if (act === "remove") {
          if (r.target_type === "entry") await q.query("update diary_entries set removed = true where id = $1", [r.target_id]);
          if (r.target_type === "comment") await q.query("update comments set removed = true where id = $1", [r.target_id]);
          if (r.target_type === "list") await q.query("update lists set removed = true where id = $1", [r.target_id]);
        }
        if (act === "suspend") {
          const authorSql = r.target_type === "user" ? "select id from users where id = $1"
            : r.target_type === "entry" ? "select user_id as id from diary_entries where id = $1"
            : r.target_type === "comment" ? "select user_id as id from comments where id = $1"
            : "select user_id as id from lists where id = $1";
          const authorId = (await q.query<{ id: string }>(authorSql, [r.target_id]))[0]?.id;
          const u = authorId ? (await q.query("select * from users where id = $1", [authorId]))[0] : undefined;
          if (u && !isAdmin(toUser(u))) {
            await q.query("update users set suspended = true where id = $1", [authorId]);
            await q.query("delete from sessions where user_id = $1", [authorId]);
          }
        }
        return about;
      });
    },

    // ── Account ────────────────────────────────────────────────────────

    async updateProfile(user: User, p: ProfileData, passwordHash?: string): Promise<void> {
      await db.query(
        `update users set display_name = $2, bio = $3, location = $4, website = $5, profile_visibility = $6, avatar_hue = $7, search_text = $8,
                          password_hash = coalesce($9, password_hash) where id = $1`,
        [user.id, p.displayName, p.bio, p.location ?? null, p.website ?? null, p.profileVisibility, p.avatarHue, searchText(user.username, p.displayName), passwordHash ?? null]);
    },

    /** Permanently removes the account and everything that hangs off it. */
    async deleteAccount(userId: string): Promise<void> {
      await tx(async (q) => {
        // Comments on this person's reviews and lists point at them by id only, so they're removed by hand; everything else cascades.
        await q.query(
          `delete from comments where (target_type = 'entry' and target_id in (select id from diary_entries where user_id = $1))
                                   or (target_type = 'list' and target_id in (select id from lists where user_id = $1))`, [userId]);
        await q.query("delete from users where id = $1", [userId]);
      });
    },

    async completeOnboarding(user: User, followIds: string[], artistIds: string[]): Promise<void> {
      await tx(async (q) => {
        const me = (await q.query<{ favorite_artist_ids: string[]; favorite_song_ids: string[] }>("select favorite_artist_ids, favorite_song_ids from users where id = $1 for update", [user.id]))[0];
        for (const id of new Set(followIds)) {
          const ok = id !== user.id && (await exists(q, "select 1 from users where id = $1 and not suspended", [id])) && !(await blocked(q, user.id, id))
            && !(await exists(q, "select 1 from follows where follower_id = $1 and following_id = $2", [user.id, id]));
          if (!ok) continue;
          await q.query("insert into follows (follower_id, following_id, created_at) values ($1, $2, $3)", [user.id, id, now()]);
          await notify(q, id, user.id, "follow");
        }
        const favs = [...me.favorite_artist_ids];
        for (const a of [...new Set(artistIds)].slice(0, 8)) {
          if (!(await exists(q, "select 1 from artists where id = $1", [a]))) continue;
          if (!favs.includes(a) && favs.length < 8) favs.push(a);
          await q.query("insert into artist_follows (user_id, artist_id, created_at) values ($1, $2, $3) on conflict do nothing", [user.id, a, now()]);
        }
        let songs = me.favorite_song_ids;
        if (!songs.length) songs = (await q.query<{ song_id: string }>("select song_id from ratings where user_id = $1 and rating >= 4.5 order by created_at, song_id " + C + " limit 4", [user.id])).map((r) => r.song_id);
        await q.query("update users set favorite_artist_ids = $2, favorite_song_ids = $3, onboarded = true where id = $1", [user.id, favs, songs]);
      });
    },

    async markNotificationsRead(user: User): Promise<void> {
      await db.query("update notifications set read_at = $2 where user_id = $1 and read_at is null", [user.id, now()]);
    },

    // ── Catalogue and imports ──────────────────────────────────────────

    /** Adds a catalogue track, its album and the rest of the album's tracks. Idempotent. Returns the track's song slug. */
    async commitImport(track: ExternalTrack, albumTracks: ExternalTrack[], albumDate: string): Promise<string> {
      return tx(async (q) => {
        await q.query("select pg_advisory_xact_lock(724501002)"); // one catalogue import at a time keeps slugs unique
        const ensureArtist = async (t: ExternalTrack): Promise<string> => {
          const found = (await q.query<{ id: string; external_id: string | null }>(
            "select id, external_id from artists where external_id = $1 or lower(name) = lower($2) order by id " + C + " limit 1", [t.artist.externalId, t.artist.name]))[0];
          if (found) {
            // Seeded artists have no catalogue id yet; remembering it makes later discography lookups exact.
            if (!found.external_id) await q.query("update artists set external_id = $2 where id = $1 and not exists (select 1 from artists where external_id = $2)", [found.id, t.artist.externalId]);
            return found.id;
          }
          const id = "ar" + rawId(t.artist.externalId);
          await q.query("insert into artists (id, external_id, slug, name, genres, hue, search_text) values ($1, $2, $3, $4, $5, $6, $7)",
            [id, t.artist.externalId, await uniqueSlug(q, "artists", slugify(t.artist.name)), t.artist.name, t.genre ? [t.genre] : [], artistHue(t.artist.name), searchText(t.artist.name, t.genre ?? "")]);
          return id;
        };

        const artistId = await ensureArtist(track);
        let album = (await q.query<{ id: string; genres: string[] }>("select id, genres from albums where external_id = $1", [track.album.externalId]))[0];
        if (!album) {
          const id = "al" + rawId(track.album.externalId);
          const cover = generatedCover(track.artist.name);
          const genres = track.genre ? [track.genre] : [];
          await q.query(
            `insert into albums (id, external_id, slug, artist_id, title, release_date, genres, artwork_url, palette, pattern, producers, search_text)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}', $11)`,
            [id, track.album.externalId, await uniqueSlug(q, "albums", slugify(`${track.album.title}-${track.artist.name}`)), artistId, track.album.title, albumDate, genres,
              track.album.artworkUrl ?? null, cover.palette, cover.pattern, searchText(track.album.title, track.artist.name)]);
          album = { id, genres };
        }
        let slug = "";
        for (const t of albumTracks) {
          const have = (await q.query<{ slug: string }>("select slug from songs where external_id = $1", [t.externalId]))[0];
          if (have) {
            if (t.externalId === track.externalId) slug = have.slug;
            continue;
          }
          const trackArtist = await ensureArtist(t);
          const query = encodeURIComponent(`${t.title} ${t.artist.name}`);
          const songSlug = await uniqueSlug(q, "songs", slugify(`${t.title}-${t.artist.name}`));
          const id = "so" + rawId(t.externalId);
          await q.query(
            `insert into songs (id, external_id, slug, album_id, title, featured, duration_ms, track_number, release_date, explicit, writers, producers, genres, popularity, preview_url, links, search_text, match_key)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}', '{}', $11, 50, $12, $13::jsonb, $14, $15)`,
            [id, t.externalId, songSlug, album.id, t.title, t.featured ?? [], t.durationMs, t.trackNumber, dateOrNull(t.album.releaseDate) ?? albumDate, t.explicit, t.genre ? [t.genre] : album.genres,
              t.previewUrl ?? null, JSON.stringify({ apple: t.url, spotify: `https://open.spotify.com/search/${query}`, youtube: `https://www.youtube.com/results?search_query=${query}` }),
              searchText(t.title, `${t.artist.name} ${track.album.title} ${(t.featured ?? []).join(" ")}`), normalizeTitle(t.title)]);
          await q.query("insert into song_artists (song_id, artist_id, position) values ($1, $2, 0)", [id, trackArtist]);
          if (t.externalId === track.externalId) slug = songSlug;
        }
        return slug;
      });
    },

    /** Remembers an artist's catalogue id (only when it has none yet), so later discography lookups are exact. */
    async setArtistExternalId(artistId: string, externalId: string): Promise<void> {
      await db.query("update artists set external_id = $2 where id = $1 and external_id is null and not exists (select 1 from artists where external_id = $2)", [artistId, externalId]);
    },

    /** Adds one diary entry per song unless the user already has one. Returns, per item, whether an entry was written. */
    async addImportedEntries(userId: string, items: ImportedEntry[]): Promise<boolean[]> {
      if (!items.length) return [];
      return tx(async (q) => {
        const have = new Set((await q.query<{ song_id: string }>("select song_id from diary_entries where user_id = $1 and not removed and song_id = any($2::text[])", [userId, items.map((i) => i.songId)])).map((r) => r.song_id));
        const at = now();
        const written = items.map((it) => { if (have.has(it.songId)) return false; have.add(it.songId); return true; });
        const rows = items.filter((_, n) => written[n]).map((it) => ({
          id: newId("en"), user_id: userId, song_id: it.songId, liked: false, listened_at: it.listenedAt, is_relisten: false, tags: it.tags, memory: it.memory, created_at: at, updated_at: at,
        }));
        if (rows.length) await q.query(
          `insert into diary_entries (id, user_id, song_id, liked, listened_at, is_relisten, tags, memory, created_at, updated_at)
           select id, user_id, song_id, liked, listened_at, is_relisten, tags, memory, created_at, updated_at
           from jsonb_to_recordset($1::jsonb) as x(id text, user_id text, song_id text, liked boolean, listened_at date, is_relisten boolean, tags text[], memory text, created_at timestamptz, updated_at timestamptz)`, [JSON.stringify(rows)]);
        return written;
      });
    },
  };
}

export type SqlCommands = ReturnType<typeof createSqlCommands>;
