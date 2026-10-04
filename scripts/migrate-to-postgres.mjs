#!/usr/bin/env node
// Moves the JSON data store into Postgres using db/schema.sql.
//
//   npm run db:check
//       Dry run. Builds the schema in an embedded Postgres (PGlite, no account
//       needed), loads data/db.json into it and verifies the result. Touches nothing.
//       Run this any time to prove your real data fits the schema.
//
//   DATABASE_URL=postgres://user:pass@host:5432/musicbox npm run db:migrate
//       Applies the schema (if the database is empty) and loads the data inside one
//       transaction. Needs the `pg` package: npm i pg
//       The URL is read from the environment so the password never appears in
//       shell history or process listings.
//
// Options:  --source=path/to/db.json   (default data/db.json)
//           --force                    load even if the target already has users

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { importDb, verifyImport } from "./lib/pg-import.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const source = path.resolve(root, args.find((a) => a.startsWith("--source="))?.slice(9) ?? "data/db.json");
const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");

if (!fs.existsSync(source)) {
  console.error(`No data file at ${source}. Start the app once (it seeds itself) or pass --source=…`);
  process.exit(2);
}
const db = JSON.parse(fs.readFileSync(source, "utf8"));
console.log(`Source: ${path.relative(root, source)}  (${db.users.length} users, ${db.songs.length} songs, ${db.entries.length} diary entries)`);

function report({ inserted, skipped }, problems) {
  for (const [table, n] of Object.entries(inserted)) console.log(`  ${table.padEnd(16)} ${String(n).padStart(7)}${skipped[table] ? `   (${skipped[table]} skipped: dangling references)` : ""}`);
  const lost = Object.entries(skipped).filter(([t]) => !(t in inserted));
  for (const [t, n] of lost) console.log(`  ${t.padEnd(16)} ${String(0).padStart(7)}   (${n} skipped: dangling references)`);
  if (problems.length) {
    console.error(`\n${problems.length} verification problem(s):`);
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
    return 1;
  }
  console.log("\nVerified: row counts match and the stats triggers reproduce the app's aggregates exactly.");
  return 0;
}

if (flag("--dry-run") || flag("--check")) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { citext } = await import("@electric-sql/pglite/contrib/citext");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const pg = new PGlite({ extensions: { citext, pg_trgm } });
  await pg.exec(schema);
  const result = await importDb(db, (sql, params) => pg.query(sql, params));
  const code = report(result, await verifyImport(db, (sql) => pg.query(sql)));
  await pg.close();
  process.exit(code);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (see the header of this script), or use --dry-run to check without a database.");
  process.exit(2);
}
let Client;
try {
  ({ Client } = (await import("pg")).default ?? (await import("pg")));
} catch {
  console.error("This needs the node-postgres driver. Install it with:  npm i pg");
  process.exit(2);
}
const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  const exists = (await client.query("select to_regclass('public.users') as t")).rows[0].t;
  if (!exists) {
    console.log("Empty database: applying db/schema.sql");
    await client.query(schema);
  } else {
    const n = Number((await client.query("select count(*)::int as n from users")).rows[0].n);
    if (n > 0 && !flag("--force")) throw new Error(`The target already has ${n} users. Refusing to load on top of them (use --force if that's really what you want).`);
  }
  const result = await importDb(db, (sql, params) => client.query(sql, params));
  const problems = await verifyImport(db, (sql) => client.query(sql));
  const code = report(result, problems);
  if (code) throw new Error("Verification failed; nothing was written.");
  await client.query("commit");
  console.log("Committed.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`\nRolled back: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
