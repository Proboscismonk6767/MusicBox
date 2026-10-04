import "server-only";
import fs from "fs";
import path from "path";
import type { DB } from "../types";
import { generateSeed, appendMissingCatalogue, DB_VERSION } from "../seed/generate";
import { recomputeAllStats } from "./stats";
import { demoDataEnabled, env, isProduction } from "./env";

// Persistence adapter. A JSON document store keeps the MVP zero-config; every
// read/write goes through this module + queries.ts, so swapping to Postgres
// (see db/schema.sql) means replacing these two files only.

// DATA_DIR must be a persistent volume in production (validated in env.ts).
export const dataDir = () => path.resolve(env().DATA_DIR ?? path.join(process.cwd(), "data"));
const dbFile = () => path.join(dataDir(), "db.json");
// Artwork overlay ships with the repo (public, non-sensitive).
const ARTWORK_FILE = path.join(process.cwd(), "data", "artwork.json");
// Artist photos (npm run artist-images) live in public/artists/<slug>.jpg and are served same-origin.
const ARTIST_IMAGE_DIR = path.join(process.cwd(), "public", "artists");

const g = globalThis as unknown as { __musicboxDB?: DB; __musicboxSave?: NodeJS.Timeout; __musicboxRev?: number };

/** Incremented on every write; used to invalidate in-memory indexes. */
export function getRev(): number {
  return g.__musicboxRev ?? 0;
}

function applyArtwork(db: DB) {
  for (const ar of db.artists) {
    const local = path.join(ARTIST_IMAGE_DIR, `${ar.slug}.jpg`);
    const have = fs.existsSync(local);
    if (!ar.imageUrl && have) ar.imageUrl = `/artists/${ar.slug}.jpg`;
    else if (ar.imageUrl?.startsWith("/artists/") && !have) ar.imageUrl = undefined; // photo was removed
  }
  try {
    const art: Record<string, { album?: string; artist?: string }> = JSON.parse(fs.readFileSync(ARTWORK_FILE, "utf8"));
    for (const al of db.albums) if (!al.externalId) al.artworkUrl = art[al.slug]?.album;
    for (const ar of db.artists) {
      const hit = Object.entries(art).find(([slug, v]) => v.artist && db.albums.find((a) => a.slug === slug)?.artistId === ar.id);
      if (!ar.imageUrl && hit) ar.imageUrl = hit[1].artist;
    }
  } catch {
    /* artwork overlay is optional */
  }
}

function load(): DB {
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(dbFile(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // unreadable ≠ missing: fail closed
  }
  if (raw !== null) {
    let db: DB | null = null;
    try {
      db = JSON.parse(raw) as DB;
    } catch {
      /* handled below */
    }
    if (db?.version === DB_VERSION) {
      const grew = appendMissingCatalogue(db);
      if (grew) recomputeAllStats(db);
      applyArtwork(db);
      if (grew) persist(db);
      return db;
    }
    // Never silently replace real data in production.
    if (isProduction()) throw new Error("Data file is corrupt or from another schema version. Restore from backup or run a migration.");
    fs.copyFileSync(dbFile(), `${dbFile()}.${Date.now()}.bak`);
  }
  const db = generateSeed({ demo: demoDataEnabled() });
  applyArtwork(db);
  persist(db);
  return db;
}

function persist(db: DB) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = dbFile() + ".tmp";
  // 0600: the store contains password hashes and session hashes.
  fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
  fs.renameSync(tmp, dbFile());
}

export function getDB(): DB {
  return (g.__musicboxDB ??= load());
}

/** Run a write and schedule a flush to disk. */
export function mutate<T>(fn: (db: DB) => T): T {
  const db = getDB();
  const result = fn(db);
  g.__musicboxRev = getRev() + 1;
  clearTimeout(g.__musicboxSave);
  g.__musicboxSave = setTimeout(() => persist(db), 150);
  return result;
}
