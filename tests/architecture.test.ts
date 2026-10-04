import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Application code must reach data only through the async facade (src/lib/server/data.ts).
// If a page, route or helper reads the JSON store directly it silently returns stale or empty
// answers once the data lives in Postgres, and tests can't tell because the seed is identical.
// So only the JSON backend itself (and the code that builds the seed) may touch it.

const root = path.join(process.cwd(), "src");
const BACKEND = new Set([
  "lib/server/store.ts", "lib/server/indexes.ts", "lib/server/queries.ts", "lib/server/queries-extra.ts", "lib/server/insights.ts", "lib/server/export.ts",
  "lib/server/stats.ts", "lib/server/commands-json.ts", "lib/server/reads-json.ts", "lib/server/data.ts",
]);
const FORBIDDEN = /\b(getDB|mutate|idx|getRev)\s*\(|from\s+"[^"]*\/(indexes|store)"/;
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));

describe("data access", () => {
  it("only the JSON backend touches the JSON store", () => {
    const offenders: string[] = [];
    for (const file of files(root).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (BACKEND.has(rel) || rel.startsWith("lib/seed/")) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, n) => {
        // dataDir() is just a directory helper that happens to live in store.ts.
        const cleaned = line.replace(/import\s*\{\s*dataDir\s*\}\s*from\s*"[^"]*\/store";?/, "");
        if (FORBIDDEN.test(cleaned) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${rel}:${n + 1}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("no page, route or component imports the JSON read functions directly", () => {
    const offenders: string[] = [];
    for (const file of files(path.join(root, "app")).concat(files(path.join(root, "components"))).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const src = fs.readFileSync(file, "utf8");
      // Types and pure helpers (userMini, avg) are fine; the query functions are not.
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/server\/(queries|insights|export|indexes|store)"/g)) {
        const names = m[1].split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean);
        const allowed = new Set(["userMini", "DiaryFilters", "ProfileHeader", "avg", "weightedAvg"]);
        for (const n of names) if (!allowed.has(n)) offenders.push(`${path.relative(root, file)} imports ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
