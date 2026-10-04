import "server-only";
import { backendName } from "./env";
import { jsonReads } from "./reads-json";
import { jsonCommands } from "./commands-json";

// The one door to the data layer. Pages, routes and actions call `data.<name>(…)`
// and always await it, so they don't care whether the answer comes from the
// in-memory JSON store or from SQL. DATA_BACKEND picks the engine.

export type Reads = typeof jsonReads;
export type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : T[K] };

const g = globalThis as unknown as { __mbSqlEngine?: Promise<{ reads: Async<Reads>; commands: Async<Commands> }> };

/** The Postgres engine, built on first use so the JSON backend never loads a database driver. */
function sqlEngine() {
  return (g.__mbSqlEngine ??= (async () => {
    const [{ getDb }, { createSqlReads }, { createSqlCommands }] = await Promise.all([import("./sql"), import("./sql/all-reads"), import("./sql/commands")]);
    const db = await getDb();
    return { reads: createSqlReads(db) as unknown as Async<Reads>, commands: createSqlCommands(db) as unknown as Async<Commands> };
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
