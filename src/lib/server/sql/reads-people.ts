import "server-only";
import type { Q } from "./driver";
import type { PublicUser, SongList, User } from "../../types";
import type { CommentView, Cover, FeedItem, ListCard, ReviewView, SongCard } from "../../views";
import { toEntry, toList, toUser } from "./mappers";
import { covers, listCards, reviewViews, songCards, toUserMini, userMinis, viewerSongStates } from "./hydrate";
import { entryOk, hidden, listOk, visibleUser } from "./visibility";
import { byId, C, compatWith, ids } from "./helpers";
import { matcher } from "../algorithms";

// People, reviews, lists, feed, notifications, search, recommendations and the small
// reads for pages that don't fit elsewhere. See reads.ts for the catalogue half.

const MAX_DIARY_ROWS = 1000;
const MAX_COMMENTS = 300;
const MAX_LIST_CARDS = 200;
type R = Record<string, unknown>;
const toPublic = (u: User): PublicUser => { const { passwordHash: _p, ...rest } = u; void _p; return rest; };

export function peopleReads(q: Q) {
  const one = async (sql: string, params?: unknown[]) => (await q.query(sql, params))[0];

  /** A list with its items, in the shape the JSON store uses. */
  async function loadList(id: string): Promise<SongList | undefined> {
    const row = await one("select * from lists where id = $1", [id]);
    if (!row) return undefined;
    const items = (await q.query("select song_id, note from list_items where list_id = $1 order by position", [id])).map((r) => ({ songId: r.song_id as string, ...(r.note != null ? { note: r.note as string } : {}) }));
    return toList(row, items);
  }

  /** The ordering the diary uses: the day listened, then when it was logged, newest first. */
  const DIARY_ORDER = `e.listened_at desc, e.created_at desc, e.id ${C}`;

  const reads = {
    // ── People ────────────────────────────────────────────────────────

    async getUserByName(username: string): Promise<User | undefined> {
      const row = await one("select * from users where username = $1", [username.toLowerCase()]);
      return row ? toUser(row) : undefined;
    },

    async getProfile(username: string, viewerId?: string) {
      const user = await reads.getUserByName(username);
      if (!user || user.suspended) return null;
      const v = viewerId ?? null;
      const year = String(new Date().getFullYear());
      const row = await one(
        `select (${visibleUser("u", "$2")} and not ${hidden("$2", "u.id")}) as can_view,
                (select count(*)::int from diary_entries e where e.user_id = u.id and not e.removed) as logged,
                (select count(*)::int from ratings r where r.user_id = u.id) as rated,
                (select count(*)::int from diary_entries e where e.user_id = u.id and not e.removed and coalesce(e.review_text, '') <> '') as reviews,
                (select count(*)::int from lists l where l.user_id = u.id and not l.removed and (l.visibility = 'public' or l.user_id = $2::text)) as lists,
                (select count(*)::int from follows f where f.following_id = u.id) as followers,
                (select count(*)::int from follows f where f.follower_id = u.id) as following,
                (select count(*)::int from listen_later ll where ll.user_id = u.id) as listen_later,
                (select count(*)::int from likes l where l.user_id = u.id) as likes,
                (select count(*)::int from diary_entries e where e.user_id = u.id and not e.removed and to_char(e.listened_at, 'YYYY') = $3) as this_year,
                ($2::text is not null and exists (select 1 from follows f where f.follower_id = $2::text and f.following_id = u.id)) as viewer_follows,
                ($2::text is not null and exists (select 1 from follows f where f.follower_id = u.id and f.following_id = $2::text)) as follows_viewer,
                ($2::text is not null and exists (select 1 from user_blocks b where b.user_id = $2::text and b.target_id = u.id and b.kind = 'block')) as blocked,
                ($2::text is not null and exists (select 1 from user_blocks b where b.user_id = $2::text and b.target_id = u.id and b.kind = 'mute')) as muted
         from users u where u.id = $1`, [user.id, v, year]);
      const canView = row.can_view as boolean;
      const [comp, lyricCards] = await Promise.all([
        viewerId && viewerId !== user.id ? compatWith(q, viewerId, [user.id]).then((m) => m.get(user.id)!) : null,
        canView && user.profileLyric ? songCards(q, [user.profileLyric.songId]) : [],
      ]);
      const sharedTop = comp ? await songCards(q, comp.topIds) : [];
      return {
        user: { ...{ id: user.id, username: user.username, displayName: user.displayName, avatarHue: user.avatarHue, avatarUrl: user.avatarUrl }, bio: user.bio, location: user.location, website: user.website, createdAt: user.createdAt },
        counts: {
          logged: row.logged as number, rated: row.rated as number, reviews: row.reviews as number, lists: row.lists as number,
          followers: row.followers as number, following: row.following as number, listenLater: row.listen_later as number, likes: row.likes as number, thisYear: row.this_year as number,
        },
        isSelf: viewerId === user.id,
        viewerFollows: row.viewer_follows as boolean,
        followsViewer: row.follows_viewer as boolean,
        blocked: row.blocked as boolean,
        muted: row.muted as boolean,
        compatibility: comp ? { score: comp.score, shared: comp.shared, sharedTop } : null,
        lyric: lyricCards[0] && user.profileLyric ? { text: user.profileLyric.text, startMs: user.profileLyric.startMs ?? null, song: lyricCards[0] } : null,
        canView,
        // Never the full record: the password hash stays server-side.
        raw: toPublic(user),
      };
    },

    async profileOverview(user: PublicUser, viewerId?: string) {
      const v = viewerId ?? null;
      const [recentRows, reviewRows, listRows, ratingRows, favSongs, artistRows] = await Promise.all([
        q.query(`select e.id, e.song_id, e.rating_at_time, e.liked, e.is_relisten, (coalesce(e.review_text, '') <> '') as has_review from diary_entries e where e.user_id = $1 and not e.removed order by ${DIARY_ORDER} limit 12`, [user.id]),
        q.query(`select e.id from diary_entries e where e.user_id = $1 and not e.removed and coalesce(e.review_text, '') <> '' order by ${DIARY_ORDER} limit 4`, [user.id]),
        q.query(`select l.id from lists l where l.user_id = $1 and not l.removed and (l.visibility = 'public' or l.user_id = $2::text) order by l.updated_at desc, l.id ${C} limit 3`, [user.id, v]),
        q.query("select rating from ratings where user_id = $1", [user.id]),
        songCards(q, user.favoriteSongIds),
        q.query("select id, name, slug, image_url, hue from artists where id = any($1::text[])", [user.favoriteArtistIds]),
      ]);
      const [recentSongs, reviews, lists] = await Promise.all([songCards(q, ids(recentRows, "song_id")), reviewViews(q, ids(reviewRows), viewerId), listCards(q, ids(listRows))]);
      const songById = new Map(recentSongs.map((s) => [s.id, s]));
      const artistById = new Map(artistRows.map((a) => [a.id as string, { name: a.name as string, slug: a.slug as string, imageUrl: (a.image_url as string | null) ?? undefined, hue: a.hue as number }]));
      const histogram = Array(10).fill(0);
      for (const r of ratingRows) histogram[(r.rating as number) * 2 - 1]++;
      return {
        favourites: favSongs,
        recent: recentRows.map((e) => ({ entryId: e.id as string, song: songById.get(e.song_id as string)!, rating: (e.rating_at_time as number | null) ?? undefined, liked: e.liked as boolean, isRelisten: e.is_relisten as boolean, review: e.has_review as boolean })),
        reviews,
        favArtists: user.favoriteArtistIds.map((a) => artistById.get(a)).filter((a): a is NonNullable<typeof a> => !!a),
        lists, histogram, ratingCount: ratingRows.length,
      };
    },

    async getDiary(user: PublicUser, f: DiaryFilters, viewerId?: string) {
      const all = await q.query(
        `select e.id, e.song_id, e.listened_at, e.rating_at_time, e.liked, e.is_relisten, e.tags, s.genres,
                array(select a.slug from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position) as artist_slugs,
                array(select a.name from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position) as artist_names
         from diary_entries e join songs s on s.id = e.song_id where e.user_id = $1 and not e.removed order by ${DIARY_ORDER}`, [user.id]);
      const years = [...new Set(all.map((e) => (e.listened_at as string).slice(0, 4)))].sort().reverse();
      const artistSet = new Map<string, string>();
      const genreSet = new Set<string>();
      const tagSet = new Set<string>();
      for (const e of all) {
        artistSet.set((e.artist_slugs as string[])[0], (e.artist_names as string[])[0]);
        (e.genres as string[]).forEach((g) => genreSet.add(g));
        (e.tags as string[]).forEach((t) => tagSet.add(t));
      }
      const filtered = all.filter((e) => {
        const at = e.listened_at as string;
        if (f.year && !at.startsWith(f.year)) return false;
        if (f.month && at.slice(5, 7) !== f.month.padStart(2, "0")) return false;
        if (f.artist && !(e.artist_slugs as string[]).includes(f.artist)) return false;
        if (f.rating && String(e.rating_at_time ?? "") !== f.rating) return false;
        if (f.genre && !(e.genres as string[]).includes(f.genre)) return false;
        if (f.relisten === "1" && !e.is_relisten) return false;
        if (f.relisten === "0" && e.is_relisten) return false;
        if (f.liked === "1" && !e.liked) return false;
        if (f.tag && !(e.tags as string[]).includes(f.tag)) return false;
        return true;
      });
      const listenCounts = new Map<string, number>();
      for (const e of all) listenCounts.set(e.song_id as string, (listenCounts.get(e.song_id as string) ?? 0) + 1);
      const shown = filtered.slice(0, MAX_DIARY_ROWS);
      const views = await reviewViews(q, ids(shown), viewerId);
      const songOf = new Map(shown.map((e) => [e.id as string, e.song_id as string]));
      return {
        entries: views.map((e) => ({ ...e, playCount: listenCounts.get(songOf.get(e.id)!) ?? 1 })),
        truncated: filtered.length > MAX_DIARY_ROWS,
        total: all.length,
        years,
        artists: [...artistSet.entries()].sort((a, b) => a[1].localeCompare(b[1])),
        genres: [...genreSet].sort(),
        tags: [...tagSet].sort(),
      };
    },

    async getUserReviews(user: PublicUser, sort: string, viewerId?: string): Promise<ReviewView[]> {
      const order = sort === "popular" ? `(select count(*) from review_likes rl where rl.entry_id = e.id) desc, ${DIARY_ORDER}`
        : sort === "rating" ? `coalesce(e.rating_at_time, 0) desc, ${DIARY_ORDER}` : DIARY_ORDER;
      const rows = await q.query(`select e.id from diary_entries e where e.user_id = $1 and not e.removed and coalesce(e.review_text, '') <> '' order by ${order} limit ${MAX_DIARY_ROWS}`, [user.id]);
      return reviewViews(q, ids(rows), viewerId);
    },

    async getUserLists(user: PublicUser, viewerId?: string): Promise<ListCard[]> {
      const rows = await q.query("select l.id from lists l where l.user_id = $1 and not l.removed and (l.visibility = 'public' or l.user_id = $2::text) order by l.updated_at desc, l.id " + C, [user.id, viewerId ?? null]);
      return listCards(q, ids(rows));
    },

    async getUserLikes(user: PublicUser): Promise<{ song: SongCard; rating?: number }[]> {
      const rows = await q.query("select l.song_id, r.rating from likes l left join ratings r on r.user_id = l.user_id and r.song_id = l.song_id where l.user_id = $1 order by l.created_at desc, l.song_id " + C, [user.id]);
      const cards = new Map((await songCards(q, ids(rows, "song_id"))).map((c) => [c.id, c]));
      return rows.map((r) => ({ song: cards.get(r.song_id as string)!, rating: (r.rating as number | null) ?? undefined }));
    },

    async getFollowList(user: PublicUser, kind: "followers" | "following", viewerId?: string) {
      const [self, other] = kind === "followers" ? ["following_id", "follower_id"] : ["follower_id", "following_id"];
      const rows = await q.query(
        `select u.id, u.username::text as username, u.display_name, u.avatar_hue, u.avatar_url, u.bio,
                ($2::text is not null and exists (select 1 from follows vf where vf.follower_id = $2::text and vf.following_id = u.id)) as viewer_follows,
                (select count(*)::int from diary_entries e where e.user_id = u.id and not e.removed) as logged
         from follows f join users u on u.id = f.${other}
         where f.${self} = $1 and not u.suspended order by f.created_at, u.id ${C}`, [user.id, viewerId ?? null]);
      return rows.map((r) => ({ ...toUserMini(r), bio: r.bio as string, viewerFollows: r.viewer_follows as boolean, logged: r.logged as number }));
    },

    async compatibility(aId: string, bId: string): Promise<{ score: number; shared: number; sharedTop: SongCard[] }> {
      const c = (await compatWith(q, aId, [bId])).get(bId)!;
      return { score: c.score, shared: c.shared, sharedTop: await songCards(q, c.topIds) };
    },

    // ── Reviews, comments and lists ───────────────────────────────────

    async getReview(id: string, viewerId?: string) {
      const row = await one(`select e.* from diary_entries e join users u on u.id = e.user_id where e.id = $1 and ${entryOk("e", "u", "$2")}`, [id, viewerId ?? null]);
      if (!row) return null;
      const entry = toEntry(row);
      if (!entry.review && !entry.rating) return null;
      const [views, comments, plays] = await Promise.all([
        reviewViews(q, [id], viewerId), reads.getComments("entry", id, viewerId),
        one("select count(*)::int as n from diary_entries where song_id = $1 and user_id = $2 and not removed", [entry.songId, entry.userId]),
      ]);
      return { review: views[0], comments, isOwner: viewerId === entry.userId, plays: plays.n as number, entry };
    },

    async getComments(targetType: "entry" | "list", targetId: string, viewerId?: string): Promise<CommentView[]> {
      const rows = await q.query(
        `select c.id, c.user_id, c.parent_id, c.body, c.created_at from comments c join users u on u.id = c.user_id
         where c.target_type = $1 and c.target_id = $2 and not c.removed and not u.suspended and not ${hidden("$3", "c.user_id")}
         order by c.created_at, c.id ${C} limit ${MAX_COMMENTS}`, [targetType, targetId, viewerId ?? null]);
      if (!rows.length) return [];
      const [likes, users] = await Promise.all([
        q.query("select comment_id, count(*)::int as n, coalesce(bool_or(user_id = $2::text), false) as mine from comment_likes where comment_id = any($1::text[]) group by comment_id", [ids(rows), viewerId ?? null]),
        userMinis(q, ids(rows, "user_id")),
      ]);
      const likeOf = new Map(likes.map((l) => [l.comment_id as string, l]));
      const toView = (c: (typeof rows)[number]): CommentView => ({
        id: c.id as string, user: users.get(c.user_id as string)!, body: c.body as string, createdAt: c.created_at as string,
        likeCount: (likeOf.get(c.id as string)?.n as number | undefined) ?? 0, viewerLiked: !!viewerId && !!likeOf.get(c.id as string)?.mine,
        replies: [], canDelete: viewerId === c.user_id,
      });
      const roots = rows.filter((c) => !c.parent_id).map(toView);
      const rootById = new Map(roots.map((r) => [r.id, r]));
      for (const c of rows.filter((c) => c.parent_id)) rootById.get(c.parent_id as string)?.replies.push(toView(c));
      return roots;
    },

    async getListPage(id: string, viewerId?: string) {
      const ok = await one(`select 1 as ok from lists l join users u on u.id = l.user_id where l.id = $1 and ${listOk("l", "u", "$2")}`, [id, viewerId ?? null]);
      if (!ok) return null;
      const list = (await loadList(id))!;
      const songIds = list.items.map((it) => it.songId);
      const [cardList, songs, states, liked, comments, clonedFrom] = await Promise.all([
        listCards(q, [id]), songCards(q, songIds), viewerSongStates(q, songIds, viewerId),
        viewerId ? one("select 1 as x from list_likes where list_id = $1 and user_id = $2", [id, viewerId]) : Promise.resolve(undefined),
        reads.getComments("list", id, viewerId),
        list.clonedFromId ? loadList(list.clonedFromId) : Promise.resolve(undefined),
      ]);
      const songById = new Map(songs.map((s) => [s.id, s]));
      return {
        list, card: cardList[0], items: list.items.map((it) => ({ song: songById.get(it.songId)!, note: it.note })), states,
        isOwner: viewerId === list.userId, viewerLiked: !!viewerId && !!liked, comments, clonedFrom,
      };
    },

    async viewerLists(viewerId: string) {
      const rows = await q.query(
        `select l.id, l.title, array(select li.song_id from list_items li where li.list_id = l.id order by li.position) as song_ids
         from lists l where l.user_id = $1 and not l.removed order by l.updated_at desc, l.id ${C}`, [viewerId]);
      return rows.map((r) => ({ id: r.id as string, title: r.title as string, count: (r.song_ids as string[]).length, songIds: r.song_ids as string[] }));
    },

    async browseLists(sort: string, viewerId?: string): Promise<ListCard[]> {
      const order = sort === "recent" ? `l.updated_at desc, l.id ${C}` : `(select count(*) from list_likes ll where ll.list_id = l.id) desc, l.id ${C}`;
      const rows = await q.query(`select l.id from lists l join users u on u.id = l.user_id where l.visibility = 'public' and ${listOk("l", "u", "$1")} order by ${order} limit ${MAX_LIST_CARDS}`, [viewerId ?? null]);
      return listCards(q, ids(rows));
    },

    async getListenLater(viewerId: string) {
      const rows = await q.query("select ll.song_id, ll.created_at, s.genres from listen_later ll join songs s on s.id = ll.song_id where ll.user_id = $1 order by ll.created_at, ll.song_id " + C, [viewerId]);
      const cards = new Map((await songCards(q, ids(rows, "song_id"))).map((c) => [c.id, c]));
      return rows.map((r) => ({ song: cards.get(r.song_id as string)!, addedAt: r.created_at as string, genres: r.genres as string[] }));
    },

    // ── Feed and notifications ────────────────────────────────────────

    async getFeed(viewerId: string, before?: string, limit = 25): Promise<{ items: FeedItem[]; next?: string }> {
      const items: FeedItem[] = [];
      const likedSeen = new Set<string>();
      let cursor: { at: string; id: string } | null = null as { at: string; id: string } | null;
      const CHUNK = Math.max(50, limit * 2);
      for (;;) {
        // Events newest first, in chunks, until enough of them turn into feed items.
        const events: R[] = await q.query<R>(
          `select a.* from activity_events a
           where a.actor_id in (select following_id from follows where follower_id = $1 union select $1::text)
             and ($2::timestamptz is null or a.created_at < $2::timestamptz)
             and ($3::timestamptz is null or a.created_at < $3::timestamptz or (a.created_at = $3::timestamptz and a.id ${C} > $4::text))
             and not ${hidden("$1", "a.actor_id")}
           order by a.created_at desc, a.id ${C} limit ${CHUNK}`, [viewerId, before ?? null, cursor?.at ?? null, cursor?.id ?? null]);
        if (!events.length) break;

        const entryIds = events.filter((a) => (a.event_type === "song_logged" || a.event_type === "song_reviewed") && a.entry_id).map((a) => a.entry_id as string);
        const listIds = events.filter((a) => (a.event_type === "list_created" || a.event_type === "list_updated") && a.list_id).map((a) => a.list_id as string);
        const [actors, okEntries, okLists, songs, views, cards, targets] = await Promise.all([
          q.query(`select u.id from users u where u.id = any($1::text[]) and ${visibleUser("u", "$2")}`, [events.map((a) => a.actor_id as string), viewerId]),
          entryIds.length ? q.query(`select e.id from diary_entries e join users u on u.id = e.user_id where e.id = any($1::text[]) and ${entryOk("e", "u", "$2")}`, [entryIds, viewerId]) : [],
          listIds.length ? q.query("select id from lists where id = any($1::text[]) and not removed and visibility = 'public'", [listIds]) : [],
          songCards(q, events.filter((a) => a.event_type === "song_liked" && a.song_id).map((a) => a.song_id as string)),
          reviewViews(q, entryIds, viewerId),
          listCards(q, listIds),
          userMinis(q, [...events.map((a) => a.actor_id as string), ...events.filter((a) => a.target_user_id).map((a) => a.target_user_id as string)]),
        ]);
        const actorOk = new Set(ids(actors));
        const entryOkIds = new Set(ids(okEntries));
        const listOkIds = new Set(ids(okLists));
        const songById = new Map(songs.map((s) => [s.id, s]));
        const viewById = new Map(views.map((r) => [r.id, r]));
        const cardById = new Map(cards.map((c) => [c.id, c]));

        for (const a of events) {
          cursor = { at: a.created_at as string, id: a.id as string };
          if (!actorOk.has(a.actor_id as string)) continue;
          const actor = targets.get(a.actor_id as string)!;
          const at = a.created_at as string;
          if ((a.event_type === "song_logged" || a.event_type === "song_reviewed") && a.entry_id) {
            if (!entryOkIds.has(a.entry_id as string)) continue;
            items.push({ kind: "entry", id: a.id as string, at, actor, review: viewById.get(a.entry_id as string)! });
          } else if (a.event_type === "song_liked" && a.song_id) {
            // Skip a like immediately duplicated by a log card for the same song.
            const k = (a.actor_id as string) + (a.song_id as string);
            if (likedSeen.has(k)) continue;
            likedSeen.add(k);
            items.push({ kind: "like", id: a.id as string, at, actor, song: songById.get(a.song_id as string)! });
          } else if ((a.event_type === "list_created" || a.event_type === "list_updated") && a.list_id) {
            if (!listOkIds.has(a.list_id as string)) continue;
            items.push({ kind: "list", id: a.id as string, at, actor, list: cardById.get(a.list_id as string)!, verb: a.event_type === "list_created" ? "created" : "updated", count: (a.count as number | null) ?? undefined });
          } else if (a.event_type === "user_followed" && a.target_user_id) {
            const target = targets.get(a.target_user_id as string);
            if (!target) continue;
            items.push({ kind: "follow", id: a.id as string, at, actor, target });
          }
          if (items.length >= limit) break;
        }
        if (items.length >= limit || events.length < CHUNK) break;
      }
      // Collapse likes that duplicate a log of the same song by the same actor.
      const logged = new Set(items.filter((x) => x.kind === "entry").map((x) => (x.kind === "entry" ? x.actor.id + x.review.song.id : "")));
      const deduped = items.filter((x) => !(x.kind === "like" && logged.has(x.actor.id + x.song.id)));
      return { items: deduped, next: items.length >= limit ? items[items.length - 1].at : undefined };
    },

    async getNotifications(userId: string) {
      const rows = await q.query(`select n.* from notifications n where n.user_id = $1 and not ${hidden("$1", "n.actor_id")} order by n.created_at desc, n.id ${C} limit 80`, [userId]);
      if (!rows.length) return [];
      const entryTypes = new Set(["review_like", "review_comment", "comment_reply", "friend_reviewed"]);
      const entryIds = rows.filter((n) => n.target_id && entryTypes.has(n.type as string)).map((n) => n.target_id as string);
      const listIds = rows.filter((n) => n.target_id && (n.type === "list_like" || n.type === "list_comment")).map((n) => n.target_id as string);
      const [actors, entries, lists] = await Promise.all([
        userMinis(q, ids(rows, "actor_id")),
        entryIds.length ? q.query("select e.id, s.title, s.album_id from diary_entries e join songs s on s.id = e.song_id where e.id = any($1::text[]) and not e.removed", [entryIds]) : [],
        listIds.length ? q.query("select id, title from lists where id = any($1::text[])", [listIds]) : [],
      ]);
      const coverMap = await covers(q, entries.map((e) => e.album_id as string));
      const entryById = new Map(entries.map((e) => [e.id as string, e]));
      const listById = new Map(lists.map((l) => [l.id as string, l]));
      return rows
        .map((n) => {
          let target: { href: string; label: string; cover?: Cover } | undefined;
          if (n.target_id && entryTypes.has(n.type as string)) {
            const e = entryById.get(n.target_id as string);
            if (e) target = { href: `/review/${e.id}`, label: e.title as string, cover: coverMap.get(e.album_id as string) };
          } else if (n.target_id && (n.type === "list_like" || n.type === "list_comment")) {
            const l = listById.get(n.target_id as string);
            if (l) target = { href: `/list/${l.id}`, label: l.title as string };
          }
          return {
            id: n.id as string, userId: n.user_id as string, actorId: n.actor_id as string, type: n.type as never, targetId: (n.target_id as string | null) ?? undefined,
            readAt: (n.read_at as string | null) ?? undefined, createdAt: n.created_at as string, actor: actors.get(n.actor_id as string) ?? null, target,
          };
        })
        .filter((n) => n.actor);
    },

    async unreadCount(userId: string): Promise<number> {
      return (await one(`select count(*)::int as n from notifications n where n.user_id = $1 and n.read_at is null and not ${hidden("$1", "n.actor_id")}`, [userId])).n as number;
    },

    // ── Search ────────────────────────────────────────────────────────

    async search(query: string, limit = 8, viewerId?: string) {
      const m = matcher(query);
      if (!m.tokens.length) return { songs: [], artists: [], albums: [], users: [], lists: [] };
      const like = m.tokens.map((t) => `%${t}%`);
      const v = viewerId ?? null;
      const [songRows, artistRows, albumRows, userRows, listRows] = await Promise.all([
        q.query(
          `select s.id, s.title, s.featured, coalesce(s.popularity, 0) as popularity, coalesce(st.log_count, 0) as logs,
                  array(select a.name from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position) as artists, al.title as album
           from songs s join albums al on al.id = s.album_id left join song_stats st on st.song_id = s.id
           where s.search_text like all($1::text[]) order by coalesce(st.log_count, 0) desc, s.id ${C} limit 1000`, [like]),
        q.query(`select a.id, a.name, a.slug, a.image_url, a.hue, a.genres, (select count(*)::int from song_artists sa where sa.artist_id = a.id) as songs
                 from artists a where a.search_text like all($1::text[]) order by songs desc, a.id ${C} limit 300`, [like]),
        q.query(`select al.id, al.title, al.slug, al.release_date, ar.name as artist from albums al join artists ar on ar.id = al.artist_id where al.search_text like all($1::text[]) order by al.id ${C} limit 300`, [like]),
        q.query(`select u.id, u.username::text as username, u.display_name, u.avatar_hue, u.avatar_url from users u
                 where u.search_text like all($1::text[]) and not u.suspended and not ${hidden("$2", "u.id")} order by u.id ${C} limit 300`, [like, v]),
        q.query(`select l.id, l.title, l.description from lists l join users u on u.id = l.user_id
                 where l.search_text like all($1::text[]) and l.visibility = 'public' and ${listOk("l", "u", "$2")} order by l.id ${C} limit 300`, [like, v]),
      ]);
      const top = (rows: R[], score: (r: R) => number, n: number) =>
        rows.map((r) => ({ r, s: score(r) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || byId(a.r.id as string, b.r.id as string)).slice(0, n).map((x) => x.r);
      const songs = top(songRows, (r) => m.score(r.title as string, `${(r.artists as string[]).join(" ")} ${r.album} ${(r.featured as string[]).join(" ")}`, Math.log2(1 + (r.logs as number)) * 3 + (r.popularity as number) / 20), limit);
      const artists = top(artistRows, (r) => m.score(r.name as string, (r.genres as string[]).join(" "), (r.songs as number) / 5), 5);
      const albums = top(albumRows, (r) => m.score(r.title as string, r.artist as string, 0), 5);
      const users = top(userRows, (r) => m.score(r.username as string, r.display_name as string, 0), 5);
      const lists = top(listRows, (r) => m.score(r.title as string, r.description as string, 0), 5);
      const albumCovers = await covers(q, ids(albums));
      return {
        songs: await songCards(q, ids(songs)),
        artists: artists.map((a) => ({ name: a.name as string, slug: a.slug as string, imageUrl: (a.image_url as string | null) ?? undefined, hue: a.hue as number, genres: a.genres as string[] })),
        albums: albums.map((a) => ({ title: a.title as string, slug: a.slug as string, artist: a.artist as string, year: Number((a.release_date as string).slice(0, 4)), cover: albumCovers.get(a.id as string)! })),
        users: users.map(toUserMini),
        lists: await listCards(q, ids(lists)),
      };
    },
  };
  return reads;
}

export interface DiaryFilters { year?: string; month?: string; artist?: string; rating?: string; genre?: string; relisten?: string; liked?: string; tag?: string }
