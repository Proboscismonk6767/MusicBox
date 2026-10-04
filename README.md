# MusicBox

A social diary for songs. Log, rate, review, collect, rank and discover individual songs, and build up a record of your taste over time.

> Spotify records what was played. MusicBox records what it meant.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The database seeds itself on the first request with 22 albums (about 270 songs), 12 users, about 1,600 diary entries, reviews, lists, follows and comments.

**Demo login (development only):** `abtin` / `musicbox-demo`. Every seeded user uses this shared password. Demo users are **never** created in production. Admins come only from the `ADMIN_USERNAMES` environment variable in production.

**Production:** copy `.env.example` and set its variables; the server refuses to start without them. See [SECURITY.md](SECURITY.md).

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Test suite (Vitest) against the JSON store |
| `npm run test:postgres` | The same suite against an embedded Postgres. Add `TEST_DATABASE_URL=postgres://admin@host/postgres` to run it on a real server (one throwaway database per test file). |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build && npm start` | Production build |
| `npm run seed` | Deletes `data/db.json` so the next request re-seeds |
| `npm run artwork` | Fetches real album covers from the iTunes Search API into `data/artwork.json`. Without it, generated covers are shown. |
| `npm run db:check` | Dry run of the Postgres migration. Loads your `data/db.json` into an embedded Postgres (PGlite, no account needed) and checks that nothing is dropped. |
| `npm run db:migrate` | Copies `data/db.json` into a real Postgres (`DATABASE_URL`): applies the schema and migrations, loads everything in one transaction and verifies it. |
| `npm run loadtest` | Hits a running server with a mix of pages. `npm run loadtest -- --url=http://localhost:3200 --users=50 --seconds=20`. Run it against `next start`, not `next dev`. |
| `npm run e2e` | Browser walk-through of the main flows against a running server (needs `npm i --no-save playwright-core` and the demo data). |

## All the music in the world

MusicBox uses **MusicBrainz** (open music data) for songs, artists and albums, and the **Cover Art Archive** for artwork. It only stores what people actually open:

- Search and autocomplete show MusicBox results first, then **"From all music"**. Autocomplete only asks for songs, so a pause in typing costs one lookup, not three.
- Opening any result goes through `/open/song|album|artist/mb:<id>`, which imports the item (a whole album at a time) and redirects to its normal page. From then on it can be rated, logged, reviewed and listed like any other song.
- Artist pages list the artist's **full discography** from the catalogue. Any album opens the same way.
- Artwork comes from the Cover Art Archive. When an album has none, a generated cover is shown instead.

How it stays inside MusicBrainz's rules (1 request per second on the public server):

- Every answer is cached on disk (`data/catalogue-cache.json`) and survives restarts.
- A request limiter spaces outgoing calls apart and gives up instead of queueing forever (`slot-limiter.ts`).
- Page renders, such as an artist's discography, wait at most 1.5 seconds for a turn. If the catalogue is busy they show the page without it, and remember the failure for a minute so a crawler can't keep retrying.
- A `503` or `429` from MusicBrainz slows every later request down.

Songs imported earlier from iTunes keep working. Set `METADATA_PROVIDER=itunes` to use Apple's catalogue for new searches instead (about 20 requests per minute per IP). Beyond a small user base, point `MUSICBRAINZ_URL` at your own MusicBrainz mirror.

## Import, share and export

- **Spotify history import** (`/settings/import`): the extended streaming history ZIP is read in your browser. IP addresses and podcasts are never uploaded. Songs MusicBox already has become diary entries straight away. The rest are looked up in the background, most-played first, with progress and a Stop button.
- **Share images**: songs, albums, artists, reviews, lists, profiles and Year in Review each get an image for link previews. Private content only produces a plain brand card.
- **Download everything**: Settings, then Download everything, gives you your account data as JSON.
- **Legal pages**: `/terms`, `/privacy` and `/copyright` describe what the app really does. They show a "draft" notice until `NEXT_PUBLIC_LEGAL_REVIEWED=true`. Have a lawyer read them before launch.

## Running it in production

| Setting | Notes |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL` | Must be set **when you run `npm run build`**, not only when you start the server, because Next.js bakes `NEXT_PUBLIC_*` values into the build. The server refuses to start without them. |
| `MUSICBRAINZ_CONTACT` | MusicBrainz asks for a way to contact you. It is sent in the User-Agent. Required. |
| `ERROR_WEBHOOK_URL` | Optional. Server errors are POSTed as JSON (Slack-compatible). |

`.env.example` lists every setting.

- **Health check**: `GET /api/health` returns 200 only if the data store loads. Point an uptime monitor at it.
- **Metrics**: `GET /api/admin/metrics?days=30` (admins only) returns a count per event per day: `signup`, `login`, `log`, `first_log`, `follow`, `import_started`, `import_completed`, `share_clicked`. It is cookieless and stores no user ids or IPs.
- **Load test** (4-core machine, load generator and database on the same machine):

  | Backend | Requests/s per instance | p95 at 10 users | p95 at 50 users |
  | --- | --- | --- | --- |
  | JSON store | about 67 | about 230 ms | about 1.1 s |
  | Postgres 16 | about 31 | about 580 ms | about 2.9 s |

  Postgres is slower per instance because each page makes 10 to 40 small queries instead of reading memory (no single query takes more than 6 ms). What it buys is that you can run as many instances as you need behind a load balancer, and the data no longer has to fit in one process's memory. Profile before optimising: the next steps would be fewer round trips on the song and artist pages, and a CDN cache for signed-out pages.

## Using Postgres

1. Create a database (Postgres 14 or newer; the `pg_trgm` and `citext` extensions must be available, as they are on Supabase, Neon, RDS and Cloud SQL).
2. Set `DATA_BACKEND=postgres` and `DATABASE_URL` (add `?sslmode=require` for managed databases). On first start the app applies `db/schema.sql` and `db/migrations/`, and seeds the catalogue if the database is empty.
3. To bring existing data across, stop the app, run `npm run db:check` (dry run), then `DATABASE_URL=... npm run db:migrate`, then start the app with `DATA_BACKEND=postgres`.
4. Back up with `pg_dump` (or your provider's snapshots), and restore one at least once to prove it works.

Without `DATABASE_URL`, development uses an embedded Postgres stored in `DATA_DIR/pglite`, so you can try it with no install.

Still per instance, even on Postgres (move these before running several instances): the rate limiter (memory; use Redis or Upstash), the Spotify import queue and the daily metrics (files in `DATA_DIR`), and the catalogue cache (a file; harmless if each instance has its own).

How the two backends are kept identical: every read and write goes through `src/lib/server/data.ts`. The JSON store (`queries.ts`, `commands-json.ts`) is the reference, and `tests/sql-parity.test.ts` and `tests/sql-writes-parity.test.ts` load the same data into both and compare every read, for many kinds of viewer, and the result of a 175-step write scenario, table by table. `tests/sql-concurrency.test.ts` checks parallel writes on Postgres. `tests/architecture.test.ts` fails if code outside the JSON backend touches the JSON store directly.

## Typography

Letterboxd uses **Graphik** (Commercial Type), a paid font. The CSS uses Graphik first: drop licensed `Graphik-Regular/Medium/Semibold/Bold.woff2` files into `public/fonts/`, or have it installed locally. Otherwise it falls back to Hanken Grotesk, the closest free match.

## Architecture

```
src/
  app/                 Next.js App Router pages (server components) + actions.ts (all mutations)
  components/          Design system + interactive client components
  lib/
    types.ts           Domain model (mirrors db/schema.sql)
    views.ts           View models passed to the UI
    seed/              Catalogue, community and deterministic seed generator
    server/
      data.ts          The only door to the data: data.<read>() and commands.<write>(), engine chosen by DATA_BACKEND
      algorithms.ts    Ranking maths shared by both engines (compatibility, recommendations, stats, search scoring)
      store.ts, indexes.ts                  JSON engine: the document and its in-memory indexes
      queries.ts, insights.ts, commands-json.ts   JSON engine: reads and writes (the reference implementation)
      sql/             Postgres engine: driver (pg / PGlite), schema runner, reads, commands, importer
      metadata.ts      Provider selection, iTunes provider, importing songs and albums
      musicbrainz.ts   MusicBrainz + Cover Art Archive provider (rate limited, cached)
      catalogue-cache.ts, slot-limiter.ts   Disk cache and request spacing for provider calls
      history-import.ts, import-queue.ts    Spotify history import and its background lookups
      metrics.ts, monitoring.ts             Cookieless daily event counts, error reporting
      stats.ts         Aggregation table (song_stats) maintenance
      auth.ts          Sessions (httpOnly cookie, scrypt passwords)
      ratelimit.ts     Token-bucket rate limiting on every mutation
db/schema.sql          Postgres baseline schema: indexes, aggregation triggers
db/migrations/         Numbered changes applied after the baseline
scripts/               Postgres migration, load test, artwork fetchers
```

Key decisions:
- **Ratings, likes and logs are separate.** `ratings` holds your current opinion of a song, one per user and song. `diary_entries` records each individual listen, and a song can be logged as many times as you like. A like (heart) is a personal favourite and is independent of the star rating.
- **Aggregates are never computed per request.** `songStats` is updated each time a rating, like or log is written. In Postgres the same job is done by triggers, which lock the song's row so simultaneous writes can't lose a count.
- **The metadata provider can be swapped.** UI code only talks to `metadataProvider` (MusicBrainz by default, iTunes as an option; any other catalogue can implement the same interface). Songs that aren't in the catalogue are imported, together with their album track list, when someone first opens them. No audio is stored; a preview player only appears when the provider supplies a preview URL.
- **Recommendations** combine several signals: user-to-user collaborative filtering (people you follow get a boost), your genre affinity and followed artists, with a mild penalty on popularity so the results aren't just the charts. Taste compatibility mixes the correlation of your shared ratings with how much your genre tastes overlap.
- **Moderation:** users can report reviews, comments, lists and users, and can block or mute others. Admins can remove content, suspend accounts and resolve reports at `/admin`.

## Moving to production

1. **Done:** Postgres backend (see "Using Postgres"). Run it with `DATA_BACKEND=postgres`; the JSON store stays available for small single-server setups and as the reference in tests.
2. **To do:** move sessions to Supabase Auth, Clerk or Auth.js (users have no email field yet, so email verification and password reset need this), and move the rate limiter, import queue and metrics out of the instance (Redis or Postgres tables).
3. Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_CONTACT_EMAIL` at build time (see above).

## Not yet built

Email verification and password reset, Google and Apple sign-in, Last.fm import, song-vs-song comparisons, the taste graph, list collaborators, custom list artwork, and an in-app editor for song memories (memories can be added while logging and are shown on the review).
