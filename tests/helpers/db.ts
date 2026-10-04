import { openPg, openPglite, type Db } from "@/lib/server/sql/driver";

/** A fresh, empty database for one test file. With TEST_DATABASE_URL set (an admin connection to a real
 *  PostgreSQL server) it is a throwaway database on that server, reached through node-postgres, the same
 *  driver production uses. Without it, an in-memory embedded Postgres. */
export async function createTestDatabase(): Promise<{ url?: string; drop: () => Promise<void> }> {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) return { drop: async () => {} };
  const pg = (await import("pg")).default;
  const name = `mb_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const c = new pg.Client({ connectionString: admin });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

/** Opens the test database described above. Call `close()` when done (it also drops a throwaway database). */
export async function openTestDb(): Promise<Db & { dispose: () => Promise<void> }> {
  const target = await createTestDatabase();
  const db = target.url ? await openPg(target.url, { max: 4 }) : await openPglite();
  return Object.assign(db, { dispose: async () => { await db.close(); await target.drop(); } });
}
