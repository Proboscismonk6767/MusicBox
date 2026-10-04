import type { DB, SongList } from "../../types";
import type { Q } from "./driver";
import { toArtist, toAlbum, toSong, SONG_COLS, toUser, toEntry, toList, toComment, toNotification, toStats } from "./mappers";

/** Reads the whole database back into the JSON store's shape. For tests, exports and migrations; not for requests. */
export async function loadDb(q: Q): Promise<DB> {
  const all = (sql: string) => q.query(sql);
  const items = new Map<string, SongList["items"]>();
  for (const r of await all("select list_id, song_id, note from list_items order by list_id, position")) {
    const list = items.get(r.list_id as string) ?? [];
    list.push({ songId: r.song_id as string, ...(r.note != null ? { note: r.note as string } : {}) });
    items.set(r.list_id as string, list);
  }
  const songStats: DB["songStats"] = {};
  for (const r of await all("select * from song_stats")) songStats[r.song_id as string] = toStats(r)!;
  return {
    version: 4,
    users: (await all("select * from users order by id")).map(toUser),
    artists: (await all("select * from artists order by id")).map(toArtist),
    albums: (await all("select *, release_date::text as release_date from albums order by id")).map(toAlbum),
    songs: (await all(`select ${SONG_COLS} from songs s order by s.id`)).map(toSong),
    ratings: (await all("select * from ratings order by user_id, song_id")).map((r) => ({ userId: r.user_id as string, songId: r.song_id as string, rating: r.rating as number, createdAt: r.created_at as string, updatedAt: r.updated_at as string })),
    likes: (await all("select * from likes order by user_id, song_id")).map((r) => ({ userId: r.user_id as string, songId: r.song_id as string, createdAt: r.created_at as string })),
    entries: (await all("select * from diary_entries order by id")).map(toEntry),
    reviewLikes: (await all("select * from review_likes order by entry_id, user_id")).map((r) => ({ userId: r.user_id as string, entryId: r.entry_id as string, createdAt: r.created_at as string })),
    follows: (await all("select * from follows order by follower_id, following_id")).map((r) => ({ followerId: r.follower_id as string, followingId: r.following_id as string, createdAt: r.created_at as string })),
    artistFollows: (await all("select * from artist_follows order by user_id, artist_id")).map((r) => ({ userId: r.user_id as string, artistId: r.artist_id as string, createdAt: r.created_at as string })),
    lists: (await all("select * from lists order by id")).map((r) => toList(r, items.get(r.id as string) ?? [])),
    listLikes: (await all("select * from list_likes order by list_id, user_id")).map((r) => ({ userId: r.user_id as string, listId: r.list_id as string, createdAt: r.created_at as string })),
    comments: (await all("select * from comments order by id")).map(toComment),
    commentLikes: (await all("select * from comment_likes order by comment_id, user_id")).map((r) => ({ userId: r.user_id as string, commentId: r.comment_id as string })),
    listenLater: (await all("select * from listen_later order by user_id, song_id")).map((r) => ({ userId: r.user_id as string, songId: r.song_id as string, createdAt: r.created_at as string })),
    notifications: (await all("select * from notifications order by id")).map(toNotification),
    activity: (await all("select * from activity_events order by id")).map((r) => ({
      id: r.id as string, actorId: r.actor_id as string, type: r.event_type as DB["activity"][number]["type"], songId: (r.song_id as string | null) ?? undefined, listId: (r.list_id as string | null) ?? undefined,
      entryId: (r.entry_id as string | null) ?? undefined, targetUserId: (r.target_user_id as string | null) ?? undefined, count: (r.count as number | null) ?? undefined, createdAt: r.created_at as string,
    })),
    reports: (await all("select * from reports order by id")).map((r) => ({ id: r.id as string, reporterId: r.reporter_id as string, targetType: r.target_type as "entry", targetId: r.target_id as string, reason: r.reason as string, status: r.status as "open", createdAt: r.created_at as string })),
    blocks: (await all("select * from user_blocks order by user_id, target_id, kind")).map((r) => ({ userId: r.user_id as string, targetId: r.target_id as string, kind: r.kind as "block" })),
    sessions: (await all("select * from sessions order by token_hash")).map((r) => ({ tokenHash: r.token_hash as string, userId: r.user_id as string, createdAt: r.created_at as string, expiresAt: r.expires_at as string })),
    songStats,
  };
}
