import "server-only";
import { env } from "./env";
import { securityLog, safeExternalUrl } from "./security";
import { SlotLimiter } from "./slot-limiter";
import { cached, cacheGet, cacheSet } from "./catalogue-cache";
import { date, MetadataError, num, str, titleCase, type ExternalAlbum, type ExternalArtist, type ExternalTrack, type MetadataProvider } from "./catalogue-core";

// MusicBrainz catalogue (open data, mirrorable) + Cover Art Archive for artwork.
//
//  • Rules of the public server: ≤ 1 request/second per IP and a User-Agent that
//    says who you are. `SlotLimiter` spaces calls out and sheds load instead of
//    queueing forever; everything is cached on disk (catalogue-cache.ts).
//  • IDs are namespaced `mb:<uuid>`. Songs are recordings, albums are release
//    GROUPS (one per album however many editions exist), artists are artists.
//  • Recordings appear on many releases (singles, live, compilations). We pick
//    the most canonical studio release for each recording and de-duplicate.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_BYTES = 3_000_000;
const CAA = "https://coverartarchive.org";
export const ART_HOSTS = ["coverartarchive.org", "archive.org"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : "");

// ── Minimal shapes of the JSON we read ──────────────────────────────────

interface MbCredit { name?: string; joinphrase?: string; artist?: { id?: string; name?: string } }
interface MbGroup { id?: string; title?: string; "primary-type"?: string; "secondary-types"?: string[]; "first-release-date"?: string }
interface MbTag { name?: string; count?: number }
interface MbRelease {
  id?: string; title?: string; status?: string; date?: string; "track-count"?: number;
  "release-group"?: MbGroup; "artist-credit"?: MbCredit[]; genres?: MbTag[];
  media?: { "track-offset"?: number; track?: { number?: string }[]; tracks?: MbTrack[] }[];
}
interface MbRecording {
  id?: string; title?: string; length?: number; score?: number; disambiguation?: string; "first-release-date"?: string;
  "artist-credit"?: MbCredit[]; releases?: MbRelease[]; tags?: MbTag[]; genres?: MbTag[];
}
interface MbTrack { title?: string; length?: number; "artist-credit"?: MbCredit[]; recording?: MbRecording }

// ── Transport ───────────────────────────────────────────────────────────

const g = globalThis as unknown as { __mbLimiter?: SlotLimiter };
const limiter = () => (g.__mbLimiter ??= new SlotLimiter(env().MUSICBRAINZ_MIN_INTERVAL_MS ?? 1100, 9000));

const BUSY = "The music catalogue is busy. Try again in a minute.";

/** Tests only: forget the request spacing state. */
export function resetMusicbrainzLimiter() {
  g.__mbLimiter = undefined;
}

/** GET a MusicBrainz web-service path. Returns null on 404. Base URL is operator-configured, never user input. */
async function mb<T>(pathAndQuery: string): Promise<T | null> {
  const base = (env().MUSICBRAINZ_URL ?? "https://musicbrainz.org/ws/2").replace(/\/$/, "");
  const url = `${base}/${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}fmt=json`;
  if (!(await limiter().acquire())) {
    securityLog("ratelimit.exceeded", { action: "catalogue_outbound" });
    throw new MetadataError(BUSY);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const contact = env().MUSICBRAINZ_CONTACT;
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "error",
      cache: "no-store",
      headers: { "User-Agent": contact ? `MusicBox/0.1 ( ${contact} )` : "MusicBox-dev/0.1 ( local development )", Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (res.status === 503 || res.status === 429) {
      const retry = Number(res.headers.get("retry-after"));
      limiter().penalize(Number.isFinite(retry) && retry > 0 ? Math.min(retry, 60) * 1000 : 5000);
      securityLog("catalogue.error", { status: res.status });
      throw new MetadataError(BUSY);
    }
    if (!res.ok) {
      securityLog("catalogue.error", { status: res.status });
      throw new MetadataError("The music catalogue is unavailable right now.");
    }
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new MetadataError("The music catalogue returned an unexpected response.");
    return JSON.parse(body) as T;
  } catch (e) {
    if (e instanceof MetadataError) throw e;
    throw new MetadataError(ctrl.signal.aborted ? "The music catalogue took too long to respond." : "Couldn't reach the music catalogue.");
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

// ── Query building ──────────────────────────────────────────────────────

const normalise = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const escapeLucene = (s: string) => s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");

/** Every word must match one of `fields`; the last word is a prefix so typeahead works.
 *  With `titleField`, candidates whose title alone contains every word are boosted, so typing
 *  "paranoid android" finds the song before an artist who happens to be called that. */
function luceneAll(q: string, fields: string[], titleField?: string): string {
  const ws = q.split(" ").filter(Boolean).slice(0, 6);
  const term = (w: string, i: number) => escapeLucene(w) + (i === ws.length - 1 && w.length >= 3 ? "*" : "");
  const cross = ws.map((w, i) => `(${fields.map((f) => `${f}:${term(w, i)}`).join(" OR ")})`).join(" AND ");
  if (!titleField || ws.length === 0) return cross;
  const titleOnly = ws.map((w, i) => `${titleField}:${term(w, i)}`).join(" AND ");
  return `((${titleOnly})^4 OR (${cross}))`;
}

// ── Choosing the canonical release ──────────────────────────────────────

const BAD_SECONDARY = new Set(["Live", "Compilation", "Remix", "DJ-mix", "Demo", "Interview", "Audiobook", "Spokenword", "Audio drama", "Field recording"]);
const NOT_A_STUDIO_VERSION = /\b(live|demo|remix|acoustic|session|instrumental|karaoke|cover|rehearsal|bootleg|radio edit|a cappella)\b/i;

/** Lower is better. Official studio albums beat singles, which beat compilations, which beat live/bootleg. */
function releaseRank(r: MbRelease): number {
  const rg = r["release-group"];
  const sec = rg?.["secondary-types"] ?? [];
  let rank = r.status === "Official" ? 0 : 20;
  if (sec.includes("Live")) rank += 30;
  else if (sec.includes("Compilation")) rank += 10;
  else if (sec.some((s) => BAD_SECONDARY.has(s))) rank += 15;
  const primary = rg?.["primary-type"];
  rank += primary === "Album" ? 0 : primary === "EP" ? 1 : primary === "Single" ? 2 : 5;
  return rank;
}

const bestRelease = (releases: MbRelease[]) =>
  releases
    .filter((r) => uuid(r.id) && uuid(r["release-group"]?.id))
    .sort((a, b) => releaseRank(a) - releaseRank(b) || (a.date || a["release-group"]?.["first-release-date"] || "9999").localeCompare(b.date || b["release-group"]?.["first-release-date"] || "9999"))[0];

// ── Mapping ─────────────────────────────────────────────────────────────

const topGenre = (...lists: (MbTag[] | undefined)[]) => {
  for (const l of lists) {
    const best = [...(l ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0]?.name;
    const s = str(best, 60);
    if (s) return titleCase(s);
  }
  return undefined;
};

function creditNames(ac: MbCredit[] | undefined): string {
  return str((ac ?? []).map((c) => (c.name ?? c.artist?.name ?? "") + (c.joinphrase ?? "")).join(""), 200);
}

function primaryArtist(ac: MbCredit[] | undefined) {
  const first = ac?.find((c) => uuid(c.artist?.id));
  if (!first) return null;
  const featured = (ac ?? []).filter((c) => c !== first && c.artist?.name).map((c) => str(c.artist!.name, 200)).filter(Boolean).slice(0, 6);
  return { externalId: `mb:${first.artist!.id}`, name: str(first.artist!.name ?? first.name, 200) || "Unknown artist", featured };
}

const artworkFor = (rgid: string) => safeExternalUrl(`${CAA}/release-group/${rgid}/front-500`, ART_HOSTS);

function mapRecording(rec: MbRecording, rel: MbRelease): ExternalTrack | null {
  const id = uuid(rec.id);
  const rg = rel["release-group"];
  const rgid = uuid(rg?.id);
  const artist = primaryArtist(rec["artist-credit"] ?? rel["artist-credit"]);
  if (!id || !rgid || !artist) return null;
  const offset = rel.media?.[0]?.["track-offset"];
  const n = parseInt(rel.media?.[0]?.track?.[0]?.number ?? "", 10);
  return {
    externalId: `mb:${id}`,
    title: str(rec.title) || "Untitled",
    artist: { externalId: artist.externalId, name: artist.name },
    featured: artist.featured,
    album: {
      externalId: `mb:${rgid}`,
      title: str(rg?.title ?? rel.title) || "Untitled",
      artworkUrl: artworkFor(rgid),
      releaseDate: date(rel.date || rg?.["first-release-date"] || rec["first-release-date"]),
      trackCount: num(rel["track-count"], 1000) || undefined,
    },
    durationMs: num(rec.length, 24 * 3600e3),
    trackNumber: typeof offset === "number" ? offset + 1 : Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1,
    explicit: false,
    genre: topGenre(rec.genres, rec.tags),
  };
}

function mapGroup(rg: MbGroup & { "artist-credit"?: MbCredit[]; score?: number }): ExternalAlbum | null {
  const id = uuid(rg.id);
  if (!id) return null;
  const t = rg["primary-type"];
  return {
    externalId: `mb:${id}`,
    title: str(rg.title) || "Untitled",
    artist: creditNames(rg["artist-credit"]) || "Unknown artist",
    artworkUrl: artworkFor(id),
    releaseDate: date(rg["first-release-date"]),
    kind: t === "EP" ? "ep" : t === "Single" ? "single" : "album",
  };
}

const wantedGroup = (rg: MbGroup) => !(rg["secondary-types"] ?? []).some((s) => BAD_SECONDARY.has(s));
const rawId = (externalId: string) => externalId.split(":")[1] ?? "";

// ── Provider ────────────────────────────────────────────────────────────

export const musicbrainz: MetadataProvider = {
  name: "MusicBrainz",

  async searchTracks(q, limit = 8) {
    const key = normalise(q);
    if (key.length < 2) return [];
    return cached(`mb:tracks:${limit}:${key}`, 6 * HOUR, async () => {
      const query = `${luceneAll(key, ["recording", "artist"], "recording")} AND status:official`;
      const data = await mb<{ recordings?: MbRecording[] }>(`recording?query=${enc(query)}&limit=100`); // MusicBrainz returns ties in arbitrary order, so rank a wide pool locally
      // One entry per (title, artist): keep the most canonical studio version.
      const best = new Map<string, { track: ExternalTrack; rank: number; rel: MbRelease }>();
      const wanted = new Set(words(key));
      for (const rec of data?.recordings ?? []) {
        const rel = bestRelease(rec.releases ?? []);
        if (!rel) continue;
        const track = mapRecording(rec, rel);
        if (!track) continue;
        // Lower is better. MusicBrainz has no popularity, but a recording that appears on many
        // releases is a well-known one; words in the title the user didn't type mark covers,
        // reissue snippets and "(live at …)" noise.
        const extraWords = words(track.title).filter((w) => !wanted.has(w)).length;
        const artistTyped = words(track.artist.name).some((w) => wanted.has(w));
        const inTitle = new Set(words(track.title));
        const titleCoverage = wanted.size ? [...wanted].filter((w) => inTitle.has(w)).length / wanted.size : 0;
        const rank =
          releaseRank(rel) +
          (NOT_A_STUDIO_VERSION.test(rec.disambiguation ?? "") ? 8 : 0) +
          5 * Math.min(extraWords, 4) -
          (artistTyped ? 3 : 0) -
          8 * titleCoverage -
          3 * Math.log2(1 + (rec.releases?.length ?? 0)) -
          (rec.score ?? 0) / 20;
        const k = `${track.title.toLowerCase()}|${track.artist.name.toLowerCase()}`;
        if (!best.has(k) || rank < best.get(k)!.rank) best.set(k, { track, rank, rel });
      }
      const picked = [...best.values()].sort((a, b) => a.rank - b.rank).slice(0, limit);
      // Opening a result later needs no extra lookup, and the album import knows which edition to read.
      for (const { track, rel } of picked) {
        cacheSet(`mb:track:${rawId(track.externalId)}`, track, 30 * DAY);
        cacheSet(`mb:edition:${rawId(track.album.externalId)}`, rel.id, 30 * DAY);
      }
      return picked.map((p) => p.track);
    });
  },

  async getTrack(externalId) {
    const id = uuid(rawId(externalId));
    if (!id) return null;
    const hit = cacheGet<ExternalTrack>(`mb:track:${id}`);
    if (hit) return hit;
    return cached<ExternalTrack | null>(`mb:recording:${id}`, 30 * DAY, async () => {
      const rec = await mb<MbRecording>(`recording/${id}?inc=artist-credits+releases+release-groups+genres`);
      if (!rec) return null;
      const rel = bestRelease(rec.releases ?? []);
      if (!rel) return null;
      cacheSet(`mb:edition:${uuid(rel["release-group"]?.id)}`, rel.id, 30 * DAY);
      return mapRecording({ ...rec, id }, rel);
    }, (v) => (v ? 30 * DAY : HOUR));
  },

  async getAlbumTracks(albumExternalId) {
    const rgid = uuid(rawId(albumExternalId));
    if (!rgid) return [];
    return cached<ExternalTrack[]>(`mb:album:${rgid}`, 30 * DAY, async () => {
      let releaseId = cacheGet<string>(`mb:edition:${rgid}`);
      if (!releaseId) {
        const group = await mb<MbGroup & { releases?: MbRelease[] }>(`release-group/${rgid}?inc=releases`);
        const pick = [...(group?.releases ?? [])]
          .filter((r) => uuid(r.id))
          .sort((a, b) => Number(a.status !== "Official") - Number(b.status !== "Official") || (a.date || "9999").localeCompare(b.date || "9999"))[0];
        releaseId = pick?.id;
      }
      if (!releaseId) return [];
      const rel = await mb<MbRelease>(`release/${releaseId}?inc=recordings+artist-credits+genres+release-groups`);
      if (!rel) return [];
      const releaseGenre = topGenre(rel.genres);
      const tracks: ExternalTrack[] = [];
      let n = 0;
      for (const medium of (rel.media ?? []).slice(0, 10)) {
        for (const t of medium.tracks ?? []) {
          const rec = t.recording;
          const recId = uuid(rec?.id);
          const artist = primaryArtist(t["artist-credit"] ?? rec?.["artist-credit"] ?? rel["artist-credit"]);
          n++;
          if (!recId || !artist || tracks.length >= 200) continue;
          tracks.push({
            externalId: `mb:${recId}`,
            title: str(t.title ?? rec?.title) || "Untitled",
            artist: { externalId: artist.externalId, name: artist.name },
            featured: artist.featured,
            album: {
              externalId: `mb:${rgid}`,
              title: str(rel["release-group"]?.title ?? rel.title) || "Untitled",
              artworkUrl: artworkFor(rgid),
              releaseDate: date(rel["release-group"]?.["first-release-date"] || rel.date),
              trackCount: n,
            },
            durationMs: num(t.length ?? rec?.length, 24 * 3600e3),
            trackNumber: n,
            explicit: false,
            genre: topGenre(rec?.genres) ?? releaseGenre,
          });
        }
      }
      for (const t of tracks) t.album.trackCount = n;
      return tracks;
    }, (v) => (v.length ? 30 * DAY : HOUR));
  },

  async searchArtists(q, limit = 5) {
    const key = normalise(q);
    if (key.length < 2) return [];
    return cached(`mb:artists:${limit}:${key}`, 6 * HOUR, async () => {
      const data = await mb<{ artists?: { id?: string; name?: string; score?: number; tags?: MbTag[]; genres?: MbTag[] }[] }>(
        `artist?query=${enc(luceneAll(key, ["artist", "alias"]))}&limit=${limit + 3}`,
      );
      const out: ExternalArtist[] = [];
      for (const a of data?.artists ?? []) {
        if (!uuid(a.id) || (a.score ?? 0) < 60 || !str(a.name)) continue;
        out.push({ externalId: `mb:${a.id}`, name: str(a.name, 200), genre: topGenre(a.genres, a.tags) });
        if (out.length >= limit) break;
      }
      return out;
    });
  },

  async searchAlbums(q, limit = 5) {
    const key = normalise(q);
    if (key.length < 2) return [];
    return cached(`mb:albums:${limit}:${key}`, 6 * HOUR, async () => {
      const query = `${luceneAll(key, ["releasegroup", "artist"], "releasegroup")} AND (primarytype:album OR primarytype:ep OR primarytype:single) AND NOT secondarytype:live AND NOT secondarytype:compilation AND NOT secondarytype:remix AND NOT secondarytype:dj-mix AND NOT secondarytype:demo`;
      const data = await mb<{ "release-groups"?: (MbGroup & { "artist-credit"?: MbCredit[]; score?: number })[] }>(`release-group?query=${enc(query)}&limit=${limit * 3}`);
      const seen = new Set<string>();
      const out: ExternalAlbum[] = [];
      for (const rg of data?.["release-groups"] ?? []) {
        const album = wantedGroup(rg) ? mapGroup(rg) : null;
        if (!album) continue;
        const k = `${album.title.toLowerCase()}|${album.artist.toLowerCase()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(album);
        if (out.length >= limit) break;
      }
      return out;
    });
  },

  async getArtistAlbums(artistExternalId) {
    const id = uuid(rawId(artistExternalId));
    if (!id) return [];
    return cached<ExternalAlbum[]>(`mb:discography:${id}`, DAY, async () => {
      const data = await mb<{ "release-groups"?: (MbGroup & { "artist-credit"?: MbCredit[] })[] }>(
        `release-group?artist=${id}&type=${enc("album|ep")}&inc=artist-credits&limit=100`,
      );
      const seen = new Set<string>();
      return (data?.["release-groups"] ?? [])
        .filter(wantedGroup)
        .map(mapGroup)
        .filter((a): a is ExternalAlbum => !!a)
        .filter((a) => { const k = a.title.toLowerCase().replace(/\s*[([].*$/, ""); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    });
  },
};
