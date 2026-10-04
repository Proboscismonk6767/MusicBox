import { getReview } from "@/lib/server/queries";
import { artDataUrl, brandCard, clip, renderCard } from "@/lib/server/og";

export const alt = "Review on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const data = getReview((await params).id);
  if (!data) return brandCard();
  const { review: r } = data;
  const stars = r.rating ? `${r.rating} / 5` : undefined;
  return renderCard({
    kicker: `${r.user.displayName}'s review`,
    title: r.song.title,
    // Never put spoilers in a preview.
    subtitle: r.review ? (r.hasSpoiler ? "Contains spoilers" : `“${clip(r.review, 110)}”`) : `${r.song.artists[0]?.name ?? ""}`,
    facts: [...(stars ? [stars] : []), r.song.artists[0]?.name ?? ""].filter(Boolean),
    palette: r.song.cover.palette,
    art: [await artDataUrl(r.song.cover.artworkUrl)],
  });
}
