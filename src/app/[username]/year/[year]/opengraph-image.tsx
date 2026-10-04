import { getProfile } from "@/lib/server/queries";
import { yearInReview } from "@/lib/server/insights";
import { artDataUrl, brandCard, plural, renderCard } from "@/lib/server/og";

export const alt = "Year in music on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ username: string; year: string }> }) {
  const { username, year: ys } = await params;
  const year = Number(ys);
  const p = getProfile(decodeURIComponent(username));
  if (!p || !p.canView || !Number.isInteger(year)) return brandCard();
  const y = yearInReview(p.raw.id, year);
  if (!y.logged) return brandCard();
  const top = y.topSongs[0];
  return renderCard({
    kicker: "Year in music",
    title: `${p.user.displayName.split(" ")[0]}'s ${year}`,
    subtitle: top ? `Most replayed: ${top.song.title} · ${top.song.artists[0]?.name ?? ""}` : undefined,
    facts: [plural(y.logged, "song") + " logged", plural(y.unique, "unique song"), plural(y.artists, "artist")],
    palette: top?.song.cover.palette,
    art: [await artDataUrl(top?.song.cover.artworkUrl)],
  });
}
