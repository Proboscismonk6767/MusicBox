import { NextResponse } from "next/server";

// Superseded by /api/search/catalogue. Kept as an explicit 410 instead of a
// second unthrottled proxy to the external catalogue.
export function GET() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}
