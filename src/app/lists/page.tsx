import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { browseLists, getUserLists, getUserByName } from "@/lib/server/queries";
import { ListCardView } from "@/components/cards";
import { Icon, SectionHeader } from "@/components/ui";

export const metadata = { title: "Lists", description: "Ranked and curated song lists from the MusicBox community." };

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort = "popular" } = await searchParams;
  const viewer = await getViewer();
  const mine = viewer ? getUserLists(getUserByName(viewer.username)!, viewer.id) : [];
  const lists = browseLists(sort, viewer?.id);
  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl md:text-6xl">Lists</h1>
          <p className="text-muted mt-2">Rankings, moods, eras and obsessions — curated by people.</p>
        </div>
        {viewer && <Link href="/list/new" className="btn-primary"><Icon name="plus" size={14} /> New list</Link>}
      </header>
      {mine.length > 0 && (
        <section>
          <SectionHeader title="Your lists" href={`/${viewer!.username}/lists`} />
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-5">{mine.slice(0, 6).map((l) => <ListCardView key={l.id} list={l} size="sm" />)}</div>
        </section>
      )}
      <section>
        <SectionHeader title="Community lists" action={
          <div className="flex gap-3 text-[11px] uppercase tracking-wider">
            {[["popular", "Popular"], ["recent", "Recent"]].map(([k, l]) => <Link key={k} href={`?sort=${k}`} className={sort === k ? "text-fg" : "text-faint hover:text-muted"}>{l}</Link>)}
          </div>
        } />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">{lists.map((l) => <ListCardView key={l.id} list={l} />)}</div>
      </section>
    </div>
  );
}
