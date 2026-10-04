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
| `npm test` | Security test suite (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build && npm start` | Production build |
| `npm run seed` | Deletes `data/db.json` so the next request re-seeds |
| `npm run artwork` | Fetches real album covers from the iTunes Search API into `data/artwork.json`. Without it, generated covers are shown. |
| `npm run db:check` | Dry run of the Postgres migration. Loads your `data/db.json` into an embedded Postgres (PGlite, no account needed) and checks that nothing is dropped. |
| `npm run db:migrate` | Loads the data into a real Postgres (`DATABASE_URL`). The app does not read from it yet, see "Moving to production". |
| `npm run loadtest` | Hits a running server with a mix of pages. `npm run loadtest -- --url=http://localhost:3200 --users=50 --seconds=20`. Run it against `next start`, not `next dev`. |

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
- **Load test**: on a 4-core machine, one Node process served about 67 requests per second, with the load generator on the same machine. With 10 users the p95 was about 230 ms. With 50 users it was about 1.1 s, which is queueing, not a slow query. A CPU profile shows the time is spent in Next.js rendering and compression, not in one hot spot. More capacity means running more than one instance, which needs Postgres first.

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
      store.ts         Persistence adapter (JSON document → swap for Postgres)
      indexes.ts       In-memory secondary indexes, rebuilt after writes
      queries.ts       Read layer: song/artist/album/genre pages, feed, search, profiles, diary
      insights.ts      Recommendations, taste compatibility, stats, year in review
      metadata.ts      Provider selection, iTunes provider, importing songs and albums
      musicbrainz.ts   MusicBrainz + Cover Art Archive provider (rate limited, cached)
      catalogue-cache.ts, slot-limiter.ts   Disk cache and request spacing for provider calls
      history-import.ts, import-queue.ts    Spotify history import and its background lookups
      metrics.ts, monitoring.ts             Cookieless daily event counts, error reporting
      stats.ts         Aggregation table (song_stats) maintenance
      auth.ts          Sessions (httpOnly cookie, scrypt passwords)
      ratelimit.ts     Token-bucket rate limiting on every mutation
db/schema.sql          Postgres schema (v2): indexes, aggregation triggers, materialized views
scripts/               Postgres migration, load test, artwork fetchers
```

Key decisions:
- **Ratings, likes and logs are separate.** `ratings` holds your current opinion of a song, one per user and song. `diary_entries` records each individual listen, and a song can be logged as many times as you like. A like (heart) is a personal favourite and is independent of the star rating.
- **Aggregates are never computed per request.** `songStats` is updated each time a rating, like or log is written. In `schema.sql` the same job is done by triggers.
- **The metadata provider can be swapped.** UI code only talks to `metadataProvider` (MusicBrainz by default, iTunes as an option; any other catalogue can implement the same interface). Songs that aren't in the catalogue are imported, together with their album track list, when someone first opens them. No audio is stored; a preview player only appears when the provider supplies a preview URL.
- **Recommendations** combine several signals: user-to-user collaborative filtering (people you follow get a boost), your genre affinity and followed artists, with a mild penalty on popularity so the results aren't just the charts. Taste compatibility mixes the correlation of your shared ratings with how much your genre tastes overlap.
- **Moderation:** users can report reviews, comments, lists and users, and can block or mute others. Admins can remove content, suspend accounts and resolve reports at `/admin`.

## Moving to production

Status: the app still reads and writes `data/db.json`. The Postgres schema is ready and tested, but the app is not switched over.

1. **Done:** `db/schema.sql` (v2) applies cleanly. `npm run db:check` loads real data (678 songs and 1,637 diary entries in the author's copy) into an embedded Postgres with nothing dropped, and the stats triggers match the app's numbers.
2. **To do:** re-implement `store.ts` and `queries.ts` with async SQL (Drizzle or Prisma). The data layer is synchronous in-memory code used across about 27 files, so this touches nearly every page. The query function signatures are the contract the UI depends on. Do it behind a feature flag, one area at a time (reads first, then writes).
3. **To do:** move sessions to Supabase Auth, Clerk or Auth.js (users have no email field yet, so email verification and password reset need this), and move the rate limiter to Redis or Upstash.
4. Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_CONTACT_EMAIL` at build time (see above).

## Not yet built

Email verification and password reset, Google and Apple sign-in, Last.fm import, song-vs-song comparisons, the taste graph, list collaborators, custom list artwork, and an in-app editor for song memories (memories can be added while logging and are shown on the review).
