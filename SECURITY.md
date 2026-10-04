# MusicBox security notes

## Architecture (attack surface)

| Area | Implementation |
| --- | --- |
| Framework | Next.js 15 App Router (React 19, TypeScript), server components + Server Actions |
| Data | `DATA_BACKEND=json`: JSON document store (`DATA_DIR/db.json`, file mode 0600), single process. `DATA_BACKEND=postgres`: PostgreSQL (`DATABASE_URL`), every write one transaction |
| Auth | Username + password (scrypt N=2^17), opaque session token in an HttpOnly cookie; only the SHA-256 of the token is stored |
| Authorization | Session-derived identity; ownership, visibility and block checks in `src/app/actions.ts`; admin = `ADMIN_USERNAMES` (`isAdmin` in `src/lib/server/security.ts`) |
| External APIs | iTunes Search API (free, keyless) via `src/lib/server/metadata.ts` only |
| Uploads, payments, webhooks, email, AI | None |
| Secrets | None required. See `.env.example` |

## Controls

- **Validation:** every Server Action argument is checked with zod (`src/lib/server/validation.ts`). Strict schemas reject unknown keys, so `userId`, `role` and similar fields can't be mass-assigned.
- **CSRF:** Server Actions only accept same-origin POSTs (Next checks Origin against Host). The session cookie is `SameSite=Lax`. GET routes have no side effects, apart from `/open/*` catalogue imports, which require sign-in and are rate-limited.
- **Rate limits:** per user and action on every mutation; per IP for login, signup, search and imports. Login is limited per IP and per IP+account, so an attacker can't lock a real user out. All routes return 429 when limited.
- **External catalogue:** fixed HTTPS host (no SSRF), 6s timeout, 2 MB response cap, 10-minute cache with request de-duplication, and a global outbound budget of 20/min. Provider strings are length-capped, and provider URLs are restricted to Apple hosts.
- **Headers:** a per-request nonce CSP (`src/middleware.ts`, `src/lib/csp.ts`), HSTS (production), nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP and `frame-ancestors 'none'`. No `X-Powered-By`.
- **Privacy:** private and followers-only profiles are enforced in every listing and every action. Profile and query objects never include password hashes. Account deletion (Settings) removes all of the user's data.
- **Fail-closed production:** `src/instrumentation.ts` refuses to start without `NEXT_PUBLIC_SITE_URL` (https), `DATA_DIR` and `CLIENT_IP_HEADER` (and `DATABASE_URL` when `DATA_BACKEND=postgres`). Demo accounts are never seeded in production. A corrupt or old-version data file aborts startup instead of being reseeded.
- **Logging:** structured `type:"security"` JSON lines for logins, failed logins, rate limits, authorization denials and admin actions. Tokens, passwords and request bodies are never logged.

## Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run audit:prod
```

`tests/security.test.ts` runs the real Server Actions against a real temporary store (`npm test` for the JSON store, `npm run test:postgres` for Postgres). It covers authentication, IDOR, admin, validation, mass assignment, rate limits, XSS escaping, open redirects and account deletion.

## Reporting

Report vulnerabilities privately to the maintainers. Don't open public issues for them.
