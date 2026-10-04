import "server-only";
import fs from "fs";
import path from "path";
import { ImageResponse } from "next/og";
import { safeExternalUrl } from "./security";

// Share images (Open Graph): what appears when a song, review, list or profile
// is pasted into iMessage, Discord, X or Slack. Every public page is a landing
// page, so these matter more than most UI. They use only data an anonymous
// visitor could already see, and never embed arbitrary remote URLs: artwork is
// fetched from allow-listed hosts or read from /public.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = "image/png";

const ACCENT = "#f2b544";
const BG = "#0d0d0f";
const MUTED = "#a3a3a9";
const ART_HOSTS = ["coverartarchive.org", "archive.org", "mzstatic.com"];
const MAX_IMAGE_BYTES = 2_500_000;
const PUBLIC_DIR = path.join(process.cwd(), "public");

const cache = new Map<string, { at: number; url: string | null }>();

/** Artwork as a data URL (or null). The image renderer then never makes its own network requests. */
export async function artDataUrl(src?: string): Promise<string | null> {
  if (!src) return null;
  const hit = cache.get(src);
  if (hit && Date.now() - hit.at < 3600_000) return hit.url;
  const url = await load(src).catch(() => null);
  if (cache.size > 200) cache.clear();
  cache.set(src, { at: Date.now(), url });
  return url;
}

async function load(src: string): Promise<string | null> {
  if (src.startsWith("/")) {
    // Bundled artist photos: /artists/<slug>.jpg
    const file = path.normalize(path.join(PUBLIC_DIR, src));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !/\.(jpe?g|png)$/i.test(file)) return null;
    const buf = fs.readFileSync(file);
    return `data:${/\.png$/i.test(file) ? "image/png" : "image/jpeg"};base64,${buf.toString("base64")}`;
  }
  const safe = safeExternalUrl(src, ART_HOSTS);
  if (!safe) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(safe, { signal: ctrl.signal, redirect: "follow", cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    // After redirects (Cover Art Archive → archive.org) the final host must still be an allowed one.
    if (!res.ok || !/^image\/(jpeg|png)/.test(type) || !safeExternalUrl(res.url, ART_HOSTS)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } finally {
    clearTimeout(timer);
  }
}

export interface CardProps {
  kicker: string;
  title: string;
  subtitle?: string;
  /** Short facts along the bottom, e.g. "4.3 average", "1,204 ratings". */
  facts?: string[];
  palette?: [string, string, string];
  /** One cover, or up to four for a collage. Missing images fall back to the palette. */
  art?: (string | null)[];
  round?: boolean;
  /** Draws a round avatar with this letter instead of artwork (profiles). */
  initial?: string;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function renderCard(p: CardProps) {
  const [c0, c1] = p.palette ?? ["#3a2f1a", "#8a6a2a", BG];
  const covers = (p.art ?? []).filter(Boolean) as string[];
  const hasArt = covers.length > 0 || p.palette || p.initial;
  const size = 420;
  const titleSize = p.title.length > 48 ? 52 : p.title.length > 28 ? 64 : 78;

  const art = !hasArt ? null : covers.length >= 4 ? (
    <div style={{ display: "flex", flexWrap: "wrap", width: size, height: size, borderRadius: 16, overflow: "hidden" }}>
      {covers.slice(0, 4).map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={c} width={size / 2} height={size / 2} style={{ objectFit: "cover" }} alt="" />
      ))}
    </div>
  ) : covers[0] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={covers[0]} width={size} height={size} style={{ objectFit: "cover", borderRadius: p.round ? size / 2 : 16 }} alt="" />
  ) : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: p.initial || p.round ? size / 2 : 16, background: `linear-gradient(135deg, ${c1}, ${c0})`, fontSize: 200, color: "#fff" }}>
      {p.initial?.slice(0, 1).toUpperCase()}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: `linear-gradient(120deg, ${c0} 0%, ${BG} 62%)`, color: "#f5f5f5", padding: 60, fontFamily: "sans-serif" }}>
        {art && <div style={{ display: "flex", alignSelf: "center", marginRight: 56, borderRadius: p.initial || p.round ? size / 2 : 16, boxShadow: "0 24px 60px rgba(0,0,0,.5)" }}>{art}</div>}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: ACCENT, fontSize: 26, letterSpacing: 5, textTransform: "uppercase" }}>{clip(p.kicker, 40)}</div>
            <div style={{ display: "flex", fontSize: titleSize, lineHeight: 1.05, marginTop: 22, fontWeight: 700 }}>{clip(p.title, 90)}</div>
            {p.subtitle && <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 18, lineHeight: 1.25 }}>{clip(p.subtitle, 120)}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexWrap: "wrap", flex: 1, minWidth: 0, fontSize: 28, color: "#e6e6e8" }}>
              {(p.facts ?? []).map((f, i) => (
                <div key={i} style={{ display: "flex", marginRight: 28 }}>{f}</div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0, marginLeft: 24, fontSize: 30, color: ACCENT, fontWeight: 700 }}>MusicBox</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

/** For anything missing, private or unknown: a plain brand card rather than a broken preview. */
export function brandCard() {
  return renderCard({ kicker: "MusicBox", title: "Your music taste deserves a history", subtitle: "Log, rate and review the songs that matter to you." });
}

export const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
export { clip };
