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

## All the music in the world

MusicBox treats Apple's catalogue (100M+ tracks) as its catalogue, and only stores what people actually open:

- Search and autocomplete show MusicBox results first, then **"From all music"**: songs, artists and albums from the iTunes Search API.
- Opening any of them goes through `/open/song|album|artist/itunes:<id>`, which imports the item (a whole album at a time) and redirects to its normal page. From then on it can be rated, logged, reviewed and listed like any other song.
- Artist pages list the artist's **full discography** from the catalogue. Any album opens the same way.

The iTunes Search API is free and needs no key, but Apple limits it to roughly 20 requests per minute per IP. For real traffic, swap `metadataProvider` in `src/lib/server/metadata.ts` for the Spotify Web API or a MusicBrainz mirror.

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
      metadata.ts      MetadataProvider interface + iTunes implementation + import
      stats.ts         Aggregation table (song_stats) maintenance
      auth.ts          Sessions (httpOnly cookie, scrypt passwords)
      ratelimit.ts     Token-bucket rate limiting on every mutation
db/schema.sql          Production Postgres schema: indexes, aggregation triggers, materialized views
```

Key decisions:
- **Ratings, likes and logs are separate.** `ratings` holds your current opinion of a song, one per user and song. `diary_entries` records each individual listen, and a song can be logged as many times as you like. A like (heart) is a personal favourite and is independent of the star rating.
- **Aggregates are never computed per request.** `songStats` is updated each time a rating, like or log is written. In `schema.sql` the same job is done by triggers.
- **The metadata provider can be swapped.** UI code only talks to `metadataProvider` (iTunes Search today; Spotify or MusicBrainz could implement the same interface). Songs that aren't in the catalogue are imported, together with their album track list, when someone first opens them. No audio is stored; a preview player only appears when the provider supplies a preview URL.
- **Recommendations** combine several signals: user-to-user collaborative filtering (people you follow get a boost), your genre affinity and followed artists, with a mild penalty on popularity so the results aren't just the charts. Taste compatibility mixes the correlation of your shared ratings with how much your genre tastes overlap.
- **Moderation:** users can report reviews, comments, lists and users, and can block or mute others. Admins can remove content, suspend accounts and resolve reports at `/admin`.

## Moving to production

1. Run `db/schema.sql` on Postgres or Supabase.
2. Re-implement `store.ts` and `queries.ts` with SQL, using Drizzle or Prisma. The query function signatures are the contract the UI depends on.
3. Move sessions to Supabase Auth or Clerk, and move the rate limiter to Redis or Upstash.
4. Set `NEXT_PUBLIC_SITE_URL` for canonical URLs and the sitemap.

## Not yet built

Spotify import (the settings page shows a placeholder), song-vs-song comparisons, the taste graph, list collaborators, custom list artwork, and an in-app editor for song memories (memories can be added while logging and are shown on the review).
