import "server-only";
import fs from "fs";
import path from "path";
import { dataDir } from "./store";
import { env } from "./env";

// Product metrics, first-party and cookieless: a count per event per day, and
// nothing else. No user ids, no IPs, no events tied to a person, so there is
// nothing to consent to and nothing to delete. It answers the questions the
// roadmap needs: signups per day, how many of them log a first song, how many
// imports finish, how often people share.

export const EVENTS = ["signup", "login", "log", "first_log", "follow", "import_started", "import_completed", "share_clicked"] as const;
export type MetricEvent = (typeof EVENTS)[number];

const KEEP_DAYS = 120;
const g = globalThis as unknown as { __metrics?: Record<string, Partial<Record<MetricEvent, number>>>; __metricsFlush?: NodeJS.Timeout };
const file = () => path.join(dataDir(), "metrics.json");
const persistent = () => env().NODE_ENV !== "test";
const today = () => new Date().toISOString().slice(0, 10);

function store() {
  if (g.__metrics) return g.__metrics;
  let m: Record<string, Partial<Record<MetricEvent, number>>> = {};
  if (persistent()) {
    try {
      m = JSON.parse(fs.readFileSync(file(), "utf8"));
    } catch {
      /* first run */
    }
  }
  return (g.__metrics = m);
}

/** Count one event. Never throws: metrics must not be able to break a request. */
export function track(event: MetricEvent, n = 1) {
  try {
    const m = store();
    const day = (m[today()] ??= {});
    day[event] = (day[event] ?? 0) + n;
    const days = Object.keys(m).sort();
    for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete m[d];
    if (!persistent() || g.__metricsFlush) return;
    g.__metricsFlush = setTimeout(() => {
      g.__metricsFlush = undefined;
      try {
        fs.mkdirSync(dataDir(), { recursive: true });
        const tmp = file() + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(store()));
        fs.renameSync(tmp, file());
      } catch {
        /* best effort */
      }
    }, 5000);
    g.__metricsFlush.unref?.();
  } catch {
    /* ignore */
  }
}

/** Per-day counts for the last `days` days, oldest first. */
export function metricsSnapshot(days = 30) {
  const m = store();
  return Object.keys(m)
    .sort()
    .slice(-days)
    .map((date) => ({ date, ...m[date] }));
}

export function resetMetricsForTests() {
  g.__metrics = {};
}
