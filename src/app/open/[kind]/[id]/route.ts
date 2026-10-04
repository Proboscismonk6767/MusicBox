import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importAlbum, importArtist, importTrack, MetadataError } from "@/lib/server/metadata";
import { rateLimit } from "@/lib/server/ratelimit";
import { getSessionUser } from "@/lib/server/auth";
import { ipFromHeaders, securityLog } from "@/lib/server/security";
import { EXTERNAL_ID } from "@/lib/server/validation";

// Catalogue-on-demand: /open/song|album|artist/<provider>:<id> imports the item the
// first time it's opened, then redirects to its canonical page.
// Signed-in users only (imports write to the database and spend catalogue quota).
const KINDS = new Set(["song", "album", "artist"]);

export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id: raw } = await params;
  const url = new URL(req.url);
  let id: string;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return NextResponse.redirect(new URL("/search", url));
  }
  if (!KINDS.has(kind) || !EXTERNAL_ID.test(id)) return NextResponse.redirect(new URL("/search", url));

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/open/${kind}/${id}`)}`, url));

  const ip = ipFromHeaders(req.headers);
  if (!rateLimit(`open:user:${user.id}`, 20, 20 / 300) || !rateLimit(`open:ip:${ip}`, 40, 40 / 300)) {
    securityLog("ratelimit.exceeded", { action: "open", user: user.id, ip });
    return NextResponse.redirect(new URL("/search?error=busy", url));
  }
  try {
    const path =
      kind === "song" ? `/song/${await importTrack(id)}` :
      kind === "album" ? `/album/${await importAlbum(id)}` :
      `/artist/${await importArtist(id)}`;
    revalidatePath("/", "layout");
    return NextResponse.redirect(new URL(path, url));
  } catch (e) {
    if (!(e instanceof MetadataError)) console.error("[open]", e instanceof Error ? e.message : "unknown error");
    return NextResponse.redirect(new URL(`/search?error=${e instanceof MetadataError ? "unavailable" : "failed"}`, url));
  }
}
