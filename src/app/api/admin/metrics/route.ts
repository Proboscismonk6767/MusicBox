import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { metricsSnapshot } from "@/lib/server/metrics";
import { isAdmin } from "@/lib/server/security";

// Daily event counts for admins (signups, first logs, imports, shares…).
// Everyone else gets a plain 404 so the route doesn't advertise itself.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return new NextResponse(null, { status: 404 });
  const days = Math.min(120, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  return NextResponse.json({ days: metricsSnapshot(days) }, { headers: { "Cache-Control": "private, no-store" } });
}
