import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import { jar } from "./setup";
import { aggregateHistory, ImportError, MAX_IMPORT_TRACKS, normalizeArtist, normalizeTitle, readZipJson } from "@/lib/spotify-import";
import { getDB } from "@/lib/server/store";
import { startSession } from "@/lib/server/auth";
import { importHistory, importWorkerIdle, findLocalSong, pickResult } from "@/lib/server/history-import";
import { forgetUser, jobs, resetImportQueueForTests, statusFor } from "@/lib/server/import-queue";
import { clearCatalogueCache } from "@/lib/server/catalogue-cache";
import { resetMusicbrainzLimiter } from "@/lib/server/musicbrainz";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { POST as importRoute } from "@/app/api/import/spotify/route";
import { GET as statusRoute, DELETE as cancelRoute } from "@/app/api/import/status/route";

// ── helpers ─────────────────────────────────────────────────────────────

function makeZip(files: { name: string; data: string; deflate?: boolean }[]): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.data);
    const body = f.deflate ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(f.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(f.deflate ? 8 : 0, 8);
    local.writeUInt32LE(zlib.crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(f.deflate ? 8 : 0, 10);
    c.writeUInt32LE(zlib.crc32(raw), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...parts, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

const extended = (title: string, artist: string, ms: number, ts: string, album = "Some Album") => ({
  ts, ms_played: ms, master_metadata_track_name: title, master_metadata_album_artist_name: artist, master_metadata_album_album_name: album,
  ip_addr: "203.0.113.9", platform: "iOS 17", conn_country: "US", spotify_track_uri: "spotify:track:abc",
});

const user = (username: string) => getDB().users.find((u) => u.username === username)!;

beforeEach(() => {
  resetImportQueueForTests();
  clearCatalogueCache();
  resetMusicbrainzLimiter();
  resetRateLimits();
  jar.clear();
});
afterEach(() => vi.unstubAllGlobals());

// ── pure parsing ────────────────────────────────────────────────────────

describe("title matching", () => {
  it("ignores remaster, feature and edition noise but keeps real differences", () => {
    expect(normalizeTitle("Karma Police - Remastered 2011")).toBe("karma police");
    expect(normalizeTitle("Karma Police (Remastered)")).toBe("karma police");
    expect(normalizeTitle("Song Name (feat. Someone)")).toBe("song name");
    expect(normalizeTitle("Song Name - feat. Someone")).toBe("song name");
    expect(normalizeTitle("Heroes - 2017 Remaster")).toBe("heroes");
    expect(normalizeTitle("Café del Mar")).toBe("cafe del mar");
    expect(normalizeTitle("Song (Live at Wembley)")).toBe("song live at wembley");
    expect(normalizeArtist("The Strokes")).toBe("strokes");
    expect(normalizeArtist("Simon & Garfunkel")).toBe("simon and garfunkel");
  });
});

describe("reading a Spotify ZIP", () => {
  const json = JSON.stringify([extended("A", "B", 200000, "2021-05-01T10:00:00Z")]);

  it("reads stored and deflated history files and ignores everything else", async () => {
    const zip = makeZip([
      { name: "Spotify Extended Streaming History/Streaming_History_Audio_2019-2021_0.json", data: json, deflate: true },
      { name: "Spotify Extended Streaming History/Streaming_History_Audio_2022_1.json", data: json },
      { name: "Spotify Extended Streaming History/Streaming_History_Video_2019.json", data: "[]" },
      { name: "Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf", data: "%PDF" },
      { name: "Playlist1.json", data: "{}" },
    ]);
    const files = await readZipJson(zip);
    expect(files.map((f) => f.name.split("/").pop())).toEqual(["Streaming_History_Audio_2019-2021_0.json", "Streaming_History_Audio_2022_1.json"]);
    expect(files.every((f) => f.text === json)).toBe(true);
  });

  it("rejects things that are not ZIPs", async () => {
    await expect(readZipJson(new TextEncoder().encode("hello, not a zip, just text that is long enough").buffer as ArrayBuffer)).rejects.toBeInstanceOf(ImportError);
  });
});

describe("aggregating history", () => {
  it("counts only real plays of songs, merges versions of a song and keeps the dates", () => {
    const rows = [
      extended("Karma Police", "Radiohead", 250000, "2020-01-05T10:00:00Z"),
      extended("Karma Police - Remastered 2011", "Radiohead", 240000, "2021-03-09T10:00:00Z"),
      extended("Karma Police", "Radiohead", 12000, "2022-01-01T10:00:00Z"), // skipped after 12 s: not a play
      extended("Other Song", "Someone", 90000, "2019-07-07T10:00:00Z"),
      { ts: "2021-01-01T00:00:00Z", ms_played: 600000, master_metadata_track_name: null, episode_name: "A podcast" },
      extended("Bad Date", "Someone", 90000, "not-a-date"),
    ];
    const { tracks, summary } = aggregateHistory([JSON.stringify(rows)]);
    expect(tracks.map((t) => [t.t, t.p])).toEqual([["Karma Police", 2], ["Other Song", 1]]);
    expect(tracks[0]).toMatchObject({ a: "Radiohead", f: "2020-01-05", l: "2021-03-09", ms: 490000 });
    expect(summary).toMatchObject({ plays: 3, tracks: 2, firstDate: "2019-07-07", lastDate: "2021-03-09", files: 1 });
  });

  it("understands the smaller Account data export", () => {
    const rows = [{ endTime: "2024-02-03 21:15", artistName: "Mitski", trackName: "Nobody", msPlayed: 180000 }];
    const { tracks } = aggregateHistory([JSON.stringify(rows)]);
    expect(tracks).toEqual([{ t: "Nobody", a: "Mitski", al: undefined, p: 1, ms: 180000, f: "2024-02-03", l: "2024-02-03" }]);
  });

  it("keeps only the most-played tracks and never leaks other fields", () => {
    const rows = Array.from({ length: MAX_IMPORT_TRACKS + 40 }, (_, i) => extended(`Song ${i}`, "Band", 60000 + i, "2023-01-01T00:00:00Z"));
    rows.push(...Array.from({ length: 5 }, () => extended("Song 3", "Band", 60000, "2023-02-01T00:00:00Z")));
    const { tracks, summary } = aggregateHistory([JSON.stringify(rows)]);
    expect(tracks).toHaveLength(MAX_IMPORT_TRACKS);
    expect(tracks[0].t).toBe("Song 3");
    expect(summary.tracks).toBe(MAX_IMPORT_TRACKS + 40);
    expect(JSON.stringify(tracks)).not.toMatch(/203\.0\.113|iOS|spotify:track|conn_country/);
  });

  it("explains an unusable file", () => {
    expect(() => aggregateHistory(["[]"])).toThrow(ImportError);
    expect(() => aggregateHistory(["not json"])).toThrow(/couldn't find any song plays/);
  });
});

// ── server side ─────────────────────────────────────────────────────────

describe("importing history", () => {
  const seeded = () => {
    const db = getDB();
    const s = db.songs[0];
    return { song: s, artist: db.artists.find((a) => a.id === s.artistIds[0])!.name };
  };

  it("adds songs MusicBox already has as one diary entry each, without feed activity", () => {
    const { song, artist } = seeded();
    const u = user("ellis");
    const before = getDB().entries.filter((e) => e.userId === u.id && e.songId === song.id && !e.removed).length;
    const activityBefore = getDB().activity.length;
    expect(findLocalSong({ t: `${song.title} - Remastered 2009`, a: artist })?.id).toBe(song.id);

    const track = { t: song.title, a: artist, al: "x", p: 142, ms: 1e7, f: "2019-03-04", l: "2025-12-31" };
    const r1 = importHistory(u.id, [track]);
    if (before) { expect(r1).toMatchObject({ added: 0, alreadyLogged: 1 }); return; }
    expect(r1).toMatchObject({ added: 1, queued: 0, alreadyLogged: 0 });
    const e = getDB().entries.find((x) => x.userId === u.id && x.songId === song.id && x.tags.includes("spotify-import"))!;
    expect(e.listenedAt).toBe("2025-12-31");
    expect(e.memory).toBe("Played 142 times on Spotify, first in March 2019.");
    expect(e.rating).toBeUndefined();
    expect(getDB().activity).toHaveLength(activityBefore);
    expect(getDB().songStats[song.id].logCount).toBeGreaterThan(0);

    // Importing again changes nothing.
    expect(importHistory(u.id, [track])).toMatchObject({ added: 0, alreadyLogged: 1 });
  });

  it("only accepts a catalogue result with the same title and artist", () => {
    const mk = (title: string, artist: string) => ({ title, artist: { name: artist } }) as never;
    expect(pickResult([mk("Karma Police (Radiohead cover)", "Someone"), mk("Karma Police", "Radiohead")], { t: "Karma Police - Remastered", a: "Radiohead" })?.title).toBe("Karma Police");
    expect(pickResult([mk("Karma Police", "Not Radiohead")], { t: "Karma Police", a: "Radiohead" })).toBeUndefined();
  });

  it("looks up the rest in the catalogue in the background, most-played first, then drops the listening data", async () => {
    const ART = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
    const RG = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
    const REL = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
    const REC1 = "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4";
    const REC2 = "b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5";
    const credit = [{ name: "Fixture Band", artist: { id: ART, name: "Fixture Band" } }];
    const release = { id: REL, title: "Stripes", status: "Official", date: "2018-04-01", "track-count": 2, "release-group": { id: RG, title: "Stripes", "primary-type": "Album", "secondary-types": [], "first-release-date": "2018-04-01" }, media: [{ "track-offset": 0, track: [{ number: "1" }] }] };
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      const body = url.includes("/recording?")
        ? { recordings: [{ id: REC1, score: 100, title: "Zebra Anthem", length: 200000, "artist-credit": credit, releases: [release] }] }
        : url.includes(`/release/${REL}`)
          ? { ...release, "artist-credit": credit, media: [{ tracks: [{ title: "Zebra Anthem", length: 200000, "artist-credit": credit, recording: { id: REC1, title: "Zebra Anthem" } }, { title: "Second Stripe", length: 190000, "artist-credit": credit, recording: { id: REC2, title: "Second Stripe" } }] }] }
          : null;
      return { status: body ? 200 : 404, ok: !!body, headers: new Headers(), text: async () => JSON.stringify(body ?? {}) };
    });

    const u = user("maya");
    const tracks = [
      { t: "Zebra Anthem", a: "Fixture Band", p: 90, ms: 9e6, f: "2018-05-01", l: "2026-01-01" },
      { t: "Second Stripe", a: "Fixture Band", p: 40, ms: 4e6, f: "2018-05-01", l: "2025-01-01" },
      { t: "A Song Nobody Catalogued", a: "Ghost", p: 3, ms: 3e5, f: "2020-01-01", l: "2020-02-01" },
    ];
    const result = importHistory(u.id, tracks);
    expect(result).toMatchObject({ added: 0, queued: 3 });
    expect(statusFor(u.id)).toMatchObject({ active: true, total: 3 });

    await importWorkerIdle();

    // Zebra Anthem needed one search; the album import then made "Second Stripe" a local match, so no second search.
    expect(calls.filter((c) => c.includes("/recording?"))).toHaveLength(2); // Zebra Anthem + the Ghost song
    const db = getDB();
    const mine = db.entries.filter((e) => e.userId === u.id && e.tags.includes("spotify-import"));
    expect(mine.map((e) => db.songs.find((s) => s.id === e.songId)!.title).sort()).toEqual(["Second Stripe", "Zebra Anthem"]);
    expect(statusFor(u.id)).toEqual({ active: false, total: 3, added: 2, pending: 0, notFound: 1, failed: 0, createdAt: expect.any(String) });
    expect(jobs().find((j) => j.userId === u.id)!.items).toEqual([]); // listening data dropped once finished
  });
});

describe("import API", () => {
  const post = (body: unknown, headers: Record<string, string> = { origin: "http://localhost" }) =>
    importRoute(new Request("http://localhost/api/import/spotify", { method: "POST", headers: { host: "localhost", "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  const good = { v: 1, tracks: [{ t: "Nowhere Song", a: "Nobody", p: 2, ms: 100000, f: "2020-01-01", l: "2020-06-01" }] };

  it("requires sign-in and a same-origin request", async () => {
    expect((await post(good)).status).toBe(401);
    await startSession(user("alex").id);
    expect((await post(good, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(good, {})).status).toBe(403);
  });

  it("rejects malformed, oversized and over-long payloads", async () => {
    await startSession(user("alex").id);
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ v: 2, tracks: good.tracks })).status).toBe(400);
    expect((await post({ ...good, extra: 1 })).status).toBe(400);
    expect((await post({ v: 1, tracks: [] })).status).toBe(400);
    expect((await post({ v: 1, tracks: [{ ...good.tracks[0], l: "2020-13-45" }] })).status).toBe(400);
    expect((await post({ v: 1, tracks: [{ ...good.tracks[0], t: "x".repeat(201) }] })).status).toBe(400);
    expect((await post({ v: 1, tracks: Array.from({ length: MAX_IMPORT_TRACKS + 1 }, () => good.tracks[0]) })).status).toBe(400);
    expect((await post("x".repeat(700_000))).status).toBe(413);
  });

  it("is rate limited per user", async () => {
    await startSession(user("alex").id);
    vi.stubGlobal("fetch", async () => ({ status: 404, ok: false, headers: new Headers(), text: async () => "{}" }));
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await post(good)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    await importWorkerIdle();
  });

  it("status needs sign-in, is private, and can be cancelled", async () => {
    expect((await statusRoute()).status).toBe(401);
    await startSession(user("alex").id);
    const res = await statusRoute();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect((await cancelRoute(new Request("http://localhost/api/import/status", { method: "DELETE", headers: { host: "localhost", origin: "https://evil.example" } }))).status).toBe(403);
    expect((await cancelRoute(new Request("http://localhost/api/import/status", { method: "DELETE", headers: { host: "localhost", origin: "http://localhost" } }))).status).toBe(200);
  });

  it("deleting an account removes the queued import", () => {
    const u = user("maya");
    importHistory(u.id, [{ t: "Queued Song", a: "Queued Artist", p: 1, ms: 1, f: "2020-01-01", l: "2020-01-01" }]);
    expect(statusFor(u.id)).not.toBeNull();
    forgetUser(u.id);
    expect(statusFor(u.id)).toBeNull();
  });
});
