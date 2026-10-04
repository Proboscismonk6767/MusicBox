import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "./setup";
import { getDB } from "@/lib/server/store";
import { jsonCommands, type Commands as JsonCommands } from "@/lib/server/commands-json";
import { openTestDb } from "./helpers/db";
import type { Db } from "@/lib/server/sql/driver";
import { applySchema } from "@/lib/server/sql/schema";
import { importDb } from "@/lib/server/sql/import-db";
import { loadDb } from "@/lib/server/sql/load-db";
import { createSqlCommands } from "@/lib/server/sql/commands";
import type { Async } from "@/lib/server/data";
import type { DB, User } from "@/lib/types";
import type { ExternalTrack } from "@/lib/server/catalogue-core";
import { applyEdgeCases } from "./helpers/fixtures";

// Every write must have the same effect on Postgres as on the JSON store. This runs one long
// scenario (every command, including its error paths) against both, with the same clock and
// the same generated ids, then compares what each command returned or threw, and finally
// compares the two whole databases.

const counters = vi.hoisted(() => ({ n: {} as Record<string, number> }));
vi.mock("@/lib/util", async (orig) => {
  const m = await orig<typeof import("@/lib/util")>();
  return { ...m, newId: (prefix = "") => prefix + String((counters.n[prefix] = (counters.n[prefix] ?? 0) + 1)).padStart(6, "0") };
});

type Cmds = Async<JsonCommands>;
type Step = { label: string; as?: User; run: (c: Cmds, u: User) => Promise<unknown> };
type Outcome = { label: string; ok: boolean; value?: unknown; error?: string };

let pg: Db & { dispose: () => Promise<void> };
let sql: Cmds;
const jsonAsync = new Proxy({} as Cmds, { get: (_t, name: string) => async (...a: unknown[]) => (jsonCommands as unknown as Record<string, (...x: unknown[]) => unknown>)[name](...a) });
const T0 = Date.parse("2026-05-01T12:00:00.000Z");

const clean = (x: unknown) => (x === undefined ? null : JSON.parse(JSON.stringify(x), (k, v) => ((k === "hasSpoiler" || k === "suspended" || k === "removed") && v === false ? undefined : v)));

async function run(c: Cmds, steps: Step[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const s of steps) {
    try {
      out.push({ label: s.label, ok: true, value: clean(await s.run(c, s.as as User)) });
    } catch (e) {
      out.push({ label: s.label, ok: false, error: `${(e as Error).constructor.name}: ${(e as Error).message}` });
    }
    vi.setSystemTime(Date.now() + 1000);
  }
  return out;
}

/** The database as a comparable value: every table in a fixed order, without the ids nobody depends on. */
function snapshot(db: DB) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = Record<string, any>;
  const sortBy = (rows: Row[], key: (r: Row) => string) => [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const c = clean as (x: unknown) => Row[];
  return {
    users: sortBy(c(db.users), (r) => r.id), artists: sortBy(c(db.artists), (r) => r.id), albums: sortBy(c(db.albums), (r) => r.id), songs: sortBy(c(db.songs), (r) => r.id),
    ratings: sortBy(c(db.ratings), (r) => r.userId + r.songId), likes: sortBy(c(db.likes), (r) => r.userId + r.songId), entries: sortBy(c(db.entries), (r) => r.id),
    reviewLikes: sortBy(c(db.reviewLikes), (r) => r.entryId + r.userId), follows: sortBy(c(db.follows), (r) => r.followerId + r.followingId),
    artistFollows: sortBy(c(db.artistFollows), (r) => r.userId + r.artistId), lists: sortBy(c(db.lists), (r) => r.id), listLikes: sortBy(c(db.listLikes), (r) => r.listId + r.userId),
    comments: sortBy(c(db.comments), (r) => r.id), commentLikes: sortBy(c(db.commentLikes), (r) => r.commentId + r.userId), listenLater: sortBy(c(db.listenLater), (r) => r.userId + r.songId),
    // Which notification went to whom matters; the order they were numbered in doesn't.
    notifications: sortBy(c(db.notifications).map((n) => ({ ...n, id: undefined })), (r) => [r.userId, r.actorId, r.type, r.targetId, r.createdAt].join("|")),
    activity: sortBy(c(db.activity), (r) => r.id), reports: sortBy(c(db.reports), (r) => r.id), blocks: sortBy(c(db.blocks), (r) => r.userId + r.targetId + r.kind),
    sessions: sortBy(c(db.sessions), (r) => r.tokenHash), songStats: clean(db.songStats) as Row,
  };
}

async function compareWorlds(label: string) {
  const want = snapshot(getDB());
  const got = snapshot(await loadDb(pg));
  for (const table of Object.keys(want) as (keyof typeof want)[]) expect(got[table], `${label}: table ${table}`).toEqual(want[table]);
}

/** Runs the steps on both worlds from identical clocks and id counters. */
async function scenario(label: string, steps: Step[]) {
  const ids = structuredClone(counters.n);
  vi.setSystemTime(Math.max(Date.now(), T0));
  const start = Date.now();
  const want = await run(jsonAsync, steps);
  counters.n = ids;
  vi.setSystemTime(start);
  const got = await run(sql, steps);
  expect(got).toEqual(want);
  await compareWorlds(label);
  for (const o of want) tally[o.ok ? "ok" : "failed"]++;
  if (process.env.SHOW_OUTCOMES) for (const o of want) console.log(`${o.ok ? "ok    " : "REFUSE"} [${label}] ${o.label}${o.error ? "  ->  " + o.error : ""}`);
  return want;
}

/** How many steps succeeded and how many were refused: identical failures on both sides prove little unless most steps really ran. */
const tally = { ok: 0, failed: 0 };
let start: { notifications: number; activity: number; entries: number; lists: number; follows: number; songs: number };

let users: Record<string, User>;
const userOf = (id: string) => Object.values(users).find((u) => u.id === id)!;
let ctx: ReturnType<typeof pick>;

function pick() {
  const db = getDB();
  const uid = (n: string) => db.users.find((x) => x.username === n)!.id;
  const live = (f: (e: DB["entries"][number]) => boolean) => db.entries.filter((e) => !e.removed && f(e));
  const reviewOf = (name: string) => live((e) => e.userId === uid(name) && !!e.review)[0];
  const plain = live((e) => e.userId === uid("alex") && !e.review);
  const publicLists = db.lists.filter((l) => l.visibility === "public" && !l.removed);
  const notMine = (l: DB["lists"][number]) => ![uid("alex"), uid("sam"), uid("abtin")].includes(l.userId);
  return {
    songs: db.songs.slice(40, 70).map((s) => s.id),
    artists: db.artists.slice(0, 12).map((a) => a.id),
    // Entries to read and like (nothing deletes these) ...
    eMaya: reviewOf("maya"), eAlex: reviewOf("alex"), ePriya: reviewOf("priya"), eTheo: reviewOf("theo"),
    // ... and entries to edit and delete.
    editA: plain[0], editB: plain[1], mayaSpare: live((e) => e.userId === uid("maya") && e.id !== reviewOf("maya").id)[0],
    removedEntry: db.entries.find((e) => e.removed)!,
    othersList: publicLists.find(notMine)!, spareList: publicLists.filter(notMine)[1],
    removedList: db.lists.find((l) => l.removed)!, privateList: db.lists.find((l) => l.visibility === "private")!,
    threadParent: db.comments[0],
    liveComment: db.comments.find((c) => !c.removed && c.id !== db.comments[0].id && c.parentId === undefined && !c.id.startsWith("co_"))!,
  };
}

const track = (n: number, artist: { id: string; name: string }, album: { id: string; title: string }, extra: Partial<ExternalTrack> = {}): ExternalTrack => ({
  externalId: `mb:t${n}`, title: `Imported Song ${n}`, artist: { externalId: `mb:${artist.id}`, name: artist.name }, album: { externalId: `mb:${album.id}`, title: album.title, releaseDate: "2024-06-07" },
  durationMs: 200_000 + n, trackNumber: n, explicit: false, genre: "Shoegaze", url: `https://music.apple.com/t${n}`, ...extra,
});

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  applyEdgeCases();
  pg = await openTestDb();
  await applySchema(pg);
  await importDb(getDB(), pg);
  sql = createSqlCommands(pg) satisfies Cmds;
  users = Object.fromEntries(getDB().users.map((u) => [u.username, structuredClone(u)]));
  ctx = pick();
  const d = getDB();
  start = { notifications: d.notifications.length, activity: d.activity.length, entries: d.entries.length, lists: d.lists.length, follows: d.follows.length, songs: d.songs.length };
}, 120_000);
afterAll(async () => { vi.useRealTimers(); await pg.dispose(); });

describe("the databases start identical", () => {
  it("before any write", async () => { await compareWorlds("start"); });
});

describe("writes behave the same on Postgres as on the JSON store", () => {
  const as = (name: string) => users[name];
  const step = (label: string, name: string | undefined, fn: (c: Cmds, u: User) => Promise<unknown>): Step => ({ label, as: name ? as(name) : undefined, run: fn });

  it("accounts and sessions", async () => {
    const newbie: User = { id: "us_newbie", username: "newbie", displayName: "New Bie", bio: "", avatarHue: 120, passwordHash: "scrypt$x", createdAt: "2026-05-01T12:00:00.000Z", favoriteSongIds: [], favoriteArtistIds: [], profileVisibility: "public", role: "user", onboarded: false };
    const out = await scenario("accounts", [
      step("create account", undefined, (c) => c.createUser(structuredClone(newbie))),
      step("same username again", undefined, (c) => c.createUser({ ...structuredClone(newbie), id: "us_other" })),
      step("same username, other case", undefined, (c) => c.createUser({ ...structuredClone(newbie), id: "us_other2", username: "Newbie" })),
      step("start a session", undefined, (c) => c.createSession({ tokenHash: "tok_new", userId: newbie.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() })),
      step("who is behind it", undefined, (c) => c.sessionUser("tok_new")),
      step("an unknown token", undefined, (c) => c.sessionUser("tok_nope")),
      step("an expired session", undefined, (c) => c.createSession({ tokenHash: "tok_old", userId: newbie.id, createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-02T00:00:00.000Z" })),
      step("it no longer counts", undefined, (c) => c.sessionUser("tok_old")),
      step("a second session prunes the expired one", undefined, (c) => c.createSession({ tokenHash: "tok_new2", userId: newbie.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 864e5).toISOString() })),
      step("sign out everywhere else", undefined, (c) => c.deleteOtherSessions(newbie.id, "tok_new2")),
      step("first session is gone", undefined, (c) => c.sessionUser("tok_new")),
      step("sign out", undefined, (c) => c.deleteSession("tok_new2")),
      step("change password hash", undefined, (c) => c.setPasswordHash(newbie.id, "scrypt$y")),
      step("a suspended user's session", undefined, (c) => c.createSession({ tokenHash: "tok_kai", userId: users.kai.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 864e5).toISOString() })),
      step("is not valid", undefined, (c) => c.sessionUser("tok_kai")),
    ]);
    expect(out.find((o) => o.label === "same username again")).toMatchObject({ ok: false, error: "UserError: That username is taken." });
    expect(out.find((o) => o.label === "same username, other case")).toMatchObject({ ok: false });
    expect(out.find((o) => o.label === "who is behind it")?.value).toMatchObject({ username: "newbie" });
  });

  it("ratings, likes, listen later and the diary", async () => {
    const [s1, s2, s3, s4, s5] = ctx.songs;
    const out = await scenario("taste", [
      step("rate", "alex", (c, u) => c.rateSong(u, s1, 4)),
      step("re-rate", "alex", (c, u) => c.rateSong(u, s1, 3.5)),
      step("others rate the same song", "maya", (c, u) => c.rateSong(u, s1, 5)),
      step("clear a rating", "alex", (c, u) => c.rateSong(u, s1, null)),
      step("rate a song that isn't there", "alex", (c, u) => c.rateSong(u, "so_nope", 4)),
      step("like", "alex", (c, u) => c.toggleLike(u, s2)),
      step("unlike", "alex", (c, u) => c.toggleLike(u, s2)),
      step("like again", "alex", (c, u) => c.toggleLike(u, s2)),
      step("like a song that isn't there", "alex", (c, u) => c.toggleLike(u, "so_nope")),
      step("listen later on", "alex", (c, u) => c.toggleListenLater(u, s3)),
      step("listen later off", "alex", (c, u) => c.toggleListenLater(u, s3)),
      step("listen later on again", "maya", (c, u) => c.toggleListenLater(u, s4)),
      step("maya follows alex", "maya", (c, u) => c.toggleFollow(u, users.alex.id)),
      step("maya rates the song alex will review", "maya", (c, u) => c.rateSong(u, s4, 4.5)),
      step("log with rating, like and review", "alex", (c, u) => c.logSong(u, s4, { rating: 5, liked: true, review: "Properly good", hasSpoiler: false, isRelisten: false, listenedAt: "2026-04-30", tags: ["night", "drive"], context: "headphones", memory: "first heard in the car" })),
      step("log again as a relisten, no review, unlike", "alex", (c, u) => c.logSong(u, s4, { rating: null, liked: false, listenedAt: "2026-05-01", tags: [], isRelisten: true })),
      step("log removes it from listen later", "maya", (c, u) => c.logSong(u, s4, { listenedAt: "2026-05-01", tags: [] })),
      step("a brand-new user's first log", "priya", (c, u) => c.logSong(u, s5, { rating: 3, listenedAt: "2026-05-01", tags: ["x"], hasSpoiler: true })),
      step("log a song that isn't there", "alex", (c, u) => c.logSong(u, "so_nope", { listenedAt: "2026-05-01", tags: [] })),
    ]);
    expect(out.find((o) => o.label === "log with rating, like and review")?.value).toMatchObject({ firstEver: false });
    expect(out.find((o) => o.label === "rate a song that isn't there")).toMatchObject({ ok: false, error: "UserError: That song is unavailable." });
  });

  it("editing and deleting diary entries", async () => {
    const mine = [ctx.editA, ctx.editB];
    await scenario("entries", [
      step("edit your entry", "alex", (c, u) => c.updateEntry(u, mine[0].id, { rating: 2, liked: true, review: "changed my mind", hasSpoiler: true, isRelisten: true, listenedAt: "2026-02-02", tags: ["a", "b"], context: "car", memory: "m" })),
      step("edit it into a plain log", "alex", (c, u) => c.updateEntry(u, mine[0].id, { rating: null, liked: false, listenedAt: "2026-02-02", tags: [] })),
      step("edit someone else's", "maya", (c, u) => c.updateEntry(u, mine[0].id, { listenedAt: "2026-02-02", tags: [] })),
      step("edit a removed entry", "rosa", (c, u) => c.updateEntry(u, ctx.removedEntry.id, { listenedAt: "2026-02-02", tags: [] })),
      step("edit one that isn't there", "alex", (c, u) => c.updateEntry(u, "en_nope", { listenedAt: "2026-02-02", tags: [] })),
      step("delete someone else's", "maya", (c, u) => c.deleteEntry(u, mine[1].id)),
      step("delete your own", "alex", (c, u) => c.deleteEntry(u, mine[1].id)),
      step("a moderator deletes someone's entry", "abtin", (c, u) => c.deleteEntry(u, ctx.mayaSpare.id)),
      step("delete it again", "abtin", (c, u) => c.deleteEntry(u, ctx.mayaSpare.id)),
    ]);
  });

  it("likes and comments on reviews", async () => {
    const t = ctx.threadParent;
    const target = (t.targetType === "entry" ? { type: "entry" as const, id: t.targetId } : { type: "list" as const, id: t.targetId });
    await scenario("comments", [
      step("like a review", "daniel", (c, u) => c.toggleReviewLike(u, ctx.eAlex.id)),
      step("unlike it", "daniel", (c, u) => c.toggleReviewLike(u, ctx.eAlex.id)),
      step("like again", "daniel", (c, u) => c.toggleReviewLike(u, ctx.eAlex.id)),
      step("like a private person's review", "daniel", (c, u) => c.toggleReviewLike(u, ctx.ePriya.id)),
      step("like a follower-only person's review", "daniel", (c, u) => c.toggleReviewLike(u, ctx.eTheo.id)),
      step("like a review that isn't there", "daniel", (c, u) => c.toggleReviewLike(u, "en_nope")),
      step("comment", "alex", (c, u) => c.addComment(u, target.type, target.id, "first thoughts")),
      step("the same comment again straight away", "alex", (c, u) => c.addComment(u, target.type, target.id, "first thoughts")),
      step("a different one", "alex", (c, u) => c.addComment(u, target.type, target.id, "second thoughts")),
      step("reply", "maya", (c, u) => c.addComment(u, target.type, target.id, "replying", t.id)),
      step("reply to a reply flattens", "abtin", (c, u) => c.addComment(u, target.type, target.id, "nested reply", "co_reply1")),
      step("reply to a removed comment", "abtin", (c, u) => c.addComment(u, target.type, target.id, "too late", "co_gone")),
      step("reply to a comment elsewhere", "abtin", (c, u) => c.addComment(u, "entry", ctx.eAlex.id, "wrong thread", t.id)),
      step("comment on a review you can't see", "daniel", (c, u) => c.addComment(u, "entry", ctx.ePriya.id, "hi")),
      step("comment where the owner blocked you", "daniel", (c, u) => c.addComment(u, "entry", ctx.eMaya.id, "hi")),
      step("comment on a list", "alex", (c, u) => c.addComment(u, "list", ctx.othersList.id, "nice list")),
      step("comment on a list that's gone", "alex", (c, u) => c.addComment(u, "list", ctx.removedList.id, "hello")),
      step("like a comment", "alex", (c, u) => c.toggleCommentLike(u, t.id)),
      step("unlike it", "alex", (c, u) => c.toggleCommentLike(u, t.id)),
      step("like a removed comment", "alex", (c, u) => c.toggleCommentLike(u, "co_gone")),
      step("delete someone else's comment", "sam", (c, u) => c.deleteComment(u, "co_reply1")),
      step("delete your own comment", "alex", (c, u) => c.deleteComment(u, "co_reply1")),
      step("a moderator deletes one with replies", "abtin", (c, u) => c.deleteComment(u, t.id)),
      step("delete a comment that isn't there", "abtin", (c, u) => c.deleteComment(u, "co_nope")),
    ]);
  });

  it("following people and artists, favourites and the pinned lyric", async () => {
    const [a1, a2, a3, a4, a5, a6, a7, a8, a9] = ctx.artists;
    const favs = ctx.songs.slice(5, 15);
    const out = await scenario("profile", [
      step("follow", "alex", (c, u) => c.toggleFollow(u, users.noor.id)),
      step("unfollow", "alex", (c, u) => c.toggleFollow(u, users.noor.id)),
      step("follow again", "alex", (c, u) => c.toggleFollow(u, users.noor.id)),
      step("follow yourself", "alex", (c, u) => c.toggleFollow(u, u.id)),
      step("follow a suspended account", "alex", (c, u) => c.toggleFollow(u, users.kai.id)),
      step("follow someone who blocked you", "daniel", (c, u) => c.toggleFollow(u, users.maya.id)),
      step("follow someone who isn't there", "alex", (c, u) => c.toggleFollow(u, "us_nope")),
      step("follow an artist", "alex", (c, u) => c.toggleArtistFollow(u, a1)),
      step("unfollow the artist", "alex", (c, u) => c.toggleArtistFollow(u, a1)),
      step("follow an artist that isn't there", "alex", (c, u) => c.toggleArtistFollow(u, "ar_nope")),
      ...[a1, a2, a3, a4, a5, a6, a7, a8, a9].map((a, n) => step(`favourite artist ${n + 1}`, "maya", (c, u) => c.toggleFavoriteArtist(u, a))),
      step("unfavourite an artist", "maya", (c, u) => c.toggleFavoriteArtist(u, a2)),
      ...favs.map((s, n) => step(`pin song ${n + 1}`, "maya", (c, u) => c.toggleFavoriteSong(u, s))),
      step("unpin a song", "maya", (c, u) => c.toggleFavoriteSong(u, favs[1])),
      step("reorder pins", "maya", (c, u) => c.reorderFavoriteSongs(u, [favs[3], favs[0], "so_unknown", favs[3], favs[2]])),
      step("pin a lyric", "maya", (c, u) => c.setProfileLyric(u, favs[0], "a line\nof lyric", 5000)),
      step("pin a lyric without a time", "maya", (c, u) => c.setProfileLyric(u, favs[1], "no timestamp")),
      step("pin a lyric from a missing song", "maya", (c, u) => c.setProfileLyric(u, "so_nope", "x", null)),
      step("clear the lyric", "maya", (c, u) => c.clearProfileLyric(u)),
    ]);
    expect(out.filter((o) => o.label.startsWith("pin song") && !o.ok).length).toBeGreaterThan(0); // the limit of 8 is reached
    expect(out.find((o) => o.label === "follow yourself")).toMatchObject({ ok: false });
  });

  it("lists", async () => {
    const [s1, s2, s3, s4] = ctx.songs.slice(15);
    let made = "", cloned = "";
    const out = await scenario("lists", [
      step("create a public list (with a missing song)", "alex", async (c, u) => { made = await c.createList(u, { title: "My list", description: "about it", isRanked: true, visibility: "public", items: [{ songId: s1, note: "first" }, { songId: s2 }, { songId: "so_nope" }] }); return made; }),
      step("create a private list", "alex", (c, u) => c.createList(u, { title: "Hidden", description: "", isRanked: false, visibility: "private", items: [] })),
      step("add a song", "alex", (c, u) => c.addToList(u, made, s3)),
      step("add another soon after (merges the feed event)", "alex", (c, u) => c.addToList(u, made, s4)),
      step("add a song already there", "alex", (c, u) => c.addToList(u, made, s1)),
      step("add a song that isn't there", "alex", (c, u) => c.addToList(u, made, "so_nope")),
      step("add to someone else's list", "maya", (c, u) => c.addToList(u, made, s2)),
      step("edit the list", "alex", (c, u) => c.updateList(u, made, { title: "Renamed", description: "new words", isRanked: false, visibility: "public", items: [{ songId: s4 }, { songId: s1, note: "kept" }, { songId: s2 }] })),
      step("make it private (feed events go)", "alex", (c, u) => c.updateList(u, made, { title: "Renamed", description: "new words", isRanked: false, visibility: "private", items: [{ songId: s4 }] })),
      step("make it public again", "alex", (c, u) => c.updateList(u, made, { title: "Renamed again", description: "", isRanked: true, visibility: "public", items: [{ songId: s4 }, { songId: s3 }] })),
      step("edit a list that was removed", undefined, (c) => c.updateList(userOf(ctx.removedList.userId), ctx.removedList.id, { title: "x", description: "", isRanked: false, visibility: "public", items: [] })),
      step("edit someone else's list", "maya", (c, u) => c.updateList(u, made, { title: "x", description: "", isRanked: false, visibility: "public", items: [] })),
      step("clone a public list", "sam", async (c, u) => { cloned = await c.cloneList(u, ctx.othersList.id); return cloned; }),
      step("clone a private list", "sam", (c, u) => c.cloneList(u, ctx.privateList.id)),
      step("like a list", "sam", (c, u) => c.toggleListLike(u, ctx.othersList.id)),
      step("unlike it", "sam", (c, u) => c.toggleListLike(u, ctx.othersList.id)),
      step("like it again", "sam", (c, u) => c.toggleListLike(u, ctx.othersList.id)),
      step("like a removed list", "sam", (c, u) => c.toggleListLike(u, ctx.removedList.id)),
      step("comment on the list so there is something to delete", "maya", (c, u) => c.addComment(u, "list", made, "nice")),
      step("delete someone else's list", "sam", (c, u) => c.deleteList(u, made)),
      step("a moderator deletes a list", "abtin", (c, u) => c.deleteList(u, made)),
      step("delete it again", "abtin", (c, u) => c.deleteList(u, made)),
      step("delete your own list (the clone)", "sam", (c, u) => c.deleteList(u, cloned)),
    ]);
    expect(out.find((o) => o.label === "add a song already there")).toMatchObject({ ok: false });
    expect(out.find((o) => o.label === "a moderator deletes a list")).toMatchObject({ ok: true, value: { byAdmin: true } });
  });

  it("reports, blocks and moderation", async () => {
    const out = await scenario("moderation", [
      step("report a review", "sam", (c, u) => c.report(u, "entry", ctx.eAlex.id, "spam")),
      step("report it again", "sam", (c, u) => c.report(u, "entry", ctx.eAlex.id, "spam")),
      step("report a user", "sam", (c, u) => c.report(u, "user", users.noor.id, "rude")),
      step("report a comment", "sam", (c, u) => c.report(u, "comment", ctx.liveComment.id, "rude")),
      step("report a list", "sam", (c, u) => c.report(u, "list", ctx.othersList.id, "off topic")),
      step("report something that isn't there", "sam", (c, u) => c.report(u, "entry", "en_nope", "x")),
      step("alex follows noor, then blocks noor", "alex", (c, u) => c.toggleFollow(u, users.noor.id)),
      step("noor follows alex", "noor", (c, u) => c.toggleFollow(u, users.alex.id)),
      step("block", "alex", (c, u) => c.toggleBlock(u, users.noor.id, "block")),
      step("unblock", "alex", (c, u) => c.toggleBlock(u, users.noor.id, "block")),
      step("mute", "alex", (c, u) => c.toggleBlock(u, users.noor.id, "mute")),
      step("a muted person's follow doesn't notify", "noor", (c, u) => c.toggleFollow(u, users.alex.id)),
      step("block yourself", "alex", (c, u) => c.toggleBlock(u, u.id, "block")),
      step("block someone who isn't there", "alex", (c, u) => c.toggleBlock(u, "us_nope", "block")),
      step("a moderator dismisses", "abtin", (c) => c.moderate("re_a", "dismiss")),
      step("removes a comment", "abtin", (c) => c.moderate("re_b", "remove")),
      step("removes a review", "abtin", (c) => c.moderate("re_d", "remove")),
      step("removes a list", "abtin", (c) => c.moderate("re_c", "remove")),
      step("suspends a reported user (and ends their sessions)", "abtin", (c) => c.moderate("re_d", "suspend")),
      step("an unknown report", "abtin", (c) => c.moderate("re_nope", "remove")),
    ]);
    expect(out.find((o) => o.label === "report it again")).toMatchObject({ ok: false });
  });

  it("moderators suspending real targets, but never an admin", async () => {
    await scenario("suspend", [
      step("report a review by theo", "sam", (c, u) => c.report(u, "entry", ctx.eTheo.id, "bad")),
      step("report abtin (an admin)", "sam", (c, u) => c.report(u, "user", users.abtin.id, "bad")),
      step("report a list", "noor", (c, u) => c.report(u, "list", ctx.spareList.id, "bad")),
    ]);
    const open = getDB().reports.filter((r) => r.status === "open" && r.id.startsWith("re0")).map((r) => r.id);
    await scenario("suspend 2", open.map((id) => step(`suspend via ${id}`, "abtin", (c) => c.moderate(id, "suspend"))));
  });

  it("account changes, onboarding and notifications", async () => {
    const [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10] = ctx.artists;
    await scenario("account", [
      step("update the profile", "sam", (c, u) => c.updateProfile(u, { displayName: "Sam Renamed", bio: "bio", location: "Brisbane", website: "https://sam.example", profileVisibility: "followers", avatarHue: 99 })),
      step("clear optional fields and change password", "sam", (c, u) => c.updateProfile(u, { displayName: "Sam", bio: "", profileVisibility: "public", avatarHue: 1 }, "scrypt$changed")),
      step("onboard (with blocked, suspended, self and repeat targets)", "noor", (c, u) => c.completeOnboarding(u, [users.alex.id, users.maya.id, users.kai.id, u.id, users.alex.id, "us_nope", users.daniel.id], [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, "ar_nope"])),
      step("onboard again", "noor", (c, u) => c.completeOnboarding(u, [users.theo.id], [a1])),
      step("onboard a rater (pins their top songs)", "sam", (c, u) => c.completeOnboarding(u, [], [])),
      step("mark notifications read", "maya", (c, u) => c.markNotificationsRead(u)),
      step("mark them read again", "maya", (c, u) => c.markNotificationsRead(u)),
    ]);
  });

  it("importing from the catalogue", async () => {
    const seedArtist = getDB().artists[2];
    const newArtist = { id: "new1", name: "Imported Artist" };
    const album = { id: "alb1", title: "Imported Album" };
    const t1 = track(1, newArtist, album), t2 = track(2, newArtist, album, { featured: ["Guest"] }), t3 = track(3, newArtist, album, { genre: undefined });
    const bySeed = track(4, { id: "seedx", name: seedArtist.name.toUpperCase() }, { id: "alb2", title: "A Second Album" });
    const collide = track(5, newArtist, { id: "alb3", title: "Imported Album" }, { title: "Imported Song 1" }); // same slug as t1
    const out = await scenario("import", [
      step("import an album", undefined, (c) => c.commitImport(t1, [t1, t2, t3], "2024-06-07")),
      step("import it again", undefined, (c) => c.commitImport(t2, [t1, t2, t3], "2024-06-07")),
      step("import a single track by an artist already here", undefined, (c) => c.commitImport(bySeed, [bySeed], "2023-01-01")),
      step("import a track that collides on slug", undefined, (c) => c.commitImport(collide, [collide], "2022-02-02")),
      step("remember an artist's catalogue id", undefined, (c) => c.setArtistExternalId(seedArtist.id, "mb:seeded-artist")),
      step("don't overwrite it", undefined, (c) => c.setArtistExternalId(seedArtist.id, "mb:other")),
    ]);
    expect(out[0].value).toBe("imported-song-1-imported-artist");
    expect(out[3].value).toBe("imported-song-1-imported-artist-2");
    // Importing listening history: entries for the new songs, then repeats and a duplicate inside one batch.
    const songId = (slug: string) => getDB().songs.find((s) => s.slug === slug)!.id;
    const ids = [songId("imported-song-1-imported-artist"), songId("imported-song-2-imported-artist")];
    await scenario("history", [
      step("add history", "alex", (c, u) => c.addImportedEntries(u.id, [
        { songId: ids[0], listenedAt: "2025-12-31", tags: ["spotify-import"], memory: "Played 3 times on Spotify, first in March 2019." },
        { songId: ids[1], listenedAt: "2025-11-30", tags: ["spotify-import"], memory: "Played once on Spotify, first in May 2020." },
        { songId: ids[0], listenedAt: "2024-01-01", tags: ["spotify-import"], memory: "duplicate in the batch" },
      ])),
      step("add the same history again", "alex", (c, u) => c.addImportedEntries(u.id, [{ songId: ids[0], listenedAt: "2025-12-31", tags: ["spotify-import"], memory: "again" }])),
      step("nothing to add", "alex", (c, u) => c.addImportedEntries(u.id, [])),
    ]);
  });

  it("deleting an account removes everything that hangs off it", async () => {
    await scenario("delete account", [
      step("delete a busy account", undefined, (c) => c.deleteAccount(users.alex.id)),
      step("delete another", undefined, (c) => c.deleteAccount(users.maya.id)),
      step("delete one that doesn't exist", undefined, (c) => c.deleteAccount("us_nope")),
    ]);
    expect(getDB().users.some((u) => u.id === users.alex.id)).toBe(false);
  });
});

describe("the scenario really did something", () => {
  it("most steps succeeded, the refusals were deliberate, and state changed", () => {
    expect(tally.ok).toBeGreaterThan(110);
    expect(tally.failed).toBeGreaterThan(40);
    expect(tally.ok).toBeGreaterThan(tally.failed * 2);
    const d = getDB();
    expect(d.songs.length).toBeGreaterThan(start.songs); // imports added songs
    expect(d.activity.length).not.toBe(start.activity);
    expect(d.notifications.length).not.toBe(start.notifications);
    expect(d.follows.length).not.toBe(start.follows);
  });
});
