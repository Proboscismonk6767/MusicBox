import { NextResponse } from "next/server";
import { search } from "@/lib/server/queries";
import { getViewer } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { ipFromHeaders } from "@/lib/server/security";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const limit = Math.max(1, Math.min(20, Math.floor(Number(url.searchParams.get("limit"))) || 8));
  const viewer = await getViewer();
  const key = viewer ? `user:${viewer.id}` : `ip:${ipFromHeaders(req.headers)}`;
  if (!rateLimit(`search:${key}`, 60, 2)) return NextResponse.json({ error: "Too many searches." }, { status: 429, headers: { "Retry-After": "5" } });
  return NextResponse.json(search(q, limit, viewer?.id));
}
