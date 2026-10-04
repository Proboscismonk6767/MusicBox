import "server-only";
import { env } from "./env";

// Error reporting without an SDK. Every error becomes one structured JSON log
// line (what Datadog, Axiom, Loki or a platform log drain ingest), and, if
// ERROR_WEBHOOK_URL is set, is also POSTed there in a Slack-compatible shape
// ("text" plus fields), which also works with GlitchTip, Discord-via-proxy, etc.
//
// Privacy: only the error name, a trimmed message, the top of the stack and the
// route path (query string removed) are recorded. Never request bodies, headers,
// cookies, usernames or IP addresses.

const MAX_PER_MINUTE = 10;
const DEDUPE_MS = 5 * 60_000;

const g = globalThis as unknown as { __errSent?: Map<string, number>; __errWindow?: { at: number; n: number } };

export interface ErrorContext {
  /** Where it happened: a route path, "action:<name>" or "worker:<name>". */
  route?: string;
  kind?: string;
  digest?: string;
}

const stripQuery = (s?: string) => s?.split("?")[0].slice(0, 200);

export function reportError(err: unknown, where: ErrorContext = {}) {
  const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
  const entry = {
    level: "error",
    type: "error",
    at: new Date().toISOString(),
    name: e.name.slice(0, 80),
    message: e.message.slice(0, 300),
    route: stripQuery(where.route),
    kind: where.kind,
    digest: where.digest,
    stack: e.stack?.split("\n").slice(0, 8).join("\n").slice(0, 1500),
  };
  if (env().NODE_ENV !== "test") console.error(JSON.stringify(entry));

  const url = env().ERROR_WEBHOOK_URL;
  if (!url) return;

  // One report per distinct error per 5 minutes, and at most 10 a minute overall,
  // so an outage can't flood the channel (or become an outage of its own).
  const sent = (g.__errSent ??= new Map());
  const key = `${entry.name}|${entry.message}|${entry.route}`;
  const now = Date.now();
  if (now - (sent.get(key) ?? 0) < DEDUPE_MS) return;
  const win = g.__errWindow && now - g.__errWindow.at < 60_000 ? g.__errWindow : (g.__errWindow = { at: now, n: 0 });
  if (win.n >= MAX_PER_MINUTE) return;
  win.n++;
  if (sent.size > 500) sent.clear();
  sent.set(key, now);

  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: `[MusicBox] ${entry.name}: ${entry.message}${entry.route ? ` (${entry.route})` : ""}`, ...entry }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {
    /* reporting must never throw */
  });
}

export function resetMonitoringForTests() {
  g.__errSent = undefined;
  g.__errWindow = undefined;
}
