import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { data } from "@/lib/server/data";
import { isAdmin } from "@/lib/server/security";
import { EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { ModerateButtons } from "./ModerateButtons";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound(); // server-side; non-admins get a 404, not a hint
  const { reports, openCount, suspendedCount } = await data.adminOverview();
  return (
    <div className="max-w-4xl">
      <h1 className="display text-4xl mb-1">Moderation</h1>
      <p className="text-muted mb-8">{openCount} open reports · {suspendedCount} suspended accounts</p>
      {!reports.length ? <EmptyState icon="shield" title="No reports" body="Reports from users will appear here for review." /> : (
        <ul>
          {reports.map((r) => {
            const d = r;
            return (
              <li key={r.id} className={`py-4 border-b border-line-soft ${r.status !== "open" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-1">
                  <span className="uppercase tracking-wider text-faint">{r.targetType}</span>
                  <span>· reported by @{r.reporter} {timeAgo(r.createdAt)}</span>
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
