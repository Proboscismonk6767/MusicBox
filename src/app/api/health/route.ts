import { NextResponse } from "next/server";
import { idx } from "@/lib/server/indexes";

// For uptime monitors and load balancers. Answers 200 only if the data store
// loads. Reveals nothing about the data, so it's safe to leave public.
export const dynamic = "force-dynamic";

export function GET() {
  try {
    if (!idx().db) throw new Error("no store"); // touches the store: a corrupt or unreadable one throws
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
