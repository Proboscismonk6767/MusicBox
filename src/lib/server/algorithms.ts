// The ranking maths, free of any storage. The JSON store and Postgres both gather the
// rows these functions need and call them, so the two backends cannot disagree about a
// score. Ties are always broken by id so a page doesn't reshuffle between requests.

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ── Taste compatibility ─────────────────────────────────────────────────

export interface Compat {
  score: number;
  shared: number;
  /** Songs both rated, highest combined rating first (up to 4). */
  topIds: string[];
}

/** `a` and `b` map song id → rating (0.5–5). `genresOf` gives a song's genres. */
export function compat(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>, genresOf: (songId: string) => readonly string[]): Compat {
  let dot = 0, na = 0, nb = 0, shared = 0;
  const both: { id: string; s: number }[] = [];
  for (const [sid, ra] of a) {
    const rb = b.get(sid);
    if (rb === undefined) continue;
    shared++;
    const x = ra - 3, y = rb - 3;
    dot += x * y; na += x * x; nb += y * y;
    both.push({ id: sid, s: ra + rb });
  }
  // Genre overlap smooths sparse co-ratings.
  const genreVector = (m: ReadonlyMap<string, number>) => {
    const v = new Map<string, number>();
    for (const [sid, r] of m) for (const g of genresOf(sid)) v.set(g, (v.get(g) ?? 0) + (r - 2.5));
    return v;
  };
  const ga = genreVector(a), gb = genreVector(b);
  let gdot = 0, gna = 0, gnb = 0;
  for (const [g, x] of ga) { gdot += x * (gb.get(g) ?? 0); gna += x * x; }
  for (const y of gb.values()) gnb += y * y;
  const genreSim = gna && gnb ? gdot / Math.sqrt(gna * gnb) : 0;
  const ratingSim = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const shrink = shared / (shared + 4);
  const sim = ratingSim * shrink * 0.6 + genreSim * 0.4;
  const score = Math.round(Math.max(0, Math.min(99, 50 + sim * 50)));
  return { score, shared, topIds: both.sort((x, y) => y.s - x.s || byId(x.id, y.id)).slice(0, 4).map((x) => x.id) };
}

// ── Recommendations ─────────────────────────────────────────────────────
// Weighted hybrid: user-user collaborative filtering (people with similar ratings,
// boosted when you follow them) + genre affinity + followed artists, with a mild
// popularity penalty so it doesn't just echo the charts.

export interface RecoSong {
  id: string;
  title: string;
  albumId: string;
  artistIds: string[];
  genres: string[];
  durationMs: number;
  ratingCount: number;
  ratingSum: number;
  logCount: number;
}

export interface RecoInput {
  /** The user's own ratings. */
  mine: ReadonlyMap<string, number>;
  /** Songs not to suggest: already rated or in Listen Later. */
  exclude: ReadonlySet<string>;
  /** Other users with positive similarity (already boosted +0.2 when followed), in id order. */
  peers: { username: string; followed: boolean; sim: number; ratings: ReadonlyMap<string, number> }[];
  followedArtistIds: ReadonlySet<string>;
  /** Every song that could be suggested, including every song a peer rated, and the user's loved songs. */
  songs: ReadonlyMap<string, RecoSong>;
}

export interface Reco { songId: string; reason: string; score: number }

export function rankRecommendations(input: RecoInput, limit: number): Reco[] {
  const { mine, exclude, peers, followedArtistIds, songs } = input;
  const score = new Map<string, number>();
  const because = new Map<string, { user?: string; n: number }>();

  for (const p of peers) {
    for (const [sid, rating] of p.ratings) {
      if (exclude.has(sid) || rating < 3.5) continue;
      score.set(sid, (score.get(sid) ?? 0) + p.sim * (rating - 3));
      const b = because.get(sid) ?? { n: 0 };
      b.n++;
      if (!b.user || p.followed) b.user = p.username;
      because.set(sid, b);
    }
  }

  // Genre affinity from the user's ratings.
  const genre = new Map<string, number>();
  for (const [sid, rating] of mine) for (const g of songs.get(sid)?.genres ?? []) genre.set(g, (genre.get(g) ?? 0) + (rating - 3));
  const topGenre = [...genre.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];

  for (const s of [...songs.values()].sort((a, b) => byId(a.id, b.id))) {
    if (exclude.has(s.id)) continue;
    let v = score.get(s.id) ?? 0;
    for (const g of s.genres) v += Math.max(0, genre.get(g) ?? 0) * 0.08;
    if (s.artistIds.some((a) => followedArtistIds.has(a))) v += 0.6;
    if (s.ratingCount) v += (s.ratingSum / s.ratingCount - 3.3) * 0.5;
    v -= Math.log2(1 + s.logCount) * 0.05;
    if (v > 0) score.set(s.id, v);
  }

  // Seed songs: for "Because you liked …" reasons via shared artist/genre.
  const loved = [...mine.entries()].filter(([, r]) => r >= 4.5).map(([sid]) => songs.get(sid)).filter((s): s is RecoSong => !!s);
  const perAlbum = new Map<string, number>();
  const out: Reco[] = [];
  for (const [sid, v] of [...score.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))) {
    const s = songs.get(sid);
    if (!s) continue;
    const n = perAlbum.get(s.albumId) ?? 0;
    if (n >= 1 || s.durationMs < 90_000) continue; // one per album; skip intros/interludes
    perAlbum.set(s.albumId, n + 1);
    const b = because.get(sid);
    const seed = loved.find((l) => l.artistIds[0] === s.artistIds[0]) ?? loved.find((l) => l.genres.some((g) => s.genres.includes(g)));
    const reason = b && b.n >= 2 && b.user
      ? `@${b.user}${b.n > 1 ? ` + ${b.n - 1} with similar taste` : ""} rated this highly`
      : seed ? `Because you love “${seed.title}”`
      : topGenre && s.genres.includes(topGenre) ? `More ${topGenre}` : "Highly rated by the community";
    out.push({ songId: sid, reason, score: v });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Listening stats ─────────────────────────────────────────────────────

export interface StatEntry { songId: string; listenedAt: string; review: boolean; isRelisten: boolean }
export interface StatSong { id: string; firstArtistId: string; genres: string[]; releaseDate: string }
export interface StatArtist { name: string; slug: string; imageUrl?: string; hue: number }

export interface StatsInput {
  /** All of the user's diary entries (not removed), whatever the year filter. */
  allEntries: StatEntry[];
  /** The user's ratings: song id → rating. */
  ratings: ReadonlyMap<string, number>;
  songs: ReadonlyMap<string, StatSong>;
  artists: ReadonlyMap<string, StatArtist>;
  yearFilter?: number;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Everything except card-shaped fields; callers turn `topSongs` ids into song cards. */
export function computeStats({ allEntries, ratings, songs, artists, yearFilter }: StatsInput) {
  const entries = yearFilter ? allEntries.filter((e) => e.listenedAt.startsWith(String(yearFilter))) : allEntries;
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
    const s = songs.get(e.songId)!;
    const a = s.firstArtistId;
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
  const ratedInScope = [...ratings].filter(([sid]) => !yearFilter || songsSet.has(sid)).map(([songId, rating]) => ({ songId, rating }));
  for (const r of ratedInScope) {
    const a = songs.get(r.songId)!.firstArtistId;
    artistRatings.set(a, [...(artistRatings.get(a) ?? []), r.rating]);
  }
  const histogram = Array(10).fill(0);
  for (const r of ratedInScope) histogram[r.rating * 2 - 1]++;
  const artistOf = (id: string) => { const a = artists.get(id)!; return { name: a.name, slug: a.slug, imageUrl: a.imageUrl, hue: a.hue }; };
  // Counts first, then id: equal counts always rank the same way.
  const rank = <T,>(m: Map<string, T>, value: (v: T) => number) => [...m.entries()].sort((a, b) => value(b[1]) - value(a[1]) || byId(a[0], b[0]));
  const topArtists = rank(artistPlays, (n) => n).slice(0, 8).map(([id, n]) => ({ ...artistOf(id), count: n }));
  const highestArtists = [...artistRatings.entries()].filter(([, r]) => r.length >= 3)
    .map(([id, r]) => ({ id, avg: r.reduce((x, y) => x + y, 0) / r.length, count: r.length }))
    .sort((x, y) => y.avg - x.avg || byId(x.id, y.id)).slice(0, 6)
    .map(({ id, avg, count }) => ({ ...artistOf(id), avg, count }));
  const mostReviewed = rank(artistReviews, (n) => n).slice(0, 6).map(([id, n]) => ({ ...artistOf(id), count: n }));
  const topGenres = [...genrePlays.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 8).map(([name, count]) => ({ name, count }));
  const topSongs = [...songPlays.entries()].sort((a, b) => b[1] - a[1] || (ratings.get(b[0]) ?? 0) - (ratings.get(a[0]) ?? 0) || byId(a[0], b[0])).slice(0, 10).map(([id, n]) => ({ id, count: n, rating: ratings.get(id) }));
  const avgRating = ratedInScope.length ? ratedInScope.reduce((a, r) => a + r.rating, 0) / ratedInScope.length : 0;
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
    entriesInScope: entries,
  };
}
