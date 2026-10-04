import "server-only";
import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import { env } from "./env";

// Persistent cache for catalogue lookups. Provider APIs are slow and rate-limited
// (MusicBrainz allows 1 request/second), so every answer is stored on disk and
// survives restarts. Only normalised, already-sanitised provider data goes in.
// Swap the file for a Postgres/Redis table later without touching callers.

interface Entry { at: number; ttl: number; v: unknown }

const MAX_ENTRIES = 3000;
const MAX_ENTRY_BYTES = 200_000;
const FLUSH_MS = 2000;

const g = globalThis as unknown as { __catalogueCache?: Map<string, Entry>; __catalogueFlush?: NodeJS.Timeout; __catalogueInflight?: Map<string, Promise<unknown>> };

const file = () => path.join(dataDir(), "catalogue-cache.json");
const persistent = () => env().NODE_ENV !== "test";

function store(): Map<string, Entry> {
  if (g.__catalogueCache) return g.__catalogueCache;
  const m = new Map<string, Entry>();
  if (persistent()) {
    try {
      const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as { v?: number; entries?: [string, Entry][] };
      const now = Date.now();
      if (raw.v === 1 && Array.isArray(raw.entries)) for (const [k, e] of raw.entries) if (e && now - e.at < e.ttl) m.set(k, e);
    } catch {
      /* missing or unreadable cache is fine: it only costs a refetch */
    }
  }
  return (g.__catalogueCache = m);
}

function scheduleFlush() {
  if (!persistent() || g.__catalogueFlush) return;
  g.__catalogueFlush = setTimeout(() => {
    g.__catalogueFlush = undefined;
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      const tmp = file() + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, entries: [...store()] }));
      fs.renameSync(tmp, file());
    } catch {
      /* best effort */
    }
  }, FLUSH_MS);
  g.__catalogueFlush.unref?.();
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store().get(key);
  if (!e) return undefined;
  if (Date.now() - e.at >= e.ttl) { store().delete(key); return undefined; }
  return e.v as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number) {
  const m = store();
  if (JSON.stringify(value).length > MAX_ENTRY_BYTES) return;
  m.delete(key); // re-insert so Map order == write order, oldest first
  m.set(key, { at: Date.now(), ttl: ttlMs, v: value });
  while (m.size > MAX_ENTRIES) m.delete(m.keys().next().value!);
  scheduleFlush();
}

/** Return the cached value, or run `produce` once (concurrent callers share it) and cache the result. */
export async function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>, ttlFor?: (v: T) => number): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const inflight = (g.__catalogueInflight ??= new Map());
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const p = produce()
    .then((v) => { cacheSet(key, v, ttlFor ? ttlFor(v) : ttlMs); return v; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function clearCatalogueCache() {
  g.__catalogueCache = undefined;
  g.__catalogueInflight = undefined;
}
