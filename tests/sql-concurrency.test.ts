import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./setup";
import { getDB } from "@/lib/server/store";
import { openTestDb } from "./helpers/db";
import type { Db } from "@/lib/server/sql/driver";
import { applySchema } from "@/lib/server/sql/schema";
import { importDb } from "@/lib/server/sql/import-db";
import { createSqlCommands } from "@/lib/server/sql/commands";
import type { User } from "@/lib/types";

// The JSON store is single threaded, so a double tap, a doubled form submit or two imports at once
// could never interleave. In Postgres they can. These fire many of the same command in parallel and
// check nothing is lost, duplicated or left inconsistent. (Most meaningful on a real server:
// TEST_DATABASE_URL; the embedded Postgres serialises everything.)

let pg: Db & { dispose: () => Promise<void> };
let cmd: ReturnType<typeof createSqlCommands>;
let users: Record<string, User>;
const songs = () => getDB().songs.map((s) => s.id);
const count = async (sql: string, params: unknown[] = []) => Number((await pg.query<{ n: number }>(sql, params))[0].n);

beforeAll(async () => {
  pg = await openTestDb();
  await applySchema(pg);
  await importDb(getDB(), pg);
  cmd = createSqlCommands(pg);
  users = Object.fromEntries(getDB().users.map((u) => [u.username, structuredClone(u)]));
}, 120_000);
afterAll(() => pg.dispose());

const settle = (ps: Promise<unknown>[]) => Promise.allSettled(ps);

describe("parallel writes", () => {
  it("two sign-ups for one username: exactly one wins, the rest are told it's taken", async () => {
    const make = (n: number): User => ({ ...structuredClone(users.alex), id: `us_race_${n}`, username: "racer", passwordHash: "x" });
    const results = await settle(Array.from({ length: 20 }, (_, n) => cmd.createUser(make(n))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect((r.reason as Error).message).toBe("That username is taken.");
    expect(await count("select count(*)::int as n from users where username = 'racer'")).toBe(1);
  });

  it("a flurry of like toggles ends consistent: no errors, at most one like, a feed event only when liked", async () => {
    const [song] = songs();
    const results = await settle(Array.from({ length: 40 }, () => cmd.toggleLike(users.maya, song)));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const likes = await count("select count(*)::int as n from likes where user_id = $1 and song_id = $2", [users.maya.id, song]);
    const events = await count("select count(*)::int as n from activity_events where actor_id = $1 and event_type = 'song_liked' and song_id = $2", [users.maya.id, song]);
    expect(likes).toBeLessThanOrEqual(1);
    expect(events).toBe(likes);
    expect(await count("select like_count as n from song_stats where song_id = $1", [song])).toBe(await count("select count(*)::int as n from likes where song_id = $1", [song]));
  });

  it("many follow toggles: at most one follow, one feed event, and stats of every kind agree", async () => {
    const results = await settle(Array.from({ length: 30 }, () => cmd.toggleFollow(users.sam, users.noor.id)));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const follows = await count("select count(*)::int as n from follows where follower_id = $1 and following_id = $2", [users.sam.id, users.noor.id]);
    const events = await count("select count(*)::int as n from activity_events where actor_id = $1 and event_type = 'user_followed' and target_user_id = $2", [users.sam.id, users.noor.id]);
    expect(follows).toBeLessThanOrEqual(1);
    expect(events).toBe(follows);
  });

  it("the same song added to a list many times at once is added once", async () => {
    const listId = await cmd.createList(users.alex, { title: "Race", description: "", isRanked: false, visibility: "public", items: [] });
    const song = songs()[3];
    const results = await settle(Array.from({ length: 15 }, () => cmd.addToList(users.alex, listId, song)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await count("select count(*)::int as n from list_items where list_id = $1 and song_id = $2", [listId, song])).toBe(1);
    const positions = await pg.query<{ position: number }>("select position from list_items where list_id = $1", [listId]);
    expect(new Set(positions.map((p) => p.position)).size).toBe(positions.length);
  });

  it("parallel logs and ratings keep the song's counters exact", async () => {
    const song = songs()[7];
    const people = ["alex", "maya", "sam", "noor", "theo", "rosa", "juno", "ellis"];
    const before = await pg.query<{ log_count: number; rating_count: number }>("select log_count, rating_count from song_stats where song_id = $1", [song]);
    await Promise.all(people.flatMap((p, n) => [
      cmd.logSong(users[p], song, { rating: ((n % 9) + 1) / 2, listenedAt: "2026-04-01", tags: [] }),
      cmd.rateSong(users[p], song, ((n % 9) + 1) / 2),
      cmd.logSong(users[p], song, { listenedAt: "2026-04-02", tags: [], review: "again" }),
    ]));
    const stats = (await pg.query<{ log_count: number; rating_count: number; review_count: number; rating_sum: number }>("select log_count, rating_count, review_count, rating_sum from song_stats where song_id = $1", [song]))[0];
    expect(stats.log_count).toBe(await count("select count(*)::int as n from diary_entries where song_id = $1 and not removed", [song]));
    expect(stats.rating_count).toBe(await count("select count(*)::int as n from ratings where song_id = $1", [song]));
    expect(stats.review_count).toBe(await count("select count(*)::int as n from diary_entries where song_id = $1 and not removed and coalesce(review_text, '') <> ''", [song]));
    expect(stats.log_count).toBeGreaterThanOrEqual(before[0].log_count + people.length * 2);
  });

  it("two big history imports touching the same songs at once don't deadlock", async () => {
    const ids = songs().slice(100, 160);
    const entries = (reverse: boolean) => (reverse ? [...ids].reverse() : ids).map((songId) => ({ songId, listenedAt: "2025-01-01", tags: ["spotify-import"], memory: "m" }));
    // Songs a person already logged are skipped, not duplicated.
    const alreadyLogged = async (p: string) => count("select count(distinct song_id)::int as n from diary_entries where user_id = $1 and not removed and song_id = any($2::text[])", [users[p].id, ids]);
    const had = Object.fromEntries(await Promise.all(["priya", "kai", "daniel", "theo"].map(async (p) => [p, await alreadyLogged(p)])));
    const results = await settle([cmd.addImportedEntries(users.priya.id, entries(false)), cmd.addImportedEntries(users.kai.id, entries(true)), cmd.addImportedEntries(users.daniel.id, entries(false)), cmd.addImportedEntries(users.theo.id, entries(true))]);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    for (const p of ["priya", "kai", "daniel", "theo"]) {
      expect(await count("select count(*)::int as n from diary_entries where user_id = $1 and tags && array['spotify-import']", [users[p].id]), p).toBe(ids.length - had[p]);
      expect(await count("select count(distinct song_id)::int as n from diary_entries where user_id = $1 and song_id = any($2::text[]) and not removed", [users[p].id, ids]), `${p} logged every song`).toBe(ids.length);
    }
  });

  it("two deletions of overlapping accounts at once both complete", async () => {
    const results = await settle([cmd.deleteAccount(users.priya.id), cmd.deleteAccount(users.kai.id), cmd.deleteAccount(users.daniel.id)]);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await count("select count(*)::int as n from users where id = any($1::text[])", [[users.priya.id, users.kai.id, users.daniel.id]])).toBe(0);
    // Every song's counters still equal what is actually there.
    const off = await pg.query(
      `select s.song_id from song_stats s where s.log_count <> (select count(*) from diary_entries e where e.song_id = s.song_id and not e.removed)
         or s.rating_count <> (select count(*) from ratings r where r.song_id = s.song_id) or s.like_count <> (select count(*) from likes l where l.song_id = s.song_id)`);
    expect(off).toEqual([]);
  });
});
