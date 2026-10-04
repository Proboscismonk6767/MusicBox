import { artDataUrl, brandCard, plural, renderCard } from "@/lib/server/og";
import { data } from "@/lib/server/data";

export const alt = "Artist on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = await data.getArtistPage((await params).slug);
  if (!page) return brandCard();
  const cover = page.albums.find((a) => a.cover.artworkUrl)?.cover;
  return renderCard({
    kicker: "Artist",
    title: page.artist.name,
    subtitle: page.artist.genres.slice(0, 3).join(" · ") || undefined,
    facts: [plural(page.cards.length, "song"), ...(page.ratingCount ? [`${page.avg.toFixed(1)} / 5 from ${plural(page.ratingCount, "rating")}`] : [])],
    palette: [`hsl(${page.artist.hue} 40% 22%)`, `hsl(${page.artist.hue} 50% 45%)`, "#0d0d0f"],
    art: [await artDataUrl(page.artist.imageUrl ?? cover?.artworkUrl)],
    round: !!page.artist.imageUrl,
  });
}
