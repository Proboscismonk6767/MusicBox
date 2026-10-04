import "server-only";
import { backendName } from "./env";
import { jsonReads } from "./reads-json";
import { jsonCommands } from "./commands-json";

// The one door to the data layer. Pages, routes and actions call `data.<name>(…)`
// and always await it, so they don't care whether the answer comes from the
// in-memory JSON store or from SQL. DATA_BACKEND picks the engine.

export type Reads = typeof jsonReads;
type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : T[K] };

async function engine(): Promise<Reads | Async<Reads>> {
  if (backendName() === "postgres") throw new Error("The Postgres backend is not available yet.");
  return jsonReads;
}

export const data = new Proxy({} as Async<Reads>, {
  get: (_t, name: string) => async (...args: unknown[]) => (await engine() as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args),
});

// Writes. Same rule: always awaited, engine chosen by DATA_BACKEND.
export type Commands = typeof jsonCommands;

async function commandEngine(): Promise<Commands | Async<Commands>> {
  if (backendName() === "postgres") throw new Error("The Postgres backend is not available yet.");
  return jsonCommands;
}

export const commands = new Proxy({} as Async<Commands>, {
  get: (_t, name: string) => async (...args: unknown[]) => (await commandEngine() as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args),
});
