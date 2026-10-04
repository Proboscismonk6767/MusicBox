"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/ui";
import { ExternalArt } from "@/components/ArtworkImage";
import { yearOf } from "@/lib/format";

interface Catalogue {
  source?: string;
  tracks: { externalId: string; title: string; artist: { name: string }; album: { title: string; artworkUrl?: string; releaseDate: string }; durationMs: number }[];
  artists: { externalId: string; name: string; genre?: string }[];
  albums: { externalId: string; title: string; artist: string; artworkUrl?: string; releaseDate: string; trackCount?: number }[];
}

/** Everything in the world catalogue that isn't on MusicBox yet. Opening an
 *  item imports it (see /open/[kind]/[id]). */
export function ExternalResults({ q }: { q: string }) {
  const [state, setState] = useState<{ loading: boolean; data?: Catalogue; error?: string }>({ loading: true });

  useEffect(() => {
    let live = true;
    setState({ loading: true });
    fetch(`/api/search/catalogue?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => live && setState({ loading: false, data }))
      .catch(() => live && setState({ loading: false, error: "The world music catalogue is unreachable right now." }));
    return () => { live = false; };
  }, [q]);

  const d = state.data;
  const none = d && !d.tracks.length && !d.artists.length && !d.albums.length;
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <section className="space-y-8">
      <SectionHeader title="From all music" action={<span className="text-[11px] text-faint">{d?.source ?? "Music catalogue"} · added to MusicBox when opened</span>} />
      {state.loading && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="flex gap-3 items-center"><div className="skeleton w-11 h-11" /><div className="flex-1 space-y-1.5"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-3 w-1/4" /></div></div>)}</div>}
      {state.error && <p className="text-sm text-muted">{state.error} MusicBox results above still work.</p>}
      {none && <p className="text-sm text-muted">Nothing else found.</p>}

      {d && d.artists.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {d.artists.map((a) => (
            <a key={a.externalId} href={`/open/artist/${a.externalId}`} className="flex items-center gap-2.5 card px-3 py-2 hover:border-line">
              <span className="w-8 h-8 rounded-full bg-elev-2 flex items-center justify-center text-sm font-semibold">{a.name[0]}</span>
              <span><span className="block text-sm font-medium">{a.name}</span><span className="text-xs text-muted">Artist{a.genre ? ` · ${a.genre}` : ""}</span></span>
            </a>
          ))}
        </div>
      )}

      {d && d.tracks.length > 0 && (
        <div>
          {d.tracks.map((t) => (
            <a key={t.externalId} href={`/open/song/${t.externalId}`} className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-md hover:bg-elev">
              <ExternalArt src={t.album.artworkUrl} className="w-11 h-11 rounded-[3px] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{t.title}</div>
                <div className="text-xs text-muted truncate">{[t.artist.name, t.album.title, yearOf(t.album.releaseDate)].filter(Boolean).join(" · ")}</div>
              </div>
              <span className="text-xs text-faint tabular-nums">{fmt(t.durationMs)}</span>
              <span className="text-xs text-accent w-12 text-right">Open →</span>
            </a>
          ))}
        </div>
      )}

      {d && d.albums.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
          {d.albums.map((a) => (
            <a key={a.externalId} href={`/open/album/${a.externalId}`} className="group">
              <ExternalArt src={a.artworkUrl} className="aspect-square w-full rounded-[3px] transition-transform group-hover:scale-[1.03]" />
              <div className="text-sm font-medium mt-1.5 truncate group-hover:text-accent">{a.title}</div>
              <div className="text-xs text-muted truncate">{[a.artist, yearOf(a.releaseDate)].filter(Boolean).join(" · ")}</div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
