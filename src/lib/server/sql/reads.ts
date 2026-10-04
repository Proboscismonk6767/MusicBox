import "server-only";
import type { Q } from "./driver";
import type { ListCard, ReviewView, SongCard, UserMini } from "../../views";
import { toAlbum, toArtist, toSong, SONG_COLS, toStats } from "./mappers";
import { covers, listCards, reviewViews, songCards, toUserMini, userMinis, viewerSongStates } from "./hydrate";
import { entryOk, hidden, listOk, visibleUser } from "./visibility";
import { byId, C, ids, windowStart } from "./helpers";
import { suggestedUsersFor } from "./suggested";
import { slugify } from "../../util";

// The Postgres side of every read in reads-json.ts. Where the JSON store walks arrays,
// this narrows with an indexed query and then reuses the same view-model shapes and the
// same ranking maths (algorithms.ts), so both backends answer identically. tests/sql-parity
// runs them against each other.

export function catalogueReads(q: Q) {
  const one = async (sql: string, params?: unknown[]) => (await q.query(sql, params))[0];

  const reads = {
    // ── Home and discover ─────────────────────────────────────────────

    async trendingSongs(limit = 12): Promise<SongCard[]> {
      for (const days of [7, 30, 120, 3650]) {
        const rows = await q.query(
          `select song_id, count(*) over ()::int as total from (
             select song_id, sum(1 + case when coalesce(review_text, '') <> '' then 0.5 else 0 end + case when liked then 0.5 else 0 end)::float8 as score
             from diary_entries where not removed and created_at >= $1::timestamptz group by song_id) t
           order by score desc, song_id ${C} limit $2`,
          [windowStart(days), limit],
        );
        if (rows.length && (rows[0].total as number) >= limit) return songCards(q, ids(rows, "song_id"));
      }
      return [];
    },

    async highlyRated(limit = 12, minCount = 4): Promise<SongCard[]> {
      const rows = await q.query(
        `select song_id from song_stats where rating_count >= $1
         order by (rating_sum::float8 + 3.4::float8 * 6) / (rating_count + 6)::float8 desc, song_id ${C} limit $2`, [minCount, limit]);
      return songCards(q, ids(rows, "song_id"));
    },

    async hiddenGems(limit = 12): Promise<SongCard[]> {
      const rows = await q.query(
        `select song_id from song_stats where rating_count between 2 and 5 and rating_sum::float8 / rating_count >= 3.9
         order by rating_sum::float8 / rating_count desc, song_id ${C} limit $1`, [limit]);
      return songCards(q, ids(rows, "song_id"));
    },

    async newReleases(limit = 12): Promise<SongCard[]> {
      const rows = await q.query(
        `select s.id from (select id, row_number() over (order by release_date desc, id ${C}) as ar from albums order by ar limit 6) a
         join lateral (select s.id, row_number() over (order by coalesce(st.log_count, 0) desc, s.track_number, s.id ${C}) as rn
                       from songs s left join song_stats st on st.song_id = s.id where s.album_id = a.id) s on s.rn <= 2
         order by a.ar, s.rn limit $1`, [limit]);
      return songCards(q, ids(rows));
    },

    async trendingReviews(limit = 8, viewerId?: string): Promise<ReviewView[]> {
      const rows = await q.query(
        `select e.id from diary_entries e join users u on u.id = e.user_id
         where coalesce(e.review_text, '') <> '' and ${entryOk("e", "u", "$1")}
         order by ((select count(*) from review_likes rl where rl.entry_id = e.id) * case when e.created_at > $2::timestamptz then 2 else 1 end
                   + (select count(*) from comments c where c.target_type = 'entry' and c.target_id = e.id and not c.removed)) desc, e.id ${C}
         limit $3`, [viewerId ?? null, windowStart(60), limit]);
      return reviewViews(q, ids(rows), viewerId);
    },

    async popularLists(limit = 6, viewerId?: string): Promise<ListCard[]> {
      const rows = await q.query(
        `select l.id from lists l join users u on u.id = l.user_id
         where l.visibility = 'public' and ${listOk("l", "u", "$1")}
         order by (select count(*) from list_likes ll where ll.list_id = l.id) desc, l.id ${C} limit $2`, [viewerId ?? null, limit]);
      return listCards(q, ids(rows));
    },

    async recentReviews(limit = 6): Promise<ReviewView[]> {
      const rows = await q.query(
        `select e.id from diary_entries e join users u on u.id = e.user_id
         where coalesce(e.review_text, '') <> '' and coalesce(e.rating_at_time, 0) >= 4 and ${entryOk("e", "u", "null")}
         order by e.created_at desc, e.id ${C} limit $1`, [limit]);
      return reviewViews(q, ids(rows));
    },

    async friendsListening(viewerId: string, limit = 12): Promise<{ song: SongCard; user: UserMini; rating?: number }[]> {
      const rows = await q.query(
        `select * from (
           select distinct on (e.song_id) e.id, e.song_id, e.user_id, e.rating_at_time, e.created_at
           from diary_entries e join users u on u.id = e.user_id
           where e.user_id in (select following_id from follows where follower_id = $1) and ${entryOk("e", "u", "$1")}
           order by e.song_id, e.created_at desc, e.id ${C}) t
         order by created_at desc, id ${C} limit $2`, [viewerId, limit]);
      const [songs, users] = await Promise.all([songCards(q, ids(rows, "song_id")), userMinis(q, ids(rows, "user_id"))]);
      const songById = new Map(songs.map((s) => [s.id, s]));
      return rows.map((r) => ({ song: songById.get(r.song_id as string)!, user: users.get(r.user_id as string)!, rating: (r.rating_at_time as number | null) ?? undefined }));
    },

    async friendsFavourites(viewerId: string, limit = 5): Promise<{ song: SongCard; count: number; users: UserMini[] }[]> {
      const rows = await q.query(
        `select l.song_id, count(*)::int as n, array_agg(l.user_id order by l.created_at, l.user_id ${C}) as users
         from likes l join users u on u.id = l.user_id
         where l.user_id in (select following_id from follows where follower_id = $1) and ${visibleUser("u", "$1")} and not ${hidden("$1", "l.user_id")}
         group by l.song_id order by n desc, l.song_id ${C} limit $2`, [viewerId, limit]);
      const [songs, users] = await Promise.all([songCards(q, ids(rows, "song_id")), userMinis(q, rows.flatMap((r) => (r.users as string[]).slice(0, 3)))]);
      const songById = new Map(songs.map((s) => [s.id, s]));
      return rows.map((r) => ({ song: songById.get(r.song_id as string)!, count: r.n as number, users: (r.users as string[]).slice(0, 3).map((u) => users.get(u)!) }));
    },

    async suggestedUsers(viewerId: string | undefined, limit = 4): Promise<(UserMini & { reason: string; bio: string })[]> {
      return suggestedUsersFor(q, viewerId, limit);
    },

    async catalogueSize() {
      const r = await one(`select (select count(*)::int from songs) as songs, (select count(*)::int from users) as users,
                                  (select count(*)::int from diary_entries where not removed) as logs,
                                  (select count(*)::int from diary_entries where not removed and coalesce(review_text, '') <> '') as reviews`);
      return { songs: r.songs as number, users: r.users as number, logs: r.logs as number, reviews: r.reviews as number };
    },

    /** Distinct album covers (one song per artwork) for decorative walls. */
    async artworkWall(limit = 60): Promise<SongCard[]> {
      const rows = await q.query(
        `select id from (select distinct on (coalesce(al.artwork_url, al.title)) s.id from songs s join albums al on al.id = s.album_id
                         order by coalesce(al.artwork_url, al.title), s.id ${C}) t
         order by id ${C} limit $1`, [limit]);
      return songCards(q, ids(rows));
    },

    async viewerStates(songIds: string[], viewerId?: string) {
      return viewerSongStates(q, songIds, viewerId);
    },

    // ── Song, artist, album and genre pages ───────────────────────────

    async getSongPage(slug: string, viewerId?: string) {
      const row = await one(`select ${SONG_COLS} from songs s where s.slug = $1`, [slug]);
      if (!row) return null;
      const song = toSong(row);
      const v = viewerId ?? null;
      const [albumRow, artistRows, statsRow, cards] = await Promise.all([
        one("select * from albums where id = $1", [song.albumId]),
        q.query("select * from artists where id = any($1::text[])", [song.artistIds]),
        one("select * from song_stats where song_id = $1", [song.id]),
        songCards(q, [song.id]),
      ]);
      const stats = toStats(statsRow);
      const artistById = new Map(artistRows.map((r) => [r.id as string, toArtist(r)]));

      // Reviews ranked by relevance: people you follow, likes, recency and length.
      const [candidates, followingRows] = await Promise.all([
        q.query(
          `select e.id, e.user_id, e.created_at, e.review_text,
                  (select count(*)::int from review_likes rl where rl.entry_id = e.id) as likes
           from diary_entries e join users u on u.id = e.user_id
           where e.song_id = $1 and coalesce(e.review_text, '') <> '' and ${entryOk("e", "u", "$2")}`, [song.id, v]),
        v ? q.query("select following_id from follows where follower_id = $1", [v]) : Promise.resolve([]),
      ]);
      const following = new Set(ids(followingRows, "following_id"));
      const now = Date.now();
      const ranked = candidates
        .map((e) => {
          const ageDays = (now - Date.parse(e.created_at as string)) / 864e5;
          const score = (following.has(e.user_id as string) ? 12 : 0) + Math.log2(1 + (e.likes as number)) * 4 + Math.max(0, 6 - ageDays / 30) + Math.min(3, (e.review_text as string).length / 80);
          return { id: e.id as string, score };
        })
        .sort((a, b) => b.score - a.score || byId(a.id, b.id))
        .slice(0, 200);
      const reviews = await reviewViews(q, ranked.map((x) => x.id), viewerId);

      const friends = v
        ? (await q.query(
            `select u.id, u.username::text as username, u.display_name, u.avatar_hue, u.avatar_url, r.rating,
                    exists (select 1 from likes l where l.user_id = u.id and l.song_id = $1) as liked
             from follows f join users u on u.id = f.following_id join ratings r on r.user_id = u.id and r.song_id = $1
             where f.follower_id = $2 and ${visibleUser("u", "$2")} and not ${hidden("$2", "u.id")}
             order by r.rating desc, u.id ${C}`, [song.id, v])).map((r) => ({ user: toUserMini(r), rating: r.rating as number, liked: r.liked as boolean }))
        : [];

      const mine = v
        ? await q.query("select id, listened_at, rating_at_time from diary_entries where song_id = $1 and user_id = $2 and not removed order by listened_at, created_at, id", [song.id, v])
        : [];
      const evolution: { year: number; rating: number }[] = [];
      for (const e of mine) {
        if (e.rating_at_time == null) continue;
        const y = Number((e.listened_at as string).slice(0, 4));
        const last = evolution[evolution.length - 1];
        if (last?.year === y) last.rating = e.rating_at_time as number;
        else evolution.push({ year: y, rating: e.rating_at_time as number });
      }

      const listRows = await q.query(
        `select l.id from lists l join users u on u.id = l.user_id
         where l.visibility = 'public' and ${listOk("l", "u", "$2")} and exists (select 1 from list_items li where li.list_id = l.id and li.song_id = $1)
         order by l.created_at, l.id ${C} limit 6`, [song.id, v]);
      const otherRows = await q.query("select id from songs where album_id = $1 and id <> $2 order by track_number, id " + C + " limit 6", [song.albumId, song.id]);
      const [lists, similar, states, otherTracks, myViews] = await Promise.all([
        listCards(q, ids(listRows)), reads.similarSongs(song.id, 12), viewerSongStates(q, [song.id], viewerId), songCards(q, ids(otherRows)),
        reviewViews(q, ids([...mine].reverse()), viewerId),
      ]);
      return {
        song, album: toAlbum(albumRow), artists: song.artistIds.map((a) => artistById.get(a)!), stats, card: cards[0], reviews, friends, lists, similar,
        viewer: states[song.id], myEntries: myViews, evolution, favouriteCount: stats?.likeCount ?? 0, otherTracks,
      };
    },

    /** Item-item similarity: co-rating listeners, shared lists, artist and genre. Scores are in tenths so the sums are exact. */
    async similarSongs(songId: string, limit = 12): Promise<SongCard[]> {
      const base = await one("select album_id, genres, array(select artist_id from song_artists where song_id = s.id) as artist_ids from songs s where s.id = $1", [songId]);
      if (!base) return [];
      const rows = await q.query(
        `select id, score from (
           select sid as id, sum(v)::int as score from (
             select r2.song_id as sid, 10 as v from ratings r1 join ratings r2 on r2.user_id = r1.user_id and r2.song_id <> $1
               where r1.song_id = $1 and r1.rating >= 4 and r2.rating >= 4
             union all
             select li2.song_id, 15 from list_items li1 join lists l on l.id = li1.list_id and not l.removed
               join list_items li2 on li2.list_id = li1.list_id and li2.song_id <> $1 where li1.song_id = $1
             union all
             select s.id, (case when s.album_id = $2 then 5 when exists (select 1 from song_artists sa where sa.song_id = s.id and sa.artist_id = any($3::text[])) then 10 else 0 end)
               from songs s where s.id <> $1
             union all
             select s.id, 12 * (select count(*)::int from unnest(s.genres) g where g = any($4::text[])) from songs s where s.id <> $1
           ) x group by sid) t
         where score > 0 order by score desc, id ${C} limit 300`, [songId, base.album_id, base.artist_ids, base.genres]);
      // Diversify: max 2 per album.
      const cards = new Map((await songCards(q, ids(rows))).map((c) => [c.id, c]));
      const albumOf = new Map((await q.query("select id, album_id from songs where id = any($1::text[])", [ids(rows)])).map((r) => [r.id as string, r.album_id as string]));
      const perAlbum = new Map<string, number>();
      const out: SongCard[] = [];
      for (const r of rows) {
        const album = albumOf.get(r.id as string)!;
        const n = perAlbum.get(album) ?? 0;
        if (n >= 2) continue;
        perAlbum.set(album, n + 1);
        out.push(cards.get(r.id as string)!);
        if (out.length >= limit) break;
      }
      return out;
    },

    async getArtistPage(slug: string, viewerId?: string) {
      const row = await one("select * from artists where slug = $1", [slug]);
      if (!row) return null;
      const artist = toArtist(row);
      const v = viewerId ?? null;
      const [popularRows, highestRows, albumRows, totals, reviewRows, listRows, fanRows, followRow] = await Promise.all([
        q.query(`select s.id from songs s join song_artists sa on sa.song_id = s.id left join song_stats st on st.song_id = s.id where sa.artist_id = $1 order by coalesce(st.log_count, 0) desc, s.id ${C} limit 10`, [artist.id]),
        q.query(`select s.id from songs s join song_artists sa on sa.song_id = s.id join song_stats st on st.song_id = s.id where sa.artist_id = $1 and st.rating_count >= 2
                 order by (st.rating_sum::float8 + 3.4::float8 * 6) / (st.rating_count + 6)::float8 desc, s.id ${C} limit 10`, [artist.id]),
        q.query(`select al.id, al.slug, al.title, al.release_date, (select count(*)::int from songs s where s.album_id = al.id) as n from albums al where al.artist_id = $1 order by al.release_date desc, al.id ${C}`, [artist.id]),
        one(`select count(distinct sa.song_id)::int as songs, coalesce(sum(st.rating_sum), 0)::float8 as sum, coalesce(sum(st.rating_count), 0)::int as n
             from song_artists sa left join song_stats st on st.song_id = sa.song_id where sa.artist_id = $1`, [artist.id]),
        q.query(`select e.id from diary_entries e join users u on u.id = e.user_id
                 where coalesce(e.review_text, '') <> '' and e.song_id in (select song_id from song_artists where artist_id = $1) and ${entryOk("e", "u", "$2")}
                 order by (select count(*) from review_likes rl where rl.entry_id = e.id) desc, e.id ${C} limit 6`, [artist.id, v]),
        q.query(`select l.id from lists l join users u on u.id = l.user_id
                 where l.visibility = 'public' and ${listOk("l", "u", "$2")}
                   and exists (select 1 from list_items li join song_artists sa on sa.song_id = li.song_id where li.list_id = l.id and sa.artist_id = $1)
                 order by l.created_at, l.id ${C} limit 4`, [artist.id, v]),
        q.query(`select u.id, u.username::text as username, u.display_name, u.avatar_hue, u.avatar_url from artist_follows af join users u on u.id = af.user_id
                 where af.artist_id = $1 and ${visibleUser("u", "$2")} and not ${hidden("$2", "u.id")} order by af.created_at, u.id ${C}`, [artist.id, v]),
        v ? one("select exists (select 1 from artist_follows where user_id = $1 and artist_id = $2) as following, exists (select 1 from users where id = $1 and $2 = any(favorite_artist_ids)) as favourite", [v, artist.id]) : Promise.resolve(null),
      ]);
      const albumCovers = await covers(q, ids(albumRows));
      const [popular, highest, reviews, lists] = await Promise.all([songCards(q, ids(popularRows)), songCards(q, ids(highestRows)), reviewViews(q, ids(reviewRows), viewerId), listCards(q, ids(listRows))]);
      return {
        artist, songCount: totals.songs as number, popular, highest, lists, reviews, fans: fanRows.map(toUserMini),
        albums: albumRows.map((a) => ({ slug: a.slug as string, title: a.title as string, year: Number((a.release_date as string).slice(0, 4)), cover: albumCovers.get(a.id as string)!, count: a.n as number })),
        avg: (totals.n as number) ? (totals.sum as number) / (totals.n as number) : 0, ratingCount: totals.n as number,
        following: !!followRow?.following, favourite: !!followRow?.favourite,
      };
    },

    async getAlbumPage(slug: string, viewerId?: string) {
      const row = await one("select * from albums where slug = $1", [slug]);
      if (!row) return null;
      const album = toAlbum(row);
      const [artistRow, songRows, otherRows, coverMap] = await Promise.all([
        one("select * from artists where id = $1", [album.artistId]),
        q.query("select id, duration_ms from songs where album_id = $1 order by track_number, id " + C, [album.id]),
        q.query(`select id, slug, title, release_date from albums where artist_id = $1 and id <> $2 order by release_date desc, id ${C}`, [album.artistId, album.id]),
        covers(q, [album.id]),
      ]);
      const songIds = ids(songRows);
      const [tracks, states] = await Promise.all([songCards(q, songIds), viewerSongStates(q, songIds, viewerId)]);
      const otherCovers = await covers(q, ids(otherRows));
      const rated = tracks.filter((t) => t.ratingCount);
      const mine = songIds.map((id) => states[id].rating).filter((r): r is number => r != null);
      return {
        album, artist: toArtist(artistRow), tracks, cover: coverMap.get(album.id)!,
        runtimeMs: songRows.reduce((a, r) => a + (r.duration_ms as number), 0),
        avgTrack: rated.length ? rated.reduce((a, t) => a + t.avg, 0) / rated.length : 0,
        myAvg: mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : 0,
        myRatedCount: mine.length, states,
        otherAlbums: otherRows.map((a) => ({ slug: a.slug as string, title: a.title as string, year: Number((a.release_date as string).slice(0, 4)), cover: otherCovers.get(a.id as string)! })),
      };
    },

    async allGenres(): Promise<{ name: string; slug: string; count: number }[]> {
      const rows = await q.query(`select g as name, count(*)::int as count from songs, unnest(genres) g group by g order by count desc, g ${C}`);
      return rows.map((r) => ({ name: r.name as string, slug: slugify(r.name as string), count: r.count as number }));
    },

    async getGenrePage(slug: string, viewerId?: string) {
      const name = (await reads.allGenres()).find((g) => g.slug === slug)?.name;
      if (!name) return null;
      const v = viewerId ?? null;
      const [topRows, popRows, reviewRows, listRows, artistRows, count] = await Promise.all([
        q.query(`select s.id from songs s join song_stats st on st.song_id = s.id where $1 = any(s.genres) and st.rating_count >= 2
                 order by (st.rating_sum::float8 + 3.4::float8 * 6) / (st.rating_count + 6)::float8 desc, s.id ${C} limit 12`, [name]),
        q.query(`select s.id from songs s left join song_stats st on st.song_id = s.id where $1 = any(s.genres) order by coalesce(st.log_count, 0) desc, s.id ${C} limit 12`, [name]),
        q.query(`select e.id from diary_entries e join users u on u.id = e.user_id join songs s on s.id = e.song_id
                 where coalesce(e.review_text, '') <> '' and $1 = any(s.genres) and ${entryOk("e", "u", "$2")} order by e.created_at desc, e.id ${C} limit 6`, [name, v]),
        q.query(`select l.id from lists l join users u on u.id = l.user_id
                 where l.visibility = 'public' and ${listOk("l", "u", "$2")}
                   and (select count(*) from list_items li join songs s on s.id = li.song_id where li.list_id = l.id and $1 = any(s.genres)) >= 3
                 order by l.created_at, l.id ${C} limit 4`, [name, v]),
        q.query(`select a.id, a.name, a.slug, a.image_url, a.hue from (
                   select sa.artist_id, sum(coalesce(st.log_count, 0)) as plays from songs s join song_artists sa on sa.song_id = s.id left join song_stats st on st.song_id = s.id
                   where $1 = any(s.genres) group by sa.artist_id) x join artists a on a.id = x.artist_id order by x.plays desc, a.id ${C} limit 8`, [name]),
        one("select count(*)::int as n from songs where $1 = any(genres)", [name]),
      ]);
      const [topRated, popular, reviews, lists] = await Promise.all([songCards(q, ids(topRows)), songCards(q, ids(popRows)), reviewViews(q, ids(reviewRows), viewerId), listCards(q, ids(listRows))]);
      return {
        name, topRated, popular, reviews, lists,
        artists: artistRows.map((a) => ({ name: a.name as string, slug: a.slug as string, imageUrl: (a.image_url as string | null) ?? undefined, hue: a.hue as number })),
        count: count.n as number,
      };
    },
  };
  return reads;
}

