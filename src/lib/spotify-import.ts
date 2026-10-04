// Client-safe (no server imports): this runs in the browser so the raw Spotify
// export never leaves the user's device. Spotify's files include IP addresses,
// device names and every podcast played; only the aggregated track list built
// here (title, artist, album, play count, dates) is ever sent to the server.

export const MAX_IMPORT_TRACKS = 500;
/** Spotify itself counts a stream once 30 seconds have played. */
const MIN_PLAY_MS = 30_000;

export interface ImportTrack {
  t: string; // title
  a: string; // primary artist
  al?: string; // album
  p: number; // plays of at least 30 s
  ms: number; // total ms listened across those plays
  f: string; // first played, YYYY-MM-DD
  l: string; // last played, YYYY-MM-DD
}

export interface HistorySummary {
  plays: number;
  tracks: number;
  firstDate: string;
  lastDate: string;
  files: number;
}

// ── Matching helpers (shared with the server so both sides agree) ───────

const strip = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Reduce a title to what identifies the song: drops "(feat. X)", "- Remastered 2011", "(Deluxe Edition)" etc. */
export function normalizeTitle(raw: string): string {
  return strip(raw)
    .replace(/\s*[([]\s*(?:feat|ft|featuring|with)\b\.?[^)\]]*[)\]]/g, "")
    .replace(/\s+[-–—]\s+(?:feat|ft|featuring|with)\b\.?.*$/, "")
    .replace(/\s*[([][^)\]]*\b(?:remaster(?:ed)?|mono|stereo|deluxe|bonus|anniversary)\b[^)\]]*[)\]]/g, "")
    .replace(/\s+[-–—]\s+[^-–—]*\b(?:remaster(?:ed)?|mono|stereo|single version|album version|radio edit|deluxe|bonus track)\b[^-–—]*$/, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeArtist(raw: string): string {
  return strip(raw).replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/^the /, "").trim();
}

// ── Reading the export ──────────────────────────────────────────────────

const WANTED = /(?:^|\/)(?:Streaming_History_Audio[^/]*|StreamingHistory[^/]*)\.json$/i;
const MAX_FILE_BYTES = 300 * 1024 * 1024;

/** Minimal ZIP reader (stored + deflate) using the browser's DecompressionStream. No dependencies. */
export async function readZipJson(buf: ArrayBuffer): Promise<{ name: string; text: string }[]> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportError("That doesn't look like a ZIP file.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new ImportError("This ZIP is too large to read in the browser. Upload the JSON files inside it instead.");

  const out: { name: string; text: string }[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.byteLength || v.getUint32(p, true) !== 0x02014b50) throw new ImportError("This ZIP file is damaged.");
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!WANTED.test(name)) continue;
    if (usize > MAX_FILE_BYTES) throw new ImportError(`${name} is too large.`);
    if (v.getUint32(local, true) !== 0x04034b50) throw new ImportError("This ZIP file is damaged.");
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + csize);
    if (method === 0) out.push({ name, text: dec.decode(data) });
    else if (method === 8) out.push({ name, text: await inflateRaw(data, MAX_FILE_BYTES) });
    else throw new ImportError("This ZIP uses a compression method we can't read.");
  }
  return out;
}

async function inflateRaw(data: Uint8Array, max: number): Promise<string> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new ImportError("A file in this ZIP is too large."); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

export class ImportError extends Error {}

// ── Parsing + aggregating ───────────────────────────────────────────────

interface Play { title: string; artist: string; album?: string; ms: number; date: string }

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");

function toPlay(row: unknown): Play | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  // Extended streaming history, or the smaller "Account data" export.
  const title = str(r.master_metadata_track_name ?? r.trackName, 200);
  const artist = str(r.master_metadata_album_artist_name ?? r.artistName, 200);
  const ms = Number(r.ms_played ?? r.msPlayed);
  const date = str(r.ts ?? r.endTime, 40).slice(0, 10);
  if (!title || !artist || !Number.isFinite(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null; // also skips podcasts (no track name)
  const year = Number(date.slice(0, 4));
  if (year < 2000 || year > new Date().getFullYear() + 1) return null;
  return { title, artist, album: str(r.master_metadata_album_album_name, 200) || undefined, ms, date };
}

/** Turn the text of one or more history files into the top tracks by play count. */
export function aggregateHistory(files: string[]): { tracks: ImportTrack[]; summary: HistorySummary } {
  const byKey = new Map<string, ImportTrack>();
  let plays = 0;
  let first = "9999-99-99";
  let last = "0000-00-00";
  let used = 0;
  for (const text of files) {
    let rows: unknown;
    try { rows = JSON.parse(text); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    used++;
    for (const row of rows) {
      const pl = toPlay(row);
      if (!pl || pl.ms < MIN_PLAY_MS) continue;
      const key = `${normalizeTitle(pl.title)}|${normalizeArtist(pl.artist)}`;
      const t = byKey.get(key);
      plays++;
      if (pl.date < first) first = pl.date;
      if (pl.date > last) last = pl.date;
      if (t) {
        t.p++; t.ms += pl.ms;
        if (pl.date < t.f) t.f = pl.date;
        if (pl.date > t.l) t.l = pl.date;
      } else {
        byKey.set(key, { t: pl.title, a: pl.artist, al: pl.album, p: 1, ms: pl.ms, f: pl.date, l: pl.date });
      }
    }
  }
  if (!plays) throw new ImportError("We couldn't find any song plays in those files. Use the Streaming_History_Audio_*.json files (or StreamingHistory_music_*.json) from your Spotify download.");
  const all = [...byKey.values()].sort((a, b) => b.p - a.p || b.ms - a.ms);
  return { tracks: all.slice(0, MAX_IMPORT_TRACKS), summary: { plays, tracks: all.length, firstDate: first, lastDate: last, files: used } };
}

/** Accepts a Spotify ZIP and/or loose JSON files exactly as the user picked them. */
export async function readHistoryFiles(files: File[]): Promise<string[]> {
  const texts: string[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === "application/zip") {
      for (const e of await readZipJson(await f.arrayBuffer())) texts.push(e.text);
    } else if (/\.json$/i.test(f.name)) {
      if (f.size > MAX_FILE_BYTES) throw new ImportError(`${f.name} is too large.`);
      texts.push(await f.text());
    }
  }
  if (!texts.length) throw new ImportError("Choose the ZIP Spotify sent you, or the history .json files from inside it.");
  return texts;
}
