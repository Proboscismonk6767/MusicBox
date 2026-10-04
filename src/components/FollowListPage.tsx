import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { Avatar, EmptyState } from "./ui";
import { FollowButton } from "./social";
import { data } from "@/lib/server/data";

export async function FollowListPage({ username, kind }: { username: string; kind: "followers" | "following" }) {
  const viewer = await getViewer();
  const p = await data.getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const users = await data.getFollowList(p.raw, kind, viewer?.id);
  return (
    <div className="max-w-2xl">
      <div className="flex gap-4 mb-4 text-sm">
        <Link href={`/${p.user.username}/followers`} className={kind === "followers" ? "text-fg font-medium" : "text-muted hover:text-fg"}>Followers {p.counts.followers}</Link>
        <Link href={`/${p.user.username}/following`} className={kind === "following" ? "text-fg font-medium" : "text-muted hover:text-fg"}>Following {p.counts.following}</Link>
      </div>
      {users.length ? users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 py-3 border-b border-line-soft">
          <Link href={`/${u.username}`}><Avatar user={u} size={42} /></Link>
          <div className="min-w-0 flex-1">
            <Link href={`/${u.username}`} className="font-medium hover:text-accent">{u.displayName}</Link>
            <div className="text-xs text-muted">@{u.username} · {u.logged} logged</div>
            {u.bio && <p className="text-xs text-muted truncate mt-0.5">{u.bio}</p>}
          </div>
          {viewer && viewer.id !== u.id && <FollowButton userId={u.id} following={u.viewerFollows} size="sm" />}
        </div>
      )) : <EmptyState icon="user" title={kind === "followers" ? "No followers yet" : "Not following anyone yet"} body={kind === "following" ? "Following people shapes your feed and recommendations." : "Write a few reviews — people follow great taste."} />}
    </div>
  );
}
