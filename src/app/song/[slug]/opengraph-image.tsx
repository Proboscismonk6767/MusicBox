import { getSongPage } from "@/lib/server/queries";
import { avg } from "@/lib/server/stats";
import { artDataUrl, brandCard, plural, renderCard } from "@/lib/server/og";

export const alt = "Song on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = getSongPage((await params).slug);
  if (!page) return brandCard();
  const n = page.stats?.ratingCount ?? 0;
  return renderCard({
    kicker: "Song",
    title: page.song.title,
    subtitle: `${page.artists.map((a) => a.name).join(", ")} · ${page.album.title}`,
    facts: n ? [`${avg(page.stats).toFixed(1)} / 5`, plural(n, "rating")] : ["Be the first to rate it"],
    palette: page.album.palette,
    art: [await artDataUrl(page.album.artworkUrl)],
  });
}
