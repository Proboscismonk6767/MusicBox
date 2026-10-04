"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard } from "@/lib/views";
import { reorderFavoriteSongs, toggleFavoriteSong } from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { Artwork } from "@/components/Artwork";
import { Icon } from "@/components/ui";
import { useApp } from "@/components/AppProvider";

export function FavouritesEditor({ favourites, asButton }: { favourites: SongCard[]; asButton?: boolean }) {
  const [open, setOpen] = useState(false);
  const [favs, setFavs] = useState(favourites);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongCard[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const { toast } = useApp();
  const router = useRouter();
  const [, start] = useTransition();

  useEffect(() => setFavs(favourites), [favourites]);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=6`);
      if (r.ok) setResults((await r.json()).songs);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (s: SongCard) => {
    const has = favs.some((f) => f.id === s.id);
    if (!has && favs.length >= 8) return toast("You can pin up to 8 songs. Remove one first.", "error");
    const prev = favs;
    setFavs(has ? favs.filter((f) => f.id !== s.id) : [...favs, s]);
    start(async () => {
      const r = await toggleFavoriteSong(s.id);
      if (!r.ok) { toast(r.error, "error"); setFavs(prev); }
    });
  };
  const drop = (to: number) => {
    if (drag == null || drag === to || !favs[to]) return setDrag(null);
    const next = [...favs];
    const [m] = next.splice(drag, 1);
    next.splice(to, 0, m);
    setFavs(next);
    setDrag(null);
    start(async () => void (await reorderFavoriteSongs(next.map((f) => f.id))));
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={asButton ? "btn-primary" : "text-[11px] uppercase tracking-wider text-faint hover:text-fg"}>{asButton ? "Choose favourites" : "Edit"}</button>
      {open && (
        <Sheet title="Favourite songs" onClose={() => { setOpen(false); router.refresh(); }}>
          <div className="px-5 pb-5">
            <p className="text-xs text-muted mb-3">Pin up to 8. Drag to reorder.</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {Array.from({ length: 8 }).map((_, i) => {
                const s = favs[i];
                return s ? (
                  <div key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} className={`relative group cursor-grab ${drag === i ? "opacity-40" : ""}`}>
                    <Artwork cover={s.cover} />
                    <button onClick={() => toggle(s)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${s.title}`}><Icon name="x" size={11} /></button>
                    <div className="text-[10px] truncate mt-1">{s.title}</div>
                  </div>
                ) : <div key={i} className="aspect-square rounded-[3px] border border-dashed border-line" />;
              })}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a song to pin…" className="input mb-2" data-autofocus />
            {results.map((s) => {
              const has = favs.some((f) => f.id === s.id);
              return (
                <button key={s.id} onClick={() => toggle(s)} className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-elev-2 text-left">
                  <Artwork cover={s.cover} size={36} />
                  <div className="min-w-0 flex-1"><div className="text-sm truncate">{s.title}</div><div className="text-xs text-muted truncate">{s.artists[0]?.name}</div></div>
                  <Icon name={has ? "check" : "plus"} size={15} className={has ? "text-accent" : "text-muted"} />
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
}
