import "server-only";
import { idx } from "./indexes";
import { songCard, compatibility } from "./queries";
import type { Recommendation, SongCard } from "../views";

// ── Recommendations (§22) ───────────────────────────────────────────────
// Weighted hybrid: user-user collaborative filtering (people with similar
// ratings, boosted when you follow them) + genre affinity + followed artists,
// with a mild popularity penalty so it doesn't just echo the charts.

export function recommendations(userId: string, limit = 12): Recommendation[] {
  const i = idx();
  const mine = i.ratingsByUser.get(userId) ?? new Map();
  const following = i.following.get(userId) ?? new Set<string>();
  const exclude = new Set([...mine.keys(), ...(i.listenLater.get(userId)?.keys() ?? [])]);
  const score = new Map<string, number>();
  const because = new Map<string, { user?: string; n: number }>();

  if (mine.size) {
    for (const u of i.db.users) {
      if (u.id === userId) continue;
      const c = compatibility(userId, u.id);
      let sim = (c.score - 50) / 50;
      if (following.has(u.id)) sim += 0.2;
      if (sim <= 0) continue;
      for (const [sid, r] of i.ratingsByUser.get(u.id) ?? []) {
        if (exclude.has(sid) || r.rating < 3.5) continue;
        score.set(sid, (score.get(sid) ?? 0) + sim * (r.rating - 3));
        const b = because.get(sid) ?? { n: 0 };
        b.n++;
        if (!b.user || following.has(u.id)) b.user = u.username;
        because.set(sid, b);
      }
    }
  }

  // Genre affinity from the viewer's ratings.
  const genre = new Map<string, number>();
  for (const [sid, r] of mine) for (const g of i.song.get(sid)?.genres ?? []) genre.set(g, (genre.get(g) ?? 0) + (r.rating - 3));
  const followedArtists = new Set(i.db.artistFollows.filter((f) => f.userId === userId).map((f) => f.artistId));
  const topGenre = [...genre.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  for (const s of i.db.songs) {
    if (exclude.has(s.id)) continue;
    let v = score.get(s.id) ?? 0;
    for (const g of s.genres) v += Math.max(0, genre.get(g) ?? 0) * 0.08;
    if (s.artistIds.some((a) => followedArtists.has(a))) v += 0.6;
    const st = i.db.songStats[s.id];
    if (st?.ratingCount) v += (st.ratingSum / st.ratingCount - 3.3) * 0.5;
    v -= Math.log2(1 + (st?.logCount ?? 0)) * 0.05;
    if (v > 0) score.set(s.id, v);
  }

  // Seed songs: for "Because you liked …" reasons via shared artist/genre.
  const loved = [...mine.entries()].filter(([, r]) => r.rating >= 4.5).map(([sid]) => i.song.get(sid)!);
  const perAlbum = new Map<string, number>();
  const out: Recommendation[] = [];
  for (const [sid, v] of [...score.entries()].sort((a, b) => b[1] - a[1])) {
    const s = i.song.get(sid)!;
    const n = perAlbum.get(s.albumId) ?? 0;
    if (n >= 1 || s.durationMs < 90_000) continue; // one per album; skip intros/interludes
    perAlbum.set(s.albumId, n + 1);
    const b = because.get(sid);
    const seed = loved.find((l) => l.artistIds[0] === s.artistIds[0]) ?? loved.find((l) => l.genres.some((g) => s.genres.includes(g)));
    const reason = b && b.n >= 2 && b.user
      ? `@${b.user}${b.n > 1 ? ` + ${b.n - 1} with similar taste` : ""} rated this highly`
      : seed ? `Because you love “${seed.title}”`
      : topGenre && s.genres.includes(topGenre) ? `More ${topGenre}` : "Highly rated by the community";
    out.push({ song: songCard(i, s), reason, score: v });
    if (out.length >= limit) break;
  }
  return out;
}

/** "Because you like …" rows for Discover: anchored to a top artist. */
export function becauseYouLike(userId: string): { anchor: SongCard; songs: SongCard[] } | null {
  const i = idx();
  const mine = [...(i.ratingsByUser.get(userId)?.values() ?? [])].filter((r) => r.rating >= 4.5).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const anchor = mine[0] && i.song.get(mine[0].songId);
  if (!anchor) return null;
  const rated = i.ratingsByUser.get(userId)!;
  const co = new Map<string, number>();
  for (const r of i.ratingsBySong.get(anchor.id) ?? []) {
    if (r.rating < 4 || r.userId === userId) continue;
    for (const [sid, rr] of i.ratingsByUser.get(r.userId) ?? []) if (rr.rating >= 4 && !rated.has(sid)) co.set(sid, (co.get(sid) ?? 0) + 1);
  }
  for (const s of i.db.songs) if (!rated.has(s.id) && s.genres.some((g) => anchor.genres.includes(g))) co.set(s.id, (co.get(s.id) ?? 0) + 0.5);
  const songs = [...co.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([sid]) => songCard(i, i.song.get(sid)!));
  return { anchor: songCard(i, anchor), songs };
}

// ── Stats (§23) ─────────────────────────────────────────────────────────

export function userStats(userId: string, yearFilter?: number) {
  const i = idx();
  const allEntries = i.entriesByUser.get(userId) ?? [];
  const entries = yearFilter ? allEntries.filter((e) => e.listenedAt.startsWith(String(yearFilter))) : allEntries;
  const ratings = [...(i.ratingsByUser.get(userId)?.values() ?? [])];
  const songsSet = new Set(entries.map((e) => e.songId));
  const artistPlays = new Map<string, number>();
  const artistRatings = new Map<string, number[]>();
  const artistReviews = new Map<string, number>();
  const genrePlays = new Map<string, number>();
  const songPlays = new Map<string, number>();
  const months = Array(12).fill(0);
  const weekdays = Array(7).fill(0);
  const decades = new Map<number, number>();
  const releaseYears = new Map<number, number>();
  const calendar = new Map<string, number>();
  for (const e of entries) {
    const s = i.song.get(e.songId)!;
    const a = s.artistIds[0];
    artistPlays.set(a, (artistPlays.get(a) ?? 0) + 1);
    if (e.review) artistReviews.set(a, (artistReviews.get(a) ?? 0) + 1);
    for (const g of s.genres.slice(0, 2)) genrePlays.set(g, (genrePlays.get(g) ?? 0) + 1);
    songPlays.set(s.id, (songPlays.get(s.id) ?? 0) + 1);
    const d = new Date(e.listenedAt + "T12:00:00Z");
    months[d.getUTCMonth()]++;
    weekdays[d.getUTCDay()]++;
    const ry = Number(s.releaseDate.slice(0, 4));
    decades.set(Math.floor(ry / 10) * 10, (decades.get(Math.floor(ry / 10) * 10) ?? 0) + 1);
    releaseYears.set(ry, (releaseYears.get(ry) ?? 0) + 1);
    calendar.set(e.listenedAt, (calendar.get(e.listenedAt) ?? 0) + 1);
  }
  const ratedInScope = yearFilter ? ratings.filter((r) => songsSet.has(r.songId)) : ratings;
  for (const r of ratedInScope) {
    const a = i.song.get(r.songId)!.artistIds[0];
    artistRatings.set(a, [...(artistRatings.get(a) ?? []), r.rating]);
  }
  const histogram = Array(10).fill(0);
  for (const r of ratedInScope) histogram[r.rating * 2 - 1]++;
  const artistOf = (id: string) => ({ name: i.artist.get(id)!.name, slug: i.artist.get(id)!.slug, imageUrl: i.artist.get(id)!.imageUrl, hue: i.artist.get(id)!.hue });
  const topArtists = [...artistPlays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ ...artistOf(id), count: n }));
  const highestArtists = [...artistRatings.entries()].filter(([, r]) => r.length >= 3).map(([id, r]) => ({ ...artistOf(id), avg: r.reduce((a, b) => a + b, 0) / r.length, count: r.length })).sort((a, b) => b.avg - a.avg).slice(0, 6);
  const mostReviewed = [...artistReviews.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ ...artistOf(id), count: n }));
  const topGenres = [...genrePlays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  const topSongs = [...songPlays.entries()].sort((a, b) => b[1] - a[1] || (i.ratingsByUser.get(userId)?.get(b[0])?.rating ?? 0) - (i.ratingsByUser.get(userId)?.get(a[0])?.rating ?? 0)).slice(0, 10).map(([id, n]) => ({ song: songCard(i, i.song.get(id)!), count: n, rating: i.ratingsByUser.get(userId)?.get(id)?.rating }));
  const avgRating = ratedInScope.length ? ratedInScope.reduce((a, r) => a + r.rating, 0) / ratedInScope.length : 0;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const years = [...new Set(allEntries.map((e) => Number(e.listenedAt.slice(0, 4))))].sort((a, b) => b - a);
  return {
    logged: entries.length,
    unique: songsSet.size,
    artists: artistPlays.size,
    avgRating,
    reviews: entries.filter((e) => e.review).length,
    relistens: entries.filter((e) => e.isRelisten).length,
    favouriteArtist: topArtists[0]?.name,
    favouriteGenre: topGenres[0]?.name,
    mostActiveDay: entries.length ? DAYS[weekdays.indexOf(Math.max(...weekdays))] : undefined,
    mostActiveMonth: entries.length ? MONTHS[months.indexOf(Math.max(...months))] : undefined,
    histogram, months, weekdays, topArtists, highestArtists, mostReviewed, topGenres, topSongs,
    decades: [...decades.entries()].sort((a, b) => a[0] - b[0]),
    releaseYears: [...releaseYears.entries()].sort((a, b) => a[0] - b[0]),
    calendar: Object.fromEntries(calendar),
    years,
  };
}

// ── Year in review (§24) ────────────────────────────────────────────────

export function yearInReview(userId: string, year: number) {
  const i = idx();
  const st = userStats(userId, year);
  const entries = (i.entriesByUser.get(userId) ?? []).filter((e) => e.listenedAt.startsWith(String(year)));
  const firsts = entries.filter((e) => !e.isRelisten && (e.rating ?? 0) >= 4.5).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.listenedAt.localeCompare(b.listenedAt));
  const fives = [...new Set(entries.filter((e) => e.rating === 5).map((e) => e.songId))].slice(0, 10).map((id) => songCard(i, i.song.get(id)!));
  return {
    ...st,
    discovery: firsts[0] ? songCard(i, i.song.get(firsts[0].songId)!) : undefined,
    mostReplayed: st.topSongs[0],
    highestArtist: st.highestArtists[0],
    fives,
  };
}
