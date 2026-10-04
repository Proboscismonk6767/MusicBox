import type { DB, SongStats } from "../types";

// Aggregation table maintenance (§36). Stats are updated incrementally on
// writes; recomputeAllStats is only used on seed/migration.

export function emptyStats(): SongStats {
  return { ratingCount: 0, ratingSum: 0, histogram: Array(10).fill(0), logCount: 0, reviewCount: 0, likeCount: 0 };
}

export function statsFor(db: DB, songId: string): SongStats {
  return (db.songStats[songId] ??= emptyStats());
}

export function recomputeSongStats(db: DB, songId: string) {
  const s = emptyStats();
  for (const r of db.ratings) if (r.songId === songId) {
    s.ratingCount++;
    s.ratingSum += r.rating;
    s.histogram[r.rating * 2 - 1]++;
  }
  for (const e of db.entries) if (e.songId === songId && !e.removed) {
    s.logCount++;
    if (e.review) s.reviewCount++;
  }
  for (const l of db.likes) if (l.songId === songId) s.likeCount++;
  db.songStats[songId] = s;
}

export function recomputeAllStats(db: DB) {
  db.songStats = {};
  for (const song of db.songs) db.songStats[song.id] = emptyStats();
  for (const r of db.ratings) {
    const s = statsFor(db, r.songId);
    s.ratingCount++;
    s.ratingSum += r.rating;
    s.histogram[r.rating * 2 - 1]++;
  }
  for (const e of db.entries) {
    if (e.removed) continue;
    const s = statsFor(db, e.songId);
    s.logCount++;
    if (e.review) s.reviewCount++;
  }
  for (const l of db.likes) statsFor(db, l.songId).likeCount++;
}

export function avg(s: SongStats | undefined): number {
  return s && s.ratingCount ? s.ratingSum / s.ratingCount : 0;
}

/** Bayesian average to rank "Highly Rated" sensibly with few ratings. */
export function weightedAvg(s: SongStats | undefined, prior = 3.4, m = 6): number {
  if (!s) return 0;
  return (s.ratingSum + prior * m) / (s.ratingCount + m);
}
