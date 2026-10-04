import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "./setup";
import { getDB, mutate } from "@/lib/server/store";
import { recomputeAllStats } from "@/lib/server/stats";
import { jsonReads } from "@/lib/server/reads-json";
import { openPglite, type Db } from "@/lib/server/sql/driver";
import { applySchema } from "@/lib/server/sql/schema";
import { importDb } from "@/lib/server/sql/import-db";
import { createSqlReads, type SqlReads } from "@/lib/server/sql/all-reads";

// The Postgres reads must answer exactly like the JSON store's. This loads the same data
// into both (after adding the awkward cases the demo seed lacks: private and
// follower-only profiles, a suspended user, blocks and mutes, removed content, private
// lists) and compares every read, for several viewers.

let pg: Db;
let sql: SqlReads;
const u = (name: string) => getDB().users.find((x) => x.username === name)!.id;
const publicOf = (user: ReturnType<typeof getDB>["users"][number]) => { const { passwordHash: _p, ...rest } = user; void _p; return rest; };

/** What a page would see: JSON round trip, with "false" flags treated as absent (the JSON store writes either). */
function clean(x: unknown): unknown {
  if (x === undefined) return null;
  return JSON.parse(JSON.stringify(x), (k, v) => ((k === "hasSpoiler" || k === "suspended" || k === "removed") && v === false ? undefined : v));
}

type Reads = typeof jsonReads;
/** How many comparisons had something in them, per read: a pass on two empty answers proves nothing. */
const filled = new Map<string, number>();
const isEmpty = (x: unknown) => x == null || (Array.isArray(x) && !x.length) || (typeof x === "object" && Object.values(x as object).every(isEmpty));

async function same<K extends keyof Reads & keyof SqlReads>(name: K, ...args: Parameters<Reads[K]>) {
  const want = clean((jsonReads[name] as (...a: unknown[]) => unknown)(...args));
  const got = clean(await (sql[name] as (...a: unknown[]) => Promise<unknown>)(...args));
  expect(got, `${name}(${JSON.stringify(args)})`).toEqual(want);
  if (!isEmpty(want)) filled.set(name, (filled.get(name) ?? 0) + 1);
}

// If a read is added to the JSON store without a SQL twin, this stops compiling.
type MissingFromSql = Exclude<keyof Reads, keyof SqlReads>;
const _complete: MissingFromSql extends never ? true : never = true;
void _complete;

let viewers: (string | undefined)[];

beforeAll(async () => {
  const db = getDB();
  const song = (n: number) => db.songs[n].id;
  mutate((d) => {
    const find = (name: string) => d.users.find((x) => x.username === name)!;
    find("priya").profileVisibility = "private";
    find("theo").profileVisibility = "followers";
    find("kai").suspended = true;
    d.blocks.push({ userId: find("maya").id, targetId: find("daniel").id, kind: "block" }, { userId: find("alex").id, targetId: find("sam").id, kind: "mute" });
    const rosa = d.entries.find((e) => e.userId === find("rosa").id && e.review)!;
    rosa.removed = true;
    const lists = d.lists;
    lists[0].removed = true;
    lists[1].visibility = "private";
    lists[2].visibility = "unlisted";
    find("abtin").profileLyric = { songId: song(3), text: "a line", startMs: 1200, updatedAt: "2026-01-01T00:00:00.000Z" };
    find("alex").profileLyric = { songId: song(5), text: "another line", updatedAt: "2026-01-02T00:00:00.000Z" };
    const withReview = d.entries.filter((e) => e.review && !e.removed);
    withReview[0].hasSpoiler = true;
    const parent = d.comments[0];
    d.comments.push({ id: "co_reply1", userId: find("alex").id, targetType: parent.targetType, targetId: parent.targetId, parentId: parent.id, body: "reply one", createdAt: "2026-02-01T00:00:00.000Z" });
    d.comments.push({ id: "co_reply2", userId: find("maya").id, targetType: parent.targetType, targetId: parent.targetId, parentId: parent.id, body: "reply two", createdAt: "2026-02-02T00:00:00.000Z" });
    d.comments.push({ id: "co_gone", userId: find("sam").id, targetType: parent.targetType, targetId: parent.targetId, body: "removed one", createdAt: "2026-02-03T00:00:00.000Z", removed: true });
    d.commentLikes.push({ userId: find("alex").id, commentId: parent.id }, { userId: find("abtin").id, commentId: "co_reply1" });
    // Reports to moderate, and catalogue ids on a few items so the importer lookups have something to find.
    const entryWithReview = d.entries.find((e) => e.review && !e.removed)!;
    d.reports.push(
      { id: "re_a", reporterId: find("alex").id, targetType: "entry", targetId: entryWithReview.id, reason: "rude", status: "open", createdAt: "2026-03-01T10:00:00.000Z" },
      { id: "re_b", reporterId: find("maya").id, targetType: "comment", targetId: "co_reply1", reason: "spam", status: "open", createdAt: "2026-03-02T10:00:00.000Z" },
      { id: "re_c", reporterId: find("sam").id, targetType: "list", targetId: d.lists[3].id, reason: "off topic", status: "resolved", createdAt: "2026-03-03T10:00:00.000Z" },
      { id: "re_d", reporterId: find("noor").id, targetType: "user", targetId: find("daniel").id, reason: "harassment", status: "dismissed", createdAt: "2026-03-04T10:00:00.000Z" },
      { id: "re_e", reporterId: find("noor").id, targetType: "entry", targetId: "en_gone", reason: "gone", status: "open", createdAt: "2026-03-05T10:00:00.000Z" },
    );
    d.songs[10].externalId = "mb:song-ten";
    d.albums[3].externalId = "mb:album-three";
    d.artists[4].externalId = "mb:artist-four";
    recomputeAllStats(d);
  });
  pg = await openPglite();
  await applySchema(pg);
  await importDb(getDB(), pg);
  sql = createSqlReads(pg);
  viewers = [undefined, u("abtin"), u("alex"), u("maya"), u("priya"), u("theo"), u("daniel"), u("kai"), u("sam")];
}, 120_000);
afterAll(() => pg.close());

describe("home and discover reads", () => {
  it("trending, rated and new music", async () => {
    for (const n of [4, 12]) await same("trendingSongs", n);
    await same("highlyRated", 12, 4);
    await same("highlyRated", 8, 2);
    await same("hiddenGems", 12);
    await same("newReleases", 12);
    await same("newReleases", 5);
    await same("artworkWall", 30);
    await same("catalogueSize");
  });

  it("reviews and lists for every kind of viewer", async () => {
    for (const v of viewers) {
      await same("trendingReviews", 8, v);
      await same("popularLists", 6, v);
    }
    await same("recentReviews", 6);
  });

  it("friends' activity and who to follow", async () => {
    for (const v of viewers.filter(Boolean) as string[]) {
      await same("friendsListening", v, 12);
      await same("friendsFavourites", v, 5);
    }
    for (const v of viewers) await same("suggestedUsers", v, 6);
  });

  it("what a viewer has done with songs", async () => {
    const ids = getDB().songs.slice(0, 40).map((s) => s.id);
    for (const v of viewers) await same("viewerStates", ids, v);
  });
});

describe("catalogue pages", () => {
  const busiest = () => [...getDB().songs].sort((a, b) => (getDB().songStats[b.id]?.logCount ?? 0) - (getDB().songStats[a.id]?.logCount ?? 0)).slice(0, 12);

  it("song pages, for busy songs and ordinary ones, for every viewer", async () => {
    const songs = [...busiest(), ...getDB().songs.filter((_, n) => n % 53 === 0)];
    for (const song of songs) for (const v of [undefined, u("abtin"), u("alex"), u("priya"), u("daniel")]) await same("getSongPage", song.slug, v);
    expect(await sql.getSongPage("no-such-song")).toBeNull();
  }, 120_000);

  it("similar songs", async () => {
    for (const song of [...busiest(), ...getDB().songs.filter((_, n) => n % 71 === 0)]) await same("similarSongs", song.id, 12);
  });

  it("artist pages", async () => {
    for (const a of getDB().artists) for (const v of [undefined, u("abtin"), u("maya")]) await same("getArtistPage", a.slug, v);
    expect(await sql.getArtistPage("no-such-artist")).toBeNull();
  }, 120_000);

  it("album pages", async () => {
    for (const a of getDB().albums) for (const v of [undefined, u("abtin"), u("alex")]) await same("getAlbumPage", a.slug, v);
    expect(await sql.getAlbumPage("no-such-album")).toBeNull();
  }, 120_000);

  it("genres", async () => {
    await same("allGenres");
    for (const g of jsonReads.allGenres()) for (const v of [undefined, u("abtin"), u("theo")]) await same("getGenrePage", g.slug, v);
    expect(await sql.getGenrePage("no-such-genre")).toBeNull();
  }, 120_000);
});

describe("people and profiles", () => {
  const allUsers = () => getDB().users;
  const some = [undefined, "abtin", "priya", "daniel"] as const;
  const vid = (n: (typeof some)[number]) => (n ? u(n) : undefined);

  it("looking people up", async () => {
    for (const user of allUsers()) {
      await same("getUserByName", user.username);
      await same("getUserByName", user.username.toUpperCase());
    }
    await same("getUserByName", "nobody-here");
  });

  it("profile headers, for every user and viewer", async () => {
    for (const user of allUsers()) for (const v of viewers) await same("getProfile", user.username, v);
    await same("getProfile", "nobody-here", u("abtin"));
  }, 120_000);

  it("profile overviews", async () => {
    for (const user of allUsers()) {
      const raw = publicOf(user);
      for (const n of some) await same("profileOverview", raw, vid(n));
    }
  }, 120_000);

  it("diaries with every filter", async () => {
    for (const name of ["abtin", "maya", "alex", "priya"]) {
      const user = getDB().users.find((x) => x.username === name)!;
      const raw = publicOf(user);
      const entries = getDB().entries.filter((e) => e.userId === user.id);
      const e = entries.find((x) => x.rating && x.tags.length) ?? entries[0];
      const artistSlug = getDB().artists.find((a) => a.id === getDB().songs.find((x) => x.id === e.songId)!.artistIds[0])!.slug;
      const genre = getDB().songs.find((x) => x.id === e.songId)!.genres[0];
      const filters = [
        {}, { year: e.listenedAt.slice(0, 4) }, { year: e.listenedAt.slice(0, 4), month: String(Number(e.listenedAt.slice(5, 7))) },
        { artist: artistSlug }, { rating: String(e.rating) }, { genre }, { relisten: "1" }, { relisten: "0" }, { liked: "1" }, { tag: e.tags[0] ?? "none" },
      ];
      for (const f of filters) for (const n of [undefined, "abtin"] as const) await same("getDiary", raw, f, vid(n));
    }
  }, 120_000);

  it("reviews, lists, likes and follow lists", async () => {
    for (const user of allUsers()) {
      const raw = publicOf(user);
      for (const sort of ["recent", "popular", "rating"]) await same("getUserReviews", raw, sort, u("abtin"));
      for (const n of some) await same("getUserLists", raw, vid(n));
      await same("getUserLikes", raw);
      for (const kind of ["followers", "following"] as const) for (const n of some) await same("getFollowList", raw, kind, vid(n));
    }
  }, 120_000);

  it("compatibility between pairs of people", async () => {
    const names = ["abtin", "alex", "maya", "sam", "priya", "noor"];
    for (const a of names) for (const b of names) if (a !== b) await same("compatibility", u(a), u(b));
  }, 120_000);
});

describe("reviews, comments, lists, feed and search", () => {
  it("single reviews, including removed and hidden ones", async () => {
    const entries = [...getDB().entries.filter((e) => e.review).slice(0, 25), getDB().entries.find((e) => e.removed)!, getDB().entries.find((e) => !e.review && !e.rating)].filter(Boolean);
    for (const e of entries) for (const v of viewers) await same("getReview", e!.id, v);
    await same("getReview", "en_nope", u("abtin"));
  }, 120_000);

  it("comment threads", async () => {
    const targets = new Set(getDB().comments.map((c) => `${c.targetType}:${c.targetId}`));
    for (const t of [...targets].slice(0, 30)) {
      const [type, id] = t.split(":") as ["entry" | "list", string];
      for (const v of viewers) await same("getComments", type, id, v);
    }
  }, 120_000);

  it("list pages, browsing and a viewer's own lists", async () => {
    for (const l of getDB().lists) for (const v of [undefined, u("abtin"), u("alex"), u("priya")]) await same("getListPage", l.id, v);
    await same("getListPage", "li_nope", u("abtin"));
    for (const v of viewers) for (const sort of ["popular", "recent"]) await same("browseLists", sort, v);
    for (const v of viewers.filter(Boolean) as string[]) { await same("viewerLists", v); await same("getListenLater", v); }
  }, 120_000);

  it("the feed, page by page", async () => {
    for (const v of viewers.filter(Boolean) as string[]) {
      let before: string | undefined;
      for (let page = 0; page < 4; page++) {
        await same("getFeed", v, before, 12);
        const next = jsonReads.getFeed(v, before, 12).next;
        if (!next) break;
        before = next;
      }
    }
  }, 120_000);

  it("notifications", async () => {
    for (const user of getDB().users) { await same("getNotifications", user.id); await same("unreadCount", user.id); }
  });

  it("search", async () => {
    const queries = ["love", "the", "a", "frank ocean", "nikes", "blonde", "ocean frank", "paranoid android", "radiohead ok", "hip hop", "maya", "abtin", "best", "zzzz", "  ", "ye", "beyonc"];
    for (const query of queries) for (const v of [undefined, u("abtin"), u("priya")]) await same("search", query, 20, v);
    await same("search", "love", 5, u("alex"));
  }, 120_000);
});

describe("recommendations, stats and year in review", () => {
  it("recommendations and 'because you like'", async () => {
    for (const user of getDB().users) {
      await same("recommendations", user.id, 12);
      await same("recommendations", user.id, 6);
      await same("becauseYouLike", user.id);
    }
    await same("recommendations", "us_nobody", 12);
  }, 120_000);

  it("listening stats, for all time and for each year", async () => {
    for (const user of getDB().users) {
      await same("userStats", user.id);
      const years = new Set(getDB().entries.filter((e) => e.userId === user.id).map((e) => Number(e.listenedAt.slice(0, 4))));
      for (const y of [...years].slice(0, 4)) { await same("userStats", user.id, y); await same("yearInReview", user.id, y); }
    }
    await same("userStats", "us_nobody");
  }, 120_000);
});

describe("export and small reads", () => {
  it("the data export, for every user", async () => {
    for (const user of getDB().users) {
      const want = clean(jsonReads.exportUserData(user.id)) as Record<string, unknown>;
      const got = clean(await sql.exportUserData(user.id)) as Record<string, unknown>;
      delete want.exportedAt; delete got.exportedAt;
      expect(got, user.username).toEqual(want);
      if (!isEmpty(want)) filled.set("exportUserData", (filled.get("exportUserData") ?? 0) + 1);
    }
    expect(await sql.exportUserData("us_nobody")).toBeNull();
  }, 120_000);

  it("the moderation queue", async () => {
    await same("adminOverview");
  });

  it("lookups for pages, routes and importers", async () => {
    for (const song of [getDB().songs[0], getDB().songs[10]]) await same("songLite", song.id);
    await same("songLite", "so_nope");
    for (const user of getDB().users) { await same("followingIds", user.id); await same("userActive", user.id); }
    await same("userActive", "us_nobody");
    for (const user of ["abtin", "alex", "priya"]) await same("onboardingData", u(user));
    await same("sitemapData");
    await same("ping");
    await same("songSlugByExternalId", "mb:song-ten");
    await same("songSlugByExternalId", "mb:missing");
    await same("songIdBySlug", getDB().songs[7].slug);
    await same("songIdBySlug", "nope");
    await same("albumByExternalId", "mb:album-three");
    await same("albumByExternalId", "mb:nothing");
    await same("artistLookup", { externalId: "mb:artist-four" });
    await same("artistLookup", { name: getDB().artists[9].name.toUpperCase() });
    await same("artistLookup", { externalId: "mb:none", name: getDB().artists[2].name });
    await same("artistLookup", { name: "Nobody At All" });
    const known = getDB().songs[20];
    const artistName = getDB().artists.find((a) => a.id === known.artistIds[0])!.name;
    await same("knownTracks", [
      { externalId: "mb:song-ten", title: "whatever", artist: "someone" },
      { externalId: "mb:other", title: known.title.toUpperCase(), artist: artistName.toLowerCase() },
      { externalId: "mb:other2", title: "Not In The Catalogue", artist: artistName },
    ]);
    await same("knownArtistNames", [artistName.toUpperCase(), "Nobody", artistName]);
    await same("knownAlbumIds", ["mb:album-three", "mb:nope", "mb:album-three"]);
    const songs = getDB().songs.slice(30, 40).map((s) => ({ t: s.title, a: getDB().artists.find((a) => a.id === s.artistIds[0])!.name }));
    await same("findLocalSongs", [...songs, { t: `${songs[0].t} (Remastered 2011)`, a: songs[0].a }, { t: "Zebra Anthem", a: "Fixture Band" }, { t: songs[1].t, a: "Wrong Artist" }]);
  }, 120_000);
});

describe("the comparisons are not vacuous", () => {
  it("every read returned real data for at least one case", () => {
    const names = ["trendingSongs", "highlyRated", "hiddenGems", "newReleases", "artworkWall", "catalogueSize", "trendingReviews", "popularLists", "recentReviews", "friendsListening", "friendsFavourites", "suggestedUsers", "viewerStates", "getSongPage", "similarSongs", "getArtistPage", "getAlbumPage", "allGenres", "getGenrePage", "getUserByName", "getProfile", "profileOverview", "getDiary", "getUserReviews", "getUserLists", "getUserLikes", "getFollowList", "compatibility", "getReview", "getComments", "getListPage", "browseLists", "viewerLists", "getListenLater", "getFeed", "getNotifications", "unreadCount", "search", "recommendations", "becauseYouLike", "userStats", "yearInReview", "exportUserData", "adminOverview", "songLite", "onboardingData", "sitemapData", "knownTracks", "knownArtistNames", "knownAlbumIds", "findLocalSongs", "artistLookup", "albumByExternalId", "songSlugByExternalId"];
    for (const n of names) expect(filled.get(n) ?? 0, n).toBeGreaterThan(0);
  });
});
