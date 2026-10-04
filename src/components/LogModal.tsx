"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SongCard, ViewerSongState } from "@/lib/views";
import { logSong, updateEntry } from "@/app/actions";
import { Sheet } from "./Sheet";
import { StarInput } from "./StarInput";
import { Artwork } from "./Artwork";
import { Icon } from "./ui";
import { useApp } from "./AppProvider";

export interface LogTarget {
  song: SongCard;
  state?: ViewerSongState;
  entry?: { id: string; listenedAt: string; rating?: number; liked: boolean; review?: string; hasSpoiler?: boolean; tags: string[]; isRelisten: boolean; context?: string; memory?: string };
  rating?: number | null;
}

const SUGGESTED_TAGS = ["late-night", "summer", "nostalgic", "gym", "study", "party", "driving", "rainy"];
const CONTEXTS = ["headphones", "car", "concert", "party", "vinyl", "radio", "other"] as const;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LogModal({ target, onClose }: { target: LogTarget; onClose: () => void }) {
  const { toast } = useApp();
  const router = useRouter();
  const e = target.entry;
  const [date, setDate] = useState(e?.listenedAt ?? today());
  const [rating, setRating] = useState<number | null>(e?.rating ?? target.rating ?? target.state?.rating ?? null);
  const [liked, setLiked] = useState(e?.liked ?? target.state?.liked ?? false);
  const [review, setReview] = useState(e?.review ?? "");
  const [spoiler, setSpoiler] = useState(e?.hasSpoiler ?? false);
  const [tags, setTags] = useState<string[]>(e?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [relisten, setRelisten] = useState(e?.isRelisten ?? (target.state?.logCount ?? 0) > 0);
  const [context, setContext] = useState(e?.context ?? "");
  const [memory, setMemory] = useState(e?.memory ?? "");
  const [more, setMore] = useState(!!(e?.context || e?.memory));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pop, setPop] = useState(false);

  const addTag = (t: string) => {
    const clean = t.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (clean && !tags.includes(clean) && tags.length < 8) setTags([...tags, clean]);
    setTagDraft("");
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const payload = { listenedAt: date, rating, liked, review, hasSpoiler: spoiler, tags, isRelisten: relisten, context: context as never, memory };
      const res = e ? await updateEntry(e.id, payload) : await logSong({ songId: target.song.id, ...payload });
      if (!res.ok) return setError(res.error);
      toast(e ? "Entry updated." : "Logged.", "ok", !e && res.data ? { label: "View", href: `/review/${res.data}` } : undefined);
      router.refresh();
      onClose();
    });
  };

  const s = target.song;
  const plays = (target.state?.logCount ?? 0) + (e ? 0 : 1);
  return (
    <Sheet title={e ? "Edit entry" : "Log song"} onClose={onClose}>
      <form onSubmit={(ev) => { ev.preventDefault(); submit(); }} onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) submit(); }} className="px-5 pb-5">
        <div className="flex gap-4 items-center mb-5">
          <Artwork cover={s.cover} size={64} />
          <div className="min-w-0">
            <div className="font-semibold text-lg leading-tight truncate">{s.title}</div>
            <div className="text-sm text-muted truncate">{s.artists.map((a) => a.name).join(", ")} · {s.year}</div>
            {!e && plays > 1 && <div className="text-xs text-accent mt-1 flex items-center gap-1"><Icon name="repeat" size={12} /> This will be listen #{plays}</div>}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 mb-5">
          <div>
            <span className="label">Rating</span>
            <div className="flex items-center gap-2">
              <StarInput value={rating} onChange={setRating} size={30} />
              <span className="text-xs text-muted w-8 tabular-nums">{rating ? rating.toFixed(1) : "—"}</span>
            </div>
          </div>
          <div>
            <span className="label">Like</span>
            <button type="button" onClick={() => { setLiked(!liked); setPop(true); setTimeout(() => setPop(false), 300); }} aria-pressed={liked} aria-label={liked ? "Unlike" : "Like"} className={`h-[30px] w-[30px] flex items-center justify-center transition-colors ${liked ? "text-heart" : "text-faint hover:text-muted"} ${pop ? "animate-pop" : ""}`}>
              <Icon name="heart" size={26} filled={liked} strokeWidth={1.6} />
            </button>
          </div>
          <div>
            <label className="label" htmlFor="log-date">Listened on</label>
            <input id="log-date" type="date" max={today()} value={date} onChange={(ev) => setDate(ev.target.value)} className="input h-9 w-auto [color-scheme:dark]" />
          </div>
        </div>

        <label className="flex items-center gap-2.5 mb-5 cursor-pointer select-none w-fit">
          <input type="checkbox" checked={relisten} onChange={(ev) => setRelisten(ev.target.checked)} className="sr-only peer" />
          <span className="h-5 w-9 rounded-full bg-line peer-checked:bg-accent relative transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
          <span className="text-sm">I&apos;ve listened to this before</span>
        </label>

        <label className="label" htmlFor="log-review">Review <span className="normal-case tracking-normal font-normal text-faint">— optional</span></label>
        <textarea id="log-review" value={review} onChange={(ev) => setReview(ev.target.value)} rows={3} maxLength={5000} placeholder="What do you think about this song?" className="textarea mb-2" data-autofocus />
        {review && (
          <label className="flex items-center gap-2 text-xs text-muted mb-4 cursor-pointer w-fit">
            <input type="checkbox" checked={spoiler} onChange={(ev) => setSpoiler(ev.target.checked)} className="accent-[var(--color-accent)]" /> Hide behind a reveal (spoiler / personal)
          </label>
        )}

        <span className="label mt-3">Tags</span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="chip chip-on">#{t} <Icon name="x" size={11} /></button>
          ))}
          <input value={tagDraft} onChange={(ev) => setTagDraft(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); addTag(tagDraft); } }} onBlur={() => tagDraft && addTag(tagDraft)} placeholder="Add tag…" className="h-7 bg-transparent text-xs outline-none placeholder:text-faint w-24" aria-label="Add tag" />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).slice(0, 6).map((t) => (
            <button key={t} type="button" onClick={() => addTag(t)} className="chip">+ {t}</button>
          ))}
        </div>

        <button type="button" onClick={() => setMore(!more)} className="text-xs text-muted hover:text-fg mb-3 flex items-center gap-1">
          <Icon name="plus" size={12} className={`transition-transform ${more ? "rotate-45" : ""}`} /> Context & memory
        </button>
        {more && (
          <div className="mb-4 space-y-3 animate-fade-up">
            <div className="flex flex-wrap gap-1.5">
              {CONTEXTS.map((c) => (
                <button key={c} type="button" onClick={() => setContext(context === c ? "" : c)} className={`chip ${context === c ? "chip-on" : ""}`}>{c}</button>
              ))}
            </div>
            <input value={memory} onChange={(ev) => setMemory(ev.target.value)} maxLength={500} placeholder="A memory attached to this listen — e.g. “first heard this on the train home”" className="input" aria-label="Memory" />
          </div>
        )}

        {error && <p className="text-sm text-danger mb-3" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-line mt-2 -mx-5 px-5 pt-4">
          <span className="text-[11px] text-faint hidden sm:block">⌘/Ctrl + Enter to save</span>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={pending} className="btn-primary min-w-24">{pending ? "Saving…" : e ? "Save" : "Log it"}</button>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
