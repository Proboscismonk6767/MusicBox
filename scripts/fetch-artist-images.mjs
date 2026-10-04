// Downloads a profile photo for every seed artist from the Deezer public API and saves it to
// public/artists/<slug>.jpg (served same-origin, so no CSP change is needed). Only an exact
// artist-name match is accepted — an initial-on-gradient avatar is better than the wrong face.
// Optional and re-runnable: artists that already have a photo are skipped.
// Usage: npm run artist-images
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const catalog = fs.readFileSync(path.join(root, "src/lib/seed/catalog.ts"), "utf8");
const outDir = path.join(root, "public/artists");

function slugify(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/\+/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}
const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const section = catalog.slice(catalog.indexOf("export const SEED_ARTISTS"), catalog.indexOf("export const SEED_ALBUMS"));
const names = [...section.matchAll(/^\s*\{ name: "([^"]+)"/gm)].map((m) => m[1]);

fs.mkdirSync(outDir, { recursive: true });
let ok = 0;
for (const name of names) {
  const file = path.join(outDir, `${slugify(name)}.jpg`);
  if (fs.existsSync(file)) { ok++; continue; }
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(name)}`);
    const hits = ((await res.json()).data ?? []).filter((a) => norm(a.name) === norm(name) && /\/artist\/[0-9a-f]{32}\//.test(a.picture_big ?? ""));
    const hit = hits.sort((a, b) => b.nb_fan - a.nb_fan)[0];
    if (!hit) { console.log("·", name, "(no exact match; keeping generated avatar)"); continue; }
    const img = await fetch(hit.picture_big);
    if (!img.ok || !(img.headers.get("content-type") ?? "").startsWith("image/")) throw new Error(`HTTP ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 5000) { console.log("·", name, "(blank placeholder image; keeping generated avatar)"); continue; }
    fs.writeFileSync(file, buf);
    ok++;
    console.log("✓", name);
  } catch (e) {
    console.log("✗", name, e.message);
  }
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`${ok}/${names.length} artist photos in public/artists`);
