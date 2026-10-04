import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { getReview } from "@/lib/server/queries";
import { Artwork } from "@/components/Artwork";
import { Comments, ReportButton, ReviewBody, ReviewLikeButton } from "@/components/social";
import { Avatar, Icon, Stars } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { EntryActions } from "@/app/[username]/diary/EntryActions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = getReview((await params).id);
  if (!r) return { title: "Review not found" };
  const { review: v } = r;
  return { title: `${v.user.displayName}'s review of ${v.song.title} by ${v.song.artists[0]?.name}`, description: v.review?.slice(0, 160) };
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params;
  const viewer = await getViewer();
  const data = getReview(id, viewer?.id);
  if (!data) notFound();
  const { review: r, comments, isOwner, plays, entry } = data;
  return (
    <div className="grid md:grid-cols-[200px_minmax(0,1fr)] gap-8 max-w-4xl">
      <Link href={`/song/${r.song.slug}`} className="hidden md:block"><Artwork cover={r.song.cover} rounded="rounded" /></Link>
      <article className="min-w-0">
        <div className="flex items-center gap-2.5 mb-4">
          <Link href={`/${r.user.username}`}><Avatar user={r.user} size={32} /></Link>
          <span className="text-sm text-muted">Review by <Link href={`/${r.user.username}`} className="text-fg font-medium hover:text-accent">{r.user.displayName}</Link></span>
        </div>
        <div className="flex gap-4 items-center md:block">
          <Link href={`/song/${r.song.slug}`} className="md:hidden w-20 shrink-0"><Artwork cover={r.song.cover} /></Link>
          <div>
            <h1 className="display text-4xl md:text-5xl leading-tight"><Link href={`/song/${r.song.slug}`} className="hover:text-accent">{r.song.title}</Link> <span className="text-muted text-2xl md:text-3xl">{r.song.year}</span></h1>
            <div className="text-muted mt-1"><Link href={`/artist/${r.song.artists[0]?.slug}`} className="hover:text-fg">{r.song.artists[0]?.name}</Link> · <Link href={`/album/${r.song.album.slug}`} className="hover:text-fg">{r.song.album.title}</Link></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4 text-sm">
          <Stars rating={r.rating} size={18} />
          {r.liked && <Icon name="heart" size={16} filled className="text-heart" />}
          <span className="text-muted">{r.isRelisten ? "Relistened" : "Listened"} {formatDate(r.listenedAt)}</span>
          {plays > 1 && <span className="text-xs text-faint flex items-center gap-1"><Icon name="repeat" size={12} /> {r.user.displayName.split(" ")[0]} has logged this {plays} times</span>}
          {entry.context && <span className="chip h-6 cursor-default">{entry.context}</span>}
        </div>
        {r.review ? <div className="mt-5 text-lg"><ReviewBody text={r.review} spoiler={r.hasSpoiler} /></div> : <p className="mt-5 text-muted italic">No written review.</p>}
        {entry.memory &&<blockquote className="mt-5 border-l-2 border-accent/60 pl-4 text-sm text-fg/80 italic">“{entry.memory}”</blockquote>}
        {r.tags.length > 0 && <div className="flex flex-wrap gap-2 mt-4">{r.tags.map((t) => <Link key={t} href={`/${r.user.username}/diary?tag=${t}`} className="text-xs text-muted hover:text-fg">#{t}</Link>)}</div>}
        <div className="flex items-center gap-5 mt-6 pt-4 border-t border-line">
          <ReviewLikeButton id={r.id} liked={r.viewerLiked} count={r.likeCount} />
          {isOwner ? <div className="flex items-center ml-auto"><EntryActions entry={{ ...r, context: entry.context, memory: entry.memory }} redirectTo={`/${r.user.username}/diary`} /></div> : <div className="ml-auto"><ReportButton targetType="entry" targetId={r.id} /></div>}
        </div>
        <Comments targetType="entry" targetId={r.id} comments={comments} />
      </article>
    </div>
  );
}
