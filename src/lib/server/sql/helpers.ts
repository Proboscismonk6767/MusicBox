import type { Q } from "./driver";
import { compat, type Compat } from "../algorithms";

export const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Plain byte ordering, the same order JavaScript string comparison gives for our ids. */
export const C = 'collate "C"';
export const ids = (rows: { [k: string]: unknown }[], key = "id") => rows.map((r) => r[key] as string);
export const windowStart = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

/** Ratings (song id → rating) for each of these users, in one query. */
export async function ratingsOf(q: Q, userIds: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>(userIds.map((u) => [u, new Map()]));
  if (!userIds.length) return out;
  for (const r of await q.query("select user_id, song_id, rating from ratings where user_id = any($1::text[])", [userIds])) out.get(r.user_id as string)!.set(r.song_id as string, r.rating as number);
  return out;
}

export async function genresOfSongs(q: Q, songIds: Iterable<string>): Promise<Map<string, string[]>> {
  const list = [...new Set(songIds)];
  if (!list.length) return new Map();
  return new Map((await q.query("select id, genres from songs where id = any($1::text[])", [list])).map((r) => [r.id as string, r.genres as string[]]));
}

/** Compatibility of one user with several others. */
export async function compatWith(q: Q, aId: string, others: string[]): Promise<Map<string, Compat>> {
  const ratings = await ratingsOf(q, [aId, ...others]);
  const genres = await genresOfSongs(q, [...ratings.values()].flatMap((m) => [...m.keys()]));
  const a = ratings.get(aId)!;
  return new Map(others.map((b) => [b, compat(a, ratings.get(b)!, (sid) => genres.get(sid) ?? [])]));
}
