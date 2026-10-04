import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getNotifications } from "@/lib/server/queries";
import { Artwork } from "@/components/Artwork";
import { Avatar, EmptyState, Icon } from "@/components/ui";
import { FollowButton } from "@/components/social";
import { timeAgo } from "@/lib/format";
import { MarkRead } from "./MarkRead";
import { idx } from "@/lib/server/indexes";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const COPY: Record<string, [string, string]> = {
  follow: ["started following you", "user"],
  review_like: ["liked your review of", "heart"],
  review_comment: ["commented on your review of", "chat"],
  list_like: ["liked your list", "heart"],
  list_comment: ["commented on your list", "chat"],
  comment_reply: ["replied to your comment on", "chat"],
  friend_reviewed: ["reviewed a song you rated:", "star"],
};

export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/notifications");
  const items = getNotifications(viewer.id);
  const following = idx().following.get(viewer.id) ?? new Set();
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-2xl">
      <div className="flex items-end justify-between mb-6">
        <h1 className="display text-4xl">Notifications</h1>
        {unread > 0 && <MarkRead />}
      </div>
      {!items.length ? <EmptyState icon="bell" title="All quiet" body="When people follow you or like and reply to your reviews and lists, it'll show up here." /> : (
        <ul>
          {items.map((n) => {
            const [verb, icon] = COPY[n.type] ?? ["interacted with you", "bell"];
            return (
              <li key={n.id} className={`flex items-center gap-3 py-3 px-3 -mx-3 rounded-md border-b border-line-soft ${!n.readAt ? "bg-accent/[0.04]" : ""}`}>
                <div className="relative">
                  <Link href={`/${n.actor!.username}`}><Avatar user={n.actor!} size={38} /></Link>
                  <span className={`absolute -bottom-1 -right-1 rounded-full p-1 ${icon === "heart" ? "bg-heart text-white" : "bg-elev-2 text-accent"}`}><Icon name={icon} size={10} filled={icon === "heart" || icon === "star"} strokeWidth={2.2} /></span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <Link href={`/${n.actor!.username}`} className="font-medium hover:text-accent">{n.actor!.displayName}</Link>{" "}
                  <span className="text-muted">{verb}</span>{" "}
                  {n.target && <Link href={n.target.href} className="font-medium hover:text-accent">{n.target.label}</Link>}
                  <div className="text-xs text-faint mt-0.5">{timeAgo(n.createdAt)}</div>
                </div>
                {n.target?.cover && <Link href={n.target.href}><Artwork cover={n.target.cover} size={40} /></Link>}
                {n.type === "follow" && !following.has(n.actor!.id) && <FollowButton userId={n.actor!.id} following={false} size="sm" />}
                {!n.readAt && <span className="h-2 w-2 rounded-full bg-accent shrink-0" aria-label="Unread" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
