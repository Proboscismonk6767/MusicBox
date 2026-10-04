// Moves the JSON data store into Postgres.
//
//   npm run db:check
//       Dry run. Builds the schema in an embedded Postgres (PGlite, no account
//       needed), loads data/db.json into it and verifies the result. Touches nothing.
//       Run this any time to prove your real data fits the schema.
//
//   DATABASE_URL=postgres://user:pass@host:5432/musicbox npm run db:migrate
//       Brings the schema up to date (db/schema.sql + db/migrations) and loads the data
//       inside one transaction. The URL is read from the environment so the password
//       never appears in shell history or process listings.
//
// After a successful migrate, run the app with DATA_BACKEND=postgres and DATABASE_URL set.
//
// Options:  --source=path/to/db.json   (default data/db.json)
//           --force                    load even if the target already has users

import fs from "fs";
import path from "path";
import type { DB } from "../src/lib/types";
import { openPg, openPglite } from "../src/lib/server/sql/driver";
import { applySchema } from "../src/lib/server/sql/schema";
import { importDb, verifyImport, type ImportReport } from "../src/lib/server/sql/import-db";

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const source = path.resolve(root, args.find((a) => a.startsWith("--source="))?.slice(9) ?? "data/db.json");

if (!fs.existsSync(source)) {
  console.error(`No data file at ${source}. Start the app once (it seeds itself) or pass --source=…`);
  process.exit(2);
}
const db = JSON.parse(fs.readFileSync(source, "utf8")) as DB;
console.log(`Source: ${path.relative(root, source)}  (${db.users.length} users, ${db.songs.length} songs, ${db.entries.length} diary entries)`);

function report({ inserted, skipped }: ImportReport, problems: string[]) {
  for (const [table, n] of Object.entries(inserted)) console.log(`  ${table.padEnd(16)} ${String(n).padStart(7)}${skipped[table] ? `   (${skipped[table]} skipped: dangling references)` : ""}`);
  for (const [t, n] of Object.entries(skipped).filter(([t]) => !(t in inserted))) console.log(`  ${t.padEnd(16)} ${String(0).padStart(7)}   (${n} skipped: dangling references)`);
  if (problems.length) {
    console.error(`\n${problems.length} verification problem(s):`);
    for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
    return 1;
  }
  console.log("\nVerified: row counts match and the stats triggers reproduce the app's aggregates exactly.");
  return 0;
}

async function main(): Promise<number> {
  if (flag("--dry-run") || flag("--check")) {
    const pg = await openPglite();
    await applySchema(pg, root);
    const code = report(await importDb(db, pg), await verifyImport(db, pg));
    await pg.close();
    return code;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (see the header of this script), or use --dry-run to check without a database.");
    return 2;
  }
  const pg = await openPg(url, { max: 2 });
  try {
    // Schema changes are idempotent and safe to keep even if the data load is rolled back.
    const schema = await applySchema(pg, root);
    if (schema.baselineApplied) console.log("Empty database: applied db/schema.sql");
    if (schema.applied.length) console.log(`Applied migrations: ${schema.applied.join(", ")}`);
    const result = await pg.tx(async (q) => {
      const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from users");
      if (n > 0 && !flag("--force")) throw new Error(`The target already has ${n} users. Refusing to load on top of them (use --force if that's really what you want).`);
      const imported = await importDb(db, q);
      const problems = await verifyImport(db, q);
      if (report(imported, problems)) throw new Error("Verification failed; nothing was written.");
      return imported;
    });
    console.log(`Committed (${Object.values(result.inserted).reduce((a, b) => a + b, 0)} rows).`);
    return 0;
  } catch (e) {
    console.error(`\nRolled back: ${(e as Error).message}`);
    return 1;
  } finally {
    await pg.close();
  }
}

main().then((code) => process.exit(code));
