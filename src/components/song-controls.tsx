"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard, ViewerSongState } from "@/lib/views";
import { rateSong, toggleLike, toggleListenLater } from "@/app/actions";
import { useApp } from "./AppProvider";
import { Artwork } from "./Artwork";
import { StarInput } from "./StarInput";
import { LyricEditor } from "./LyricEditor";
import { Icon, Stars, ExplicitBadge } from "./ui";
import { formatDuration } from "@/lib/format";

const EMPTY: ViewerSongState = { liked: false, listenLater: false, logCount: 0 };

/** Optimistic per-song viewer state. */
export function useSongState(song: SongCard, initial?: ViewerSongState) {
  const [state, setState] = useState<ViewerSongState>(initial ?? EMPTY);
  const { toast, requireAuth } = useApp();
  const router = useRouter();
  const [, start] = useTransition();

  const rate = (r: number | null) => {
    if (!requireAuth()) return;
    const prev = state;
    setState({ ...state, rating: r ?? undefined });
    start(async () => {
      const res = await rateSong(song.id, r);
      if (!res.ok) { setState(prev); toast(res.error, "error"); }
      else router.refresh();
    });
  };
  const like = () => {
    if (!requireAuth()) return;
    const prev = state;
    setState({ ...state, liked: !state.liked });
    start(async () => {
      const res = await toggleLike(song.id);
      if (!res.ok) { setState(prev); toast(res.error, "error"); }
    });
  };
  const later = () => {
    if (!requireAuth()) return;
    const prev = state;
    setState({ ...state, listenLater: !state.listenLater });
    start(async () => {
      const res = await toggleListenLater(song.id);
      if (!res.ok) { setState(prev); toast(res.error, "error"); }
      else toast(res.data ? "Saved to Listen Later." : "Removed from Listen Later.", "ok", res.data ? { label: "Open", href: "/listen-later" } : undefined);
    });
  };
  return { state, rate, like, later };
}

export function HeartButton({ on, onClick, size = 18, className = "" }: { on: boolean; onClick: () => void; size?: number; className?: string }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Unlike" : "Like"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); if (!on) { setPop(true); setTimeout(() => setPop(false), 280); } }}
      className={`transition-colors ${on ? "text-heart" : "text-muted hover:text-fg"} ${pop ? "animate-pop" : ""} ${className}`}
    >
      <Icon name="heart" size={size} filled={on} />
    </button>
  );
}

/** Album-art tile — the primary interaction primitive (§32). */
export function SongTile({ song, state, caption, sub, showMeta = true, priority }: { song: SongCard; state?: ViewerSongState; caption?: React.ReactNode; sub?: React.ReactNode; showMeta?: boolean; priority?: boolean }) {
  const { state: s, like, later } = useSongState(song, state);
  const { openLog, viewer } = useApp();
  return (
    <div className="group min-w-0">
      <Link href={`/song/${song.slug}`} className="relative block rounded-[3px] transition-[transform,box-shadow] duration-200 ease-out group-hover:scale-[1.02] group-hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] focus-visible:scale-[1.02]">
        <Artwork cover={song.cover} priority={priority} />
        <div className="absolute inset-0 rounded-[3px] bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2">
          <div className="text-[13px] font-semibold leading-tight line-clamp-2">{song.title}</div>
          <div className="text-[11px] text-white/70 truncate">{song.artists[0]?.name}</div>
          {viewer && (
            <div className="flex items-center gap-2.5 mt-1.5">
              <button type="button" onClick={(e) => { e.preventDefault(); openLog({ song, state: s }); }} aria-label="Log" title="Log" className="text-white/80 hover:text-accent"><Icon name="check" size={16} strokeWidth={2.2} /></button>
              <HeartButton on={s.liked} onClick={like} size={15} className={s.liked ? "" : "!text-white/80 hover:!text-heart"} />
              <button type="button" onClick={(e) => { e.preventDefault(); later(); }} aria-label={s.listenLater ? "Remove from Listen Later" : "Listen later"} title="Listen later" className={s.listenLater ? "text-accent" : "text-white/80 hover:text-accent"}><Icon name="bookmark" size={15} filled={s.listenLater} /></button>
              {s.rating != null && <Stars rating={s.rating} size={10} className="ml-auto" />}
            </div>
          )}
        </div>
      </Link>
      {showMeta && (
        <div className="mt-1.5 min-w-0">
          {caption ?? (
            <>
              <Link href={`/song/${song.slug}`} className="block text-[13px] font-medium leading-snug truncate hover:text-accent">{song.title}</Link>
              <Link href={`/artist/${song.artists[0]?.slug}`} className="block text-xs text-muted truncate hover:text-fg">{song.artists[0]?.name}</Link>
            </>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}

/** Compact row with quick-rate (album tracklists, lists, listen later). */
export function SongRow({ song, state, index, note, showAlbum = true, showCover = true, trailing }: { song: SongCard; state?: ViewerSongState; index?: number; note?: string; showAlbum?: boolean; showCover?: boolean; trailing?: React.ReactNode }) {
  const { state: s, rate, like, later } = useSongState(song, state);
  const { openLog, openAddToList, viewer } = useApp();
  return (
    <div className="group flex items-center gap-3 px-2 py-2 -mx-2 rounded-md hover:bg-elev transition-colors">
      {index != null && <span className="w-6 text-right text-sm tabular-nums text-faint shrink-0">{index}</span>}
      {showCover && <Link href={`/song/${song.slug}`} className="shrink-0"><Artwork cover={song.cover} size={44} /></Link>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link href={`/song/${song.slug}`} className="font-medium text-sm truncate hover:text-accent">{song.title}</Link>
          {song.explicit && <ExplicitBadge />}
        </div>
        <div className="text-xs text-muted truncate">
          {song.artists.map((a, i) => <span key={a.slug}>{i > 0 && ", "}<Link href={`/artist/${a.slug}`} className="hover:text-fg">{a.name}</Link></span>)}
          {song.featured.length > 0 && <span className="text-faint"> feat. {song.featured.join(", ")}</span>}
          {showAlbum && <> · <Link href={`/album/${song.album.slug}`} className="hover:text-fg">{song.album.title}</Link></>}
        </div>
        {note && <p className="text-xs text-fg/80 italic mt-1 line-clamp-2">“{note}”</p>}
      </div>
      <div className="hidden sm:flex items-center gap-1 text-xs text-muted tabular-nums w-14 justify-end" title={`${song.ratingCount} ratings`}>
        {song.ratingCount > 0 && <><Icon name="star" size={11} filled strokeWidth={0} className="text-muted" />{song.avg.toFixed(1)}</>}
      </div>
      {viewer ? (
        <div className="flex items-center gap-2">
          <div className={`${s.rating ? "" : "opacity-60 md:opacity-0 group-hover:opacity-100"} transition-opacity`}>
            <StarInput value={s.rating} onChange={rate} size={16} label={`Rate ${song.title}`} />
          </div>
          <HeartButton on={s.liked} onClick={like} size={15} className={s.liked ? "" : "md:opacity-0 group-hover:opacity-100"} />
          <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => openLog({ song, state: s })} className="btn-ghost h-7 w-7 px-0" aria-label="Log" title="Log"><Icon name="check" size={15} /></button>
            <button onClick={later} className={`btn-ghost h-7 w-7 px-0 ${s.listenLater ? "!text-accent" : ""}`} aria-label="Listen later" title="Listen later"><Icon name="bookmark" size={14} filled={s.listenLater} /></button>
            <button onClick={() => openAddToList(song)} className="btn-ghost h-7 w-7 px-0" aria-label="Add to list" title="Add to list"><Icon name="plus" size={15} /></button>
          </div>
        </div>
      ) : null}
      <span className="hidden md:block text-xs text-faint tabular-nums w-10 text-right">{formatDuration(song.durationMs)}</span>
      {trailing}
    </div>
  );
}

/** The song page action panel (§4). */
export function SongActionPanel({ song, state }: { song: SongCard; state: ViewerSongState }) {
  const { state: s, rate, like, later } = useSongState(song, state);
  const { openLog, openAddToList, toast, viewer } = useApp();
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${song.title} — ${song.artists[0]?.name}`, url });
      else { await navigator.clipboard.writeText(url); toast("Link copied."); }
    } catch { /* cancelled */ }
  };
  return (
    <div className="card p-4 w-full">
      <div className="grid grid-cols-3 gap-1 mb-4">
        <PanelButton icon="check" label={s.logCount ? `Logged ×${s.logCount}` : "Log"} on={s.logCount > 0} onClick={() => openLog({ song, state: s })} />
        <PanelButton icon="heart" label={s.liked ? "Liked" : "Like"} on={s.liked} onClick={like} tone="heart" />
        <PanelButton icon="bookmark" label={s.listenLater ? "Saved" : "Later"} on={s.listenLater} onClick={later} />
      </div>
      <div className="flex flex-col items-center border-y border-line py-4 mb-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-muted mb-2">{s.rating ? "Your rating" : viewer ? "Rate" : "Sign in to rate"}</span>
        <StarInput value={s.rating} onChange={rate} size={32} />
      </div>
      <div className="flex flex-col">
        <button onClick={() => openLog({ song, state: s })} className="btn-ghost justify-start text-fg/90"><Icon name="chat" size={15} /> {s.logCount ? "Log again or review" : "Review or log…"}</button>
        <button onClick={() => openAddToList(song)} className="btn-ghost justify-start text-fg/90"><Icon name="plus" size={15} /> Add to list</button>
        {viewer && <LyricEditor song={song} trigger={(open) => <button onClick={open} className="btn-ghost justify-start text-fg/90"><span className="w-[15px] text-center display text-lg leading-none">&ldquo;</span> Pin a lyric to profile</button>} />}
        <button onClick={share} className="btn-ghost justify-start text-fg/90"><Icon name="share" size={15} /> Share</button>
      </div>
    </div>
  );
}

function PanelButton({ icon, label, on, onClick, tone = "accent" }: { icon: string; label: string; on: boolean; onClick: () => void; tone?: "accent" | "heart" }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { onClick(); setPop(true); setTimeout(() => setPop(false), 280); }}
      aria-pressed={on}
      className={`flex flex-col items-center gap-1.5 rounded-md py-2.5 text-xs transition-colors hover:bg-elev-2 ${on ? (tone === "heart" ? "text-heart" : "text-accent") : "text-muted hover:text-fg"}`}
    >
      <span className={pop ? "animate-pop" : ""}><Icon name={icon} size={22} filled={on && icon !== "check"} strokeWidth={icon === "check" ? 2.4 : 1.8} /></span>
      {label}
    </button>
  );
}
