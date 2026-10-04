"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard } from "@/lib/views";
import { addToList, createList } from "@/app/actions";
import { Sheet } from "./Sheet";
import { Icon } from "./ui";
import { useApp } from "./AppProvider";

export function AddToListModal({ song, onClose }: { song: SongCard; onClose: () => void }) {
  const { lists, toast } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const filtered = lists.filter((l) => l.title.toLowerCase().includes(q.toLowerCase()));

  const add = (id: string) =>
    start(async () => {
      const res = await addToList(id, song.id);
      if (!res.ok) return toast(res.error, "error");
      setAdded(new Set(added).add(id));
      toast(`Added to “${res.data}”.`, "ok", { label: "View", href: `/list/${id}` });
      router.refresh();
    });

  const create = () =>
    start(async () => {
      const res = await createList({ title, items: [{ songId: song.id }], visibility: "public" });
      if (!res.ok) return toast(res.error, "error");
      toast(`Created “${title}”.`, "ok", { label: "View", href: `/list/${res.data}` });
      router.refresh();
      onClose();
    });

  return (
    <Sheet title={`Add “${song.title}” to a list`} onClose={onClose} width="max-w-md">
      <div className="px-5 pb-5">
        <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) create(); }} className="flex gap-2 mb-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New list title…" className="input" aria-label="New list title" />
          <button className="btn-primary" disabled={!title.trim() || pending}><Icon name="plus" size={14} /> Create</button>
        </form>
        {lists.length > 6 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter your lists" className="input h-9 mb-2" />}
        <ul className="max-h-80 overflow-y-auto -mx-2">
          {filtered.map((l) => {
            const inList = l.songIds.includes(song.id) || added.has(l.id);
            return (
              <li key={l.id}>
                <button disabled={inList || pending} onClick={() => add(l.id)} className="w-full flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left hover:bg-elev-2 disabled:hover:bg-transparent disabled:cursor-default">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{l.title}</span>
                    <span className="text-xs text-muted">{l.count + (added.has(l.id) ? 1 : 0)} songs</span>
                  </span>
                  {inList ? <span className="text-xs text-accent flex items-center gap-1"><Icon name="check" size={13} /> Added</span> : <Icon name="plus" size={16} className="text-muted" />}
                </button>
              </li>
            );
          })}
          {!lists.length && <li className="px-2 py-6 text-sm text-muted text-center">You haven&apos;t made any lists yet. Name one above to start.</li>}
        </ul>
      </div>
    </Sheet>
  );
}
