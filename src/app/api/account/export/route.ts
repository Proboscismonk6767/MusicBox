import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { exportUserData } from "@/lib/server/export";
import { rateLimit } from "@/lib/server/ratelimit";

// Signed-in users download their own data. Never cached or shared.
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to download your data." }, { status: 401, headers });
  if (!rateLimit(`export:${user.id}`, 3, 3 / 3600)) return NextResponse.json({ error: "You've downloaded your data a few times already. Try again in an hour." }, { status: 429, headers: { ...headers, "Retry-After": "1200" } });
  const data = exportUserData(user.id);
  if (!data) return NextResponse.json({ error: "Account not found." }, { status: 404, headers });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="musicbox-${user.username}-${day}.json"` },
  });
}
