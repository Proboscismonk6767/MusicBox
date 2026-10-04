import { brandCard, plural, renderCard } from "@/lib/server/og";
import { data } from "@/lib/server/data";

export const alt = "Profile on MusicBox";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const p = await data.getProfile(decodeURIComponent((await params).username));
  if (!p) return brandCard();
  const hue = p.user.avatarHue;
  const palette: [string, string, string] = [`hsl(${hue} 45% 24%)`, `hsl(${hue} 55% 48%)`, "#0d0d0f"];
  // Private profiles share only a name, never counts or bio.
  if (!p.canView) return renderCard({ kicker: "MusicBox", title: p.user.displayName, subtitle: `@${p.user.username}`, palette, initial: p.user.displayName });
  return renderCard({
    kicker: "Music diary",
    title: p.user.displayName,
    subtitle: p.user.bio || `@${p.user.username}`,
    facts: [`${p.counts.logged.toLocaleString("en-US")} logged`, plural(p.counts.lists, "list"), plural(p.counts.followers, "follower")],
    palette,
    initial: p.user.displayName,
  });
}
