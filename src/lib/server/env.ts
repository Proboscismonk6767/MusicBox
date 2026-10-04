import "server-only";
import { z } from "zod";

// Server-side environment. Validated once at startup (instrumentation.ts) so
// production fails closed when configuration is incomplete.
//
// PUBLIC (shipped to the browser): NEXT_PUBLIC_SITE_URL
// SERVER-ONLY: everything else in this schema.

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  // Shown on the Terms, Privacy and Copyright pages (DMCA notices and data requests arrive here).
  NEXT_PUBLIC_CONTACT_EMAIL: z.string().email().optional(),
  // Set to "true" once a lawyer has reviewed /terms, /privacy and /copyright; removes the draft notice.
  NEXT_PUBLIC_LEGAL_REVIEWED: z.enum(["true", "false"]).optional(),
  // Writable, persistent directory for the JSON store (a mounted volume in production).
  DATA_DIR: z.string().min(1).optional(),
  // Data engine: "json" (default, single file in DATA_DIR) or "postgres".
  DATA_BACKEND: z.enum(["json", "postgres"]).optional(),
  // Postgres connection string. Required in production when DATA_BACKEND=postgres.
  // Without it, development uses an embedded Postgres (PGlite) stored in DATA_DIR.
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//).optional(),
  // Connections kept open to Postgres by each app instance. Keep instances x this below the server's max_connections.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).optional(),
  // How long (seconds) public, viewer-independent reads (trending, top rated, genres, similar songs) may be reused
  // before asking Postgres again. Default 30 in production, 0 (off) elsewhere. Only applies to DATA_BACKEND=postgres.
  READ_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).optional(),
  // Comma-separated usernames granted moderator/admin rights. The only source of admin in production.
  ADMIN_USERNAMES: z.string().optional(),
  // Header your proxy/platform sets with the real client IP (e.g. "x-real-ip", "cf-connecting-ip", "x-vercel-forwarded-for").
  CLIENT_IP_HEADER: z.string().regex(/^[a-z0-9-]+$/i).optional(),
  // Demo users with a shared, public password. Never allowed in production.
  SEED_DEMO_DATA: z.enum(["true", "false"]).optional(),
  // Optional: server errors are POSTed here as JSON ({ text, ...fields }), e.g. a Slack-compatible webhook or GlitchTip.
  ERROR_WEBHOOK_URL: z.string().url().startsWith("https://").optional(),
  // Which catalogue answers searches and imports. Songs already imported keep working whichever you pick.
  METADATA_PROVIDER: z.enum(["musicbrainz", "itunes"]).optional(),
  // MusicBrainz API root. Point at your own mirror once traffic outgrows the public server.
  MUSICBRAINZ_URL: z.string().url().regex(/^(https:\/\/|http:\/\/localhost(:\d+)?\/)/).optional(),
  // How MusicBrainz can reach you (email or URL). Required by their API rules; sent in the User-Agent.
  MUSICBRAINZ_CONTACT: z.string().min(3).max(200).regex(/^[ -~]+$/).optional(),
  // Minimum gap between MusicBrainz requests. The public server allows 1/s; a private mirror can go lower.
  MUSICBRAINZ_MIN_INTERVAL_MS: z.coerce.number().int().min(0).max(10_000).optional(),
  // Lyrics API root (LRCLIB-compatible) for the "pin a lyric" picker.
  LRCLIB_URL: z.string().url().regex(/^(https:\/\/|http:\/\/localhost(:\d+)?\/?)/).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const missing: string[] = [];
    if (!e.NEXT_PUBLIC_SITE_URL) missing.push("NEXT_PUBLIC_SITE_URL");
    else if (!e.NEXT_PUBLIC_SITE_URL.startsWith("https://")) missing.push("NEXT_PUBLIC_SITE_URL (must be https)");
    if (!e.NEXT_PUBLIC_CONTACT_EMAIL) missing.push("NEXT_PUBLIC_CONTACT_EMAIL");
    if (!e.DATA_DIR) missing.push("DATA_DIR"); // still holds the catalogue cache, metrics and the import queue
    if (e.DATA_BACKEND === "postgres" && !e.DATABASE_URL) missing.push("DATABASE_URL");
    if (!e.CLIENT_IP_HEADER) missing.push("CLIENT_IP_HEADER");
    if ((e.METADATA_PROVIDER ?? "musicbrainz") === "musicbrainz" && !e.MUSICBRAINZ_CONTACT) missing.push("MUSICBRAINZ_CONTACT");
    if (e.SEED_DEMO_DATA === "true") missing.push("SEED_DEMO_DATA must not be true in production");
    if (missing.length) throw new Error(`Refusing to start in production. Fix: ${missing.join(", ")}`);
  }
  cached = e;
  return e;
}

export const metadataProviderName = () => env().METADATA_PROVIDER ?? "musicbrainz";

export const isProduction = () => env().NODE_ENV === "production";

/** Demo accounts (shared password) are only seeded outside production. */
export const demoDataEnabled = () => !isProduction() && env().SEED_DEMO_DATA !== "false";

export function adminUsernames(): Set<string> {
  return new Set((env().ADMIN_USERNAMES ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** Which engine holds the data. "json" is the original single-file store; "postgres" uses DATABASE_URL (or an embedded Postgres in development). */
export const backendName = (): "json" | "postgres" => env().DATA_BACKEND ?? "json";
