"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewView, CommentView } from "@/lib/views";
import { addComment, deleteComment, report, toggleBlock, toggleCommentLike, toggleFollow, toggleReviewLike } from "@/app/actions";
import { useApp } from "./AppProvider";
import { Artwork } from "./Artwork";
import { Avatar, Icon, Stars, UserLink } from "./ui";
import { Sheet } from "./Sheet";
import { formatDate, timeAgo } from "@/lib/format";

export function ReviewBody({ text, spoiler, clamp }: { text: string; spoiler?: boolean; clamp?: boolean }) {
  const [shown, setShown] = useState(!spoiler);
  if (!shown) {
    return (
      <button onClick={() => setShown(true)} className="text-sm text-muted italic border border-dashed border-line rounded px-2 py-1 hover:text-fg hover:border-muted">
        Hidden review — tap to reveal
      </button>
    );
  }
  return <p className={`text-[15px] leading-relaxed text-fg/90 whitespace-pre-line ${clamp ? "line-clamp-4" : ""}`}>{text}</p>;
}

export function ReviewLikeButton({ id, liked, count }: { id: string; liked: boolean; count: number }) {
  const [s, setS] = useState({ liked, count });
  const [pop, setPop] = useState(false);
  const { requireAuth, toast } = useApp();
  const [, start] = useTransition();
  return (
    <button
      onClick={() => {
        if (!requireAuth()) return;
        const prev = s;
        setS({ liked: !s.liked, count: s.count + (s.liked ? -1 : 1) });
        if (!s.liked) { setPop(true); setTimeout(() => setPop(false), 280); }
        start(async () => {
          const r = await toggleReviewLike(id);
          if (!r.ok) { setS(prev); toast(r.error, "error"); }
        });
      }}
      aria-pressed={s.liked}
      className={`flex items-center gap-1 text-xs transition-colors ${s.liked ? "text-heart" : "text-muted hover:text-fg"}`}
    >
      <span className={pop ? "animate-pop" : ""}><Icon name="heart" size={14} filled={s.liked} /></span>
      {s.count > 0 ? s.count : "Like"}
      <span className="sr-only">likes</span>
    </button>
  );
}

/** Review card (§4/§9). `withSong` shows the song (feeds, profiles). */
export function ReviewCard({ r, withSong = false, compact = false }: { r: ReviewView; withSong?: boolean; compact?: boolean }) {
  return (
    <article className="flex gap-3.5 py-4 border-b border-line-soft last:border-0">
      {withSong ? (
        <Link href={`/song/${r.song.slug}`} className="shrink-0 w-16 sm:w-20"><Artwork cover={r.song.cover} /></Link>
      ) : (
        <Link href={`/${r.user.username}`} className="shrink-0"><Avatar user={r.user} size={36} /></Link>
      )}
      <div className="min-w-0 flex-1">
        {withSong && (
          <div className="mb-0.5 leading-tight">
            <Link href={`/song/${r.song.slug}`} className="font-semibold hover:text-accent">{r.song.title}</Link>
            <span className="text-muted text-sm"> — {r.song.artists[0]?.name}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm mb-1.5">
          {withSong && <Avatar user={r.user} size={18} />}
          <UserLink user={r.user} className="text-sm" />
          <Stars rating={r.rating} size={12} />
          {r.liked && <Icon name="heart" size={12} filled className="text-heart" />}
          {r.isRelisten && <span title="Relisten" className="text-muted"><Icon name="repeat" size={12} /></span>}
          <Link href={`/review/${r.id}`} className="text-xs text-faint hover:text-muted">{formatDate(r.listenedAt)}</Link>
        </div>
        {r.review && (
          <Link href={`/review/${r.id}`} className="block">
            <ReviewBody text={r.review} spoiler={r.hasSpoiler} clamp={compact} />
          </Link>
        )}
        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">{r.tags.map((t) => <span key={t} className="text-[11px] text-faint">#{t}</span>)}</div>
        )}
        <div className="flex items-center gap-4 mt-2.5">
          <ReviewLikeButton id={r.id} liked={r.viewerLiked} count={r.likeCount} />
          <Link href={`/review/${r.id}#comments`} className="flex items-center gap-1 text-xs text-muted hover:text-fg">
            <Icon name="chat" size={13} /> {r.commentCount || "Reply"}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function FollowButton({ userId, following, size = "md" }: { userId: string; following: boolean; size?: "sm" | "md" }) {
  const [on, setOn] = useState(following);
  const { requireAuth, toast } = useApp();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <button
      onClick={() => {
        if (!requireAuth()) return;
        setOn(!on);
        start(async () => {
          const r = await toggleFollow(userId);
          if (!r.ok) { setOn(on); toast(r.error, "error"); }
          else router.refresh();
        });
      }}
      className={`${on ? "btn-secondary" : "btn-primary"} ${size === "sm" ? "btn-sm" : ""} min-w-[84px] group`}
      aria-pressed={on}
    >
      {on ? <><span className="group-hover:hidden">Following</span><span className="hidden group-hover:inline">Unfollow</span></> : "Follow"}
    </button>
  );
}

export function ReportButton({ targetType, targetId, label = "Report" }: { targetType: "entry" | "comment" | "list" | "user"; targetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Spam");
  const [details, setDetails] = useState("");
  const { requireAuth, toast } = useApp();
  const [pending, start] = useTransition();
  return (
    <>
      <button onClick={() => requireAuth() && setOpen(true)} className="text-xs text-faint hover:text-danger flex items-center gap-1"><Icon name="flag" size={12} /> {label}</button>
      {open && (
        <Sheet title="Report" onClose={() => setOpen(false)} width="max-w-sm">
          <form className="px-5 pb-5 space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await report(targetType, targetId, `${reason}${details ? ": " + details : ""}`); toast(r.ok ? "Thanks — our moderators will review this." : r.error, r.ok ? "ok" : "error"); setOpen(false); }); }}>
            {["Spam", "Harassment or hate", "Inappropriate content", "Something else"].map((x) => (
              <label key={x} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="reason" checked={reason === x} onChange={() => setReason(x)} className="accent-[var(--color-accent)]" /> {x}</label>
            ))}
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" rows={2} className="textarea" />
            <button disabled={pending} className="btn-primary w-full">Submit report</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

export function BlockMuteButtons({ userId, blocked, muted }: { userId: string; blocked: boolean; muted: boolean }) {
  const { toast } = useApp();
  const router = useRouter();
  const [, start] = useTransition();
  const act = (kind: "block" | "mute") => start(async () => {
    const r = await toggleBlock(userId, kind);
    if (!r.ok) return toast(r.error, "error");
    toast(kind === "block" ? (r.data ? "Blocked. They can't follow you or comment on your posts." : "Unblocked.") : r.data ? "Muted. You won't see their activity." : "Unmuted.");
    router.refresh();
  });
  return (
    <div className="flex flex-col">
      <button onClick={() => act("mute")} className="btn-ghost justify-start btn-sm">{muted ? "Unmute" : "Mute"}</button>
      <button onClick={() => act("block")} className="btn-ghost justify-start btn-sm !text-danger/80 hover:!text-danger">{blocked ? "Unblock" : "Block"}</button>
    </div>
  );
}

export function Comments({ targetType, targetId, comments }: { targetType: "entry" | "list"; targetId: string; comments: CommentView[] }) {
  const { viewer } = useApp();
  return (
    <section id="comments" className="mt-8">
      <h3 className="section-title border-b border-line pb-2 mb-2">{comments.reduce((n, c) => n + 1 + c.replies.length, 0)} comments</h3>
      <div>
        {comments.map((c) => (
          <div key={c.id}>
            <CommentItem c={c} targetType={targetType} targetId={targetId} />
            {c.replies.length > 0 && (
              <div className="ml-11 border-l border-line pl-4">
                {c.replies.map((r) => <CommentItem key={r.id} c={r} targetType={targetType} targetId={targetId} parentId={c.id} />)}
              </div>
            )}
          </div>
        ))}
        {!comments.length && <p className="text-sm text-muted py-4">No comments yet. Start the conversation.</p>}
      </div>
      {viewer ? <CommentForm targetType={targetType} targetId={targetId} /> : <p className="text-sm text-muted mt-3"><Link href="/login" className="text-accent hover:underline">Sign in</Link> to comment.</p>}
    </section>
  );
}

function CommentItem({ c, targetType, targetId, parentId }: { c: CommentView; targetType: "entry" | "list"; targetId: string; parentId?: string }) {
  const [replying, setReplying] = useState(false);
  const [liked, setLiked] = useState({ on: c.viewerLiked, n: c.likeCount });
  const { requireAuth, toast } = useApp();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="flex gap-3 py-3">
      <Link href={`/${c.user.username}`}><Avatar user={c.user} size={28} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm"><UserLink user={c.user} /><span className="text-xs text-faint">{timeAgo(c.createdAt)}</span></div>
        <p className="text-sm text-fg/90 mt-0.5 whitespace-pre-line break-words">{c.body}</p>
        <div className="flex items-center gap-4 mt-1.5">
          <button onClick={() => { if (!requireAuth()) return; setLiked({ on: !liked.on, n: liked.n + (liked.on ? -1 : 1) }); start(async () => void (await toggleCommentLike(c.id))); }} className={`text-xs flex items-center gap-1 ${liked.on ? "text-heart" : "text-faint hover:text-fg"}`}>
            <Icon name="heart" size={12} filled={liked.on} /> {liked.n || ""}
          </button>
          <button onClick={() => requireAuth() && setReplying(!replying)} className="text-xs text-faint hover:text-fg">Reply</button>
          {c.canDelete ? (
            <button onClick={() => start(async () => { const r = await deleteComment(c.id); if (!r.ok) toast(r.error, "error"); else router.refresh(); })} className="text-xs text-faint hover:text-danger">Delete</button>
          ) : <ReportButton targetType="comment" targetId={c.id} label="" />}
        </div>
        {replying && <CommentForm targetType={targetType} targetId={targetId} parentId={parentId ?? c.id} onDone={() => setReplying(false)} autoFocus placeholder={`Reply to ${c.user.displayName}…`} />}
      </div>
    </div>
  );
}

function CommentForm({ targetType, targetId, parentId, onDone, autoFocus, placeholder = "Add a comment…" }: { targetType: "entry" | "list"; targetId: string; parentId?: string; onDone?: () => void; autoFocus?: boolean; placeholder?: string }) {
  const [body, setBody] = useState("");
  const { toast, viewer } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="flex gap-3 mt-3 items-start"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addComment(targetType, targetId, body, parentId);
          if (!r.ok) return toast(r.error, "error");
          setBody("");
          onDone?.();
          router.refresh();
        });
      }}
    >
      {viewer && !parentId && <Avatar user={viewer} size={28} />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={1} placeholder={placeholder} autoFocus={autoFocus} maxLength={2000} className="textarea min-h-9 py-2" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
      <button disabled={!body.trim() || pending} className="btn-secondary">Post</button>
    </form>
  );
}
