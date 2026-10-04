"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { aggregateHistory, ImportError, readHistoryFiles, MAX_IMPORT_TRACKS, type HistorySummary, type ImportTrack } from "@/lib/spotify-import";
import { Icon } from "@/components/ui";

interface Status { active: boolean; total: number; added: number; pending: number; notFound: number; failed: number }
type Phase =
  | { name: "choose" }
  | { name: "reading" }
  | { name: "preview"; tracks: ImportTrack[]; summary: HistorySummary }
  | { name: "sending" }
  | { name: "error"; message: string };

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function ImportClient({ username }: { username: string }) {
  const [phase, setPhase] = useState<Phase>({ name: "choose" });
  const [status, setStatus] = useState<Status | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/import/status", { cache: "no-store" });
      if (r.ok) setStatus((await r.json()).status);
    } catch { /* offline: keep what we have */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!status?.active) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [status?.active, refresh]);

  async function read(list: FileList | File[]) {
    setPhase({ name: "reading" });
    try {
      // Everything below happens on this device. The export is never uploaded.
      const texts = await readHistoryFiles([...list]);
      const { tracks, summary } = aggregateHistory(texts);
      setPhase({ name: "preview", tracks, summary });
    } catch (e) {
      setPhase({ name: "error", message: e instanceof ImportError ? e.message : "We couldn't read that file. Pick the ZIP Spotify emailed you, or the history .json files inside it." });
    }
  }

  async function send(tracks: ImportTrack[]) {
    setPhase({ name: "sending" });
    try {
      const r = await fetch("/api/import/spotify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ v: 1, tracks }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "The import failed. Please try again.");
      setPhase({ name: "choose" });
      await refresh();
    } catch (e) {
      setPhase({ name: "error", message: e instanceof Error ? e.message : "The import failed. Please try again." });
    }
  }

  async function stop() {
    await fetch("/api/import/status", { method: "DELETE" });
    await refresh();
  }

  const busy = phase.name === "reading" || phase.name === "sending";

  return (
    <div className="space-y-8">
      {status && (
        <section className="card p-5 space-y-3" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">{status.active ? "Adding your songs…" : "Your last import"}</h2>
            {status.active && <button onClick={stop} className="btn-ghost btn-sm">Stop</button>}
          </div>
          <div className="h-1.5 rounded-full bg-elev-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.total - status.pending}>
            <div className="h-full bg-accent transition-all" style={{ width: `${status.total ? Math.round(((status.total - status.pending) / status.total) * 100) : 100}%` }} />
          </div>
          <p className="text-sm text-muted">
            <strong className="text-fg">{status.added.toLocaleString()}</strong> songs added to your diary
            {status.pending > 0 && <> · {status.pending.toLocaleString()} still being found</>}
            {status.notFound > 0 && <> · {status.notFound.toLocaleString()} not in the catalogue</>}
            {status.failed > 0 && <> · {status.failed.toLocaleString()} couldn’t be added</>}
          </p>
          {status.active && <p className="text-xs text-faint">Most-played songs first. You can leave this page; it keeps going.</p>}
          <Link href={`/${username}/diary`} className="btn-secondary btn-sm inline-flex">Open my diary →</Link>
        </section>
      )}

      {phase.name === "preview" ? (
        <section className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Ready to import</h2>
          <p className="text-sm text-muted">
            Found <strong className="text-fg">{phase.summary.plays.toLocaleString()}</strong> plays of <strong className="text-fg">{phase.summary.tracks.toLocaleString()}</strong> songs, from {fmtDate(phase.summary.firstDate)} to {fmtDate(phase.summary.lastDate)}.
            We’ll add your <strong className="text-fg">{phase.tracks.length.toLocaleString()}</strong> most-played{phase.summary.tracks > MAX_IMPORT_TRACKS ? ` (of ${phase.summary.tracks.toLocaleString()})` : ""}.
          </p>
          <ol className="text-sm space-y-1">
            {phase.tracks.slice(0, 5).map((t, i) => (
              <li key={i} className="flex gap-2"><span className="text-faint w-5 text-right tabular-nums">{i + 1}</span><span className="truncate">{t.t} <span className="text-muted">· {t.a}</span></span><span className="ml-auto text-faint tabular-nums">{t.p.toLocaleString()}×</span></li>
            ))}
          </ol>
          <p className="text-xs text-muted">These become diary entries, visible to anyone who can see your diary (see your profile privacy in Settings). They don’t appear in your followers’ feeds, and you can delete any of them.</p>
          <p className="text-xs text-faint">Only song titles, artists and play counts are sent to MusicBox. Your IP addresses, device details and podcasts stay on this device.</p>
          <div className="flex gap-3">
            <button onClick={() => send(phase.tracks)} className="btn-primary">Import {phase.tracks.length.toLocaleString()} songs</button>
            <button onClick={() => setPhase({ name: "choose" })} className="btn-ghost">Cancel</button>
          </div>
        </section>
      ) : (
        <section
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy && e.dataTransfer.files.length) void read(e.dataTransfer.files); }}
          className={`card p-8 text-center space-y-3 border-dashed ${drag ? "border-accent bg-elev" : ""}`}
        >
          <Icon name="plus" size={22} className="mx-auto text-muted" />
          <div className="text-sm font-medium">{phase.name === "reading" ? "Reading your history…" : phase.name === "sending" ? "Importing…" : "Drop your Spotify ZIP here"}</div>
          <p className="text-xs text-muted">or</p>
          <button disabled={busy} onClick={() => input.current?.click()} className="btn-secondary btn-sm">Choose file</button>
          <input ref={input} type="file" multiple accept=".zip,.json,application/zip,application/json" className="sr-only" aria-label="Spotify history file" onChange={(e) => { if (e.target.files?.length) void read(e.target.files); e.target.value = ""; }} />
          {phase.name === "error" && <p className="text-sm text-danger" role="alert">{phase.message}</p>}
        </section>
      )}

      <section className="space-y-3 text-sm">
        <h2 className="section-title border-b border-line pb-2">How to get your history from Spotify</h2>
        <ol className="list-decimal pl-5 space-y-1.5 text-muted">
          <li>Open <strong className="text-fg">spotify.com/account/privacy</strong> and scroll to <em>Download your data</em>.</li>
          <li>Tick <strong className="text-fg">Extended streaming history</strong> (your whole listening life). <em>Account data</em> also works and arrives sooner, but only covers the last year.</li>
          <li>Spotify emails you a link when the ZIP is ready. This can take days or weeks.</li>
          <li>Come back and drop the ZIP above. You don’t need to unzip it.</li>
        </ol>
      </section>
    </div>
  );
}
