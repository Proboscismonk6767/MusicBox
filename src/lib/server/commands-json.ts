import "server-only";
import { mutate, getDB } from "./store";
import { recomputeAllStats, recomputeSongStats } from "./stats";
import { isAdmin } from "./security";
import { Forbidden, UserError } from "./errors";
import { newId, slugify } from "../util";
import { emptyStats } from "./stats";
import { artistHue, dateOrNull, generatedCover, rawId } from "./import-helpers";
import type { ExternalTrack } from "./catalogue-core";
import type { ImportedEntry } from "./commands-types";
import type { Album, Artist, DB, DiaryEntry, NotificationType, ProfileVisibility, Session, Song, SongList, User, Visibility, ListeningContext } from "../types";

// Every write the app makes, applied to the in-memory JSON store. Each command is one
// atomic mutate() call. Input is already validated and cleaned by src/app/actions.ts;
// what lives here is the part that depends on stored data: existence, ownership,
// visibility, blocks, limits and the side effects (stats, activity, notifications).
// The Postgres implementation (sql/commands.ts) must behave identically.

const now = () => new Date().toISOString();

// ── Access helpers ──────────────────────────────────────────────────────

function blocked(db: DB, a: string, b: string) {
  return db.blocks.some((x) => x.kind === "block" && ((x.userId === a && x.targetId === b) || (x.userId === b && x.targetId === a)));
}

/** Can `viewerId` see content owned by `ownerId`? (privacy + blocks + suspension) */
function canSeeOwner(db: DB, viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return true;
  const owner = db.users.find((u) => u.id === ownerId);
  if (!owner || owner.suspended || blocked(db, viewerId, ownerId)) return false;
  if (owner.profileVisibility === "private") return false;
  if (owner.profileVisibility === "followers") return db.follows.some((f) => f.followerId === viewerId && f.followingId === ownerId);
  return true;
}

function visibleEntry(db: DB, viewerId: string, entryId: string): DiaryEntry {
  const e = db.entries.find((x) => x.id === entryId && !x.removed);
  if (!e || !canSeeOwner(db, viewerId, e.userId)) throw new UserError("That review is no longer available.");
  return e;
}

function visibleList(db: DB, viewerId: string, listId: string) {
  const l = db.lists.find((x) => x.id === listId && !x.removed);
  if (!l || (l.visibility === "private" && l.userId !== viewerId) || !canSeeOwner(db, viewerId, l.userId)) throw new UserError("That list is unavailable.");
  return l;
}

function ownedEntry(db: DB, user: User, entryId: string, allowAdmin = false) {
  const e = db.entries.find((x) => x.id === entryId);
  if (!e) throw new UserError("That entry no longer exists.");
  if (e.userId !== user.id && !(allowAdmin && isAdmin(user))) throw new Forbidden("You can only change your own entries.");
  return e;
}

function ownedList(db: DB, user: User, listId: string, allowAdmin = false) {
  const l = db.lists.find((x) => x.id === listId);
  if (!l) throw new UserError("That list no longer exists.");
  if (l.userId !== user.id && !(allowAdmin && isAdmin(user))) throw new Forbidden("You can only change your own lists.");
  return l;
}

function notify(db: DB, userId: string, actorId: string, type: NotificationType, targetId?: string) {
  if (userId === actorId || blocked(db, userId, actorId)) return;
  if (db.blocks.some((b) => b.userId === userId && b.targetId === actorId)) return; // muted
  db.notifications.push({ id: newId("no"), userId, actorId, type, targetId, createdAt: now() });
}

function songExists(db: DB, songId: string) {
  if (!db.songs.some((s) => s.id === songId)) throw new UserError("That song is unavailable.");
}

function artistExists(db: DB, artistId: string) {
  if (!db.artists.some((a) => a.id === artistId)) throw new UserError("That artist is unavailable.");
}

function setLike(db: DB, userId: string, songId: string, liked: boolean) {
  const has = db.likes.some((l) => l.userId === userId && l.songId === songId);
  if (liked && !has) {
    db.likes.push({ userId, songId, createdAt: now() });
    db.activity.push({ id: newId("ac"), actorId: userId, type: "song_liked", songId, createdAt: now() });
  } else if (!liked && has) {
    db.likes = db.likes.filter((l) => !(l.userId === userId && l.songId === songId));
    db.activity = db.activity.filter((a) => !(a.actorId === userId && a.type === "song_liked" && a.songId === songId));
  }
}

// ── Command inputs (already validated) ──────────────────────────────────

export interface LogData {
  rating?: number | null;
  liked?: boolean | null;
  hasSpoiler?: boolean | null;
  isRelisten?: boolean | null;
  listenedAt: string;
  tags: string[];
  review?: string;
  memory?: string;
  context?: ListeningContext;
}

export interface ListData {
  title: string;
  description: string;
  isRanked: boolean;
  visibility: Visibility;
  items: { songId: string; note?: string }[];
}

export interface ProfileData {
  displayName: string;
  bio: string;
  location?: string;
  website?: string;
  profileVisibility: ProfileVisibility;
  avatarHue: number;
}

function uniqueSlug(rows: { slug: string }[], base: string) {
  let slug = base;
  let n = 2;
  while (rows.some((r) => r.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}

/** Find the artist by catalogue id or exact name, creating it when new. */
function ensureArtist(artists: Artist[], t: ExternalTrack): Artist {
  const found = artists.find((a) => a.externalId === t.artist.externalId || a.name.toLowerCase() === t.artist.name.toLowerCase());
  if (found) {
    // Seeded artists have no catalogue id yet; remembering it makes later discography lookups exact.
    found.externalId ??= t.artist.externalId;
    return found;
  }
  const artist = { id: "ar" + rawId(t.artist.externalId), externalId: t.artist.externalId, slug: uniqueSlug(artists, slugify(t.artist.name)), name: t.artist.name, genres: t.genre ? [t.genre] : [], hue: artistHue(t.artist.name) } satisfies Artist;
  artists.push(artist);
  return artist;
}

export const jsonCommands = {
  // ── Accounts and sessions ────────────────────────────────────────────

  /** Adds a new account. Throws UserError when the username is taken. */
  createUser(user: User): void {
    mutate((db) => {
      if (db.users.some((u) => u.username.toLowerCase() === user.username.toLowerCase())) throw new UserError("That username is taken.");
      db.users.push(user);
    });
  },

  setPasswordHash(userId: string, hash: string): void {
    mutate((db) => {
      const u = db.users.find((x) => x.id === userId);
      if (u) u.passwordHash = hash;
    });
  },

  /** The signed-in user behind a session token hash, or null when the session is missing, expired or suspended. */
  sessionUser(tokenHash: string): User | null {
    const db = getDB();
    const session = db.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session || session.expiresAt < new Date().toISOString()) return null;
    const user = db.users.find((u) => u.id === session.userId);
    if (!user || user.suspended) return null;
    return user;
  },

  createSession(session: Session): void {
    mutate((db) => {
      db.sessions = db.sessions.filter((s) => s.expiresAt > session.createdAt);
      db.sessions.push(session);
    });
  },

  deleteSession(tokenHash: string): void {
    mutate((db) => void (db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash)));
  },

  /** Signs the user out everywhere except (optionally) the session with `keepHash`. */
  deleteOtherSessions(userId: string, keepHash: string | null): void {
    mutate((db) => void (db.sessions = db.sessions.filter((s) => s.userId !== userId || s.tokenHash === keepHash)));
  },

  // ── Taste ────────────────────────────────────────────────────────────

  rateSong(user: User, songId: string, rating: number | null): void {
    mutate((db) => {
      songExists(db, songId);
      const existing = db.ratings.find((x) => x.userId === user.id && x.songId === songId);
      if (rating == null) db.ratings = db.ratings.filter((x) => x !== existing);
      else if (existing) Object.assign(existing, { rating, updatedAt: now() });
      else db.ratings.push({ userId: user.id, songId, rating, createdAt: now(), updatedAt: now() });
      recomputeSongStats(db, songId);
    });
  },

  toggleLike(user: User, songId: string): boolean {
    return mutate((db) => {
      songExists(db, songId);
      const liked = !db.likes.some((l) => l.userId === user.id && l.songId === songId);
      setLike(db, user.id, songId, liked);
      recomputeSongStats(db, songId);
      return liked;
    });
  },

  toggleListenLater(user: User, songId: string): boolean {
    return mutate((db) => {
      songExists(db, songId);
      const has = db.listenLater.some((l) => l.userId === user.id && l.songId === songId);
      if (has) db.listenLater = db.listenLater.filter((l) => !(l.userId === user.id && l.songId === songId));
      else {
        if (db.listenLater.filter((l) => l.userId === user.id).length >= 5000) throw new UserError("Your Listen Later is full (5,000 songs).");
        db.listenLater.push({ userId: user.id, songId, createdAt: now() });
      }
      return !has;
    });
  },

  logSong(user: User, songId: string, p: LogData): { id: string; firstEver: boolean } {
    return mutate((db) => {
      songExists(db, songId);
      const firstEver = !db.entries.some((e) => e.userId === user.id);
      const t = now();
      const entry: DiaryEntry = {
        id: newId("en"), userId: user.id, songId, rating: p.rating ?? undefined, liked: !!p.liked, review: p.review,
        hasSpoiler: !!p.hasSpoiler, listenedAt: p.listenedAt, isRelisten: !!p.isRelisten, tags: p.tags,
        context: p.context, memory: p.memory, createdAt: t, updatedAt: t,
      };
      db.entries.push(entry);
      db.activity.push({ id: newId("ac"), actorId: user.id, type: entry.review ? "song_reviewed" : "song_logged", songId, entryId: entry.id, createdAt: t });
      if (p.rating != null) {
        const r = db.ratings.find((x) => x.userId === user.id && x.songId === songId);
        if (r) Object.assign(r, { rating: p.rating, updatedAt: t });
        else db.ratings.push({ userId: user.id, songId, rating: p.rating, createdAt: t, updatedAt: t });
      }
      if (p.liked != null) setLike(db, user.id, songId, p.liked);
      db.activity = db.activity.filter((a) => !(a.actorId === user.id && a.type === "song_liked" && a.songId === songId && a.createdAt === t));
      db.listenLater = db.listenLater.filter((l) => !(l.userId === user.id && l.songId === songId));
      if (entry.review) {
        const followers = new Set(db.follows.filter((f) => f.followingId === user.id).map((f) => f.followerId));
        for (const r of db.ratings) if (r.songId === songId && followers.has(r.userId)) notify(db, r.userId, user.id, "friend_reviewed", entry.id);
      }
      recomputeSongStats(db, songId);
      return { id: entry.id, firstEver };
    });
  },

  updateEntry(user: User, entryId: string, p: LogData): void {
    mutate((db) => {
      const e = ownedEntry(db, user, entryId);
      if (e.removed) throw new UserError("That entry was removed by a moderator.");
      // Explicit allow-list of editable fields (no mass assignment).
      Object.assign(e, { listenedAt: p.listenedAt, rating: p.rating ?? undefined, liked: !!p.liked, review: p.review, hasSpoiler: !!p.hasSpoiler, tags: p.tags, isRelisten: !!p.isRelisten, context: p.context, memory: p.memory, updatedAt: now() });
      const act = db.activity.find((a) => a.entryId === e.id);
      if (act) act.type = e.review ? "song_reviewed" : "song_logged";
      recomputeSongStats(db, e.songId);
    });
  },

  /** Returns true when a moderator deleted someone else's entry (so the caller can log it). */
  deleteEntry(user: User, entryId: string): { byAdmin: boolean } {
    return mutate((db) => {
      const e = ownedEntry(db, user, entryId, true);
      db.entries = db.entries.filter((x) => x.id !== entryId);
      db.activity = db.activity.filter((a) => a.entryId !== entryId);
      db.reviewLikes = db.reviewLikes.filter((l) => l.entryId !== entryId);
      db.comments = db.comments.filter((c) => !(c.targetType === "entry" && c.targetId === entryId));
      recomputeSongStats(db, e.songId);
      return { byAdmin: e.userId !== user.id };
    });
  },

  // ── Social ───────────────────────────────────────────────────────────

  toggleReviewLike(user: User, entryId: string): boolean {
    return mutate((db) => {
      const e = visibleEntry(db, user.id, entryId);
      const has = db.reviewLikes.some((l) => l.userId === user.id && l.entryId === entryId);
      if (has) db.reviewLikes = db.reviewLikes.filter((l) => !(l.userId === user.id && l.entryId === entryId));
      else {
        db.reviewLikes.push({ userId: user.id, entryId, createdAt: now() });
        notify(db, e.userId, user.id, "review_like", entryId);
      }
      return !has;
    });
  },

  addComment(user: User, type: "entry" | "list", targetId: string, text: string, parentId?: string): string {
    return mutate((db) => {
      const owner = type === "entry" ? visibleEntry(db, user.id, targetId).userId : visibleList(db, user.id, targetId).userId;
      if (blocked(db, owner, user.id)) throw new Forbidden("You can't comment here.");
      // Anti-spam: identical comment twice in a row on the same target.
      const last = db.comments.filter((c) => c.userId === user.id && c.targetId === targetId).at(-1);
      if (last && last.body === text && Date.now() - Date.parse(last.createdAt) < 600_000) throw new UserError("You just posted that.");
      let parent = parentId ? db.comments.find((c) => c.id === parentId && c.targetId === targetId && c.targetType === type && !c.removed) : undefined;
      if (parentId && !parent) throw new UserError("That comment is no longer available.");
      if (parent?.parentId) parent = db.comments.find((c) => c.id === parent!.parentId); // one reply depth max
      const c = { id: newId("co"), userId: user.id, targetType: type, targetId, parentId: parent?.id, body: text, createdAt: now() };
      db.comments.push(c);
      notify(db, owner, user.id, type === "entry" ? "review_comment" : "list_comment", targetId);
      if (parent && parent.userId !== owner) notify(db, parent.userId, user.id, "comment_reply", targetId);
      return c.id;
    });
  },

  deleteComment(user: User, commentId: string): { byAdmin: boolean } {
    return mutate((db) => {
      const c = db.comments.find((x) => x.id === commentId);
      if (!c) throw new UserError("That comment no longer exists.");
      if (c.userId !== user.id && !isAdmin(user)) throw new Forbidden("You can only delete your own comments.");
      db.comments = db.comments.filter((x) => x.id !== commentId && x.parentId !== commentId);
      return { byAdmin: c.userId !== user.id };
    });
  },

  toggleCommentLike(user: User, commentId: string): boolean {
    return mutate((db) => {
      const c = db.comments.find((x) => x.id === commentId && !x.removed);
      if (!c) throw new UserError("That comment is no longer available.");
      if (c.targetType === "entry") visibleEntry(db, user.id, c.targetId);
      else visibleList(db, user.id, c.targetId);
      const has = db.commentLikes.some((l) => l.userId === user.id && l.commentId === commentId);
      if (has) db.commentLikes = db.commentLikes.filter((l) => !(l.userId === user.id && l.commentId === commentId));
      else db.commentLikes.push({ userId: user.id, commentId });
      return !has;
    });
  },

  toggleFollow(user: User, targetId: string): boolean {
    return mutate((db) => {
      if (targetId === user.id) throw new UserError("You can't follow yourself.");
      const target = db.users.find((u) => u.id === targetId && !u.suspended);
      if (!target) throw new UserError("That account doesn't exist.");
      const has = db.follows.some((f) => f.followerId === user.id && f.followingId === targetId);
      if (has) {
        db.follows = db.follows.filter((f) => !(f.followerId === user.id && f.followingId === targetId));
        db.activity = db.activity.filter((a) => !(a.type === "user_followed" && a.actorId === user.id && a.targetUserId === targetId));
      } else {
        if (blocked(db, user.id, targetId)) throw new Forbidden("You can't follow this account.");
        if (db.follows.filter((f) => f.followerId === user.id).length >= 5000) throw new UserError("You're following the maximum number of accounts.");
        db.follows.push({ followerId: user.id, followingId: targetId, createdAt: now() });
        db.activity.push({ id: newId("ac"), actorId: user.id, type: "user_followed", targetUserId: targetId, createdAt: now() });
        notify(db, targetId, user.id, "follow");
      }
      return !has;
    });
  },

  // ── Artists and profile ──────────────────────────────────────────────

  toggleArtistFollow(user: User, artistId: string): boolean {
    return mutate((db) => {
      artistExists(db, artistId);
      const has = db.artistFollows.some((f) => f.userId === user.id && f.artistId === artistId);
      if (has) db.artistFollows = db.artistFollows.filter((f) => !(f.userId === user.id && f.artistId === artistId));
      else db.artistFollows.push({ userId: user.id, artistId, createdAt: now() });
      return !has;
    });
  },

  toggleFavoriteArtist(user: User, artistId: string): boolean {
    return mutate((db) => {
      artistExists(db, artistId);
      const u = db.users.find((x) => x.id === user.id)!;
      const has = u.favoriteArtistIds.includes(artistId);
      if (has) u.favoriteArtistIds = u.favoriteArtistIds.filter((a) => a !== artistId);
      else {
        if (u.favoriteArtistIds.length >= 8) throw new UserError("You can pin up to 8 favourite artists.");
        u.favoriteArtistIds.push(artistId);
      }
      return !has;
    });
  },

  toggleFavoriteSong(user: User, songId: string): boolean {
    return mutate((db) => {
      songExists(db, songId);
      const u = db.users.find((x) => x.id === user.id)!;
      const has = u.favoriteSongIds.includes(songId);
      if (has) u.favoriteSongIds = u.favoriteSongIds.filter((a) => a !== songId);
      else {
        if (u.favoriteSongIds.length >= 8) throw new UserError("You can pin up to 8 favourite songs. Unpin one first.");
        u.favoriteSongIds.push(songId);
      }
      return !has;
    });
  },

  reorderFavoriteSongs(user: User, ids: string[]): void {
    mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      u.favoriteSongIds = [...new Set(ids)].filter((id) => u.favoriteSongIds.includes(id));
    });
  },

  setProfileLyric(user: User, songId: string, text: string, startMs?: number | null): void {
    mutate((db) => {
      songExists(db, songId);
      const u = db.users.find((x) => x.id === user.id)!;
      u.profileLyric = { songId, text, ...(startMs != null ? { startMs } : {}), updatedAt: now() };
    });
  },

  clearProfileLyric(user: User): void {
    mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      delete u.profileLyric;
    });
  },

  // ── Lists ────────────────────────────────────────────────────────────

  createList(user: User, n: ListData): string {
    return mutate((db) => {
      const items = n.items.filter((it) => db.songs.some((s) => s.id === it.songId));
      if (db.lists.filter((l) => l.userId === user.id).length >= 1000) throw new UserError("You've reached the maximum number of lists.");
      const t = now();
      const list = { id: newId("li"), userId: user.id, ...n, items, createdAt: t, updatedAt: t };
      db.lists.push(list);
      if (n.visibility === "public") db.activity.push({ id: newId("ac"), actorId: user.id, type: "list_created", listId: list.id, count: items.length, createdAt: t });
      return list.id;
    });
  },

  updateList(user: User, listId: string, n: ListData): void {
    mutate((db) => {
      const l = ownedList(db, user, listId);
      if (l.removed) throw new UserError("That list was removed by a moderator.");
      const items = n.items.filter((it) => db.songs.some((s) => s.id === it.songId));
      const added = items.filter((it) => !l.items.some((x) => x.songId === it.songId)).length;
      Object.assign(l, { title: n.title, description: n.description, isRanked: n.isRanked, visibility: n.visibility, items, updatedAt: now() });
      if (n.visibility !== "public") db.activity = db.activity.filter((a) => a.listId !== l.id);
      else if (added) db.activity.push({ id: newId("ac"), actorId: user.id, type: "list_updated", listId: l.id, count: added, createdAt: now() });
    });
  },

  addToList(user: User, listId: string, songId: string): string {
    return mutate((db) => {
      const l = ownedList(db, user, listId);
      if (l.removed) throw new UserError("That list was removed by a moderator.");
      songExists(db, songId);
      if (l.items.some((it) => it.songId === songId)) throw new UserError(`Already in “${l.title}”.`);
      if (l.items.length >= 500) throw new UserError("Lists can hold up to 500 songs.");
      l.items.push({ songId });
      l.updatedAt = now();
      const recent = db.activity.find((a) => a.listId === l.id && a.type === "list_updated" && a.actorId === user.id && Date.now() - Date.parse(a.createdAt) < 3600e3);
      if (recent) { recent.count = (recent.count ?? 0) + 1; recent.createdAt = now(); }
      else if (l.visibility === "public") db.activity.push({ id: newId("ac"), actorId: user.id, type: "list_updated", listId: l.id, count: 1, createdAt: now() });
      return l.title;
    });
  },

  /** Returns the owner's username (for revalidating) and whether a moderator did it. */
  deleteList(user: User, listId: string): { username: string; byAdmin: boolean } {
    return mutate((db) => {
      const l = ownedList(db, user, listId, true);
      db.lists = db.lists.filter((x) => x.id !== listId);
      db.activity = db.activity.filter((a) => a.listId !== listId);
      db.listLikes = db.listLikes.filter((x) => x.listId !== listId);
      db.comments = db.comments.filter((c) => !(c.targetType === "list" && c.targetId === listId));
      return { username: db.users.find((u) => u.id === l.userId)!.username, byAdmin: l.userId !== user.id };
    });
  },

  cloneList(user: User, listId: string): string {
    return mutate((db) => {
      const l = visibleList(db, user.id, listId);
      if (db.lists.filter((x) => x.userId === user.id).length >= 1000) throw new UserError("You've reached the maximum number of lists.");
      const t = now();
      // Explicit fields only: never copy ownership/moderation fields.
      const copy: SongList = { id: newId("li"), userId: user.id, title: `${l.title} (copy)`.slice(0, 120), description: l.description, isRanked: l.isRanked, items: l.items.map((x) => ({ ...x })), clonedFromId: l.id, visibility: "private", createdAt: t, updatedAt: t };
      db.lists.push(copy);
      return copy.id;
    });
  },

  toggleListLike(user: User, listId: string): boolean {
    return mutate((db) => {
      const l = visibleList(db, user.id, listId);
      const has = db.listLikes.some((x) => x.userId === user.id && x.listId === listId);
      if (has) db.listLikes = db.listLikes.filter((x) => !(x.userId === user.id && x.listId === listId));
      else {
        db.listLikes.push({ userId: user.id, listId, createdAt: now() });
        notify(db, l.userId, user.id, "list_like", listId);
      }
      return !has;
    });
  },

  // ── Moderation ───────────────────────────────────────────────────────

  report(user: User, type: "entry" | "comment" | "list" | "user", targetId: string, reason: string): void {
    mutate((db) => {
      const exists =
        type === "entry" ? db.entries.some((x) => x.id === targetId) :
        type === "comment" ? db.comments.some((x) => x.id === targetId) :
        type === "list" ? db.lists.some((x) => x.id === targetId) : db.users.some((x) => x.id === targetId);
      if (!exists) throw new UserError("That content no longer exists.");
      if (db.reports.some((r) => r.reporterId === user.id && r.targetId === targetId && r.status === "open")) throw new UserError("You've already reported this. Our moderators will take a look.");
      db.reports.push({ id: newId("re"), reporterId: user.id, targetType: type, targetId, reason, status: "open", createdAt: now() });
    });
  },

  toggleBlock(user: User, targetId: string, kind: "block" | "mute"): boolean {
    return mutate((db) => {
      if (targetId === user.id) throw new UserError("You can't do that to yourself.");
      if (!db.users.some((u) => u.id === targetId)) throw new UserError("That account doesn't exist.");
      const has = db.blocks.some((b) => b.userId === user.id && b.targetId === targetId && b.kind === kind);
      if (has) db.blocks = db.blocks.filter((b) => !(b.userId === user.id && b.targetId === targetId && b.kind === kind));
      else {
        db.blocks.push({ userId: user.id, targetId, kind });
        if (kind === "block") db.follows = db.follows.filter((f) => !((f.followerId === user.id && f.followingId === targetId) || (f.followerId === targetId && f.followingId === user.id)));
      }
      return !has;
    });
  },

  /** Returns what the report was about, for the audit log. */
  moderate(reportId: string, act: "remove" | "dismiss" | "suspend"): { targetId: string; targetType: string } {
    return mutate((db) => {
      const r = db.reports.find((x) => x.id === reportId);
      if (!r) throw new UserError("Report not found.");
      const about = { targetId: r.targetId, targetType: r.targetType };
      if (act === "dismiss") { r.status = "dismissed"; return about; }
      r.status = "resolved";
      if (act === "remove") {
        if (r.targetType === "entry") { const e = db.entries.find((x) => x.id === r.targetId); if (e) { e.removed = true; recomputeSongStats(db, e.songId); } }
        if (r.targetType === "comment") { const c = db.comments.find((x) => x.id === r.targetId); if (c) c.removed = true; }
        if (r.targetType === "list") { const l = db.lists.find((x) => x.id === r.targetId); if (l) l.removed = true; }
      }
      if (act === "suspend") {
        const authorId = r.targetType === "user" ? r.targetId
          : r.targetType === "entry" ? db.entries.find((x) => x.id === r.targetId)?.userId
          : r.targetType === "comment" ? db.comments.find((x) => x.id === r.targetId)?.userId
          : db.lists.find((x) => x.id === r.targetId)?.userId;
        const u = db.users.find((x) => x.id === authorId);
        if (u && !isAdmin(u)) { u.suspended = true; db.sessions = db.sessions.filter((s) => s.userId !== u.id); }
      }
      return about;
    });
  },

  // ── Account ──────────────────────────────────────────────────────────

  updateProfile(user: User, p: ProfileData, passwordHash?: string): void {
    mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      u.displayName = p.displayName;
      u.bio = p.bio;
      u.location = p.location;
      u.website = p.website;
      u.profileVisibility = p.profileVisibility;
      u.avatarHue = p.avatarHue;
      if (passwordHash) u.passwordHash = passwordHash;
    });
  },

  /** Permanently removes the account and everything that hangs off it. */
  deleteAccount(userId: string): void {
    mutate((db) => {
      const uid = userId;
      const entryIds = new Set(db.entries.filter((e) => e.userId === uid).map((e) => e.id));
      const listIds = new Set(db.lists.filter((l) => l.userId === uid).map((l) => l.id));
      const commentIds = new Set(db.comments.filter((c) => c.userId === uid).map((c) => c.id));
      db.users = db.users.filter((u) => u.id !== uid);
      db.sessions = db.sessions.filter((s) => s.userId !== uid);
      db.ratings = db.ratings.filter((r) => r.userId !== uid);
      db.likes = db.likes.filter((l) => l.userId !== uid);
      db.entries = db.entries.filter((e) => e.userId !== uid);
      db.reviewLikes = db.reviewLikes.filter((l) => l.userId !== uid && !entryIds.has(l.entryId));
      db.follows = db.follows.filter((f) => f.followerId !== uid && f.followingId !== uid);
      db.artistFollows = db.artistFollows.filter((f) => f.userId !== uid);
      db.lists = db.lists.filter((l) => l.userId !== uid);
      db.listLikes = db.listLikes.filter((l) => l.userId !== uid && !listIds.has(l.listId));
      db.comments = db.comments.filter((c) => c.userId !== uid && !(c.parentId && commentIds.has(c.parentId)) && !(c.targetType === "entry" && entryIds.has(c.targetId)) && !(c.targetType === "list" && listIds.has(c.targetId)));
      db.commentLikes = db.commentLikes.filter((l) => l.userId !== uid && !commentIds.has(l.commentId));
      db.listenLater = db.listenLater.filter((l) => l.userId !== uid);
      db.notifications = db.notifications.filter((n) => n.userId !== uid && n.actorId !== uid);
      db.activity = db.activity.filter((a) => a.actorId !== uid && a.targetUserId !== uid);
      db.reports = db.reports.filter((r) => r.reporterId !== uid);
      db.blocks = db.blocks.filter((b) => b.userId !== uid && b.targetId !== uid);
      for (const u of db.users) u.favoriteSongIds = u.favoriteSongIds.filter(Boolean);
      recomputeAllStats(db);
    });
  },

  completeOnboarding(user: User, followIds: string[], artistIds: string[]): void {
    mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      for (const id of new Set(followIds)) {
        const target = db.users.find((x) => x.id === id && !x.suspended);
        if (id !== u.id && target && !blocked(db, u.id, id) && !db.follows.some((f) => f.followerId === u.id && f.followingId === id)) {
          db.follows.push({ followerId: u.id, followingId: id, createdAt: now() });
          notify(db, id, u.id, "follow");
        }
      }
      for (const a of [...new Set(artistIds)].slice(0, 8)) {
        if (!db.artists.some((x) => x.id === a)) continue;
        if (!u.favoriteArtistIds.includes(a) && u.favoriteArtistIds.length < 8) u.favoriteArtistIds.push(a);
        if (!db.artistFollows.some((f) => f.userId === u.id && f.artistId === a)) db.artistFollows.push({ userId: u.id, artistId: a, createdAt: now() });
      }
      if (!u.favoriteSongIds.length) u.favoriteSongIds = db.ratings.filter((r) => r.userId === u.id && r.rating >= 4.5).slice(0, 4).map((r) => r.songId);
      u.onboarded = true;
    });
  },

  markNotificationsRead(user: User): void {
    mutate((db) => {
      for (const n of db.notifications) if (n.userId === user.id && !n.readAt) n.readAt = now();
    });
  },

  // ── Catalogue and imports ────────────────────────────────────────────

  /** Adds a catalogue track, its album and the rest of the album's tracks. Idempotent. Returns the track's song slug. */
  commitImport(track: ExternalTrack, albumTracks: ExternalTrack[], albumDate: string): string {
    return mutate((db) => {
      const artist = ensureArtist(db.artists, track);
      let album = db.albums.find((a) => a.externalId === track.album.externalId);
      if (!album) {
        album = {
          id: "al" + rawId(track.album.externalId), externalId: track.album.externalId, slug: uniqueSlug(db.albums, slugify(`${track.album.title}-${track.artist.name}`)),
          title: track.album.title, artistId: artist.id, releaseDate: albumDate, genres: track.genre ? [track.genre] : [],
          artworkUrl: track.album.artworkUrl, ...generatedCover(track.artist.name), producers: [],
        } satisfies Album;
        db.albums.push(album);
      }
      let slug = "";
      for (const t of albumTracks) {
        if (db.songs.some((s) => s.externalId === t.externalId)) {
          if (t.externalId === track.externalId) slug = db.songs.find((s) => s.externalId === t.externalId)!.slug;
          continue;
        }
        const q = encodeURIComponent(`${t.title} ${t.artist.name}`);
        const song: Song = {
          id: "so" + rawId(t.externalId), externalId: t.externalId, slug: uniqueSlug(db.songs, slugify(`${t.title}-${t.artist.name}`)), title: t.title,
          albumId: album.id, artistIds: [ensureArtist(db.artists, t).id], featured: t.featured ?? [], durationMs: t.durationMs, trackNumber: t.trackNumber, releaseDate: dateOrNull(t.album.releaseDate) ?? albumDate,
          explicit: t.explicit, writers: [], producers: [], genres: t.genre ? [t.genre] : album.genres, popularity: 50, previewUrl: t.previewUrl,
          links: { apple: t.url, spotify: `https://open.spotify.com/search/${q}`, youtube: `https://www.youtube.com/results?search_query=${q}` },
        };
        db.songs.push(song);
        db.songStats[song.id] = emptyStats();
        if (t.externalId === track.externalId) slug = song.slug;
      }
      return slug;
    });
  },

  /** Remembers an artist's catalogue id (only when it has none yet), so later discography lookups are exact. */
  setArtistExternalId(artistId: string, externalId: string): void {
    mutate((db) => {
      const a = db.artists.find((x) => x.id === artistId);
      if (a) a.externalId ??= externalId;
    });
  },

  /** Adds one diary entry per song unless the user already has one. Returns, per item, whether an entry was written. */
  addImportedEntries(userId: string, items: ImportedEntry[]): boolean[] {
    return mutate((db) => items.map((it) => {
      if (db.entries.some((e) => e.userId === userId && e.songId === it.songId && !e.removed)) return false;
      const at = now();
      db.entries.push({
        id: newId("en"), userId, songId: it.songId, liked: false, listenedAt: it.listenedAt, isRelisten: false,
        tags: it.tags, memory: it.memory, createdAt: at, updatedAt: at,
      });
      recomputeSongStats(db, it.songId);
      return true;
    }));
  },
};

export type Commands = typeof jsonCommands;
