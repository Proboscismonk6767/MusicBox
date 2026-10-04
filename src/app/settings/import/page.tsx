import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { ImportClient } from "./ImportClient";

export const metadata = { title: "Import your listening history" };

export default async function ImportPage() {
  const u = await getSessionUser();
  if (!u) redirect("/login?next=/settings/import");
  return (
    <div className="max-w-2xl">
      <Link href="/settings" className="text-xs text-muted hover:text-fg">← Settings</Link>
      <h1 className="display text-4xl mt-3 mb-2">Import your listening history</h1>
      <p className="text-muted mb-8">
        Start with your diary already filled in. We turn your Spotify history into one diary entry per song you actually play, with how many times you played it, so you can go back and rate the ones that mattered.
      </p>
      <ImportClient username={u.username} />
    </div>
  );
}
