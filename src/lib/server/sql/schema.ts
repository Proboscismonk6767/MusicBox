import fs from "fs";
import path from "path";
import type { Db } from "./driver";

// Brings a database up to date: db/schema.sql is the baseline (applied once to an
// empty database), then every file in db/migrations/ runs once, in name order.
// Applied migrations are recorded in schema_migrations. Never edit schema.sql after
// it has been deployed; add a numbered migration instead.

const BASELINE = "000_baseline";

export interface SchemaResult { baselineApplied: boolean; applied: string[] }

export async function applySchema(db: Db, root = process.cwd()): Promise<SchemaResult> {
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const result: SchemaResult = { baselineApplied: false, applied: [] };

  const hasUsers = (await db.query<{ t: string | null }>("select to_regclass('public.users')::text as t"))[0].t !== null;
  if (!hasUsers) {
    await db.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
    result.baselineApplied = true;
  }
  if (!done.has(BASELINE)) await db.query("insert into schema_migrations (name) values ($1) on conflict do nothing", [BASELINE]);

  const dir = path.join(root, "db", "migrations");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    result.applied.push(file);
  }
  return result;
}
