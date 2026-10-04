"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { SongCard } from "@/lib/views";
import { Artwork } from "@/components/Artwork";
import { LyricEditor } from "@/components/LyricEditor";
import { Icon } from "@/components/ui";
import { useApp } from "@/components/AppProvider";
import { formatDuration } from "@/lib/format";

export function ProfileLyric({ lyric, isSelf }: { lyric: { text: string; startMs: number | null; song: SongCard } | null; isSelf: boolean }) {
  if (!lyric) {
    if (!isSelf) return null;
    return (
      <LyricEditor
        trigger={(open) => (
          <button onClick={open} className="w-full sm:w-72 shrink-0 self-stretch min-h-[84px] rounded-lg border border-dashed border-line px-4 py-3 flex items-center justify-center text-center text-muted hover:border-muted hover:text-fg transition-colors">
            <span className="display italic text-[15px]">&ldquo;Click to pin a lyric&rdquo;</span>
          </button>
        )}
      />
    );
  }
  const { text, song, startMs } = lyric;
  return (
    <figure className="group relative w-full sm:w-80 shrink-0 rounded-lg border border-line bg-elev/60 px-4 py-3">
      <span aria-hidden className="display absolute -top-3 left-3 text-4xl leading-none text-accent">&ldquo;</span>
      <blockquote className="display italic text-[15px] leading-snug text-fg/90 whitespace-pre-line line-clamp-4 pt-1">{text}</blockquote>
      <figcaption className="mt-2.5 flex items-center gap-2 text-xs text-muted">
        <Link href={`/song/${song.slug}`} className="flex items-center gap-2 min-w-0 hover:text-fg">
          <Artwork cover={song.cover} size={20} />
          <span className="truncate"><span className="text-fg/80">{song.title}</span> · {song.artists[0]?.name}</span>
        </Link>
        <PreviewChip songId={song.id} title={song.title} startMs={startMs} />
        {isSelf && (
          <LyricEditor
            current={lyric}
            trigger={(open) => (
              <button onClick={open} className="ml-auto shrink-0 text-faint hover:text-fg opacity-60 group-hover:opacity-100 focus:opacity-100" aria-label="Edit pinned lyric"><Icon name="settings" size={13} /></button>
            )}
          />
        )}
      </figcaption>
    </figure>
  );
}

/** Timestamp chip that plays the song's 30-second preview clip. */
function PreviewChip({ songId, title, startMs }: { songId: string; title: string; startMs: number | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState(0);
  const { toast } = useApp();

  useEffect(() => () => { audio.current?.pause(); audio.current = null; }, []);

  const toggle = async () => {
    const a = audio.current;
    if (a) {
      if (a.paused) { await a.play().catch(() => {}); setState("playing"); }
      else { a.pause(); setState("paused"); }
      return;
    }
    setState("loading");
    try {
      const r = await fetch(`/api/preview/${encodeURIComponent(songId)}`);
      const body = (await r.json()) as { url?: string | null; error?: string };
      if (!r.ok || !body.url) { setState("idle"); return toast(body.error ?? "No preview available for this song.", "error"); }
      const el = new Audio(body.url);
      el.volume = 0.8;
      el.ontimeupdate = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
      el.onended = () => { setState("idle"); setProgress(0); audio.current = null; };
      audio.current = el;
      await el.play();
      setState("playing");
    } catch {
      setState("idle");
      toast("Couldn't play the preview.", "error");
    }
  };

  const playing = state === "playing";
  const label = startMs != null ? formatDuration(startMs) : "Play";
  return (
    <button
      onClick={toggle}
      className={`relative shrink-0 overflow-hidden inline-flex items-center gap-1 rounded px-1.5 py-px font-mono text-[10px] tabular-nums transition-colors ${playing ? "bg-accent/15 text-accent" : "bg-elev-2 text-faint hover:text-fg"}`}
      aria-label={playing ? `Pause preview of ${title}` : `Play preview of ${title}`}
      title={playing ? "Pause preview" : "Play the 30-second preview"}
    >
      {state === "loading" ? (
        <span className="h-2 w-2 rounded-full border border-current border-t-transparent animate-spin" />
      ) : playing ? (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden><rect x="1" y="1" width="2" height="6" /><rect x="5" y="1" width="2" height="6" /></svg>
      ) : (
        <Icon name="play" size={8} filled />
      )}
      {label}
      {state !== "idle" && <span className="absolute left-0 bottom-0 h-px bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />}
    </button>
  );
}
