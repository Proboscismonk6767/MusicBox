import "server-only";
import type { Q } from "./driver";
import type { Recommendation, SongCard } from "../../views";
import { songCards } from "./hydrate";
import { C, compatWith, genresOfSongs, ids, ratingsOf } from "./helpers";
import { computeStats, rankRecommendations, type RecoSong, type StatArtist, type StatSong } from "../algorithms";
import { normalizeArtist, normalizeTitle } from "../../spotify-import";
import type { AdminReport, SongLite } from "../queries-extra";
import { EXPORT_VERSION } from "../export";
import { toUser } from "./mappers";
import { ONBOARDING_SONGS } from "../queries-extra";
import { suggestedUsersFor } from "./suggested";

// Recommendations, listening stats, the data export and the small lookups the
// importers and a few pages use.

/** Songs and artists a user's stats depend on, in the shape computeStats wants. */
async function statSources(q: Q, songIds: string[]) {
  const rows = songIds.length
    ? await q.query(
        `select s.id, s.genres, s.release_date, (select sa.artist_id from song_artists sa where sa.song_id = s.id order by sa.position limit 1) as first_artist
         from songs s where s.id = any($1::text[])`, [songIds])
    : [];
  const songs = new Map<string, StatSong>(rows.map((r) => [r.id as string, { id: r.id as string, firstArtistId: r.first_artist as string, genres: r.genres as string[], releaseDate: r.release_date as string }]));
  const artistIds = [...new Set([...songs.values()].map((s) => s.firstArtistId))];
  const artistRows = artistIds.length ? await q.query("select id, name, slug, image_url, hue from artists where id = any($1::text[])", [artistIds]) : [];
  const artists = new Map<string, StatArtist>(artistRows.map((a) => [a.id as string, { name: a.name as string, slug: a.slug as string, imageUrl: (a.image_url as string | null) ?? undefined, hue: a.hue as number }]));
  return { songs, artists };
}

export function insightReads(q: Q) {
  const one = async (sql: string, params?: unknown[]) => (await q.query(sql, params))[0];

  async function statsFor(userId: string, yearFilter?: number) {
    const [entries, ratingMap] = await Promise.all([
      q.query("select song_id, listened_at, (coalesce(review_text, '') <> '') as review, is_relisten from diary_entries where user_id = $1 and not removed", [userId]),
      ratingsOf(q, [userId]),
    ]);
    const ratings = ratingMap.get(userId)!;
    const { songs, artists } = await statSources(q, [...new Set([...entries.map((e) => e.song_id as string), ...ratings.keys()])]);
    return computeStats({
      allEntries: entries.map((e) => ({ songId: e.song_id as string, listenedAt: e.listened_at as string, review: e.review as boolean, isRelisten: e.is_relisten as boolean })),
      ratings, songs, artists, yearFilter,
    });
  }

  const withCards = async <T extends { id: string }>(top: T[]) => {
    const cards = new Map((await songCards(q, ids(top))).map((c) => [c.id, c]));
    return top.map((t) => ({ song: cards.get(t.id)!, count: (t as unknown as { count: number }).count, rating: (t as unknown as { rating?: number }).rating }));
  };

  const reads = {
    async recommendations(userId: string, limit = 12): Promise<Recommendation[]> {
      const ratingMap = await ratingsOf(q, [userId]);
      const mine = ratingMap.get(userId)!;
      const [followingRows, laterRows, artistRows] = await Promise.all([
        q.query("select following_id from follows where follower_id = $1", [userId]),
        q.query("select song_id from listen_later where user_id = $1", [userId]),
        q.query("select artist_id from artist_follows where user_id = $1", [userId]),
      ]);
      const following = new Set(ids(followingRows, "following_id"));
      const exclude = new Set([...mine.keys(), ...ids(laterRows, "song_id")]);
      const followedArtistIds = new Set(ids(artistRows, "artist_id"));

      // People worth comparing with: those who rated the most of the same songs, plus everyone followed.
      const peers: { username: string; followed: boolean; sim: number; ratings: Map<string, number> }[] = [];
      let peerRatings = new Map<string, Map<string, number>>();
      if (mine.size) {
        const near = await q.query(
          `select user_id from ratings where user_id <> $1 group by user_id
           order by count(*) filter (where song_id in (select song_id from ratings where user_id = $1)) desc, user_id ${C} limit 300`, [userId]);
        const candidates = [...new Set([...ids(near, "user_id"), ...following])].filter((id) => id !== userId).sort();
        const [comps, users] = await Promise.all([
          compatWith(q, userId, candidates),
          candidates.length ? q.query("select id, username::text as username from users where id = any($1::text[])", [candidates]) : [],
        ]);
        peerRatings = await ratingsOf(q, candidates);
        const nameOf = new Map(users.map((r) => [r.id as string, r.username as string]));
        for (const id of candidates) {
          if (!nameOf.has(id)) continue;
          let sim = (comps.get(id)!.score - 50) / 50;
          if (following.has(id)) sim += 0.2;
          if (sim <= 0) continue;
          peers.push({ username: nameOf.get(id)!, followed: following.has(id), sim, ratings: peerRatings.get(id)! });
        }
      }

      // Songs that could be suggested: what peers liked, what the user's taste points to, followed artists, well-rated songs.
      const genreOfMine = await genresOfSongs(q, mine.keys());
      const affinity = new Map<string, number>();
      for (const [sid, r] of mine) for (const g of genreOfMine.get(sid) ?? []) affinity.set(g, (affinity.get(g) ?? 0) + (r - 3));
      const wantedGenres = [...affinity].filter(([, v]) => v > 0).map(([g]) => g);
      const peerSongs = [...new Set(peers.flatMap((p) => [...p.ratings].filter(([, r]) => r >= 3.5).map(([sid]) => sid)))];
      const rows = await q.query(
        `select s.id, s.title, s.album_id, s.genres, s.duration_ms, coalesce(st.rating_count, 0) as rating_count, coalesce(st.rating_sum, 0) as rating_sum, coalesce(st.log_count, 0) as log_count,
                array(select sa.artist_id from song_artists sa where sa.song_id = s.id order by sa.position) as artist_ids
         from songs s left join song_stats st on st.song_id = s.id
         where s.id = any($1::text[]) or s.id = any($2::text[]) or s.genres && $3::text[]
            or exists (select 1 from song_artists sa where sa.song_id = s.id and sa.artist_id = any($4::text[]))
            or s.id in (select song_id from song_stats where rating_count > 0 order by rating_sum / rating_count desc, song_id ${C} limit 2000)`,
        [peerSongs, [...mine.keys()], wantedGenres, [...followedArtistIds]]);
      const songs = new Map<string, RecoSong>(rows.map((r) => [r.id as string, {
        id: r.id as string, title: r.title as string, albumId: r.album_id as string, artistIds: r.artist_ids as string[], genres: r.genres as string[], durationMs: r.duration_ms as number,
        ratingCount: r.rating_count as number, ratingSum: r.rating_sum as number, logCount: r.log_count as number,
      }]));
      const ranked = rankRecommendations({ mine, exclude, peers, followedArtistIds, songs }, limit);
      const cards = new Map((await songCards(q, ranked.map((r) => r.songId))).map((c) => [c.id, c]));
      return ranked.map((r) => ({ song: cards.get(r.songId)!, reason: r.reason, score: r.score }));
    },

    /** "Because you like …" rows for Discover: anchored to a song the user rated highly most recently. */
    async becauseYouLike(userId: string): Promise<{ anchor: SongCard; songs: SongCard[] } | null> {
      const anchorRow = await one("select song_id from ratings where user_id = $1 and rating >= 4.5 order by updated_at desc, song_id " + C + " limit 1", [userId]);
      if (!anchorRow) return null;
      const anchorId = anchorRow.song_id as string;
      const genres = (await one("select genres from songs where id = $1", [anchorId]))?.genres as string[] | undefined;
      if (!genres) return null;
      const rows = await q.query(
        `select sid as id from (
           select r2.song_id as sid, 10 as v from ratings r1 join ratings r2 on r2.user_id = r1.user_id
             where r1.song_id = $1 and r1.rating >= 4 and r1.user_id <> $2 and r2.rating >= 4 and not exists (select 1 from ratings m where m.user_id = $2 and m.song_id = r2.song_id)
           union all
           select s.id, 5 from songs s where s.genres && $3::text[] and not exists (select 1 from ratings m where m.user_id = $2 and m.song_id = s.id)
         ) x group by sid order by sum(v) desc, sid ${C} limit 10`, [anchorId, userId, genres]);
      const [anchor, songs] = await Promise.all([songCards(q, [anchorId]), songCards(q, ids(rows))]);
      return { anchor: anchor[0], songs };
    },

    async userStats(userId: string, yearFilter?: number) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { entriesInScope, topSongs, ...st } = await statsFor(userId, yearFilter);
      return { ...st, topSongs: await withCards(topSongs) };
    },

    async yearInReview(userId: string, year: number) {
      const raw = await statsFor(userId, year);
      const { entriesInScope: _in, topSongs, ...rest } = raw; // eslint-disable-line @typescript-eslint/no-unused-vars
      const st = { ...rest, topSongs: await withCards(topSongs) };
      const [firsts, fiveRows] = await Promise.all([
        q.query(`select song_id from diary_entries where user_id = $1 and not removed and to_char(listened_at, 'YYYY') = $2 and not is_relisten and coalesce(rating_at_time, 0) >= 4.5
                 order by rating_at_time desc, listened_at, id ${C} limit 1`, [userId, String(year)]),
        q.query(`select song_id from diary_entries e where user_id = $1 and not removed and to_char(listened_at, 'YYYY') = $2 and rating_at_time = 5 order by listened_at desc, created_at desc, id ${C}`, [userId, String(year)]),
      ]);
      const fiveIds = [...new Set(ids(fiveRows, "song_id"))].slice(0, 10);
      const [discovery, fives] = await Promise.all([firsts[0] ? songCards(q, [firsts[0].song_id as string]) : [], songCards(q, fiveIds)]);
      return { ...st, discovery: discovery[0], mostReplayed: st.topSongs[0], highestArtist: st.highestArtists[0], fives };
    },

    // ── Data export ───────────────────────────────────────────────────

    async exportUserData(userId: string) {
      const userRow = await one("select * from users where id = $1", [userId]);
      if (!userRow) return null;
      const u = toUser(userRow);
      const [entries, ratings, likes, later, lists, items, comments, following, followers, artistFollows, blocks] = await Promise.all([
        q.query("select * from diary_entries where user_id = $1 and not removed order by created_at, id " + C, [userId]),
        q.query("select * from ratings where user_id = $1 order by created_at, song_id " + C, [userId]),
        q.query("select * from likes where user_id = $1 order by created_at, song_id " + C, [userId]),
        q.query("select * from listen_later where user_id = $1 order by created_at, song_id " + C, [userId]),
        q.query("select * from lists where user_id = $1 and not removed order by created_at, id " + C, [userId]),
        q.query("select li.list_id, li.song_id, li.note from list_items li join lists l on l.id = li.list_id where l.user_id = $1 and not l.removed order by li.list_id, li.position", [userId]),
        q.query("select * from comments where user_id = $1 and not removed order by created_at, id " + C, [userId]),
        q.query("select u.username::text as username, f.created_at from follows f join users u on u.id = f.following_id where f.follower_id = $1 order by f.created_at, u.username", [userId]),
        q.query("select u.username::text as username, f.created_at from follows f join users u on u.id = f.follower_id where f.following_id = $1 order by f.created_at, u.username", [userId]),
        q.query("select a.name, af.created_at from artist_follows af join artists a on a.id = af.artist_id where af.user_id = $1 order by af.created_at, a.id " + C, [userId]),
        q.query("select u.username::text as username, b.kind from user_blocks b join users u on u.id = b.target_id where b.user_id = $1 order by u.username, b.kind", [userId]),
      ]);
      const songIds = [...new Set([...u.favoriteSongIds, ...(u.profileLyric ? [u.profileLyric.songId] : []), ...entries.map((e) => e.song_id as string), ...ratings.map((r) => r.song_id as string), ...likes.map((l) => l.song_id as string), ...later.map((l) => l.song_id as string), ...items.map((i) => i.song_id as string)])];
      const songRows = songIds.length ? await q.query(
        `select s.id, s.title, s.isrc, al.title as album, array(select a.name from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position) as artists
         from songs s join albums al on al.id = s.album_id where s.id = any($1::text[])`, [songIds]) : [];
      const songById = new Map(songRows.map((s) => [s.id as string, s]));
      const song = (id: string) => { const s = songById.get(id); return s ? { id, title: s.title, artists: s.artists, album: s.album, isrc: (s.isrc as string | null) ?? undefined } : { id }; };
      const artistNames = u.favoriteArtistIds.length ? await q.query("select id, name from artists where id = any($1::text[])", [u.favoriteArtistIds]) : [];
      const artistName = new Map(artistNames.map((a) => [a.id as string, a.name as string]));
      const itemsByList = new Map<string, { song: ReturnType<typeof song>; note?: string }[]>();
      for (const i of items) {
        const list = itemsByList.get(i.list_id as string) ?? [];
        list.push({ song: song(i.song_id as string), ...(i.note != null ? { note: i.note as string } : {}) });
        itemsByList.set(i.list_id as string, list);
      }
      const opt = <T,>(v: T | null) => (v == null ? undefined : v);
      return {
        exportVersion: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        note: "Everything MusicBox holds about this account, except your sign-in credentials.",
        profile: {
          username: u.username, displayName: u.displayName, bio: u.bio, location: u.location, website: u.website,
          createdAt: u.createdAt, profileVisibility: u.profileVisibility, avatarHue: u.avatarHue,
          favouriteSongs: u.favoriteSongIds.map(song), favouriteArtists: u.favoriteArtistIds.map((a) => artistName.get(a)).filter(Boolean),
          pinnedLyric: u.profileLyric ? { text: u.profileLyric.text, song: song(u.profileLyric.songId) } : undefined,
        },
        diary: entries.map((e) => ({
          id: e.id, song: song(e.song_id as string), listenedAt: e.listened_at, rating: opt(e.rating_at_time), liked: e.liked, review: opt(e.review_text), hasSpoiler: e.has_spoiler || undefined,
          relisten: e.is_relisten, tags: e.tags, context: opt(e.context), memory: opt(e.memory), createdAt: e.created_at, updatedAt: e.updated_at,
        })),
        ratings: ratings.map((r) => ({ song: song(r.song_id as string), rating: r.rating, createdAt: r.created_at, updatedAt: r.updated_at })),
        likedSongs: likes.map((l) => ({ song: song(l.song_id as string), createdAt: l.created_at })),
        listenLater: later.map((l) => ({ song: song(l.song_id as string), createdAt: l.created_at })),
        lists: lists.map((l) => ({
          id: l.id, title: l.title, description: l.description, ranked: l.is_ranked, visibility: l.visibility, createdAt: l.created_at, updatedAt: l.updated_at,
          items: itemsByList.get(l.id as string) ?? [],
        })),
        comments: comments.map((c) => ({ id: c.id, on: `${c.target_type}:${c.target_id}`, replyTo: opt(c.parent_id), body: c.body, createdAt: c.created_at })),
        following: following.map((f) => ({ username: f.username, since: f.created_at })),
        followers: followers.map((f) => ({ username: f.username, since: f.created_at })),
        followedArtists: artistFollows.map((f) => ({ artist: f.name, since: f.created_at })),
        blockedAndMuted: blocks.map((b) => ({ username: b.username, kind: b.kind })),
      };
    },

    // ── Small reads for pages and importers ───────────────────────────

    async adminOverview(): Promise<{ reports: AdminReport[]; openCount: number; suspendedCount: number }> {
      const reports = await q.query(`select * from reports order by (status = 'open') desc, created_at desc, id ${C}`);
      const of = (type: string) => reports.filter((r) => r.target_type === type).map((r) => r.target_id as string);
      const [entries, comments, lists, users, reporters, suspended] = await Promise.all([
        of("entry").length ? q.query("select e.id, e.review_text, u.username::text as author from diary_entries e join users u on u.id = e.user_id where e.id = any($1::text[])", [of("entry")]) : [],
        of("comment").length ? q.query("select c.id, c.body, u.username::text as author from comments c join users u on u.id = c.user_id where c.id = any($1::text[])", [of("comment")]) : [],
        of("list").length ? q.query("select l.id, l.title, u.username::text as author from lists l join users u on u.id = l.user_id where l.id = any($1::text[])", [of("list")]) : [],
        of("user").length ? q.query("select id, username::text as username from users where id = any($1::text[])", [of("user")]) : [],
        q.query("select id, username::text as username from users where id = any($1::text[])", [reports.map((r) => r.reporter_id as string)]),
        one("select count(*)::int as n from users where suspended"),
      ]);
      const by = (rows: { [k: string]: unknown }[]) => new Map(rows.map((r) => [r.id as string, r]));
      const e = by(entries), c = by(comments), l = by(lists), us = by(users), rep = by(reporters);
      const describe = (type: string, id: string): { text: string; href?: string; author?: string } => {
        if (type === "entry") { const x = e.get(id); return { text: (x?.review_text as string | null) ?? "(removed)", href: `/review/${id}`, author: x?.author as string | undefined }; }
        if (type === "comment") { const x = c.get(id); return { text: (x?.body as string | undefined) ?? "(removed)", author: x?.author as string | undefined }; }
        if (type === "list") { const x = l.get(id); return { text: (x?.title as string | undefined) ?? "(removed)", href: `/list/${id}`, author: x?.author as string | undefined }; }
        const x = us.get(id);
        return { text: x ? `@${x.username}` : "(unknown)", href: x ? `/${x.username}` : undefined, author: x?.username as string | undefined };
      };
      return {
        reports: reports.map((r) => ({
          id: r.id as string, targetType: r.target_type as string, targetId: r.target_id as string, reason: r.reason as string, status: r.status as string, createdAt: r.created_at as string,
          reporter: rep.get(r.reporter_id as string)?.username as string | undefined, ...describe(r.target_type as string, r.target_id as string),
        })),
        openCount: reports.filter((r) => r.status === "open").length,
        suspendedCount: suspended.n as number,
      };
    },

    async songLite(songId: string): Promise<SongLite | null> {
      const r = await one(
        `select s.id, s.title, s.duration_ms, s.preview_url, al.title as album,
                coalesce((select a.name from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position limit 1), '') as artist
         from songs s join albums al on al.id = s.album_id where s.id = $1`, [songId]);
      return r ? { id: r.id as string, title: r.title as string, durationMs: r.duration_ms as number, previewUrl: (r.preview_url as string | null) ?? undefined, artist: r.artist as string, album: r.album as string } : null;
    },

    async followingIds(userId: string): Promise<string[]> {
      return ids(await q.query("select following_id from follows where follower_id = $1 order by following_id " + C, [userId]), "following_id");
    },

    async onboardingData(userId: string) {
      const songRows = await q.query(
        `select id from (select s.id, coalesce(st.log_count, 0) as logs, row_number() over (partition by s.album_id order by coalesce(st.log_count, 0) desc, s.id ${C}) as rn
                         from songs s left join song_stats st on st.song_id = s.id) t
         order by (rn = 1) desc, logs desc, id ${C} limit ${ONBOARDING_SONGS}`);
      const artistRows = await q.query(
        `select a.id, a.name, a.slug, a.image_url, a.hue from artists a
         order by (select coalesce(sum(st.log_count), 0) from song_artists sa left join song_stats st on st.song_id = sa.song_id where sa.artist_id = a.id) desc, a.id ${C} limit 200`);
      const [songs, people, ratingRows] = await Promise.all([
        songCards(q, ids(songRows)), suggestedUsersFor(q, userId, 8), q.query("select song_id, rating from ratings where user_id = $1", [userId]),
      ]);
      const logged = people.length ? await q.query("select user_id, count(*)::int as n from diary_entries where user_id = any($1::text[]) and not removed group by user_id", [people.map((p) => p.id)]) : [];
      const loggedBy = new Map(logged.map((r) => [r.user_id as string, r.n as number]));
      return {
        songs,
        artists: artistRows.map((a) => ({ id: a.id as string, name: a.name as string, slug: a.slug as string, imageUrl: (a.image_url as string | null) ?? undefined, hue: a.hue as number })),
        people: people.map((p) => ({ ...p, logged: loggedBy.get(p.id) ?? 0 })),
        ratings: Object.fromEntries(ratingRows.map((r) => [r.song_id as string, r.rating as number])),
      };
    },

    async sitemapData() {
      const [songs, artists, albums, users, lists] = await Promise.all([
        q.query("select slug from songs order by id " + C), q.query("select slug from artists order by id " + C), q.query("select slug from albums order by id " + C),
        q.query("select username::text as username from users where profile_visibility = 'public' and not suspended order by id " + C),
        q.query("select id from lists where visibility = 'public' and not removed order by id " + C),
      ]);
      return { songs: songs.map((r) => r.slug as string), artists: artists.map((r) => r.slug as string), albums: albums.map((r) => r.slug as string), users: users.map((r) => r.username as string), lists: ids(lists) };
    },

    async ping(): Promise<true> {
      await q.query("select 1");
      return true;
    },

    async songSlugByExternalId(externalId: string): Promise<string | undefined> {
      return ((await one("select slug from songs where external_id = $1", [externalId]))?.slug as string | undefined) ?? undefined;
    },

    async songIdBySlug(slug: string): Promise<string | undefined> {
      return ((await one("select id from songs where slug = $1", [slug]))?.id as string | undefined) ?? undefined;
    },

    async albumByExternalId(externalId: string): Promise<{ slug: string; songCount: number } | null> {
      const r = await one("select al.slug, (select count(*)::int from songs s where s.album_id = al.id) as n from albums al where al.external_id = $1", [externalId]);
      return r ? { slug: r.slug as string, songCount: r.n as number } : null;
    },

    /** Finds an artist by catalogue id, or (when none matches) by exact name, ignoring case. */
    async artistLookup(query: { externalId?: string; name?: string }): Promise<{ id: string; slug: string; externalId?: string } | null> {
      let r = query.externalId ? await one("select id, slug, external_id from artists where external_id = $1 order by id " + C + " limit 1", [query.externalId]) : undefined;
      if (!r && query.name) r = await one("select id, slug, external_id from artists where lower(name) = lower($1) order by id " + C + " limit 1", [query.name]);
      return r ? { id: r.id as string, slug: r.slug as string, externalId: (r.external_id as string | null) ?? undefined } : null;
    },

    /** Which of these catalogue results does MusicBox already have? (by catalogue id, or by title and artist) */
    async knownTracks(tracks: { externalId: string; title: string; artist: string }[]): Promise<boolean[]> {
      if (!tracks.length) return [];
      const rows = await q.query(
        `select (x.i - 1)::int as i from unnest($1::text[], $2::text[], $3::text[]) with ordinality as x(ext, title, artist, i)
         where exists (select 1 from songs s where s.external_id = x.ext)
            or exists (select 1 from songs s where lower(s.title) = lower(x.title)
                         and lower((select a.name from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position limit 1)) = lower(x.artist))`,
        [tracks.map((t) => t.externalId), tracks.map((t) => t.title), tracks.map((t) => t.artist)]);
      const known = new Set(rows.map((r) => r.i as number));
      return tracks.map((_, n) => known.has(n));
    },

    async knownArtistNames(names: string[]): Promise<string[]> {
      if (!names.length) return [];
      const have = new Set((await q.query("select lower(name) as n from artists where lower(name) = any($1::text[])", [names.map((n) => n.toLowerCase())])).map((r) => r.n as string));
      return names.map((n) => n.toLowerCase()).filter((n) => have.has(n));
    },

    async knownAlbumIds(externalIds: string[]): Promise<string[]> {
      if (!externalIds.length) return [];
      const have = new Set((await q.query("select external_id from albums where external_id = any($1::text[])", [externalIds])).map((r) => r.external_id as string));
      return externalIds.filter((id) => have.has(id));
    },

    /** For each track the user played, the id of the matching song MusicBox already has (same title and artist), or null. */
    async findLocalSongs(tracks: { t: string; a: string }[]): Promise<(string | null)[]> {
      if (!tracks.length) return [];
      const rows = await q.query(
        `select s.id, s.match_key, s.featured, array(select a.name from song_artists sa join artists a on a.id = sa.artist_id where sa.song_id = s.id order by sa.position) as artists
         from songs s where s.match_key = any($1::text[]) order by s.id ${C}`, [[...new Set(tracks.map((t) => normalizeTitle(t.t)))]]);
      const byTitle = new Map<string, typeof rows>();
      for (const r of rows) byTitle.set(r.match_key as string, [...(byTitle.get(r.match_key as string) ?? []), r]);
      return tracks.map((t) => {
        const artist = normalizeArtist(t.a);
        const hit = byTitle.get(normalizeTitle(t.t))?.find((s) => [...(s.artists as string[]), ...(s.featured as string[])].filter(Boolean).map(normalizeArtist).includes(artist));
        return (hit?.id as string | undefined) ?? null;
      });
    },

    async userActive(userId: string): Promise<boolean> {
      return !!(await one("select 1 as x from users where id = $1 and not suspended", [userId]));
    },
  };
  return reads;
}
