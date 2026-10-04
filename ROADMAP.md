# MusicBox Roadmap: from demo to massive

_Written 2026-10-04 against the current codebase (~9k lines, Next.js 15, JSON-file store, iTunes Search for catalogue)._

## The bet

> Spotify records what was played. MusicBox records what it meant.

Letterboxd didn't win by having a bigger film database than IMDb. It won because **logging is a habit, profiles are identity, and a year of diary entries is something you can't take elsewhere.** MusicBox's moat is the same: the diary and the social graph, not the catalogue. Every phase below serves one of three things:

1. **Get people in with their history already there** (no cold-start).
2. **Make logging a habit** (a reason to come back weekly).
3. **Make every profile a billboard** (sharing brings in the next user).

The product surface is already wide: diary, ratings, reviews, lists, follows, recommendations, taste compatibility, year in review, moderation. **What's missing is not features. It's a foundation that can survive traffic, and a way for strangers to arrive and stay.** So the order is: foundation, then acquisition, then retention, then monetisation.

## Where you are today (honest assessment)

| Area | State | Why it matters |
| --- | --- | --- |
| Product breadth | Strong | Diary, reviews, lists, stats, compatibility, year in review all exist |
| Persistence | `data/db.json` with in-memory indexes rebuilt after writes | Fine for a demo; breaks at a few hundred users (single process, whole-file writes, no concurrency) |
| Catalogue | iTunes Search API, ~20 req/min per IP, imports on open | One busy minute exhausts the quota. This is the first thing that breaks |
| Auth | Home-grown sessions + scrypt | Works, but no email verification, password reset, OAuth, or 2FA |
| Onboarding | Taste picker; Spotify import is a placeholder | No imported history means empty profiles and no reason to stay |
| Distribution | Web only, share card for year in review | No mobile app, no embeds, no per-page OG images |
| Ops | CI + dependabot + security tests; no monitoring, backups or analytics | You can't grow what you can't see |
| Legal/ToS | Unreviewed | Apple/Spotify API terms for a commercial app, music artwork usage, DMCA, GDPR |

## Phase 0: Foundation (weeks 0–4). "Don't fall over."

Nothing here is visible to users, and all of it blocks everything after. Do not run any acquisition until this is done.

- **Move to Postgres.** `db/schema.sql` already exists (indexes, aggregation triggers, materialised views). Re-implement `store.ts` and `queries.ts` behind the same function signatures, as the README plans. Use Supabase or Neon + Drizzle.
- **Replace the metadata provider.** Do this before launch, not after.
  - Use **MusicBrainz** (open, mirrorable) for IDs/credits and **Cover Art Archive** for artwork. Keep iTunes only as a fallback and for 30-second previews.
  - Cache every provider response in your own DB. Import on first open (already the model), but never hit the provider twice for the same ID.
  - Put a queue and a rate limiter in front of provider calls (see the Redis item below).
  - **Check current API terms** (Apple, Spotify, MusicBrainz) for a commercial service before depending on any of them. These terms change.
- **Auth that real people trust.** Email verification, password reset, "Sign in with Apple/Google", session management UI. Move to Clerk, Auth.js or Supabase Auth rather than maintaining crypto yourself.
- **Redis/Upstash** for rate limiting and the provider-call queue (README already flags this).
- **Observability.** Error tracking (Sentry), uptime checks, structured logs, a DB backup you've actually restored once.
- **Product analytics.** PostHog or similar. Define the events now: `signup`, `first_log`, `log`, `follow`, `share_clicked`, `import_completed`.
- **Legal basics.** Terms, privacy policy, DMCA agent, GDPR export/delete (account deletion exists; add data export), cookie consent.
- **Load test.** Script 1k concurrent browsers across feed, song page, search and log. Fix what falls over first.

**Exit criteria:** p95 page < 500 ms at 1k concurrent users; zero provider rate-limit errors in the load test; a restored backup; email verification live.

## Phase 1: Acquisition & the cold-start fix (weeks 4–12). "Arrive with your history."

**Timing hook:** today is early October. Wrapped season runs roughly November–December and everybody is primed to look at their music year. MusicBox already has Year in Review with a share card. **Ship the imports + a polished shareable year-in-review by late November** and you launch into the one moment when people want to talk about their listening.

- **History import (the single highest-leverage feature):**
  1. **Spotify "Extended streaming history" ZIP upload.** This is the GDPR data export, so it needs no API access and no approval. Parse it client-side or in a worker, match to catalogue, create diary entries with real timestamps.
  2. **Last.fm / ListenBrainz import** (open APIs, easy, a loyal audience of people who already track their music).
  3. Apple Music export if feasible.
  4. Spotify OAuth as a later nicety. Spotify has tightened API access for new apps, so don't build the strategy on it.
- **After import, don't dump 40k scrobbles into the diary.** Show "your top 50 songs of the year, rate them" so a profile is meaningful in five minutes. Keep raw plays as private background data for stats.
- **Every public page is a landing page:**
  - Per-page OpenGraph images (song, review, list, profile, year in review). Generated server-side with `next/og`.
  - Fast, indexable song/album/artist pages with structured data (`MusicRecording`, `MusicAlbum`, `Review`). Programmatic SEO is how Letterboxd and RYM get steady organic traffic: "[song] review", "[song] meaning", "best [artist] songs".
  - Make sitemap generation scale (sitemap index, chunked).
- **Share loops.** One-tap share of: a review card, a list, "my top 4 songs", year-in-review, weekly recap. Each links back with a signup prompt that preserves context ("see how your taste matches mine").
- **Taste-compatibility as the viral hook.** "You and @friend are 83% compatible" is inherently shareable and already built. Add an invite-a-friend link that pre-fills the comparison.
- **Embeds.** `<iframe>` / oEmbed for a review or list so music blogs and Substacks can embed them.
- **Seed the community deliberately.** Invite 50–100 music writers, playlist curators, small-label people and Discord/Reddit music community mods. Give them early lists/curator tools. Ten people who each bring 100 listeners beat paid ads.

**Exit criteria:** 30%+ of signups complete an import or log 5 songs in their first session; share-link click-through measured; first 1k real users with 100+ weekly actives.

## Phase 2: Retention & habit (weeks 12–24). "Make it a weekly ritual."

Day-30 retention matters more than signups. Letterboxd's loop is "I watched something, I log it." For songs the equivalent needs to be nearly frictionless.

- **Mobile first, not mobile later.** Music is consumed on phones.
  - First, make the PWA excellent: installable, offline-safe, 2-tap log.
  - Then a native app (Expo/React Native sharing your API and types). Add a share-sheet extension so "Share song → MusicBox" logs from Spotify/Apple Music/YouTube Music. This is the most important single mobile feature.
- **Frictionless logging:** a Spotify/Apple "now playing → log it" shortcut, iOS Shortcuts/Android intent, keyboard quick-log (`L`) on web, smart defaults (today, last rating).
- **Notifications that earn their place:** weekly recap ("you logged 14 songs; here's your top"), friend activity digest, new releases from artists you've logged, "a song you rated 5★ has 3 new reviews". Email + push, with a hard cap.
- **Release radar:** follow artists, get new-release alerts and a "new music Friday" feed ranked by your taste. This is a reason to open the app on a fixed day every week.
- **Social depth:** comment threads and replies, review likes with popularity ranking, @mentions, "diary activity from people you follow" tuned to be calm, not noisy.
- **Taste graph + comparisons** (listed as not yet built): song-vs-song, "rank your albums", head-to-head. Great for engagement and shareable.
- **Challenges & lists with momentum:** "log one new album a week", seasonal challenges, "decade bingo", collaborative lists (also in the not-yet-built list).
- **Recommendations v2:** move from SQL heuristics to embeddings/collaborative filtering once there's data, and measure it (click-through, saves, ratings of recommended songs).

**Exit criteria:** D30 retention ≥ 20%, weekly active / monthly active ≥ 40%, ≥ 30% of actives log at least weekly.

## Phase 3: Network effects & ecosystem (months 6–12)

- **Public API + developer program.** Third-party tools, Discord bots, "now playing" widgets, Raycast/Shortcuts integrations. Letterboxd's ecosystem is a big part of its stickiness.
- **Artist and label accounts (free).** Verified pages, official lists, pre-save/"log this" links, an analytics view. Artists will promote the page for free, and each one brings their audience.
- **Critics and curators.** Verified-curator badges, newsletters, publication partnerships. The "MusicBox says" layer that sets cultural conversation (annual best-of lists, a MusicBox 100).
- **Events and live shows:** log concerts and festivals (Songkick/Bandsintown data), "who I saw" stats.
- **Cross-service identity:** one-click link of Spotify/Apple/Last.fm/YouTube Music for live "now playing" and "open in…" buttons.
- **Internationalisation:** the catalogue is global; the UI isn't. Localise the top 5–8 markets, and use region-aware charts and lists.
- **Trust & safety at scale:** automated moderation triage, appeals, spam/brigading detection (review bombing is the failure mode for rating sites), moderator tooling beyond `/admin`.

## Phase 4: Sustainable business (start testing at ~50k MAU; don't force it earlier)

Don't monetise until the habit exists. Ranked by fit with the product:

1. **MusicBox Pro subscription** (~$20–30/yr): advanced stats and history, unlimited lists, private lists, import history storage, custom profile themes, data export, year-in-review extras, no ads. This is Letterboxd's proven model.
2. **Artist/label tools:** paid analytics, promoted discovery slots clearly labelled, pre-release listening-party features.
3. **Affiliate / "listen on" links** (streaming, vinyl, tickets, Bandcamp). Low-friction and aligned with intent.
4. **Data and insights products** (aggregated, anonymised, privacy-first) for labels/press. Handle with great care, and only if the privacy policy and users' expectations support it.
5. **Avoid:** audio-ad-style monetisation, selling individual-level data, or pay-to-rank. Any of these would break the "this is the honest taste record" promise.

## Cross-cutting principles

- **Own your data model, rent your catalogue.** Cached, normalised catalogue IDs mean you can swap providers without losing diaries.
- **Never lose a diary.** Exports (CSV/JSON), backups and an easy way out build trust, and trust is the product.
- **Protect the social layer early.** Block/mute/report exist, and that's a strong start. Moderation cost grows with users, so budget for it before you need it.
- **Measure one number per phase:** Phase 0 p95 latency, Phase 1 signup→first-log rate, Phase 2 D30 retention, Phase 3 weekly shares/embeds, Phase 4 free→Pro conversion.
- **Stay opinionated.** Songs, not just albums, and meaning, not plays. Every feature should reinforce "diary of what a song meant to you."

## Risks to watch

| Risk | Mitigation |
| --- | --- |
| Provider API terms or rate limits change | Cache aggressively, abstract behind `metadataProvider`, prefer open sources (MusicBrainz, Cover Art Archive) |
| Cold-start empty-profile churn | History import + auto-generated "top songs to rate" |
| Spotify/Apple clone the feature | Their moat is playback; yours is a neutral cross-service diary and community. Stay cross-platform and independent |
| Review-bombing, spam, harassment | Rate limits, verified-email requirement, report tooling, weighted ratings, moderator program |
| Copyright / artwork claims | Use licensed/open artwork sources, DMCA process, don't host audio |
| Founder bandwidth | Phase 0 is the only mandatory big-bang rewrite. Everything after ships incrementally behind feature flags |

## The next 10 things to do

1. Stand up Postgres and port `store.ts`/`queries.ts` (feature-flag it).
2. Swap the primary catalogue to MusicBrainz + Cover Art Archive with a persistent cache and queue.
3. Add email verification, password reset, and Apple/Google sign-in.
4. Add Sentry, uptime monitoring, PostHog and a tested backup.
5. Write Terms, Privacy and a DMCA policy.
6. Build the Spotify extended-history ZIP importer, then Last.fm.
7. Add per-page OG images and make Year in Review beautiful and one-tap shareable (target: live by late November).
8. Run a load test and fix the top three bottlenecks.
9. Recruit the first 50–100 music writers/curators privately.
10. Launch publicly with a Wrapped-season campaign: "Your year in songs, and what they meant."
