import "server-only";
import { backendName, env, isProduction } from "./env";
import { jsonReads } from "./reads-json";
import { jsonCommands } from "./commands-json";

// The one door to the data layer. Pages, routes and actions call `data.<name>(…)`
// and always await it, so they don't care whether the answer comes from the
// in-memory JSON store or from SQL. DATA_BACKEND picks the engine.

export type Reads = typeof jsonReads;
export type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : T[K] };

const g = globalThis as unknown as { __mbSqlEngine?: Promise<{ reads: Async<Reads>; commands: Async<Commands> }> };

/** Reads that are the same for every visitor and fine to reuse briefly. Each is a full-table aggregate, so
 *  asking Postgres for them on every page view is the most expensive thing the home and song pages do. */
const SHARED_READS = new Set(["trendingSongs", "highlyRated", "hiddenGems", "newReleases", "allGenres", "artworkWall", "catalogueSize", "recentReviews", "similarSongs", "sitemapData"]);

/** Reuses an answer for `seconds`; a burst of identical requests shares one query. Per process, best effort. */
function withSharedCache(reads: Async<Reads>, seconds: number): Async<Reads> {
  if (seconds <= 0) return reads;
  const store = new Map<string, { until: number; value: Promise<unknown> }>();
  return new Proxy(reads, {
    get(target, name: string) {
      const fn = (target as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name];
      if (!SHARED_READS.has(name)) return fn;
      return (...args: unknown[]) => {
        const key = name + JSON.stringify(args);
        const hit = store.get(key);
        if (hit && hit.until > Date.now()) return hit.value;
        if (store.size > 500) store.clear();
        const value = fn(...args).catch((e) => { store.delete(key); throw e; });
        store.set(key, { until: Date.now() + seconds * 1000, value });
        return value;
      };
    },
  });
}

/** The Postgres engine, built on first use so the JSON backend never loads a database driver. */
function sqlEngine() {
  return (g.__mbSqlEngine ??= (async () => {
    const [{ getDb }, { createSqlReads }, { createSqlCommands }] = await Promise.all([import("./sql"), import("./sql/all-reads"), import("./sql/commands")]);
    const db = await getDb();
    const seconds = env().READ_CACHE_SECONDS ?? (isProduction() ? 30 : 0);
    return { reads: withSharedCache(createSqlReads(db) as unknown as Async<Reads>, seconds), commands: createSqlCommands(db) as unknown as Async<Commands> };
  })());
}

/** Tests: forget the cached Postgres engine (see resetDb in sql/index.ts). */
export function resetSqlEngine() {
  g.__mbSqlEngine = undefined;
}

async function engine(): Promise<Reads | Async<Reads>> {
  return backendName() === "postgres" ? (await sqlEngine()).reads : jsonReads;
}

export const data = new Proxy({} as Async<Reads>, {
  get: (_t, name: string) => async (...args: unknown[]) => (await engine() as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args),
});

// Writes. Same rule: always awaited, engine chosen by DATA_BACKEND.
export type Commands = typeof jsonCommands;

async function commandEngine(): Promise<Commands | Async<Commands>> {
  return backendName() === "postgres" ? (await sqlEngine()).commands : jsonCommands;
}

export const commands = new Proxy({} as Async<Commands>, {
  get: (_t, name: string) => async (...args: unknown[]) => (await commandEngine() as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args),
});
