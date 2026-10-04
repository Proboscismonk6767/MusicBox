import { describe, expect, it } from "vitest";
import { musicbrainz } from "@/lib/server/musicbrainz";

// Hits the real MusicBrainz API, so it only runs on request:
//   LIVE_MB=1 npx vitest run tests/musicbrainz.live.test.ts
// It documents what "good results" mean for the ranking heuristics in musicbrainz.ts.
process.env.MUSICBRAINZ_MIN_INTERVAL_MS = "1200";
const live = process.env.LIVE_MB ? describe : describe.skip;

live("MusicBrainz (live)", () => {
  it("ranks the well-known studio recording first", async () => {
    const tracks = await musicbrainz.searchTracks("karma police radiohead", 8);
    console.log(tracks.map((t) => `${t.title} — ${t.artist.name} — ${t.album.title} (${t.album.releaseDate}) #${t.trackNumber}`));
    expect(tracks[0].title).toBe("Karma Police");
    expect(tracks[0].artist.name).toBe("Radiohead");
    expect(tracks[0].album.title).toBe("OK Computer");
  }, 60_000);

  it("ranks the original over covers when only the title is typed", async () => {
    const tracks = await musicbrainz.searchTracks("paranoid android", 8);
    console.log(tracks.map((t) => `${t.title} — ${t.artist.name} — ${t.album.title}`));
    expect(tracks[0].artist.name).toBe("Radiohead");
  }, 60_000);

  it("finds artists and albums", async () => {
    const [artists, albums] = await Promise.all([musicbrainz.searchArtists("radiohead", 3), musicbrainz.searchAlbums("ok computer radiohead", 3)]);
    console.log(artists, albums.map((a) => `${a.title} — ${a.artist} (${a.releaseDate})`));
    expect(artists[0].name).toBe("Radiohead");
    expect(albums[0].title.toLowerCase()).toContain("ok computer");
  }, 60_000);

  it("reads a full album and an artist discography", async () => {
    const tracks = await musicbrainz.getAlbumTracks("mb:b1392450-e666-3926-a536-22c65f834433");
    console.log(tracks.length, tracks.slice(0, 3).map((t) => `${t.trackNumber}. ${t.title}`));
    expect(tracks.length).toBeGreaterThanOrEqual(12);
    const albums = await musicbrainz.getArtistAlbums("mb:a74b1b7f-71a5-4011-9441-d0b5e4122711");
    console.log(albums.slice(0, 8).map((a) => `${a.title} (${a.releaseDate.slice(0, 4)})`));
    expect(albums.some((a) => a.title === "OK Computer")).toBe(true);
  }, 90_000);
});
