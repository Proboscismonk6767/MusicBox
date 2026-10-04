import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { getFeed } from "@/lib/server/queries";
import { rateLimit } from "@/lib/server/ratelimit";

export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
  if (!rateLimit(`feed:${viewer.id}`, 30, 1)) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "5" } });
  const raw = new URL(req.url).searchParams.get("before");
  const before = raw && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw) ? raw : undefined;
  return NextResponse.json(getFeed(viewer.id, before));
}
