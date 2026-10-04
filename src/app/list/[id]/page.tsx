import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { Collage } from "@/components/Artwork";
import { SongRow, SongTile } from "@/components/song-controls";
import { Comments, ReportButton } from "@/components/social";
import { Avatar, EmptyState, Pill } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ListActions } from "./ListActions";
import { data } from "@/lib/server/data";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; sort?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await data.getListPage((await params).id);
  if (!p) return { title: "List not found" };
  return { title: `${p.list.title} — a list by ${p.card.owner.displayName}`, description: p.list.description || `${p.list.items.length} songs`, robots: p.list.visibility === "public" ? undefined : { index: false } };
}

export default async function ListPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { view = "list", sort = "position" } = await searchParams;
  const viewer = await getViewer();
  const p = await data.getListPage(id, viewer?.id);
  if (!p) notFound();
  const { list, card } = p;
  let items = p.items.map((it, i) => ({ ...it, position: i + 1 }));
  if (sort === "rating") items = [...items].sort((a, b) => b.song.avg - a.song.avg);
  if (sort === "year") items = [...items].sort((a, b) => a.song.releaseDate.localeCompare(b.song.releaseDate));
  if (sort === "title") items = [...items].sort((a, b) => a.song.title.localeCompare(b.song.title));
  const qs = (k: string, v: string) => `?${new URLSearchParams({ view, sort, [k]: v })}`;

  return (
    <div className="max-w-5xl">
      <header className="flex flex-col sm:flex-row gap-6 mb-8">
        <Collage covers={card.covers} className="w-48 sm:w-56 shrink-0 shadow-2xl shadow-black/60" />
        <div className="min-w-0 flex flex-col justify-end">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted">{list.isRanked ? "Ranked list" : "List"}</span>
            {list.visibility !== "public" && <Pill>{list.visibility}</Pill>}
          </div>
          <h1 className="display text-4xl md:text-5xl leading-tight">{list.title}</h1>
          <div className="flex items-center gap-2 mt-3 text-sm text-muted">
            <Link href={`/${card.owner.username}`} className="flex items-center gap-2 hover:text-fg"><Avatar user={card.owner} size={22} /> {card.owner.displayName}</Link>
            <span>· {list.items.length} songs · Updated {formatDate(list.updatedAt)}</span>
          </div>
          {p.clonedFrom && <div className="text-xs text-faint mt-1">Cloned from <Link href={`/list/${p.clonedFrom.id}`} className="hover:text-muted underline">{p.clonedFrom.title}</Link></div>}
          {list.description && <p className="mt-4 text-fg/85 max-w-2xl whitespace-pre-line">{list.description}</p>}
          <ListActions listId={list.id} isOwner={p.isOwner} liked={p.viewerLiked} likeCount={card.likeCount} commentCount={card.commentCount} />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2 mb-3">
        <div className="flex gap-3 text-[11px] uppercase tracking-wider">
          {[["position", list.isRanked ? "Rank" : "List order"], ["rating", "Rating"], ["year", "Release"], ["title", "Title"]].map(([k, l]) => (
            <Link key={k} href={qs("sort", k)} scroll={false} replace className={sort === k ? "text-fg" : "text-faint hover:text-muted"}>{l}</Link>
          ))}
        </div>
        <div className="flex gap-3 text-[11px] uppercase tracking-wider">
          {[["list", "Detail"], ["grid", "Grid"]].map(([k, l]) => <Link key={k} href={qs("view", k)} scroll={false} replace className={view === k ? "text-fg" : "text-faint hover:text-muted"}>{l}</Link>)}
        </div>
      </div>

      {!items.length ? (
        <EmptyState icon="list" title="This list is empty" body={p.isOwner ? "Add songs from any song page with “Add to list”, or edit this list to search and add." : "Nothing here yet."} action={p.isOwner ? <Link href={`/list/${list.id}/edit`} className="btn-primary">Add songs</Link> : undefined} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {items.map((it) => <SongTile key={it.song.id} song={it.song} state={p.states[it.song.id]} sub={list.isRanked && sort === "position" ? <div className="text-xs text-accent font-semibold">#{it.position}</div> : undefined} />)}
        </div>
      ) : (
        <div>{items.map((it) => <SongRow key={it.song.id} song={it.song} state={p.states[it.song.id]} index={list.isRanked || sort !== "position" ? it.position : undefined} note={it.note} />)}</div>
      )}

      {!p.isOwner && <div className="mt-6"><ReportButton targetType="list" targetId={list.id} label="Report list" /></div>}
      <Comments targetType="list" targetId={list.id} comments={p.comments} />
    </div>
  );
}
