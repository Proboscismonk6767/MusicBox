import "server-only";
import fs from "fs";
import path from "path";
import { backendName, demoDataEnabled, env } from "../env";
import { dataDir } from "../store";
import { generateSeed, appendMissingCatalogue } from "../../seed/generate";
import { emptyDB } from "../../seed/generate";
import { openPg, openPglite, type Db } from "./driver";
import { applySchema } from "./schema";
import { importDb } from "./import-db";
import { loadDb } from "./load-db";

// The app's database handle. DATABASE_URL → real Postgres. Otherwise an embedded
// Postgres (PGlite): in memory under tests, in DATA_DIR/pglite in development.
// The first caller opens it, brings the schema up to date and seeds an empty database.

const g = globalThis as unknown as { __mbSql?: Promise<Db> };

/** Arbitrary constant: serialises first-run seeding when several instances start at once. */
const SEED_LOCK = 724_501_001;

export function getDb(): Promise<Db> {
  if (backendName() !== "postgres") throw new Error("getDb() called but DATA_BACKEND is not postgres");
  const open = (g.__mbSql ??= (async () => {
    const e = env();
    const db = e.DATABASE_URL ? await openPg(e.DATABASE_URL) : await openPglite(e.NODE_ENV === "test" ? undefined : path.join(dataDir(), "pglite"));
    try {
      await bootstrap(db);
    } catch (err) {
      await db.close().catch(() => {});
      throw err;
    }
    return db;
  })());
  open.catch(() => { g.__mbSql = undefined; }); // a failed start can be retried
  return open;
}

/** Tests: close the handle so the next call starts from an empty database. */
export async function resetDb(): Promise<void> {
  const open = g.__mbSql;
  g.__mbSql = undefined;
  if (open) await (await open.catch(() => null))?.close();
}

export async function bootstrap(db: Db): Promise<void> {
  await applySchema(db);
  // First run: load the seed catalogue (and the demo community outside production).
  await db.tx(async (q) => {
    await q.query("select pg_advisory_xact_lock($1)", [SEED_LOCK]);
    const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from songs");
    if (n === 0) await importDb(generateSeed({ demo: demoDataEnabled() }), q);
  });
  await addMissingSeedCatalogue(db);
  await applyArtworkOverlay(db);
}

/** New artists added to the seed catalogue since this database was created appear on the next start. */
async function addMissingSeedCatalogue(db: Db): Promise<void> {
  const known = emptyDB();
  known.artists = (await db.query("select id, slug, name, genres, hue from artists")).map((r) => ({ id: r.id as string, slug: r.slug as string, name: r.name as string, genres: r.genres as string[], hue: r.hue as number }));
  known.albums = (await db.query("select id, slug from albums")).map((r) => ({ id: r.id as string, slug: r.slug as string })) as never;
  known.songs = (await db.query("select id, slug from songs")).map((r) => ({ id: r.id as string, slug: r.slug as string })) as never;
  const before = { artists: known.artists.length, albums: known.albums.length, songs: known.songs.length };
  if (!appendMissingCatalogue(known)) return;
  const fresh = emptyDB();
  fresh.artists = known.artists.slice(before.artists);
  fresh.albums = known.albums.slice(before.albums);
  fresh.songs = known.songs.slice(before.songs);
  await db.tx(async (q) => { await importDb(fresh, q); });
}

/** Seed albums get their artwork, and artists their photos, from files shipped with the app (the same overlay the JSON store applies). */
async function applyArtworkOverlay(db: Db): Promise<void> {
  const artists = await db.query<{ id: string; slug: string; image_url: string | null }>("select id, slug, image_url from artists");
  const albums = await db.query<{ slug: string; artist_id: string; external_id: string | null; artwork_url: string | null }>("select slug, artist_id, external_id, artwork_url from albums");
  let art: Record<string, { album?: string; artist?: string }> = {};
  try { art = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "artwork.json"), "utf8")); } catch { /* optional */ }
  const photoDir = path.join(process.cwd(), "public", "artists");
  const albumBySlug = new Map(albums.map((a) => [a.slug, a]));

  await db.tx(async (q) => {
    for (const al of albums) {
      if (al.external_id) continue;
      const want = art[al.slug]?.album ?? null;
      if (want !== al.artwork_url) await q.query("update albums set artwork_url = $1 where slug = $2", [want, al.slug]);
    }
    for (const ar of artists) {
      let want = ar.image_url;
      const have = fs.existsSync(path.join(photoDir, `${ar.slug}.jpg`));
      if (!want && have) want = `/artists/${ar.slug}.jpg`;
      else if (want?.startsWith("/artists/") && !have) want = null; // the photo was removed
      if (!want) {
        const hit = Object.entries(art).find(([slug, v]) => v.artist && albumBySlug.get(slug)?.artist_id === ar.id);
        if (hit) want = hit[1].artist ?? null;
      }
      if (want !== ar.image_url) await q.query("update artists set image_url = $1 where id = $2", [want, ar.id]);
    }
  });
}

export { loadDb };
