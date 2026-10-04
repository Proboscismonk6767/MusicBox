import { NextResponse } from "next/server";
import { searchCatalogue } from "@/lib/server/metadata";
import { rateLimit } from "@/lib/server/ratelimit";
import { getSessionUser } from "@/lib/server/auth";
import { ipFromHeaders } from "@/lib/server/security";

// Proxies the external catalogue. Rate-limited per user/IP; results are cached
// and de-duplicated in metadata.ts, and a global outbound budget applies.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const user = await getSessionUser();
  const key = user ? `user:${user.id}` : `ip:${ipFromHeaders(req.headers)}`;
  if (!rateLimit(`catalogue:${key}`, user ? 30 : 10, user ? 0.5 : 0.1)) {
    return NextResponse.json({ error: "Too many searches. Slow down a little." }, { status: 429, headers: { "Retry-After": "10" } });
  }
  if (q.length < 2) return NextResponse.json({ tracks: [], artists: [], albums: [] });
  // `scope=quick` is autocomplete: songs only, so typing doesn't burn the provider's rate limit.
  const quick = new URL(req.url).searchParams.get("scope") === "quick";
  return NextResponse.json(await searchCatalogue(q, { quick }), { headers: { "Cache-Control": "private, max-age=300" } });
}
