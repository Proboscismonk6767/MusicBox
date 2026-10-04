import { artDataUrl, brandCard, plural, renderCard } from "@/lib/server/og";
import { data } from "@/lib/server/data";

export const alt = "Album on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = await data.getAlbumPage((await params).slug);
  if (!page) return brandCard();
  return renderCard({
    kicker: "Album",
    title: page.album.title,
    subtitle: `${page.artist.name} · ${page.album.releaseDate.slice(0, 4)}`,
    facts: [plural(page.tracks.length, "track"), ...(page.avgTrack ? [`${page.avgTrack.toFixed(1)} avg track`] : [])],
    palette: page.album.palette,
    art: [await artDataUrl(page.album.artworkUrl)],
  });
}
