import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { ListRowCard } from "@/components/cards";
import { EmptyState, Icon } from "@/components/ui";
import { data } from "@/lib/server/data";

export const metadata = { title: "Lists" };

export default async function UserListsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getViewer();
  const p = await data.getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const lists = await data.getUserLists(p.raw, viewer?.id);
  return (
    <div className="max-w-4xl">
      <div className="flex items-end justify-between mb-2">
        <h2 className="display text-3xl">Lists <span className="text-muted text-xl">{lists.length}</span></h2>
        {p.isSelf && <Link href="/list/new" className="btn-primary"><Icon name="plus" size={14} /> New list</Link>}
      </div>
      {lists.length ? lists.map((l) => <ListRowCard key={l.id} list={l} />) : (
        <EmptyState icon="list" title="No lists yet" body={p.isSelf ? "Rank your all-time favourites, collect songs for a mood, or document a summer." : "No public lists yet."} action={p.isSelf ? <Link href="/list/new" className="btn-primary">Create a list</Link> : undefined} />
      )}
    </div>
  );
}
