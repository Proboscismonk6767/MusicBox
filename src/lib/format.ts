// Client-safe formatting helpers.

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRuntime(ms: number): string {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} hr ${min % 60} min` : `${min} min`;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function plural(n: number, word: string, pluralWord = word + "s"): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? word : pluralWord}`;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return formatDate(iso);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDate(iso: string, withYear = true): string {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  const now = new Date();
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${withYear && !sameYear ? ", " + d.getUTCFullYear() : ""}`;
}

export function monthShort(i: number) {
  return MONTHS[i];
}

export function year(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function stars(r: number): string {
  return "★".repeat(Math.floor(r)) + (r % 1 ? "½" : "");
}

/** Four-digit year of a YYYY-MM-DD date; empty when the catalogue doesn't know it (it reports 1970-01-01). */
export function yearOf(d: string): string {
  const y = d.slice(0, 4);
  return y === "1970" ? "" : y;
}
