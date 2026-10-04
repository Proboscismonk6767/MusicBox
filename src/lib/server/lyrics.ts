import "server-only";
import { env } from "./env";
import { securityLog } from "./security";
import { SlotLimiter } from "./slot-limiter";
import { cached } from "./catalogue-cache";

// Lyrics lookup via LRCLIB (https://lrclib.net): open, keyless, and returns
// time-synced LRC lyrics when they exist. Results (including misses) are cached
// on disk so each song costs at most one upstream lookup per TTL.
//
// Lyrics are shown only inside the "pin a lyric" picker; the profile stores just
// the few lines the user picked.

const DAY = 86_400_000;
const MAX_BYTES = 500_000;
const MAX_LINES = 400;

export interface LyricLine { ms: number | null; text: string }
export type LyricsResult = { status: "ok"; synced: boolean; lines: LyricLine[] } | { status: "instrumental" } | { status: "none" };

interface LrclibTrack { trackName?: string; artistName?: string; duration?: number; instrumental?: boolean; plainLyrics?: string | null; syncedLyrics?: string | null }

const g = globalThis as unknown as { __lyricsLimiter?: SlotLimiter };
const limiter = () => (g.__lyricsLimiter ??= new SlotLimiter(250, 6000));

const cleanLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);

/** Parse LRC (`[mm:ss.xx] text`, possibly several tags per line) into sorted lines. */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = cleanLine(raw.replace(/\[[^\]]*\]/g, ""));
    if (!text) continue;
    for (const t of tags) {
      const frac = t[3] ? Number(t[3].padEnd(3, "0")) : 0;
      out.push({ ms: Number(t[1]) * 60_000 + Number(t[2]) * 1000 + frac, text });
    }
  }
  return out.sort((a, b) => a.ms! - b.ms!).slice(0, MAX_LINES);
}

export function parsePlain(plain: string): LyricLine[] {
  return plain.split(/\r?\n/).map(cleanLine).filter(Boolean).slice(0, MAX_LINES).map((text) => ({ ms: null, text }));
}

async function lrclib<T>(pathAndQuery: string): Promise<T | null> {
  const base = (env().LRCLIB_URL ?? "https://lrclib.net").replace(/\/$/, "");
  if (!(await limiter().acquire())) throw new Error("busy");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}${pathAndQuery}`, {
      signal: ctrl.signal,
      redirect: "error",
      cache: "no-store",
      headers: { "User-Agent": "MusicBox/0.1 (lyrics picker)", Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      securityLog("catalogue.error", { status: res.status, provider: "lrclib" });
      throw new Error(`lrclib ${res.status}`);
    }
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new Error("lrclib response too large");
    return JSON.parse(body) as T;
  } finally {
    clearTimeout(timer);
  }
}

function toResult(t: LrclibTrack | null | undefined): LyricsResult {
  if (!t) return { status: "none" };
  if (t.instrumental) return { status: "instrumental" };
  if (typeof t.syncedLyrics === "string" && t.syncedLyrics.trim()) {
    const lines = parseLrc(t.syncedLyrics);
    if (lines.length) return { status: "ok", synced: true, lines };
  }
  if (typeof t.plainLyrics === "string" && t.plainLyrics.trim()) {
    const lines = parsePlain(t.plainLyrics);
    if (lines.length) return { status: "ok", synced: false, lines };
  }
  return { status: "none" };
}

/** Best-effort lyrics for a catalogue song. Throws only on transport errors (not cached). */
export async function getLyrics(song: { id: string; title: string; artist: string; album: string; durationMs: number }): Promise<LyricsResult> {
  return cached(
    `lyrics:${song.id}`,
    30 * DAY,
    async () => {
      const q = new URLSearchParams({ track_name: song.title, artist_name: song.artist, album_name: song.album, duration: String(Math.round(song.durationMs / 1000)) });
      const exact = toResult(await lrclib<LrclibTrack>(`/api/get?${q}`));
      if (exact.status !== "none") return exact;
      // Album names and durations differ between catalogues: fall back to a search and take the closest match.
      const hits = (await lrclib<LrclibTrack[]>(`/api/search?${new URLSearchParams({ track_name: song.title, artist_name: song.artist })}`)) ?? [];
      const secs = song.durationMs / 1000;
      const ranked = (Array.isArray(hits) ? hits : [])
        .filter((h) => !secs || !h.duration || Math.abs(h.duration - secs) <= 15)
        .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || Math.abs((a.duration ?? secs) - secs) - Math.abs((b.duration ?? secs) - secs));
      for (const h of ranked) {
        const r = toResult(h);
        if (r.status !== "none") return r;
      }
      return { status: "none" } as LyricsResult;
    },
    (v) => (v.status === "none" ? 3 * DAY : 30 * DAY),
  );
}
