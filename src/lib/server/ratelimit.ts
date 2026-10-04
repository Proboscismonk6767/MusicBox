import "server-only";

// Token-bucket rate limiter keyed by caller-chosen keys (user id, IP, action).
// In-memory: correct for a single instance. For multiple instances move this to
// Redis/Upstash (see SECURITY.md) — the call sites don't change.

const buckets = new Map<string, { tokens: number; at: number }>();
let lastSweep = Date.now();

export function rateLimit(key: string, capacity = 30, refillPerSec = 0.5): boolean {
  const now = Date.now();
  if (now - lastSweep > 60_000 || buckets.size > 50_000) sweep(now);
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * refillPerSec);
  b.at = now;
  buckets.set(key, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

/** Drop buckets that have fully refilled (bounded memory). */
function sweep(now: number) {
  lastSweep = now;
  for (const [k, b] of buckets) if (now - b.at > 15 * 60_000) buckets.delete(k);
  if (buckets.size > 50_000) buckets.clear();
}

export function resetRateLimits() {
  buckets.clear();
}
