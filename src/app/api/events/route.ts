import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server/csrf";
import { track } from "@/lib/server/metrics";
import { rateLimit } from "@/lib/server/ratelimit";
import { ipFromHeaders } from "@/lib/server/security";

// The only product event the browser reports (everything else is counted on the
// server where it happens): the share button was used. Anonymous, counted per
// day, nothing stored about who sent it.
const CLIENT_EVENTS = new Set(["share_clicked"]);

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new NextResponse(null, { status: 403 });
  if (!rateLimit(`events:${ipFromHeaders(req.headers)}`, 30, 0.5)) return new NextResponse(null, { status: 429 });
  let event: unknown;
  try {
    event = (JSON.parse((await req.text()).slice(0, 200)) as { event?: unknown }).event;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof event !== "string" || !CLIENT_EVENTS.has(event)) return new NextResponse(null, { status: 400 });
  track("share_clicked");
  return new NextResponse(null, { status: 204 });
}
