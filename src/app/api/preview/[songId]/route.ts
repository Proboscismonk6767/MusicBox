import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { idx } from "@/lib/server/indexes";
import { rateLimit } from "@/lib/server/ratelimit";
import { ipFromHeaders } from "@/lib/server/security";
import { findPreviewUrl } from "@/lib/server/metadata";

// Resolves a song's 30-second preview clip (used by the pinned-lyric play button).
export async function GET(req: Request, { params }: { params: Promise<{ songId: string }> }) {
  const viewer = await getViewer();
  const key = viewer ? `user:${viewer.id}` : `ip:${ipFromHeaders(req.headers)}`;
  if (!rateLimit(`preview:${key}`, 20, 0.5)) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "5" } });
  const { songId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(songId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const i = idx();
  const song = i.song.get(songId);
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const url = await findPreviewUrl(song, i.artist.get(song.artistIds[0])?.name ?? "");
    return NextResponse.json({ url }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load the preview right now." }, { status: 502 });
  }
}
