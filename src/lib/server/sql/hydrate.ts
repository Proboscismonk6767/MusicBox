import type { Cover, ListCard, ReviewView, SongCard, UserMini, ViewerSongState } from "../../views";
import type { Q } from "./driver";

// Batch loaders that turn ids into the view models the pages use (the SQL twins of
// songCard(), reviewView(), listCard() in queries.ts). Each makes a fixed number of
// queries however many ids it is given, and returns results in the order of the ids.

const orNull = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);
const unique = <T>(xs: T[]) => [...new Set(xs)];

export function toUserMini(r: Record<string, unknown>): UserMini {
  return { id: r.id as string, username: r.username as string, displayName: r.display_name as string, avatarHue: r.avatar_hue as number, avatarUrl: orNull(r.avatar_url as string | null) };
}

export async function userMinis(q: Q, ids: string[]): Promise<Map<string, UserMini>> {
  if (!ids.length) return new Map();
  const rows = await q.query("select id, username::text as username, display_name, avatar_hue, avatar_url from users where id = any($1::text[])", [unique(ids)]);
  return new Map(rows.map((r) => [r.id as string, toUserMini(r)]));
}

export async function covers(q: Q, albumIds: string[]): Promise<Map<string, Cover>> {
  if (!albumIds.length) return new Map();
  const rows = await q.query("select id, title, artwork_url, palette, pattern from albums where id = any($1::text[])", [unique(albumIds)]);
  return new Map(rows.map((r) => [r.id as string, { title: r.title as string, artworkUrl: orNull(r.artwork_url as string | null), palette: r.palette as [string, string, string], pattern: r.pattern as number }]));
}

const SONG_CARD_SQL = `
  select s.id, s.slug, s.title, s.featured, s.release_date, s.duration_ms, s.explicit, s.track_number,
         al.title as album_title, al.slug as album_slug, al.artwork_url, al.palette, al.pattern,
         st.rating_count, st.rating_sum,
         coalesce((select json_agg(json_build_object('name', a.name, 'slug', a.slug) order by sa.position)
                   from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id), '[]'::json) as artists
  from songs s
  join albums al on al.id = s.album_id
  left join song_stats st on st.song_id = s.id`;

export function toSongCard(r: Record<string, unknown>): SongCard {
  const count = (r.rating_count as number | null) ?? 0;
  const sum = (r.rating_sum as number | null) ?? 0;
  const releaseDate = (r.release_date as string | null) ?? "1970-01-01";
  return {
    id: r.id as string, slug: r.slug as string, title: r.title as string,
    artists: r.artists as { name: string; slug: string }[],
    featured: (r.featured as string[]) ?? [], album: { title: r.album_title as string, slug: r.album_slug as string },
    cover: { title: r.album_title as string, artworkUrl: orNull(r.artwork_url as string | null), palette: r.palette as [string, string, string], pattern: r.pattern as number },
    year: Number(releaseDate.slice(0, 4)), releaseDate, durationMs: r.duration_ms as number, explicit: r.explicit as boolean,
    avg: count ? sum / count : 0, ratingCount: count, trackNumber: (r.track_number as number | null) ?? 0,
  };
}

/** Song cards for these ids, in the same order. Ids that don't exist are skipped. */
export async function songCards(q: Q, ids: string[]): Promise<SongCard[]> {
  if (!ids.length) return [];
  const rows = await q.query(`${SONG_CARD_SQL} where s.id = any($1::text[])`, [unique(ids)]);
  const byId = new Map(rows.map((r) => [r.id as string, toSongCard(r)]));
  return ids.map((id) => byId.get(id)).filter((c): c is SongCard => !!c);
}

/** What the viewer has done with each song: rating, like, listen-later, and how many times they've logged it. */
export async function viewerSongStates(q: Q, songIds: string[], viewerId?: string): Promise<Record<string, ViewerSongState>> {
  const out: Record<string, ViewerSongState> = {};
  for (const id of songIds) out[id] = { liked: false, listenLater: false, logCount: 0 };
  if (!viewerId || !songIds.length) return out;
  const ids = unique(songIds);
  const [ratings, likes, later, logs] = await Promise.all([
    q.query("select song_id, rating from ratings where user_id = $1 and song_id = any($2::text[])", [viewerId, ids]),
    q.query("select song_id from likes where user_id = $1 and song_id = any($2::text[])", [viewerId, ids]),
    q.query("select song_id from listen_later where user_id = $1 and song_id = any($2::text[])", [viewerId, ids]),
    q.query("select song_id, count(*)::int as n from diary_entries where user_id = $1 and not removed and song_id = any($2::text[]) group by song_id", [viewerId, ids]),
  ]);
  for (const r of ratings) out[r.song_id as string].rating = r.rating as number;
  for (const r of likes) out[r.song_id as string].liked = true;
  for (const r of later) out[r.song_id as string].listenLater = true;
  for (const r of logs) out[r.song_id as string].logCount = r.n as number;
  return out;
}

/** Review views for these diary entries (ids that don't exist are skipped). Visibility is the caller's job. */
export async function reviewViews(q: Q, ids: string[], viewerId?: string): Promise<ReviewView[]> {
  if (!ids.length) return [];
  const rows = await q.query(
    `select e.id, e.user_id, e.song_id, e.rating_at_time, e.liked, e.review_text, e.has_spoiler, e.listened_at, e.is_relisten, e.tags, e.created_at,
            (select count(*)::int from review_likes rl where rl.entry_id = e.id) as like_count,
            (select count(*)::int from comments c where c.target_type = 'entry' and c.target_id = e.id and not c.removed) as comment_count,
            ($2::text is not null and exists (select 1 from review_likes rl where rl.entry_id = e.id and rl.user_id = $2::text)) as viewer_liked,
            ($2::text is not null and exists (select 1 from follows f where f.follower_id = $2::text and f.following_id = e.user_id)) as followed
     from diary_entries e where e.id = any($1::text[])`,
    [unique(ids), viewerId ?? null],
  );
  const [users, songs] = await Promise.all([userMinis(q, rows.map((r) => r.user_id as string)), songCards(q, rows.map((r) => r.song_id as string))]);
  const songById = new Map(songs.map((s) => [s.id, s]));
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const out: ReviewView[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const user = users.get(r.user_id as string);
    const song = songById.get(r.song_id as string);
    if (!user || !song) continue;
    out.push({
      id, user, song, rating: orNull(r.rating_at_time as number | null), liked: r.liked as boolean, review: orNull(r.review_text as string | null),
      hasSpoiler: (r.has_spoiler as boolean) || undefined, listenedAt: r.listened_at as string, isRelisten: r.is_relisten as boolean, tags: (r.tags as string[]) ?? [],
      likeCount: r.like_count as number, commentCount: r.comment_count as number, viewerLiked: r.viewer_liked as boolean, createdAt: r.created_at as string,
      followedByViewer: r.followed as boolean,
    });
  }
  return out;
}

/** List cards for these lists (ids that don't exist are skipped). Visibility is the caller's job. */
export async function listCards(q: Q, ids: string[]): Promise<ListCard[]> {
  if (!ids.length) return [];
  const uniq = unique(ids);
  const [rows, albums] = await Promise.all([
    q.query(
      `select l.id, l.user_id, l.title, l.description, l.is_ranked, l.visibility, l.updated_at,
              (select count(*)::int from list_items li where li.list_id = l.id) as item_count,
              (select count(*)::int from list_likes ll where ll.list_id = l.id) as like_count,
              (select count(*)::int from comments c where c.target_type = 'list' and c.target_id = l.id and not c.removed) as comment_count
       from lists l where l.id = any($1::text[])`, [uniq]),
    // The first album each list's songs come from, in list order (a list card shows up to four covers).
    q.query("select li.list_id, s.album_id, min(li.position) as pos from list_items li join songs s on s.id = li.song_id where li.list_id = any($1::text[]) group by li.list_id, s.album_id", [uniq]),
  ]);
  const albumsByList = new Map<string, { album: string; pos: number }[]>();
  for (const r of albums) {
    const list = albumsByList.get(r.list_id as string) ?? [];
    list.push({ album: r.album_id as string, pos: r.pos as number });
    albumsByList.set(r.list_id as string, list);
  }
  const firstFour = new Map([...albumsByList].map(([id, l]) => [id, l.sort((a, b) => a.pos - b.pos).slice(0, 4).map((x) => x.album)]));
  const [owners, coverMap] = await Promise.all([userMinis(q, rows.map((r) => r.user_id as string)), covers(q, [...firstFour.values()].flat())]);
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const out: ListCard[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    const owner = r && owners.get(r.user_id as string);
    if (!r || !owner) continue;
    out.push({
      id, title: r.title as string, description: r.description as string, owner, count: r.item_count as number, likeCount: r.like_count as number,
      commentCount: r.comment_count as number, covers: (firstFour.get(id) ?? []).map((a) => coverMap.get(a)!).filter(Boolean), isRanked: r.is_ranked as boolean,
      visibility: r.visibility as ListCard["visibility"], updatedAt: r.updated_at as string,
    });
  }
  return out;
}
