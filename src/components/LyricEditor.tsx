"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SongCard } from "@/lib/views";
import { clearProfileLyric, setProfileLyric } from "@/app/actions";
import { formatDuration } from "@/lib/format";
import { Sheet } from "./Sheet";
import { Artwork } from "./Artwork";
import { Icon } from "./ui";
import { useApp } from "./AppProvider";

const MAX_CHARS = 300;
const MAX_LINES = 4;

type Line = { ms: number | null; text: string };
type Lyrics = { status: "loading" } | { status: "error"; message: string } | { status: "instrumental" } | { status: "none" } | { status: "ok"; synced: boolean; lines: Line[] };
type Current = { text: string; startMs: number | null; song: SongCard };
type Range = { start: number; end: number } | null;

/**
 * Pin a lyric to your profile: pick a song, then tap the line(s) you love in its
 * time-synced lyrics. Opened from a song page (song preset) or from your profile.
 */
export function LyricEditor({ song: preset, current, trigger }: { song?: SongCard; current?: Current | null; trigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const initialSong = preset ?? current?.song ?? null;
  const [song, setSong] = useState<SongCard | null>(initialSong);
  const { toast } = useApp();
  const router = useRouter();
  const [pending, start] = useTransition();

  const openSheet = () => { setSong(initialSong); setOpen(true); };
  const done = (msg: string) => { toast(msg); setOpen(false); router.refresh(); };

  const save = (s: SongCard, text: string, startMs: number | null) => start(async () => {
    const r = await setProfileLyric(s.id, text, startMs);
    if (!r.ok) return toast(r.error, "error");
    done("Lyric pinned to your profile.");
  });
  const remove = () => start(async () => {
    const r = await clearProfileLyric();
    if (!r.ok) return toast(r.error, "error");
    done("Lyric removed.");
  });

  return (
    <>
      {trigger(openSheet)}
      {open && (
        <Sheet title={song ? "Pick a lyric" : "Pick a song"} onClose={() => setOpen(false)} width="max-w-xl">
          {song ? (
            <LinePicker
              key={song.id}
              song={song}
              current={current && current.song.id === song.id ? current : null}
              onBack={preset ? undefined : () => setSong(null)}
              onSave={(text, ms) => save(song, text, ms)}
              onRemove={current ? remove : undefined}
              pending={pending}
            />
          ) : (
            <SongSearch onPick={setSong} />
          )}
        </Sheet>
      )}
    </>
  );
}

// ── Step 1: pick a song ─────────────────────────────────────────────────

function SongSearch({ onPick }: { onPick: (s: SongCard) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongCard[] | null>(null);

  useEffect(() => {
    if (!q.trim()) { setResults(null); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
      if (r.ok) setResults((await r.json()).songs);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="px-5 pb-5">
      <div className="relative mb-3">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a song…" className="input pl-9" data-autofocus />
      </div>
      <div className="min-h-[240px]">
        {results === null ? (
          <div className="flex flex-col items-center justify-center text-center h-[240px] text-muted">
            <span className="display text-5xl leading-none text-faint">&ldquo;</span>
            <p className="text-sm mt-2">Find the song, then tap the line you love.</p>
          </div>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted text-center py-16">No songs match &ldquo;{q}&rdquo;.</p>
        ) : (
          results.map((s) => (
            <button key={s.id} onClick={() => onPick(s)} className="group w-full flex items-center gap-3 p-2 rounded-md hover:bg-elev-2 text-left">
              <Artwork cover={s.cover} size={48} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.title}</div>
                <div className="text-xs text-muted truncate">{s.artists.map((a) => a.name).join(", ")} · {s.album.title}</div>
              </div>
              <span className="text-faint group-hover:text-fg text-lg leading-none pr-1" aria-hidden>›</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Step 2: pick the lines ──────────────────────────────────────────────

function LinePicker({ song, current, onBack, onSave, onRemove, pending }: {
  song: SongCard; current: Current | null; onBack?: () => void; onSave: (text: string, startMs: number | null) => void; onRemove?: () => void; pending: boolean;
}) {
  const [lyrics, setLyrics] = useState<Lyrics>({ status: "loading" });
  const [range, setRange] = useState<Range>(null);
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState(current?.text ?? "");
  const listRef = useRef<HTMLDivElement>(null);
  const { toast } = useApp();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/lyrics/${encodeURIComponent(song.id)}`);
        const body = await r.json();
        if (!alive) return;
        if (!r.ok) return setLyrics({ status: "error", message: body.error ?? "Couldn't load lyrics." });
        setLyrics(body);
        if (body.status === "ok" && current) {
          // Re-select the pinned lines so editing starts where you left off.
          const first = current.text.split("\n")[0];
          const at = (body.lines as Line[]).findIndex((l) => l.text === first && (current.startMs == null || l.ms === current.startMs));
          if (at >= 0) setRange({ start: at, end: Math.min(body.lines.length - 1, at + current.text.split("\n").length - 1) });
          else setManual(true);
        }
        if (body.status !== "ok") setManual(true);
      } catch {
        if (alive) { setLyrics({ status: "error", message: "Couldn't load lyrics." }); setManual(true); }
      }
    })();
    return () => { alive = false; };
  }, [song.id, current]);

  // Bring the selection into view once lyrics arrive.
  useEffect(() => {
    if (lyrics.status === "ok" && range) listRef.current?.querySelector(`[data-line="${range.start}"]`)?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyrics.status]);

  const lines = useMemo(() => (lyrics.status === "ok" ? lyrics.lines : []), [lyrics]);
  const synced = lyrics.status === "ok" && lyrics.synced;
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return lines.map((l, i) => ({ ...l, i })).filter((l) => !f || l.text.toLowerCase().includes(f));
  }, [lines, filter]);

  const tap = (i: number) => setRange((r) => {
    if (!r) return { start: i, end: i };
    if (i >= r.start && i <= r.end) {
      if (r.start === r.end) return null;
      if (i === r.start) return { start: r.start + 1, end: r.end };
      if (i === r.end) return { start: r.start, end: r.end - 1 };
      return { start: i, end: i };
    }
    const size = r.end - r.start + 1;
    if ((i === r.end + 1 || i === r.start - 1) && size >= MAX_LINES) { toast(`Pick up to ${MAX_LINES} lines.`, "error"); return r; }
    if (i === r.end + 1) return { start: r.start, end: i };
    if (i === r.start - 1) return { start: i, end: r.end };
    return { start: i, end: i };
  });

  const picked = range ? lines.slice(range.start, range.end + 1) : [];
  const pickedText = picked.map((l) => l.text).join("\n");
  const tooLong = pickedText.length > MAX_CHARS;
  const startMs = picked[0]?.ms ?? null;

  return (
    <div className="flex flex-col">
      {/* Song header */}
      <div className="mx-5 mb-3 flex items-center gap-3 rounded-lg border border-line bg-elev-2/40 p-2">
        {onBack && <button onClick={onBack} className="btn-ghost h-8 w-8 px-0" aria-label="Pick a different song"><span className="text-lg leading-none">‹</span></button>}
        <Artwork cover={song.cover} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{song.title}</div>
          <div className="text-xs text-muted truncate">{song.artists.map((a) => a.name).join(", ")}</div>
        </div>
        {synced && !manual && <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-faint mr-1">Synced</span>}
      </div>

      {manual ? (
        <div className="px-5">
          {lyrics.status !== "ok" && (
            <p className="text-xs text-muted mb-2">
              {lyrics.status === "loading" ? "Loading lyrics…" : lyrics.status === "instrumental" ? "This one's an instrumental, so there are no lyrics to pick. You can still type something." : lyrics.status === "error" ? `${lyrics.message} You can type the line yourself instead.` : "We couldn't find lyrics for this song. Type the line yourself."}
            </p>
          )}
          <textarea value={manualText} onChange={(e) => setManualText(e.target.value.slice(0, MAX_CHARS))} rows={3} placeholder="Type the line that gets you…" className="input min-h-[96px] resize-none italic" data-autofocus />
          <div className="flex justify-between text-[11px] text-faint mt-1">
            {lyrics.status === "ok" ? <button onClick={() => setManual(false)} className="hover:text-fg">← Back to lyrics</button> : <span />}
            <span className="tabular-nums">{manualText.length}/{MAX_CHARS}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a line…" className="input h-8 pl-8 text-sm" disabled={lyrics.status !== "ok"} />
            </div>
            <button onClick={() => setManual(true)} className="text-[11px] uppercase tracking-wider text-faint hover:text-fg whitespace-nowrap">Type it instead</button>
          </div>
          <div
            ref={listRef}
            className="relative mx-5 h-[min(46vh,380px)] overflow-y-auto overscroll-contain rounded-lg border border-line py-2 [mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]"
            role="listbox"
            aria-label="Lyrics"
            aria-multiselectable
          >
            {lyrics.status === "loading" ? (
              <div className="space-y-3 px-3 py-2" aria-label="Loading lyrics">
                {Array.from({ length: 10 }).map((_, k) => (
                  <div key={k} className="flex gap-3 items-center"><div className="h-3 w-9 rounded bg-elev-2 animate-pulse" /><div className="h-3.5 rounded bg-elev-2 animate-pulse" style={{ width: `${45 + ((k * 37) % 45)}%` }} /></div>
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className="text-sm text-muted text-center py-16">No line matches &ldquo;{filter}&rdquo;.</p>
            ) : (
              shown.map((l) => {
                const on = !!range && l.i >= range.start && l.i <= range.end;
                return (
                  <button
                    key={l.i}
                    data-line={l.i}
                    role="option"
                    aria-selected={on}
                    onClick={() => tap(l.i)}
                    className={`w-full grid grid-cols-[44px_1fr] gap-2 items-baseline px-3 py-1.5 text-left border-l-2 transition-colors ${on ? "border-accent bg-accent/10 text-fg" : "border-transparent text-muted hover:text-fg hover:bg-elev-2/60"}`}
                  >
                    <span className={`text-[11px] tabular-nums font-mono ${on ? "text-accent" : "text-faint"}`}>{l.ms != null ? formatDuration(l.ms) : ""}</span>
                    <span className={`text-[15px] leading-snug ${on ? "font-medium" : ""}`}>{l.text}</span>
                  </button>
                );
              })
            )}
          </div>
          <p className="px-5 mt-2 text-[11px] text-faint">Tap a line to pick it. Tap the line above or below to add it (up to {MAX_LINES}).</p>
        </>
      )}

      {/* Preview + actions */}
      <div className="sticky bottom-0 mt-4 border-t border-line bg-elev px-5 py-4">
        {!manual && picked.length > 0 && (
          <div className="mb-3 flex gap-2">
            <span className="display text-3xl leading-none text-accent" aria-hidden>&ldquo;</span>
            <div className="min-w-0">
              <p className="display italic text-[15px] leading-snug whitespace-pre-line line-clamp-4">{pickedText}</p>
              <p className={`text-[11px] mt-1 ${tooLong ? "text-heart" : "text-faint"}`}>
                {tooLong ? `Too long to pin (${pickedText.length}/${MAX_CHARS} characters). Pick fewer lines.` : <>{song.title}{startMs != null && <> · at {formatDuration(startMs)}</>}</>}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {onRemove ? <button onClick={onRemove} disabled={pending} className="btn-ghost text-muted">Remove</button> : <span />}
          <button
            onClick={() => (manual ? onSave(manualText, null) : onSave(pickedText, startMs))}
            disabled={pending || (manual ? !manualText.trim() : !picked.length || tooLong)}
            className="btn-primary"
          >
            {pending ? "Saving…" : manual || picked.length ? "Pin to profile" : "Pick a line"}
          </button>
        </div>
      </div>
    </div>
  );
}
