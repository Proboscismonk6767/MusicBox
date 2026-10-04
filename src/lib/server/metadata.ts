import "server-only";
import type { Album, Artist, Song } from "../types";
import { mutate } from "./store";
import { idx } from "./indexes";
import { slugify } from "../util";
import { emptyStats } from "./stats";
import { safeExternalUrl, securityLog } from "./security";
import { rateLimit } from "./ratelimit";
import { metadataProviderName } from "./env";
import { date, MetadataError, num, str, type ExternalAlbum, type ExternalArtist, type ExternalTrack, type MetadataProvider } from "./catalogue-core";
import { musicbrainz, withWaitBudget } from "./musicbrainz";
import { cached } from "./catalogue-cache";

export { MetadataError };
export type { ExternalAlbum, ExternalArtist, ExternalTrack, MetadataProvider };

// Provider data is untrusted input (see catalogue-core.ts); URLs must be https on provider-owned hosts.
const ART_HOSTS = ["mzstatic.com"];
const AUDIO_HOSTS = ["apple.com", "mzstatic.com"];
const LINK_HOSTS = ["apple.com"];

// ── Providers ───────────────────────────────────────────────────────────
// Any catalogue implements MetadataProvider (catalogue-core.ts). The app talks
// to `metadataProvider` for search and to `providerFor(id)` for items it has
// already imported, so songs from a previous provider keep working after a switch.


interface ItunesResult {
  wrapperType: string;
  kind?: string;
  trackId: number;
  trackName: string;
  artistId: number;
  artistName: string;
  collectionType?: string;
  primaryGenre?: string;
  collectionId: number;
  collectionName: string;
  artworkUrl100?: string;
  releaseDate: string;
  trackTimeMillis: number;
  trackNumber: number;
  trackCount?: number;
  trackExplicitness?: string;
  primaryGenreName?: string;
  previewUrl?: string;
  trackViewUrl?: string;
}

const itunes: MetadataProvider = {
  name: "Apple Music (iTunes Search)",
  async searchTracks(q, limit = 8) {
    const data = await fetchJSON(`https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(q)}`);
    return data.results.filter((r) => r.kind === "song").map(mapItunes);
  },
  async getTrack(externalId) {
    const id = rawId(externalId);
    const data = await fetchJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`);
    const r = data.results.find((x) => x.kind === "song");
    return r ? mapItunes(r) : null;
  },
  async getAlbumTracks(externalId) {
    const id = rawId(externalId);
    const data = await fetchJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`);
    return data.results.filter((r) => r.kind === "song").map(mapItunes);
  },
  async searchArtists(q, limit = 5) {
    const data = await fetchJSON(`https://itunes.apple.com/search?media=music&entity=musicArtist&limit=${limit}&term=${encodeURIComponent(q)}`);
    return data.results.filter((r) => r.wrapperType === "artist").map((r) => ({ externalId: `itunes:${num(r.artistId, 1e15)}`, name: str(r.artistName, 200), genre: str(r.primaryGenreName, 60) || undefined }));
  },
  async searchAlbums(q, limit = 5) {
    const data = await fetchJSON(`https://itunes.apple.com/search?media=music&entity=album&limit=${limit}&term=${encodeURIComponent(q)}`);
    return data.results.filter((r) => r.wrapperType === "collection").map(mapAlbum);
  },
  async getArtistAlbums(externalId) {
    const id = rawId(externalId);
    const data = await fetchJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=album&limit=200`);
    const seen = new Set<string>();
    return data.results
      .filter((r) => r.wrapperType === "collection")
      .map(mapAlbum)
      .filter((a) => { const k = a.title.toLowerCase().replace(/s*[([].*$/, ""); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  },
};

function mapAlbum(r: ItunesResult): ExternalAlbum {
  return { externalId: `itunes:${num(r.collectionId, 1e15)}`, title: str(r.collectionName) || "Untitled", artist: str(r.artistName, 200), artworkUrl: safeExternalUrl(r.artworkUrl100?.replace("100x100bb", "600x600bb"), ART_HOSTS), releaseDate: date(r.releaseDate), trackCount: num(r.trackCount, 1000) };
}

const inflight = new Map<string, Promise<{ results: ItunesResult[] }>>();
const cache = new Map<string, { at: number; data: { results: ItunesResult[] } }>();
const CACHE_MS = 10 * 60_000;
const MAX_BYTES = 2_000_000;

/** All outbound catalogue requests go through here: fixed https host (no SSRF),
 *  in-memory cache + request de-duplication, timeout and response size cap. */
async function fetchJSON(url: string): Promise<{ results: ItunesResult[] }> {
  if (!url.startsWith("https://itunes.apple.com/")) throw new MetadataError("Unsupported catalogue request.");
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = fetchJSONUncached(url)
    .then((data) => {
      if (cache.size > 2000) cache.clear();
      cache.set(url, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

async function fetchJSONUncached(url: string): Promise<{ results: ItunesResult[] }> {
  // Global outbound budget: Apple allows ~20 req/min per server IP. Exceeding it
  // gets the whole site blocked, so callers can never push us past it.
  if (!rateLimit("catalogue:outbound", 20, 20 / 60)) {
    securityLog("ratelimit.exceeded", { action: "catalogue_outbound" });
    throw new MetadataError("The music catalogue is busy. Try again in a minute.");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "error", cache: "no-store" });
    if (!res.ok) {
      securityLog("catalogue.error", { status: res.status });
      throw new MetadataError(res.status === 403 || res.status === 429 ? "The music catalogue is busy. Try again in a minute." : "The music catalogue is unavailable right now.");
    }
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new MetadataError("The music catalogue returned an unexpected response.");
    const json = JSON.parse(body) as { results?: unknown };
    return { results: Array.isArray(json.results) ? (json.results as ItunesResult[]).slice(0, 250) : [] };
  } catch (e) {
    if (e instanceof MetadataError) throw e;
    throw new MetadataError(ctrl.signal.aborted ? "The music catalogue took too long to respond." : "Couldn't reach the music catalogue.");
  } finally {
    clearTimeout(t);
  }
}

function mapItunes(r: ItunesResult): ExternalTrack {
  return {
    externalId: `itunes:${num(r.trackId, 1e15)}`,
    title: str(r.trackName) || "Untitled",
    artist: { externalId: `itunes:${num(r.artistId, 1e15)}`, name: str(r.artistName, 200) || "Unknown artist" },
    album: { externalId: `itunes:${num(r.collectionId, 1e15)}`, title: str(r.collectionName) || "Untitled", artworkUrl: safeExternalUrl(r.artworkUrl100?.replace("100x100bb", "600x600bb"), ART_HOSTS), releaseDate: date(r.releaseDate), trackCount: num(r.trackCount, 1000) },
    durationMs: num(r.trackTimeMillis, 24 * 3600e3),
    trackNumber: num(r.trackNumber, 1000) || 1,
    explicit: r.trackExplicitness === "explicit",
    genre: str(r.primaryGenreName, 60) || undefined,
    previewUrl: safeExternalUrl(r.previewUrl, AUDIO_HOSTS),
    url: safeExternalUrl(r.trackViewUrl, LINK_HOSTS),
  };
}

/** The catalogue that answers new searches (METADATA_PROVIDER, default MusicBrainz). */
export const metadataProvider: MetadataProvider = {
  get name() { return primary().name; },
  searchTracks: (q, l) => primary().searchTracks(q, l),
  getTrack: (id) => providerFor(id).getTrack(id),
  getAlbumTracks: (id) => providerFor(id).getAlbumTracks(id),
  searchArtists: (q, l) => primary().searchArtists(q, l),
  searchAlbums: (q, l) => primary().searchAlbums(q, l),
  getArtistAlbums: (id) => providerFor(id).getArtistAlbums(id),
};

const primary = (): MetadataProvider => (metadataProviderName() === "itunes" ? itunes : musicbrainz);

/** Items remember which catalogue they came from through their id prefix. */
function providerFor(externalId: string): MetadataProvider {
  return externalId.startsWith("mb:") ? musicbrainz : itunes;
}

const rawId = (externalId: string) => externalId.split(":")[1];

/** External search results that aren't already in our catalogue. */
export async function searchExternal(q: string) {
  q = q.slice(0, 100);
  const results = await metadataProvider.searchTracks(q, 10);
  const i = idx();
  const known = new Set(i.db.songs.map((s) => s.externalId).filter(Boolean));
  const knownTitles = new Set(i.db.songs.map((s) => `${s.title.toLowerCase()}|${i.artist.get(s.artistIds[0])?.name.toLowerCase()}`));
  return results.filter((t) => !known.has(t.externalId) && !knownTitles.has(`${t.title.toLowerCase()}|${t.artist.name.toLowerCase()}`));
}

/** Import a track (and its album's track list) into the catalogue. Idempotent. */
export async function importTrack(externalId: string, prefetched?: ExternalTrack[]): Promise<string> {
  const existing = idx().db.songs.find((s) => s.externalId === externalId);
  if (existing && !prefetched) return existing.slug;
  const track = prefetched?.find((t) => t.externalId === externalId) ?? (await metadataProvider.getTrack(externalId));
  if (!track) throw new MetadataError("That song is no longer available in the catalogue.");
  let albumTracks: ExternalTrack[] = prefetched ?? [];
  if (!prefetched) try {
    albumTracks = await metadataProvider.getAlbumTracks(track.album.externalId);
  } catch {
    /* fall back to the single track */
  }
  if (!albumTracks.some((t) => t.externalId === track.externalId)) albumTracks.push(track);

  // Search results sometimes lack a date (stored as 1970-01-01); the album's own track list knows it.
  const albumDate = albumTracks.map((t) => dateOrNull(t.album.releaseDate)).find(Boolean) ?? track.album.releaseDate;

  return mutate((db) => {
    const artist = ensureArtist(db.artists, track);
    let album = db.albums.find((a) => a.externalId === track.album.externalId);
    if (!album) {
      const hue = artistHue(track.artist.name);
      album = {
        id: "al" + rawId(track.album.externalId), externalId: track.album.externalId, slug: uniqueSlug(db.albums, slugify(`${track.album.title}-${track.artist.name}`)),
        title: track.album.title, artistId: artist.id, releaseDate: albumDate, genres: track.genre ? [track.genre] : [],
        artworkUrl: track.album.artworkUrl, palette: [`hsl(${hue} 40% 40%)`, `hsl(${(hue + 40) % 360} 50% 60%)`, `hsl(${hue} 30% 12%)`], pattern: hue % 22, producers: [],
      } satisfies Album;
      db.albums.push(album);
    }
    let slug = "";
    for (const t of albumTracks) {
      if (db.songs.some((s) => s.externalId === t.externalId)) {
        if (t.externalId === track.externalId) slug = db.songs.find((s) => s.externalId === t.externalId)!.slug;
        continue;
      }
      const q = encodeURIComponent(`${t.title} ${t.artist.name}`);
      const song: Song = {
        id: "so" + rawId(t.externalId), externalId: t.externalId, slug: uniqueSlug(db.songs, slugify(`${t.title}-${t.artist.name}`)), title: t.title,
        albumId: album.id, artistIds: [ensureArtist(db.artists, t).id], featured: t.featured ?? [], durationMs: t.durationMs, trackNumber: t.trackNumber, releaseDate: dateOrNull(t.album.releaseDate) ?? albumDate,
        explicit: t.explicit, writers: [], producers: [], genres: t.genre ? [t.genre] : album.genres, popularity: 50, previewUrl: t.previewUrl,
        links: { apple: t.url, spotify: `https://open.spotify.com/search/${q}`, youtube: `https://www.youtube.com/results?search_query=${q}` },
      };
      db.songs.push(song);
      db.songStats[song.id] = emptyStats();
      if (t.externalId === track.externalId) slug = song.slug;
    }
    return slug;
  });
}

/** Providers use 1970-01-01 as "unknown" (see catalogue-core `date`). */
const dateOrNull = (d: string) => (d.startsWith("1970-") ? null : d);

const artistHue =(name: string) => [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

/** Find the artist by catalogue id or exact name, creating it when new. Call inside mutate(). */
function ensureArtist(artists: Artist[], t: ExternalTrack): Artist {
  const found = artists.find((a) => a.externalId === t.artist.externalId || a.name.toLowerCase() === t.artist.name.toLowerCase());
  if (found) {
    // Seeded artists have no catalogue id yet; remembering it makes later discography lookups exact.
    found.externalId ??= t.artist.externalId;
    return found;
  }
  const artist = { id: "ar" + rawId(t.artist.externalId), externalId: t.artist.externalId, slug: uniqueSlug(artists, slugify(t.artist.name)), name: t.artist.name, genres: t.genre ? [t.genre] : [], hue: artistHue(t.artist.name) } satisfies Artist;
  artists.push(artist);
  return artist;
}

/** Import a whole album by its external id; returns the album slug. */
export async function importAlbum(albumExternalId: string): Promise<string> {
  const existing = idx().db.albums.find((a) => a.externalId === albumExternalId);
  if (existing && (idx().songsByAlbum.get(existing.id)?.length ?? 0) > 1) return existing.slug;
  const tracks = await metadataProvider.getAlbumTracks(albumExternalId);
  if (!tracks.length) throw new MetadataError("That album has no tracks available in the catalogue.");
  await importTrack(tracks[0].externalId, tracks);
  return idx().db.albums.find((a) => a.externalId === albumExternalId)!.slug;
}

/** Create (or find) an artist from the external catalogue; returns the slug. */
export async function importArtist(artistExternalId: string): Promise<string> {
  const known = idx().db.artists.find((a) => a.externalId === artistExternalId);
  if (known) return known.slug;
  const albums = await metadataProvider.getArtistAlbums(artistExternalId);
  if (!albums.length) throw new MetadataError("We couldn't find music for that artist.");
  const byName = idx().db.artists.find((a) => a.name.toLowerCase() === albums[0].artist.toLowerCase());
  if (byName) {
    mutate(() => { byName.externalId ??= artistExternalId; });
    return byName.slug;
  }
  // Import their most recent full release so the page has content.
  const pick = albums.find((a) => a.kind === "album" || (a.trackCount ?? 0) >= 6) ?? albums[0];
  await importAlbum(pick.externalId);
  const artist = idx().db.artists.find((a) => a.externalId === artistExternalId || a.name.toLowerCase() === albums[0].artist.toLowerCase())!;
  mutate(() => { artist.externalId ??= artistExternalId; });
  return artist.slug;
}

/** How long a page render will wait for the catalogue before showing the page without it. */
const RENDER_WAIT_MS = 1500;
/** After a failed lookup, don't retry the same artist for a while (stops crawlers hammering a busy catalogue). */
const FAIL_MEMO_MS = 60_000;
const gm = globalThis as unknown as { __discoFailures?: Map<string, number> };

/** Provider discography for any artist (seeded or imported). Called while rendering artist pages,
 *  so it gives up quickly instead of queueing behind other catalogue requests. */
export async function externalDiscography(artist: { name: string; externalId?: string }): Promise<ExternalAlbum[]> {
  const failures = (gm.__discoFailures ??= new Map());
  const key = artist.externalId ?? artist.name.toLowerCase();
  const until = failures.get(key);
  if (until && until > Date.now()) throw new Error("Discography temporarily unavailable");
  try {
    return await withWaitBudget(RENDER_WAIT_MS, async () => {
      let id = artist.externalId;
      if (!id) {
        const hits = await metadataProvider.searchArtists(artist.name, 5);
        const hit = hits.find((h) => h.name.toLowerCase() === artist.name.toLowerCase());
        if (!hit) return [];
        id = hit.externalId;
      }
      return metadataProvider.getArtistAlbums(id);
    });
  } catch (e) {
    if (failures.size > 500) failures.clear();
    failures.set(key, Date.now() + FAIL_MEMO_MS);
    throw e;
  }
}

/** Full external search for autocomplete/search page. `quick` (autocomplete) asks the
 *  provider for songs only, because a rate-limited catalogue can't afford three lookups per pause. */
export async function searchCatalogue(q: string, opts: { quick?: boolean } = {}) {
  q = q.slice(0, 100);
  const [tracks, artists, albums] = await Promise.all([
    searchExternal(q).catch(() => []),
    opts.quick ? [] : metadataProvider.searchArtists(q, 4).catch(() => []),
    opts.quick ? [] : metadataProvider.searchAlbums(q, 4).catch(() => []),
  ]);
  const i = idx();
  const knownArtists = new Set(i.db.artists.map((a) => a.name.toLowerCase()));
  const knownAlbums = new Set(i.db.albums.map((a) => a.externalId).filter(Boolean));
  return {
    source: metadataProvider.name,
    tracks,
    artists: artists.filter((a) => !knownArtists.has(a.name.toLowerCase())),
    albums: albums.filter((a) => !knownAlbums.has(a.externalId)),
  };
}

function uniqueSlug(rows: { slug: string }[], base: string) {
  let slug = base;
  let n = 2;
  while (rows.some((r) => r.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}

// ── Audio previews ──────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** A 30-second Apple preview clip for any catalogue song (stored URL first, else an iTunes lookup). Cached on disk. */
export async function findPreviewUrl(song: Song, artistName: string): Promise<string | null> {
  if (song.previewUrl) return song.previewUrl;
  return cached(`preview:${song.id}`, 30 * 86_400_000, async () => {
    const term = encodeURIComponent(`${song.title} ${artistName}`.slice(0, 120));
    const { results } = await fetchJSON(`https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${term}`);
    const title = norm(song.title);
    const artist = norm(artistName);
    const hit = results
      .filter((r) => r.previewUrl && norm(r.artistName ?? "").includes(artist) && norm(r.trackName ?? "").startsWith(title))
      .sort((a, b) => Math.abs((a.trackTimeMillis ?? 0) - song.durationMs) - Math.abs((b.trackTimeMillis ?? 0) - song.durationMs))[0];
    return safeExternalUrl(hit?.previewUrl, AUDIO_HOSTS) ?? null;
  }, (v) => (v ? 30 * 86_400_000 : 3 * 86_400_000));
}
