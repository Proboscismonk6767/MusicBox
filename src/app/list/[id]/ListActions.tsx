"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cloneList, deleteList, toggleListLike } from "@/app/actions";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/ui";

export function ListActions({ listId, isOwner, liked, likeCount, commentCount }: { listId: string; isOwner: boolean; liked: boolean; likeCount: number; commentCount: number }) {
  const [s, setS] = useState({ liked, n: likeCount });
  const [pop, setPop] = useState(false);
  const { requireAuth, toast } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();

  const like = () => {
    if (!requireAuth()) return;
    const prev = s;
    setS({ liked: !s.liked, n: s.n + (s.liked ? -1 : 1) });
    if (!s.liked) { setPop(true); setTimeout(() => setPop(false), 280); }
    start(async () => { const r = await toggleListLike(listId); if (!r.ok) { setS(prev); toast(r.error, "error"); } });
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ url: location.href, title: document.title });
      else { await navigator.clipboard.writeText(location.href); toast("Link copied."); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-5">
      <button onClick={like} aria-pressed={s.liked} className={`btn-secondary ${s.liked ? "!text-heart" : ""}`}><span className={pop ? "animate-pop" : ""}><Icon name="heart" size={15} filled={s.liked} /></span> {s.n}</button>
      <a href="#comments" className="btn-secondary"><Icon name="chat" size={15} /> {commentCount}</a>
      <button onClick={share} className="btn-secondary"><Icon name="share" size={15} /> Share</button>
      {isOwner ? (
        <>
          <Link href={`/list/${listId}/edit`} className="btn-primary">Edit list</Link>
          <button
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this list? This can't be undone.")) return;
              start(async () => {
                const r = await deleteList(listId);
                if (!r.ok) return toast(r.error, "error");
                toast("List deleted.");
                router.push(`/${r.data}/lists`);
              });
            }}
            className="btn-ghost hover:!text-danger"
          >
            Delete
          </button>
        </>
      ) : (
        <button
          disabled={pending}
          onClick={() => requireAuth() && start(async () => {
            const r = await cloneList(listId);
            if (!r.ok) return toast(r.error, "error");
            toast("Cloned to your lists (private).");
            router.push(`/list/${r.data}/edit`);
          })}
          className="btn-secondary"
        >
          <Icon name="plus" size={15} /> Clone
        </button>
      )}
    </div>
  );
}
