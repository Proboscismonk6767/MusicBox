// Simple load test: npm run loadtest -- --url=http://localhost:3200 --users=50 --seconds=20
// Hits a mix of public pages and reports p50/p95/p99 and error counts per route.
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const base = arg("url", "http://localhost:3200").replace(/\/$/, "");
const users = Number(arg("users", 50));
const seconds = Number(arg("seconds", 20));

async function discover() {
  // Take real URLs from the sitemap so the test follows whatever data exists.
  const xml = await (await fetch(base + "/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  const pick = (prefix, n) => paths.filter((p) => p.startsWith(prefix)).slice(0, n);
  return [
    "/",
    "/discover",
    "/lists",
    "/search?q=love",
    ...pick("/song/", 6),
    ...pick("/album/", 4),
    ...pick("/artist/", 4),
    ...pick("/list/", 2),
  ];
}

const routes = await discover();
console.log(`Testing ${base} with ${users} users for ${seconds}s across ${routes.length} routes`);
const stats = new Map();
const record = (route, ms, ok) => {
  const s = stats.get(route) ?? { times: [], errors: 0 };
  s.times.push(ms);
  if (!ok) s.errors++;
  stats.set(route, s);
};
const end = Date.now() + seconds * 1000;
async function worker() {
  while (Date.now() < end) {
    const route = routes[Math.floor(Math.random() * routes.length)];
    const t = performance.now();
    try {
      const res = await fetch(base + route);
      await res.arrayBuffer();
      record(route, performance.now() - t, res.status < 400);
    } catch {
      record(route, performance.now() - t, false);
    }
  }
}
await Promise.all(Array.from({ length: users }, worker));

const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const all = [];
let errors = 0;
console.log("\nroute".padEnd(42), "n".padStart(6), "p50".padStart(7), "p95".padStart(7), "err".padStart(5));
for (const [route, s] of [...stats].sort()) {
  const t = s.times.sort((a, b) => a - b);
  all.push(...t);
  errors += s.errors;
  console.log(route.slice(0, 40).padEnd(42), String(t.length).padStart(6), q(t, 0.5).toFixed(0).padStart(7), q(t, 0.95).toFixed(0).padStart(7), String(s.errors).padStart(5));
}
all.sort((a, b) => a - b);
console.log(`\nTotal ${all.length} requests, ${(all.length / seconds).toFixed(0)} req/s, p50 ${q(all, 0.5).toFixed(0)}ms, p95 ${q(all, 0.95).toFixed(0)}ms, p99 ${q(all, 0.99).toFixed(0)}ms, errors ${errors}`);
process.exit(errors > all.length * 0.01 || q(all, 0.95) > 500 ? 1 : 0);
