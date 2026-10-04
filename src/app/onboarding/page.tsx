import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { idx } from "@/lib/server/indexes";
import { songCard, suggestedUsers, userMini } from "@/lib/server/queries";
import { Onboarding } from "./Onboarding";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signup");
  const i = idx();
  // A long, scrollable catalogue: the most-logged song from each album first (a broad,
  // recognisable spread), then every remaining song ranked by popularity.
  const logs = (id: string) => i.db.songStats[id]?.logCount ?? 0;
  const top = i.db.albums
    .map((al) => [...(i.songsByAlbum.get(al.id) ?? [])].sort((a, b) => logs(b.id) - logs(a.id))[0])
    .filter(Boolean)
    .sort((a, b) => logs(b.id) - logs(a.id));
  const topIds = new Set(top.map((s) => s.id));
  const rest = i.db.songs.filter((s) => !topIds.has(s.id)).sort((a, b) => logs(b.id) - logs(a.id));
  const songs = [...top, ...rest].map((s) => songCard(i, s));
  const artists = i.db.artists.map((a) => ({ id: a.id, name: a.name, slug: a.slug, imageUrl: a.imageUrl, hue: a.hue }));
  const people = suggestedUsers(user.id, 8).map((u) => ({ ...u, logged: i.entriesByUser.get(u.id)?.length ?? 0 }));
  const ratings = Object.fromEntries([...(i.ratingsByUser.get(user.id)?.values() ?? [])].map((r) => [r.songId, r.rating]));
  return <Onboarding user={userMini(user)} songs={songs} artists={artists} people={people} initialRatings={ratings} />;
}
