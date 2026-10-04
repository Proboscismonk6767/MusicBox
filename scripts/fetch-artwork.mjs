// Fetches album artwork URLs for the seed catalogue from the iTunes Search API
// and writes data/artwork.json (album slug → URL). Optional: without it, the
// app renders generated covers. Only exact artist + album-title matches are
// accepted — a generated cover is better than a wrong one. Usage: npm run artwork
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const catalog = fs.readFileSync(path.join(root, "src/lib/seed/catalog.ts"), "utf8");
const out = path.join(root, "data/artwork.json");

function slugify(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/\+/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}
const norm = (s) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
// "Blonde" matches "Blonde", "Blonde (Deluxe)", "Blonde [Explicit]" — not "Blonde Redhead".
const titleMatches = (candidate, title) => {
  const base = candidate.replace(/\s*[([].*?[)\]]\s*/g, " ").replace(/\s+-\s+(Single|EP)$/i, "").trim();
  return norm(base) === norm(title);
};

const albums = [...catalog.matchAll(/artist: "([^"]+)", title: "([^"]+)"[\s\S]*?tracks: \["([^|"]+)/g)].map(([, artist, title, firstTrack]) => ({ artist, title, firstTrack }));
let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(out, "utf8").replace(/^﻿/, ""));
} catch {
  /* start fresh */
}

async function search(term, entity) {
  const res = await fetch(`https://itunes.apple.com/search?media=music&entity=${entity}&limit=25&term=${encodeURIComponent(term)}`);
  return (await res.json()).results ?? [];
}

for (const { artist, title, firstTrack } of albums) {
  const slug = slugify(`${title}-${artist}`);
  if (existing[slug]?.album) continue;
  const cleanTitle = title.replace(/\s*[–-]\s*\d+.*$/, "");
  const attempts = [
    [`${artist} ${cleanTitle}`, "album"],
    [cleanTitle, "album"],
    [`${artist} ${firstTrack}`, "song"],
  ];
  let hit;
  try {
    for (const [term, entity] of attempts) {
      const results = await search(term, entity);
      hit = results.find((r) => norm(r.artistName) === norm(artist) && titleMatches(r.collectionName ?? "", cleanTitle));
      await new Promise((r) => setTimeout(r, 300));
      if (hit) break;
    }
    if (hit?.artworkUrl100) {
      existing[slug] = { album: hit.artworkUrl100.replace("100x100bb", "600x600bb") };
      console.log("✓", artist, "—", title, `(${hit.collectionName})`);
    } else console.log("·", artist, "—", title, "(no exact match; using generated cover)");
  } catch (e) {
    console.log("✗", artist, "—", title, e.message);
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(existing, null, 2));
console.log(`Wrote ${Object.keys(existing).length} covers to data/artwork.json`);
