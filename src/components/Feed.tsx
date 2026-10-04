"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/views";
import { Artwork, Collage } from "./Artwork";
import { Avatar, Icon, Stars, UserLink, EmptyState } from "./ui";
import { ReviewBody, ReviewLikeButton } from "./social";
import { timeAgo, formatDate } from "@/lib/format";

export function Feed({ initial, next: initialNext }: { initial: FeedItem[]; next?: string }) {
  const [items, setItems] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => { setItems(initial); setNext(initialNext); }, [initial, initialNext]);

  useEffect(() => {
    if (!next || !sentinel.current) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || loading) return;
      setLoading(true);
      try {
        const r = await fetch(`/api/feed?before=${encodeURIComponent(next)}`);
        if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't load more activity.");
        const data = await r.json();
        setItems((prev) => [...prev, ...data.items.filter((x: FeedItem) => !prev.some((p) => p.id === x.id))]);
        setNext(data.next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "You seem to be offline. Scroll to retry.");
      }
      setLoading(false);
    }, { rootMargin: "600px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [next, loading]);

  if (!items.length) {
    return <EmptyState icon="user" title="Your feed is quiet" body="Follow a few people whose taste you trust and their logs, reviews and lists will show up here." action={<Link href="/discover" className="btn-primary">Find people & songs</Link>} />;
  }

  return (
    <div>
      {items.map((it) => <FeedCard key={it.id} item={it} />)}
      <div ref={sentinel} />
      {loading && <FeedSkeleton />}
      {error && <p className="text-sm text-muted text-center py-4">{error}</p>}
      {!next && <p className="text-center text-xs text-faint py-8">You&apos;re all caught up.</p>}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-5 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="skeleton w-20 h-20 shrink-0" />
          <div className="flex-1 space-y-2 pt-1"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-1/2" /><div className="skeleton h-3 w-3/4" /></div>
        </div>
      ))}
    </div>
  );
}

function Header({ actor, verb, at }: { actor: FeedItem["actor"]; verb: React.ReactNode; at: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted mb-2 min-w-0">
      <Link href={`/${actor.username}`}><Avatar user={actor} size={22} /></Link>
      <span className="truncate"><UserLink user={actor} /> {verb}</span>
      <span className="ml-auto text-xs text-faint shrink-0">{timeAgo(at)}</span>
    </div>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  if (item.kind === "entry") {
    const r = item.review;
    return (
      <article className="py-5 border-b border-line-soft animate-fade-up">
        <Header actor={item.actor} at={item.at} verb={<>{r.review ? "reviewed" : r.isRelisten ? "relistened to" : "listened to"}</>} />
        <div className="flex gap-4">
          <Link href={`/song/${r.song.slug}`} className="shrink-0 w-[84px] sm:w-[104px] transition-transform hover:scale-[1.02]"><Artwork cover={r.song.cover} /></Link>
          <div className="min-w-0 flex-1">
            <Link href={`/song/${r.song.slug}`} className="text-lg font-semibold leading-tight hover:text-accent">{r.song.title}</Link>
            <div className="text-sm text-muted"><Link href={`/artist/${r.song.artists[0]?.slug}`} className="hover:text-fg">{r.song.artists[0]?.name}</Link> · {r.song.year}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <Stars rating={r.rating} size={14} />
              {r.liked && <Icon name="heart" size={13} filled className="text-heart" />}
              {r.isRelisten && <Icon name="repeat" size={13} className="text-muted" />}
              <span className="text-xs text-faint">{formatDate(r.listenedAt)}</span>
            </div>
            {r.review && <div className="mt-2"><Link href={`/review/${r.id}`}><ReviewBody text={r.review} spoiler={r.hasSpoiler} clamp /></Link></div>}
            <div className="flex items-center gap-4 mt-2.5">
              <ReviewLikeButton id={r.id} liked={r.viewerLiked} count={r.likeCount} />
              <Link href={`/review/${r.id}#comments`} className="flex items-center gap-1 text-xs text-muted hover:text-fg"><Icon name="chat" size={13} /> {r.commentCount || "Reply"}</Link>
            </div>
          </div>
        </div>
      </article>
    );
  }
  if (item.kind === "like") {
    return (
      <article className="py-4 border-b border-line-soft">
        <Header actor={item.actor} at={item.at} verb={<>liked <Link href={`/song/${item.song.slug}`} className="text-fg font-medium hover:text-accent">{item.song.title}</Link> <span className="text-faint">by {item.song.artists[0]?.name}</span></>} />
        <Link href={`/song/${item.song.slug}`} className="flex items-center gap-3 ml-8 w-fit group">
          <Artwork cover={item.song.cover} size={48} />
          <Icon name="heart" size={16} filled className="text-heart" />
        </Link>
      </article>
    );
  }
  if (item.kind === "list") {
    return (
      <article className="py-5 border-b border-line-soft">
        <Header actor={item.actor} at={item.at} verb={item.verb === "created" ? <>created a list</> : <>added {item.count ?? "some"} {item.count === 1 ? "song" : "songs"} to a list</>} />
        <Link href={`/list/${item.list.id}`} className="flex gap-4 group">
          <Collage covers={item.list.covers} className="w-[84px] sm:w-[104px] shrink-0" />
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight group-hover:text-accent">{item.list.title}</div>
            <div className="text-sm text-muted">{item.list.count} songs{item.list.isRanked ? " · Ranked" : ""}</div>
            {item.list.description && <p className="text-sm text-muted mt-1.5 line-clamp-2">{item.list.description}</p>}
          </div>
        </Link>
      </article>
    );
  }
  return (
    <article className="py-3.5 border-b border-line-soft">
      <Header actor={item.actor} at={item.at} verb={<>followed <Link href={`/${item.target.username}`} className="text-fg font-medium hover:text-accent">{item.target.displayName}</Link></>} />
    </article>
  );
}
