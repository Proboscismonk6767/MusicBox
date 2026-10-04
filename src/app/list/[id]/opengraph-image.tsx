import { artDataUrl, brandCard, plural, renderCard } from "@/lib/server/og";
import { data } from "@/lib/server/data";

export const alt = "List on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const page = await data.getListPage((await params).id);
  if (!page) return brandCard();
  // Unlisted and private lists are never previewed with their contents.
  if (page.list.visibility !== "public") return brandCard();
  const covers = await Promise.all(page.card.covers.slice(0, 4).map((c) => artDataUrl(c.artworkUrl)));
  return renderCard({
    kicker: page.list.isRanked ? "Ranked list" : "List",
    title: page.list.title,
    subtitle: `by ${page.card.owner.displayName}`,
    facts: [plural(page.list.items.length, "song")],
    palette: page.card.covers[0]?.palette,
    art: covers.length >= 4 && covers.every(Boolean) ? covers : [covers[0] ?? null],
  });
}
