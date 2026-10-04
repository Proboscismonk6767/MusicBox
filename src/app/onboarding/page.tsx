import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { data } from "@/lib/server/data";
import { userMini } from "@/lib/server/queries";
import { Onboarding } from "./Onboarding";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/signup");
  // A long, scrollable catalogue: the most-logged song from each album first (a broad,
  // recognisable spread), then the rest by popularity, capped so the page stays light.
  const { songs, artists, people, ratings } = await data.onboardingData(user.id);
  return <Onboarding user={userMini(user)} songs={songs} artists={artists} people={people} initialRatings={ratings} />;
}
