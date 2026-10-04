import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlotLimiter } from "@/lib/server/slot-limiter";
import { clearCatalogueCache } from "@/lib/server/catalogue-cache";
import { musicbrainz, resetMusicbrainzLimiter } from "@/lib/server/musicbrainz";
import { importAlbum, importTrack, MetadataError } from "@/lib/server/metadata";
import { EXTERNAL_ID } from "@/lib/server/validation";
import { getDB } from "@/lib/server/store";

// ── Fixtures shaped like real MusicBrainz responses ─────────────────────
const RADIOHEAD = "a74b1b7f-71a5-4011-9441-d0b5e4122711";
const OKC_RG = "b1392450-e666-3926-a536-22c65f834433";
const OKC_REL = "1834eae1-741b-3c03-9ca5-0df3decb43ea";
const LIVE_RG = "bfd3541c-2ea6-3c85-acb7-d5501c3b45be";
const LIVE_REL = "b7d8d117-45d1-4934-a22b-b88dd85a56db";
const HITS_RG = "11111111-2222-3333-4444-555555555555";
const HITS_REL = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const REC_STUDIO = "6a29ed9f-b78c-4281-902a-8ff78af43f67";
const REC_LIVE = "7e2c01ee-4ab2-41c7-9b4a-57f712053183";
const REC_PARANOID = "9f9cf187-d6f9-437f-9d98-d59cdbd52757";
const REC_FEAT = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const OTHER_ARTIST = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";

const credit = [{ name: "Radiohead", artist: { id: RADIOHEAD, name: "Radiohead" } }];
const release = (id: string, rg: string, title: string, status: string, secondary: string[]) => ({
  id, title, status, date: "1997-05-21", "track-count": 12,
  "release-group": { id: rg, title, "primary-type": "Album", "secondary-types": secondary, "first-release-date": "1997-05-21" },
  media: [{ position: 1, "track-count": 12, "track-offset": 5, track: [{ number: "6", title: "Karma Police" }] }],
});

const searchResponse = {
  recordings: [
    { id: REC_LIVE, score: 100, title: "Karma Police", disambiguation: "live, 2003", "artist-credit": credit, length: 250000, releases: [release(LIVE_REL, LIVE_RG, "not my fault.", "Bootleg", ["Live"])] },
    {
      id: REC_STUDIO, score: 100, title: "Karma Police", length: 253720, "artist-credit": credit,
      tags: [{ name: "alternative rock", count: 9 }, { name: "rock", count: 3 }],
      releases: [release(HITS_REL, HITS_RG, "Greatest Hits", "Official", ["Compilation"]), release(OKC_REL, OKC_RG, "OK Computer", "Official", [])],
    },
  ],
};

const releaseLookup = {
  id: OKC_REL, title: "OK Computer", date: "1997-05-21", status: "Official",
  "release-group": { id: OKC_RG, title: "OK Computer", "primary-type": "Album", "first-release-date": "1997-05-21" },
  "artist-credit": credit,
  genres: [{ name: "art rock", count: 4 }],
  media: [
    {
      tracks: [
        { title: "Paranoid Android", length: 383493, "artist-credit": credit, recording: { id: REC_PARANOID, title: "Paranoid Android", length: 384000, genres: [{ name: "alternative rock", count: 12 }] } },
        {
          title: "Guest Spot", length: 200000,
          "artist-credit": [{ name: "Radiohead", joinphrase: " feat. ", artist: { id: RADIOHEAD, name: "Radiohead" } }, { name: "Someone Else", artist: { id: OTHER_ARTIST, name: "Someone Else" } }],
          recording: { id: REC_FEAT, title: "Guest Spot", length: 200000 },
        },
        { title: "No Recording Id", recording: { id: "not-a-uuid" } },
      ],
    },
  ],
};

type Handler = (url: string) => { status?: number; body?: unknown; headers?: Record<string, string> };
function mockFetch(handler: Handler) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const r = handler(url);
    const status = r.status ?? 200;
    return { status, ok: status >= 200 && status < 300, headers: new Headers(r.headers), text: async () => JSON.stringify(r.body ?? {}) };
  });
  return calls;
}

const route: Handler = (url) => {
  if (url.includes("/recording?")) return { body: searchResponse };
  if (url.includes(`/release/${OKC_REL}`)) return { body: releaseLookup };
  if (url.includes(`/release-group/${OKC_RG}?inc=releases`)) return { body: { releases: [{ id: OKC_REL, status: "Official", date: "1997-05-21" }] } };
  return { status: 404 };
};

beforeEach(() => {
  clearCatalogueCache();
  resetMusicbrainzLimiter();
});
afterEach(() => vi.unstubAllGlobals());

describe("SlotLimiter", () => {
  it("spaces callers one interval apart and sheds load past the max wait", async () => {
    vi.useFakeTimers();
    try {
      const l = new SlotLimiter(1000, 2500);
      const order: number[] = [];
      const t0 = Date.now();
      const first = l.acquire().then(() => order.push(Date.now() - t0));
      const second = l.acquire().then(() => order.push(Date.now() - t0));
      const third = l.acquire().then(() => order.push(Date.now() - t0));
      const fourth = l.acquire(); // would wait 3000ms > 2500ms
      await vi.advanceTimersByTimeAsync(2100);
      await Promise.all([first, second, third]);
      expect(order).toEqual([0, 1000, 2000]);
      expect(await fourth).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("penalize() pushes later slots out", () => {
    const l = new SlotLimiter(1000, 60_000);
    l.penalize(5000);
    expect(l.backlogMs()).toBeGreaterThan(4000);
  });
});

describe("catalogue ids", () => {
  it("accepts iTunes and MusicBrainz ids and nothing else", () => {
    expect(EXTERNAL_ID.test("itunes:123")).toBe(true);
    expect(EXTERNAL_ID.test(`mb:${RADIOHEAD}`)).toBe(true);
    for (const bad of ["mb:../../etc", `mb:${RADIOHEAD}/x`, "mb:abc", "http://169.254.169.254", "itunes:12a", `MB:${RADIOHEAD}`, `mb:${RADIOHEAD}\n`]) {
      expect(EXTERNAL_ID.test(bad), bad).toBe(false);
    }
  });
});

describe("MusicBrainz provider", () => {
  it("returns one canonical studio version per song, with artwork and genre", async () => {
    const calls = mockFetch(route);
    const tracks = await musicbrainz.searchTracks("karma police radiohead", 8);
    expect(tracks).toHaveLength(1); // the live bootleg and the studio recording share title + artist
    const t = tracks[0];
    expect(t.externalId).toBe(`mb:${REC_STUDIO}`);
    expect(t.album.externalId).toBe(`mb:${OKC_RG}`); // the official album, not the compilation
    expect(t.album.title).toBe("OK Computer");
    expect(t.album.artworkUrl).toBe(`https://coverartarchive.org/release-group/${OKC_RG}/front-500`);
    expect(t.artist).toEqual({ externalId: `mb:${RADIOHEAD}`, name: "Radiohead" });
    expect(t.trackNumber).toBe(6);
    expect(t.durationMs).toBe(253720);
    expect(t.genre).toBe("Alternative Rock");
    expect(calls).toHaveLength(1);
  });

  it("identifies itself, requires official releases and escapes query syntax", async () => {
    const calls = mockFetch(route);
    await musicbrainz.searchTracks('AC/DC "TNT" (live) OR 1=1', 5);
    const url = decodeURIComponent(calls[0].url);
    expect(calls[0].headers["User-Agent"]).toContain("tests@example.com");
    expect(url).toContain("status:official");
    expect(url).toContain("recording:ac\\/dc"); // lowercased, slash escaped
    expect(url).toContain('\\"tnt\\"'); // quotes can't open a Lucene phrase
    expect(url).toContain("\\(live\\)"); // parentheses can't regroup the query
    expect(url).toContain("recording:or OR artist:or"); // a typed "OR" is a plain word, not an operator
    expect(url).toContain("fmt=json");
  });

  it("answers repeat searches from the cache without another request", async () => {
    const calls = mockFetch(route);
    await musicbrainz.searchTracks("karma police", 8);
    await musicbrainz.searchTracks("  Karma   POLICE ", 8);
    expect(calls).toHaveLength(1);
  });

  it("shares one request between concurrent identical searches", async () => {
    const calls = mockFetch(route);
    await Promise.all([musicbrainz.searchTracks("karma police", 8), musicbrainz.searchTracks("karma police", 8), musicbrainz.searchTracks("karma police", 8)]);
    expect(calls).toHaveLength(1);
  });

  it("opens a search result without another lookup and reads the same edition for the album", async () => {
    const calls = mockFetch(route);
    await musicbrainz.searchTracks("karma police", 8);
    const t = await musicbrainz.getTrack(`mb:${REC_STUDIO}`);
    expect(t?.title).toBe("Karma Police");
    expect(calls).toHaveLength(1);
    const album = await musicbrainz.getAlbumTracks(`mb:${OKC_RG}`);
    // The edition that contained the clicked song is fetched directly: no release-group lookup first.
    expect(calls.map((c) => c.url).some((u) => u.includes("release-group/"))).toBe(false);
    expect(album.map((a) => a.title)).toEqual(["Paranoid Android", "Guest Spot"]); // the track without a valid recording id is dropped
    expect(album.map((a) => a.trackNumber)).toEqual([1, 2]);
    expect(album[1].artist.name).toBe("Radiohead");
    expect(album[1].featured).toEqual(["Someone Else"]);
    expect(album[0].genre).toBe("Alternative Rock");
    expect(album[1].genre).toBe("Art Rock"); // falls back to the release's genre
  });

  it("falls back to the earliest official edition when no edition is known", async () => {
    const calls = mockFetch(route);
    const album = await musicbrainz.getAlbumTracks(`mb:${OKC_RG}`);
    expect(album).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain(`release-group/${OKC_RG}`);
  });

  it("never builds requests from malformed ids", async () => {
    const calls = mockFetch(route);
    expect(await musicbrainz.getTrack("mb:../../admin")).toBeNull();
    expect(await musicbrainz.getAlbumTracks("mb:nope")).toEqual([]);
    expect(await musicbrainz.getArtistAlbums("mb:1/2")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("turns a MusicBrainz 503 into a friendly error and caches nothing", async () => {
    const calls = mockFetch(() => ({ status: 503, headers: { "retry-after": "1" } }));
    await expect(musicbrainz.searchTracks("karma police", 8)).rejects.toBeInstanceOf(MetadataError);
    expect(calls).toHaveLength(1);
  });

  it("lists a discography without live releases or duplicate titles", async () => {
    mockFetch((url) =>
      url.includes("release-group?artist=")
        ? {
            body: {
              "release-groups": [
                { id: OKC_RG, title: "OK Computer", "primary-type": "Album", "secondary-types": [], "first-release-date": "1997-05-21", "artist-credit": credit },
                { id: LIVE_RG, title: "I Might Be Wrong", "primary-type": "Album", "secondary-types": ["Live"], "first-release-date": "2001-11-12", "artist-credit": credit },
                { id: HITS_RG, title: "OK Computer (deluxe)", "primary-type": "Album", "secondary-types": [], "first-release-date": "2017-06-23", "artist-credit": credit },
              ],
            },
          }
        : { status: 404 },
    );
    const albums = await musicbrainz.getArtistAlbums(`mb:${RADIOHEAD}`);
    expect(albums.map((a) => a.title)).toEqual(["OK Computer"]);
    expect(albums[0].kind).toBe("album");
  });
});

describe("importing from MusicBrainz", () => {
  it("creates the artist, album and every track once, attributing guests as featured", async () => {
    mockFetch(route);
    await musicbrainz.searchTracks("karma police", 8); // search results are what users open from
    await importTrack(`mb:${REC_STUDIO}`);
    const db = getDB();
    const album = db.albums.find((a) => a.externalId === `mb:${OKC_RG}`)!;
    expect(album.artworkUrl).toContain("coverartarchive.org");
    expect(db.artists.filter((a) => a.externalId === `mb:${RADIOHEAD}`)).toHaveLength(1);
    expect(db.songs.filter((s) => s.albumId === album.id).map((s) => s.title).sort()).toEqual(["Guest Spot", "Karma Police", "Paranoid Android"]);
    expect(db.songs.find((s) => s.title === "Guest Spot")!.featured).toEqual(["Someone Else"]);

    const before = db.songs.length;
    await importAlbum(`mb:${OKC_RG}`);
    await importTrack(`mb:${REC_STUDIO}`);
    expect(getDB().songs.length).toBe(before);
  });
});
