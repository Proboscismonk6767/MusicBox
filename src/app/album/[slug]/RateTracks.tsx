"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard, ViewerSongState } from "@/lib/views";
import { rateSong } from "@/app/actions";
import { Sheet } from "@/components/Sheet";
import { StarInput } from "@/components/StarInput";
import { Artwork } from "@/components/Artwork";
import { Icon, Stars } from "@/components/ui";
import { useApp } from "@/components/AppProvider";

/** Rapidly rate every track on an album (§16). Keys 1–5, ←/→ to move. */
export function RateTracks({ tracks, states }: { tracks: SongCard[]; states: Record<string, ViewerSongState> }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [ratings, setRatings] = useState<Record<string, number | undefined>>(() => Object.fromEntries(tracks.map((t) => [t.id, states[t.id]?.rating])));
  const { toast } = useApp();
  const router = useRouter();
  const [, start] = useTransition();
  const t = tracks[i];
  const done = i >= tracks.length;

  const set = (r: number | null) => {
    setRatings((x) => ({ ...x, [t.id]: r ?? undefined }));
    start(async () => {
      const res = await rateSong(t.id, r);
      if (!res.ok) toast(res.error, "error");
    });
    if (r != null) setTimeout(() => setI((n) => n + 1), 220);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((n) => Math.min(tracks.length, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, tracks.length]);

  const rated = Object.values(ratings).filter((x): x is number => x != null);
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
  const close = () => { setOpen(false); router.refresh(); };

  return (
    <>
      <button onClick={() => { setI(tracks.findIndex((x) => ratings[x.id] == null) >= 0 ? tracks.findIndex((x) => ratings[x.id] == null) : 0); setOpen(true); }} className="btn-primary mt-5 w-fit">
        <Icon name="star" size={14} filled strokeWidth={0} /> Rate album tracks
      </button>
      {open && (
        <Sheet title={done ? "All rated" : `Track ${i + 1} of ${tracks.length}`} onClose={close} width="max-w-md">
          <div className="px-5 pb-5">
            <div className="h-1 bg-line rounded-full mb-6 overflow-hidden"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${(Math.min(i, tracks.length) / tracks.length) * 100}%` }} /></div>
            {!done ? (
              <div className="flex flex-col items-center text-center" key={t.id}>
                <div className="w-40 mb-4 animate-fade-up"><Artwork cover={t.cover} /></div>
                <div className="text-xl font-semibold">{t.title}</div>
                <div className="text-sm text-muted mb-6">{t.artists[0]?.name}</div>
                <StarInput value={ratings[t.id]} onChange={set} size={40} label={`Rate ${t.title}`} />
                <p className="text-[11px] text-faint mt-4">Press 1–5 after focusing the stars · ← → to move</p>
                <div className="flex gap-2 mt-6">
                  <button className="btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
                  <button className="btn-secondary" onClick={() => setI(i + 1)}>Skip</button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="display text-5xl mb-1">{avg ? avg.toFixed(2) : "—"}</div>
                <div className="text-sm text-muted mb-6">your average across {rated.length} tracks</div>
                <ol className="text-left max-h-64 overflow-y-auto mb-6">
                  {tracks.map((x, n) => (
                    <li key={x.id} className="flex items-center gap-2 py-1 text-sm"><span className="w-5 text-faint text-right">{n + 1}</span><button className="truncate hover:text-accent text-left flex-1" onClick={() => setI(n)}>{x.title}</button><Stars rating={ratings[x.id]} size={10} /></li>
                  ))}
                </ol>
                <button className="btn-primary" onClick={close}>Done</button>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
