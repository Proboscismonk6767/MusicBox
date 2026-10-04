import { randomBytes } from "crypto";

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

export function newId(prefix = ""): string {
  return prefix + randomBytes(8).toString("hex");
}

/** Deterministic PRNG for seeding. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseDuration(s: string): number {
  const [m, sec] = s.split(":").map(Number);
  return (m * 60 + sec) * 1000;
}

export function clampRating(r: number): number {
  return Math.min(5, Math.max(0.5, Math.round(r * 2) / 2));
}

export function isValidRating(r: unknown): r is number {
  return typeof r === "number" && r >= 0.5 && r <= 5 && Number.isInteger(r * 2);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** decodeURIComponent that never throws (malformed % sequences → raw input). */
export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
