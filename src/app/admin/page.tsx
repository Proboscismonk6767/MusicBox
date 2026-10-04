import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { idx } from "@/lib/server/indexes";
import { isAdmin } from "@/lib/server/security";
import { EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { ModerateButtons } from "./ModerateButtons";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound(); // server-side; non-admins get a 404, not a hint
  const i = idx();
  const reports = [...i.db.reports].sort((a, b) => (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
  const describe = (type: string, id: string): { text: string; href?: string; author?: string } => {
    if (type === "entry") { const e = i.db.entries.find((x) => x.id === id); return { text: e?.review ?? "(removed)", href: `/review/${id}`, author: e && i.user.get(e.userId)?.username }; }
    if (type === "comment") { const c = i.db.comments.find((x) => x.id === id); return { text: c?.body ?? "(removed)", author: c && i.user.get(c.userId)?.username }; }
    if (type === "list") { const l = i.db.lists.find((x) => x.id === id); return { text: l?.title ?? "(removed)", href: `/list/${id}`, author: l && i.user.get(l.userId)?.username }; }
    const u = i.user.get(id); return { text: u ? `@${u.username}` : "(unknown)", href: u && `/${u.username}`, author: u?.username };
  };
  return (
    <div className="max-w-4xl">
      <h1 className="display text-4xl mb-1">Moderation</h1>
      <p className="text-muted mb-8">{reports.filter((r) => r.status === "open").length} open reports · {i.db.users.filter((u) => u.suspended).length} suspended accounts</p>
      {!reports.length ? <EmptyState icon="shield" title="No reports" body="Reports from users will appear here for review." /> : (
        <ul>
          {reports.map((r) => {
            const d = describe(r.targetType, r.targetId);
            return (
              <li key={r.id} className={`py-4 border-b border-line-soft ${r.status !== "open" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-1">
                  <span className="uppercase tracking-wider text-faint">{r.targetType}</span>
                  <span>· reported by @{i.user.get(r.reporterId)?.username} {timeAgo(r.createdAt)}</span>
                  {d.author && <span>· author @{d.author}</span>}
                  <span className="ml-auto uppercase tracking-wider">{r.status}</span>
                </div>
                <p className="text-sm mb-1">{d.href ? <Link href={d.href} className="hover:text-accent">{d.text}</Link> : d.text}</p>
                <p className="text-xs text-danger/80 mb-2">Reason: {r.reason}</p>
                {r.status === "open" && <ModerateButtons id={r.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
