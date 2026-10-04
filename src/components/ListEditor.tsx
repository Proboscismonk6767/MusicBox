"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard } from "@/lib/views";
import type { Visibility } from "@/lib/types";
import { createList, updateList } from "@/app/actions";
import { useApp } from "./AppProvider";
import { Artwork, Collage } from "./Artwork";
import { Icon } from "./ui";

interface Item { song: SongCard; note?: string }

/** Create/edit list with drag-and-drop ranking and per-entry notes (§10). */
export function ListEditor({ initial }: { initial?: { id: string; title: string; description: string; isRanked: boolean; visibility: Visibility; items: Item[] } }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isRanked, setRanked] = useState(initial?.isRanked ?? true);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "public");
  const [items, setItems] = useState<Item[]>(initial?.items ?? []);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongCard[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { toast } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      if (r.ok) setResults((await r.json()).songs);
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const change = (fn: () => void) => { fn(); setDirty(true); };
  const add = (s: SongCard) => {
    if (items.some((i) => i.song.id === s.id)) return toast(`“${s.title}” is already in this list.`, "error");
    change(() => setItems([...items, { song: s }]));
  };
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    change(() => setItems(next));
  };

  const save = () => {
    setError(null);
    start(async () => {
      const payload = { title, description, isRanked, visibility, items: items.map((i) => ({ songId: i.song.id, note: i.note })) };
      const r = initial ? await updateList(initial.id, payload) : await createList(payload);
      if (!r.ok) return setError(r.error);
      setDirty(false);
      toast(initial ? "List saved." : "List created.");
      router.push(`/list/${initial?.id ?? r.data}`);
      router.refresh();
    });
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-10 max-w-6xl">
      <div className="min-w-0">
        <input value={title} onChange={(e) => change(() => setTitle(e.target.value))} placeholder="List title" maxLength={120} className="w-full bg-transparent display text-4xl md:text-5xl outline-none placeholder:text-faint mb-3" aria-label="Title" autoFocus={!initial} />
        <textarea value={description} onChange={(e) => change(() => setDescription(e.target.value))} placeholder="What's this list about? (optional)" rows={2} maxLength={2000} className="textarea mb-6" aria-label="Description" />

        <div className="relative mb-6">
          <Icon name="search" size={15} className="absolute left-3 top-3 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for songs to add…" className="input pl-9" aria-label="Search songs to add" />
          {results.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 card shadow-2xl shadow-black/60 max-h-80 overflow-y-auto p-1">
              {results.map((s) => {
                const has = items.some((i) => i.song.id === s.id);
                return (
                  <button key={s.id} onClick={() => add(s)} disabled={has} className="w-full flex items-center gap-3 p-2 rounded hover:bg-elev-2 text-left disabled:opacity-50">
                    <Artwork cover={s.cover} size={36} />
                    <div className="min-w-0 flex-1"><div className="text-sm truncate">{s.title}</div><div className="text-xs text-muted truncate">{s.artists[0]?.name} · {s.year}</div></div>
                    <Icon name={has ? "check" : "plus"} size={15} className={has ? "text-accent" : "text-muted"} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between section-title border-b border-line pb-2 mb-2">
          <span>{items.length} songs</span>
          {items.length > 1 && <span className="normal-case tracking-normal font-normal text-faint">Drag to reorder</span>}
        </div>
        {items.length === 0 && <p className="text-sm text-muted py-10 text-center border border-dashed border-line rounded-lg">Search above to add your first song.</p>}
        <ol>
          {items.map((it, i) => (
            <li
              key={it.song.id}
              draggable
              onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={() => { if (drag != null) move(drag, i); setDrag(null); setOver(null); }}
              className={`group flex items-start gap-3 py-2.5 border-b border-line-soft transition-colors ${drag === i ? "opacity-40" : ""} ${over === i && drag !== i ? "border-t-2 border-t-accent" : ""}`}
            >
              <span className="cursor-grab text-faint hover:text-muted pt-3" aria-hidden><Icon name="grip" size={16} /></span>
              {isRanked && <span className="w-7 pt-3 text-right tabular-nums text-sm font-semibold text-muted">{i + 1}</span>}
              <Artwork cover={it.song.cover} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{it.song.title}</div>
                <div className="text-xs text-muted truncate">{it.song.artists[0]?.name}</div>
                <input value={it.note ?? ""} onChange={(e) => change(() => setItems(items.map((x, j) => (j === i ? { ...x, note: e.target.value } : x))))} placeholder="Add a note…" maxLength={500} className="mt-1 w-full bg-transparent text-xs text-fg/80 italic outline-none placeholder:text-faint placeholder:not-italic focus:bg-elev rounded px-1 -mx-1 py-0.5" aria-label={`Note for ${it.song.title}`} />
              </div>
              <div className="flex items-center gap-0.5 pt-2">
                <button onClick={() => move(i, i - 1)} disabled={i === 0} className="btn-ghost h-7 w-7 px-0 text-xs" aria-label="Move up">↑</button>
                <button onClick={() => move(i, i + 1)} disabled={i === items.length - 1} className="btn-ghost h-7 w-7 px-0 text-xs" aria-label="Move down">↓</button>
                <button onClick={() => change(() => setItems(items.filter((_, j) => j !== i)))} className="btn-ghost h-7 w-7 px-0 hover:!text-danger" aria-label={`Remove ${it.song.title}`}><Icon name="x" size={14} /></button>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-20 h-fit">
        <Collage covers={items.slice(0, 8).map((i) => i.song.cover).filter((c, j, a) => a.findIndex((x) => x.title === c.title) === j)} className="w-full max-w-[240px]" />
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm"><span className="block font-medium">Ranked</span><span className="text-xs text-muted">Show numbers next to each song</span></span>
          <input type="checkbox" checked={isRanked} onChange={(e) => change(() => setRanked(e.target.checked))} className="sr-only peer" />
          <span className="h-5 w-9 shrink-0 rounded-full bg-line peer-checked:bg-accent relative transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-4" />
        </label>
        <div>
          <span className="label">Visibility</span>
          <div className="grid grid-cols-3 gap-1 bg-bg border border-line rounded-md p-1">
            {(["public", "unlisted", "private"] as const).map((v) => (
              <button key={v} onClick={() => change(() => setVisibility(v))} className={`h-8 rounded text-xs capitalize ${visibility === v ? "bg-elev-2 text-fg" : "text-muted hover:text-fg"}`}>{v}</button>
            ))}
          </div>
          <p className="text-xs text-faint mt-1.5">{visibility === "public" ? "Anyone can find it; shows in feeds." : visibility === "unlisted" ? "Only people with the link." : "Only you."}</p>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={pending || !title.trim()} className="btn-primary flex-1">{pending ? "Saving…" : initial ? "Save changes" : "Create list"}</button>
          <button onClick={() => { if (!dirty || confirm("Discard your changes?")) router.back(); }} className="btn-ghost">Cancel</button>
        </div>
      </aside>
    </div>
  );
}
