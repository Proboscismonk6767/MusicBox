import "server-only";
import { idx, type Indexes } from "./indexes";
import { songCard } from "./queries";
import { compat, computeStats, rankRecommendations, type RecoSong } from "./algorithms";
import type { Recommendation, SongCard } from "../views";

// Recommendations, stats and year in review for the JSON store. The maths lives in
// algorithms.ts and is shared with the Postgres backend; this file only gathers
// the rows it needs from the in-memory indexes.

const ratingMap = (i: Indexes, userId: string): Map<string, number> => new Map([...(i.ratingsByUser.get(userId) ?? [])].map(([sid, r]) => [sid, r.rating]));
const genresOf = (i: Indexes) => (sid: string) => i.song.get(sid)?.genres ?? [];
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ── Recommendations (§22) ───────────────────────────────────────────────

export function recommendations(userId: string, limit = 12): Recommendation[] {
  const i = idx();
  const mine = ratingMap(i, userId);
  const following = i.following.get(userId) ?? new Set<string>();
  const exclude = new Set([...mine.keys(), ...(i.listenLater.get(userId)?.keys() ?? [])]);

  const peers = [];
  if (mine.size) {
    for (const u of [...i.db.users].sort((a, b) => byId(a.id, b.id))) {
      if (u.id === userId) continue;
      const theirs = ratingMap(i, u.id);
      let sim = (compat(mine, theirs, genresOf(i)).score - 50) / 50;
      if (following.has(u.id)) sim += 0.2;
      if (sim <= 0) continue;
      peers.push({ username: u.username, followed: following.has(u.id), sim, ratings: theirs });
    }
  }

  const songs = new Map<string, RecoSong>();
  for (const s of i.db.songs) {
    const st = i.db.songStats[s.id];
    songs.set(s.id, { id: s.id, title: s.title, albumId: s.albumId, artistIds: s.artistIds, genres: s.genres, durationMs: s.durationMs, ratingCount: st?.ratingCount ?? 0, ratingSum: st?.ratingSum ?? 0, logCount: st?.logCount ?? 0 });
  }
  const followedArtistIds = new Set(i.db.artistFollows.filter((f) => f.userId === userId).map((f) => f.artistId));
  return rankRecommendations({ mine, exclude, peers, followedArtistIds, songs }, limit).map((r) => ({ song: songCard(i, i.song.get(r.songId)!), reason: r.reason, score: r.score }));
}

/** "Because you like …" rows for Discover: anchored to a song the user rated highly most recently. */
export function becauseYouLike(userId: string): { anchor: SongCard; songs: SongCard[] } | null {
  const i = idx();
  const loved = [...(i.ratingsByUser.get(userId)?.values() ?? [])].filter((r) => r.rating >= 4.5).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byId(a.songId, b.songId));
  const anchor = loved[0] && i.song.get(loved[0].songId);
  if (!anchor) return null;
  const rated = i.ratingsByUser.get(userId)!;
  // Scores in tenths so the sums are exact whatever order they're added in.
  const co = new Map<string, number>();
  for (const r of i.ratingsBySong.get(anchor.id) ?? []) {
    if (r.rating < 4 || r.userId === userId) continue;
    for (const [sid, rr] of i.ratingsByUser.get(r.userId) ?? []) if (rr.rating >= 4 && !rated.has(sid)) co.set(sid, (co.get(sid) ?? 0) + 10);
  }
  for (const s of i.db.songs) if (!rated.has(s.id) && s.genres.some((g) => anchor.genres.includes(g))) co.set(s.id, (co.get(s.id) ?? 0) + 5);
  const songs = [...co.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).slice(0, 10).map(([sid]) => songCard(i, i.song.get(sid)!));
  return { anchor: songCard(i, anchor), songs };
}

// ── Stats (§23) ─────────────────────────────────────────────────────────

function statsInput(i: Indexes, userId: string, yearFilter?: number) {
  const entries = i.entriesByUser.get(userId) ?? [];
  const songs = new Map(entries.concat().map((e) => i.song.get(e.songId)!).concat([...(i.ratingsByUser.get(userId)?.keys() ?? [])].map((sid) => i.song.get(sid)!)).map((s) => [s.id, { id: s.id, firstArtistId: s.artistIds[0], genres: s.genres, releaseDate: s.releaseDate }]));
  const artists = new Map([...songs.values()].map((s) => { const a = i.artist.get(s.firstArtistId)!; return [a.id, { name: a.name, slug: a.slug, imageUrl: a.imageUrl, hue: a.hue }] as const; }));
  return {
    allEntries: entries.map((e) => ({ songId: e.songId, listenedAt: e.listenedAt, review: !!e.review, isRelisten: e.isRelisten })),
    ratings: ratingMap(i, userId), songs, artists, yearFilter,
  };
}

export function userStats(userId: string, yearFilter?: number) {
  const i = idx();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { entriesInScope, topSongs, ...st } = computeStats(statsInput(i, userId, yearFilter));
  return { ...st, topSongs: topSongs.map((t) => ({ song: songCard(i, i.song.get(t.id)!), count: t.count, rating: t.rating })) };
}

// ── Year in review (§24) ────────────────────────────────────────────────

export function yearInReview(userId: string, year: number) {
  const i = idx();
  const { entriesInScope: _in, ...raw } = computeStats(statsInput(i, userId, year)); // eslint-disable-line @typescript-eslint/no-unused-vars
  const st = { ...raw, topSongs: raw.topSongs.map((t) => ({ song: songCard(i, i.song.get(t.id)!), count: t.count, rating: t.rating })) };
  const entries = (i.entriesByUser.get(userId) ?? []).filter((e) => e.listenedAt.startsWith(String(year)));
  const firsts = entries.filter((e) => !e.isRelisten && (e.rating ?? 0) >= 4.5).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.listenedAt.localeCompare(b.listenedAt) || byId(a.id, b.id));
  const fives = [...new Set(entries.filter((e) => e.rating === 5).map((e) => e.songId))].slice(0, 10).map((id) => songCard(i, i.song.get(id)!));
  return {
    ...st,
    discovery: firsts[0] ? songCard(i, i.song.get(firsts[0].songId)!) : undefined,
    mostReplayed: st.topSongs[0],
    highestArtist: st.highestArtists[0],
    fives,
  };
}
