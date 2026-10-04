// A tiny database interface that both node-postgres (real Postgres) and PGlite
// (embedded Postgres for development and tests) satisfy. No app imports here, so
// scripts can use it too.
//
// Values come back in the shapes the app uses: numbers for int8/numeric,
// "YYYY-MM-DD" for dates and ISO-8601 strings for timestamps.

export type Row = Record<string, unknown>;

export interface Q {
  /** Runs one statement with $1, $2… parameters and returns its rows. */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs several statements with no parameters (schema files). */
  exec(text: string): Promise<void>;
}

export interface Db extends Q {
  readonly kind: "pg" | "pglite";
  /** Runs `fn` in one transaction: committed if it returns, rolled back if it throws. */
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Postgres type ids we care about.
const INT8 = 20, NUMERIC = 1700, DATE = 1082, TIMESTAMP = 1114, TIMESTAMPTZ = 1184;

const toNumber = (v: string) => Number(v);
const toIso = (v: string) => new Date(/[zZ]|[+-]\d\d(:?\d\d)?$/.test(v) ? v : v + "Z").toISOString();
const same = (v: string) => v;

/** Parsers keyed by Postgres type id. */
export const PARSERS: Record<number, (v: string) => unknown> = {
  [INT8]: toNumber, [NUMERIC]: toNumber, [DATE]: same, [TIMESTAMP]: toIso, [TIMESTAMPTZ]: toIso,
};

/** Real Postgres through node-postgres. */
export async function openPg(connectionString: string, opts: { max?: number } = {}): Promise<Db> {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 10,
    // A runaway query or a forgotten transaction must not hold a connection (and its locks) for long.
    statement_timeout: 20_000,
    idle_in_transaction_session_timeout: 30_000,
    types: { getTypeParser: ((oid: number, format?: string) => PARSERS[oid] ?? pg.types.getTypeParser(oid, format as "text")) as never },
  });
  pool.on("error", () => { /* an idle client dropped; the pool replaces it */ });
  const run = async <T>(c: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }, text: string, params?: unknown[]) => (await c.query(text, params)).rows as T[];
  return {
    kind: "pg",
    query: (text, params) => run(pool, text, params),
    exec: async (text) => { await pool.query(text); },
    async tx(fn) {
      // Two transactions can deadlock when they touch the same rows in opposite orders (the song_stats
      // triggers make that possible). Postgres aborts one; the whole transaction is safe to run again.
      for (let attempt = 1; ; attempt++) {
        const c = await pool.connect();
        try {
          await c.query("begin");
          const out = await fn({ query: (text, params) => run(c, text, params), exec: async (text) => { await c.query(text); } });
          await c.query("commit");
          return out;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          const code = (e as { code?: string }).code;
          if ((code === "40P01" || code === "40001") && attempt < 4) { await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 25)); continue; }
          throw e;
        } finally {
          c.release();
        }
      }
    },
    close: () => pool.end(),
  };
}

/** Embedded Postgres (WASM). `dataDir` omitted = in memory. Not for production traffic. */
export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const lite = await PGlite.create(dataDir, { extensions: { citext, pg_trgm }, parsers: PARSERS as never });
  // PGlite runs one statement at a time and queues other callers while a transaction is open.
  return {
    kind: "pglite",
    query: async <T>(text: string, params?: unknown[]) => (await lite.query<T>(text, params)).rows,
    exec: async (text) => { await lite.exec(text); },
    tx: (fn) => lite.transaction((t) => fn({
      query: async <T>(text: string, params?: unknown[]) => (await t.query<T>(text, params)).rows,
      exec: async (text: string) => { await t.exec(text); },
    })),
    close: () => lite.close(),
  };
}
