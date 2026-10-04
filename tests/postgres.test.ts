import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDB } from "@/lib/server/store";
import { openTestDb } from "./helpers/db";
import type { Db } from "@/lib/server/sql/driver";
import { applySchema } from "@/lib/server/sql/schema";
import { importDb, verifyImport, type ImportReport } from "@/lib/server/sql/import-db";

// Applies db/schema.sql and the migrations to a real Postgres (PGlite) and loads the
// app's complete data set into it. If the schema drifts from src/lib/types.ts, or the
// importer loses or invents data, this fails.

let pg: Db & { dispose: () => Promise<void> };
let source: ReturnType<typeof getDB>;
let result: ImportReport;

const rows = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => pg.query<T>(sql, params);
const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await rows<T>(sql, params))[0];
const q = (sql: string, params?: unknown[]) => pg.query(sql, params);

async function fresh() {
  const p = await openTestDb();
  await applySchema(p);
  return p;
}

beforeAll(async () => {
  source = getDB();
  pg = await fresh();
  result = await importDb(source, pg);
}, 120_000);
afterAll(() => pg.dispose());

describe("schema + importer", () => {
  it("loads every row of the app's data with nothing dropped", async () => {
    expect(result.skipped).toEqual({});
    expect(result.inserted).toMatchObject({
      users: source.users.length, artists: source.artists.length, albums: source.albums.length, songs: source.songs.length,
      ratings: source.ratings.length, likes: source.likes.length, diary_entries: source.entries.length, follows: source.follows.length,
      lists: source.lists.length, list_items: source.lists.reduce((n, l) => n + l.items.length, 0), comments: source.comments.length,
      notifications: source.notifications.length, activity_events: source.activity.length,
    });
    expect(Number((await one<{ n: number }>("select count(*)::int as n from diary_entries")).n)).toBe(source.entries.length);
  });

  it("reproduces the app's song_stats exactly through triggers", async () => {
    expect(await verifyImport(source, pg)).toEqual([]);
  });

  it("verification actually notices a difference", async () => {
    await q("begin");
    await q("update song_stats set rating_count = rating_count + 1 where song_id = (select song_id from song_stats order by rating_count desc limit 1)");
    const problems = await verifyImport(source, pg);
    await q("rollback");
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/song_stats: .* differs/);
  });

  it("keeps ids stable so public URLs survive the move", async () => {
    const e = source.entries.find((x) => x.review)!;
    expect((await one<{ id: string }>("select id from diary_entries where id = $1", [e.id])).id).toBe(e.id);
    const u = source.users[0];
    expect((await one<{ username: string }>("select username::text from users where id = $1", [u.id])).username).toBe(u.username);
    // citext: usernames are case-insensitive, as the app treats them
    expect((await one<{ id: string }>("select id from users where username = $1", [u.username.toUpperCase()])).id).toBe(u.id);
  });
});

describe("triggers and constraints", () => {
  it("keep song_stats right as ratings, logs, reviews and likes change", async () => {
    await q("begin");
    const song = source.songs[source.songs.length - 1].id;
    const [a, b] = source.users;
    const stats = () => one<Record<string, unknown>>("select rating_count, rating_sum::float8 as rating_sum, histogram, log_count, review_count, like_count from song_stats where song_id = $1", [song]);
    const before = await stats();

    await q("insert into ratings (user_id, song_id, rating) values ($1, $2, 4.5)", [a.id, song]);
    await q("insert into ratings (user_id, song_id, rating) values ($1, $2, 3)", [b.id, song]);
    await q("insert into likes (user_id, song_id) values ($1, $2)", [a.id, song]);
    await q("insert into diary_entries (id, user_id, song_id, listened_at, review_text) values ('en_t1', $1, $2, '2026-01-01', 'great')", [a.id, song]);
    await q("insert into diary_entries (id, user_id, song_id, listened_at) values ('en_t2', $1, $2, '2026-01-02')", [a.id, song]);
    let s = await stats();
    expect(s).toMatchObject({ rating_count: Number(before!.rating_count) + 2, log_count: Number(before!.log_count) + 2, review_count: Number(before!.review_count) + 1, like_count: Number(before!.like_count) + 1 });
    expect(Number(s!.rating_sum) - Number(before!.rating_sum)).toBeCloseTo(7.5);
    expect((s!.histogram as number[])[8]).toBe((before!.histogram as number[])[8] + 1); // 4.5 stars → bucket 9
    expect((s!.histogram as number[])[5]).toBe((before!.histogram as number[])[5] + 1); // 3 stars → bucket 6

    await q("update ratings set rating = 5 where user_id = $1 and song_id = $2", [a.id, song]);
    await q("update diary_entries set removed = true where id = 'en_t1'");
    s = await stats();
    expect((s!.histogram as number[])[9]).toBe((before!.histogram as number[])[9] + 1);
    expect((s!.histogram as number[])[8]).toBe((before!.histogram as number[])[8]);
    expect(s).toMatchObject({ log_count: Number(before!.log_count) + 1, review_count: Number(before!.review_count) });

    await q("delete from ratings where song_id = $1 and user_id in ($2, $3)", [song, a.id, b.id]);
    await q("rollback");
    expect(await stats()).toEqual(before);
  });

  it("deleting a user removes their data and corrects the stats", async () => {
    await q("begin");
    const e = source.entries.find((x) => x.review && !x.removed)!;
    const before = await one<{ log_count: number; review_count: number }>("select log_count, review_count from song_stats where song_id = $1", [e.songId]);
    const mine = Number((await one<{ n: number }>("select count(*)::int as n from diary_entries where user_id = $1 and song_id = $2 and not removed", [e.userId, e.songId])).n);
    await q("delete from users where id = $1", [e.userId]);
    expect(Number((await one<{ n: number }>("select count(*)::int as n from diary_entries where user_id = $1", [e.userId])).n)).toBe(0);
    expect(Number((await one<{ n: number }>("select count(*)::int as n from sessions where user_id = $1", [e.userId])).n)).toBe(0);
    const after = await one<{ log_count: number }>("select log_count from song_stats where song_id = $1", [e.songId]);
    expect(Number(after.log_count)).toBe(Number(before.log_count) - mine);
    await q("rollback");
  });

  it("rejects data the app would also reject", async () => {
    const [a] = source.users;
    const song = source.songs[0].id;
    const fails = async (sql: string, params: unknown[] = []) => {
      await q("begin");
      try {
        await q(sql, params);
        return false;
      } catch {
        return true;
      } finally {
        await q("rollback");
      }
    };
    expect(await fails("insert into ratings (user_id, song_id, rating) values ($1, $2, 0.3)", [a.id, song])).toBe(true); // not a half step
    expect(await fails("insert into ratings (user_id, song_id, rating) values ($1, $2, 5.5)", [a.id, song])).toBe(true);
    expect(await fails("insert into users (id, username, display_name, password_hash) values ('x1', 'Bad Name!', 'x', 'h')")).toBe(true);
    expect(await fails("insert into users (id, username, display_name, password_hash) values ('x2', $1, 'x', 'h')", [a.username.toUpperCase()])).toBe(true); // duplicate, case-insensitively
    expect(await fails("insert into follows (follower_id, following_id) values ($1, $1)", [a.id])).toBe(true);
    expect(await fails("insert into diary_entries (id, user_id, song_id, listened_at, context) values ('en_x', $1, $2, '2026-01-01', 'spaceship')", [a.id, song])).toBe(true);
    expect(await fails("insert into diary_entries (id, user_id, song_id, listened_at) values ('en_y', 'nobody', $1, '2026-01-01')", [song])).toBe(true);
  });

  it("supports the lookups the app relies on with real indexes", async () => {
    const hit = await rows<{ title: string }>("select title from songs where title % $1 order by similarity(title, $1) desc limit 3", [source.songs[0].title.slice(0, 6)]);
    expect(hit.length).toBeGreaterThan(0);
    const tagged = await rows("select id from diary_entries where tags && array['spotify-import']::text[]");
    expect(Array.isArray(tagged)).toBe(true);
  });
});

describe("importing data with dangling references", () => {
  it("skips and reports them instead of failing", async () => {
    const p = await fresh();
    const broken = structuredClone(source);
    const someEntry = broken.entries[0].id;
    broken.activity.push({ id: "ac_orphan1", actorId: broken.users[0].id, type: "song_logged", entryId: "en_deleted", createdAt: new Date().toISOString() });
    broken.reviewLikes.push({ userId: broken.users[0].id, entryId: "en_deleted", createdAt: new Date().toISOString() });
    broken.ratings.push({ userId: "us_ghost", songId: broken.songs[0].id, rating: 4, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
    broken.comments.push({ id: "co_orphan", userId: broken.users[0].id, targetType: "entry", targetId: someEntry, parentId: "co_missing", body: "a reply to a deleted comment", createdAt: "2026-01-01T00:00:00Z" });
    const r = await importDb(broken, p);
    expect(r.skipped).toEqual({ activity_events: 1, review_likes: 1, ratings: 1 });
    // The reply survives as a top-level comment.
    expect((await p.query<{ parent_id: string | null }>("select parent_id from comments where id = 'co_orphan'"))[0].parent_id).toBeNull();
    expect(await verifyImport(source, p)).toEqual([]);
    await p.dispose();
  }, 120_000);
});
