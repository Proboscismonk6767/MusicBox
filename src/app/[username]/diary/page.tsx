import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getDiary, getProfile, type DiaryFilters } from "@/lib/server/queries";
import { Artwork } from "@/components/Artwork";
import { EmptyState, Icon, Stars } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/format";
import { DiaryFilterBar } from "./DiaryFilterBar";
import { EntryActions } from "./EntryActions";

export const metadata = { title: "Diary" };

export default async function DiaryPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<DiaryFilters> }) {
  const { username } = await params;
  const filters = await searchParams;
  const viewer = await getViewer();
  const p = getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const d = getDiary(p.raw, filters, viewer?.id);
  const active = Object.values(filters).some(Boolean);

  // Group by month for the editorial date column.
  const groups: { key: string; label: string; entries: typeof d.entries }[] = [];
  for (const e of d.entries) {
    const key = e.listenedAt.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, entries: [] };
      groups.push(g);
    }
    g.entries.push(e);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="display text-3xl">Diary</h2>
          <p className="text-sm text-muted">{active ? `${d.entries.length} of ${d.total} entries` : `${d.total.toLocaleString()} entries`}</p>
        </div>
      </div>
      <DiaryFilterBar filters={filters} years={d.years} artists={d.artists} genres={d.genres} tags={d.tags} />

      {!d.entries.length ? (
        active ? (
          <EmptyState icon="search" title="No entries match" body="Try removing a filter or two." action={<Link href={`/${p.user.username}/diary`} className="btn-secondary">Clear filters</Link>} />
        ) : p.isSelf ? (
          <EmptyState icon="book" title="Your diary is empty" body="Search for a song you've listened to recently and start building your music history." action={<Link href="/search" className="btn-primary">Find a song</Link>} />
        ) : <EmptyState icon="book" title="Nothing logged yet" body={`${p.user.displayName} hasn't logged any songs.`} />
      ) : (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.key}>
              <h3 className="sticky top-14 z-10 bg-bg/90 backdrop-blur py-2 section-title border-b border-line mb-1">{g.label} <span className="text-faint normal-case tracking-normal font-normal">· {g.entries.length}</span></h3>
              <ol>
                {g.entries.map((e, i) => {
                  const showDay = i === 0 || g.entries[i - 1].listenedAt !== e.listenedAt;
                  return (
                    <li key={e.id} className="group grid grid-cols-[44px_48px_minmax(0,1fr)_auto] sm:grid-cols-[56px_56px_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 py-2.5 border-b border-line-soft">
                      <div className="text-center leading-none">
                        {showDay && <><div className="text-[10px] uppercase text-faint tracking-wider">{MONTH_NAMES[Number(e.listenedAt.slice(5, 7)) - 1].slice(0, 3)}</div><div className="text-2xl font-semibold tabular-nums">{Number(e.listenedAt.slice(8))}</div></>}
                      </div>
                      <Link href={`/song/${e.song.slug}`}><Artwork cover={e.song.cover} /></Link>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <Link href={`/song/${e.song.slug}`} className="font-semibold truncate hover:text-accent">{e.song.title}</Link>
                          <span className="text-sm text-muted truncate hidden sm:inline">{e.song.artists[0]?.name}</span>
                        </div>
                        <div className="text-xs text-muted sm:hidden truncate">{e.song.artists[0]?.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Stars rating={e.rating} size={12} />
                          {e.liked && <Icon name="heart" size={12} filled className="text-heart" />}
                          {e.isRelisten && <span className="text-[11px] text-faint flex items-center gap-0.5"><Icon name="repeat" size={11} /> relisten</span>}
                          {e.playCount > 1 && <span className="text-[11px] text-faint">· {e.playCount}× total</span>}
                          {e.tags.map((t) => <Link key={t} href={`?tag=${t}`} className="text-[11px] text-faint hover:text-muted">#{t}</Link>)}
                        </div>
                        {e.review && <Link href={`/review/${e.id}`} className="block text-sm text-fg/75 mt-1 line-clamp-1 hover:text-fg">{e.hasSpoiler ? <span className="italic text-muted">Hidden review</span> : e.review}</Link>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Link href={`/review/${e.id}`} className="btn-ghost h-8 w-8 px-0" aria-label="Open entry"><Icon name="chat" size={14} /></Link>
                        {p.isSelf && <EntryActions entry={e} />}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
