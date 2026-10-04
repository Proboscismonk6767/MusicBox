import { NextResponse } from "next/server";
import { getViewer } from "@/lib/server/auth";
import { data } from "@/lib/server/data";
import { rateLimit } from "@/lib/server/ratelimit";
import { getLyrics } from "@/lib/server/lyrics";

// Lyrics for the "pin a lyric" picker. Signed-in users only: it proxies an external API.
export async function GET(_req: Request, { params }: { params: Promise<{ songId: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to pick lyrics." }, { status: 401 });
  if (!rateLimit(`lyrics:${viewer.id}`, 20, 0.5)) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "5" } });
  const { songId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(songId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const song = await data.songLite(songId);
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const result = await getLyrics({
      id: song.id, title: song.title, artist: song.artist, album: song.album, durationMs: song.durationMs,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load lyrics right now." }, { status: 502 });
  }
}
