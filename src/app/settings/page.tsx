import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { SettingsForm } from "./SettingsForm";
import { isAdmin } from "@/lib/server/security";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const u = await getSessionUser();
  if (!u) redirect("/login?next=/settings");
  return <SettingsForm user={{ username: u.username, displayName: u.displayName, bio: u.bio, location: u.location ?? "", website: u.website ?? "", avatarHue: u.avatarHue, profileVisibility: u.profileVisibility }} isAdmin={isAdmin(u)} />;
}
