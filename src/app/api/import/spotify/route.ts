import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/server/auth";
import { isSameOrigin } from "@/lib/server/csrf";
import { historyPayload, importHistory } from "@/lib/server/history-import";
import { rateLimit } from "@/lib/server/ratelimit";
import { securityLog } from "@/lib/server/security";

// Receives the already-aggregated track list the browser built from the user's
// Spotify export (never the export itself). 500 tracks is well under this cap.
const MAX_BYTES = 600_000;
const noStore = { "Cache-Control": "private, no-store" };

function tooMany(userId?: string) {
  if (userId) securityLog("ratelimit.exceeded", { action: "import", user: userId });
  return NextResponse.json({ error: "You've imported a few times already. Try again in an hour." }, { status: 429, headers: { ...noStore, "Retry-After": "1200" } });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to import your history." }, { status: 401, headers: noStore });
  // Loose limit on attempts of any kind; the strict one below only counts valid imports,
  // so a failed upload never uses up the user's real allowance.
  if (!rateLimit(`import-attempt:${user.id}`, 30, 30 / 3600)) return tooMany();
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "That import is too large." }, { status: 413, headers: noStore });
  const body = await req.text();
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "That import is too large." }, { status: 413, headers: noStore });

  const parsed = (() => {
    try {
      return historyPayload.safeParse(JSON.parse(body));
    } catch {
      return null;
    }
  })();
  if (!parsed?.success) return NextResponse.json({ error: "That wasn't in the expected format. Please try the import again." }, { status: 400, headers: noStore });

  if (!rateLimit(`import:${user.id}`, 3, 3 / 3600)) return tooMany(user.id);

  const result = importHistory(user.id, parsed.data.tracks);
  revalidatePath("/", "layout");
  return NextResponse.json(result, { headers: noStore });
}
