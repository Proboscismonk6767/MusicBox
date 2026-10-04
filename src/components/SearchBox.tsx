"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SongCard, UserMini, Cover } from "@/lib/views";
import { Artwork } from "./Artwork";
import { Avatar, Icon } from "./ui";
import { ArtistImage } from "./cards";
import { ExternalArt } from "./ArtworkImage";
import { yearOf } from "@/lib/format";

interface Results {
  songs: SongCard[];
  artists: { name: string; slug: string; imageUrl?: string; hue: number }[];
  albums: { title: string; slug: string; artist: string; year: number; cover: Cover }[];
  users: UserMini[];
}

type Item = { href: string; key: string };
interface Catalogue {
  tracks: { externalId: string; title: string; artist: { name: string }; album: { title: string; artworkUrl?: string; releaseDate: string } }[];
  artists: { externalId: string; name: string; genre?: string }[];
  albums: { externalId: string; title: string; artist: string; artworkUrl?: string; releaseDate: string }[];
}

export function SearchBox({ autoFocus = false, className = "" }: { autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cat, setCat] = useState<Catalogue | null>(null);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  // Debounced autocomplete.
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`, { signal: ctrl.signal });
        if (r.ok) { setRes(await r.json()); setActive(0); }
      } catch { /* aborted */ }
      setLoading(false);
    }, 120);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // Whole-world catalogue (slower, so separately debounced).
  useEffect(() => {
    setCat(null);
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/catalogue?scope=quick&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setCat(await r.json());
      } catch { /* aborted */ }
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const items: Item[] = res ? [
    ...res.songs.map((s) => ({ href: `/song/${s.slug}`, key: "s" + s.id })),
    ...res.artists.map((a) => ({ href: `/artist/${a.slug}`, key: "a" + a.slug })),
    ...res.albums.map((a) => ({ href: `/album/${a.slug}`, key: "al" + a.slug })),
    ...res.users.map((u) => ({ href: `/${u.username}`, key: "u" + u.id })),
    ...(cat?.artists ?? []).slice(0, 2).map((a) => ({ href: `/open/artist/${a.externalId}`, key: "xa" + a.externalId })),
    ...(cat?.tracks ?? []).slice(0, 5).map((t) => ({ href: `/open/song/${t.externalId}`, key: "xt" + t.externalId })),
    ...(cat?.albums ?? []).slice(0, 3).map((a) => ({ href: `/open/album/${a.externalId}`, key: "xl" + a.externalId })),
  ] : [];
  const go = (href: string) => {
    setOpen(false);
    setQ("");
    // /open/* are route handlers that import then redirect: use a full navigation.
    if (href.startsWith("/open/")) window.location.assign(href);
    else router.push(href);
  };
  const idxOf = (key: string) => items.findIndex((i) => i.key === key);
  const rowCls = (key: string) => `flex items-center gap-3 px-3 py-2 cursor-pointer ${idxOf(key) === active ? "bg-elev-2" : "hover:bg-elev-2"}`;
  const empty = res && !res.songs.length && !res.artists.length && !res.albums.length && !res.users.length;

  return (
    <div ref={box} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); if (items[active] && open && res) go(items[active].href); else if (q.trim()) go(`/search?q=${encodeURIComponent(q)}`); }}
        className="relative"
      >
        <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input
          id="global-search"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="Search songs, artists, people…"
          className="input h-9 pl-9 pr-8 bg-elev border-line-soft"
          role="combobox"
          aria-expanded={open && !!res}
          aria-controls="search-results"
          aria-label="Search"
        />
        {loading ? <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-faint border-t-transparent animate-spin" /> : <kbd className="hidden md:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-faint border border-line rounded px-1">/</kbd>}
      </form>
      {open && res && q.trim() && (
        <div id="search-results" role="listbox" className="absolute left-0 right-0 mt-1.5 z-50 bg-elev border border-line rounded-lg shadow-2xl shadow-black/70 overflow-hidden animate-fade-up max-h-[70vh] overflow-y-auto min-w-[320px]">
          {res.songs.length > 0 && <Group label="Songs" />}
          {res.songs.map((s) => (
            <div key={s.id} role="option" aria-selected={idxOf("s" + s.id) === active} onMouseEnter={() => setActive(idxOf("s" + s.id))} onClick={() => go(`/song/${s.slug}`)} className={rowCls("s" + s.id)}>
              <Artwork cover={s.cover} size={40} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{s.title}</div>
                <div className="text-xs text-muted truncate">{s.artists[0]?.name}</div>
                <div className="text-[11px] text-faint truncate">{s.album.title} · {s.year}</div>
              </div>
            </div>
          ))}
          {res.artists.length > 0 && <Group label="Artists" />}
          {res.artists.map((a) => (
            <div key={a.slug} role="option" aria-selected={idxOf("a" + a.slug) === active} onMouseEnter={() => setActive(idxOf("a" + a.slug))} onClick={() => go(`/artist/${a.slug}`)} className={rowCls("a" + a.slug)}>
              <ArtistImage artist={a} className="w-9 text-[10px]" />
              <span className="text-sm font-medium">{a.name}</span>
            </div>
          ))}
          {res.albums.length > 0 && <Group label="Albums" />}
          {res.albums.map((a) => (
            <div key={a.slug} role="option" aria-selected={idxOf("al" + a.slug) === active} onMouseEnter={() => setActive(idxOf("al" + a.slug))} onClick={() => go(`/album/${a.slug}`)} className={rowCls("al" + a.slug)}>
              <Artwork cover={a.cover} size={36} />
              <div className="min-w-0"><div className="text-sm font-medium truncate">{a.title}</div><div className="text-xs text-muted">{a.artist} · {a.year}</div></div>
            </div>
          ))}
          {res.users.length > 0 && <Group label="People" />}
          {res.users.map((u) => (
            <div key={u.id} role="option" aria-selected={idxOf("u" + u.id) === active} onMouseEnter={() => setActive(idxOf("u" + u.id))} onClick={() => go(`/${u.username}`)} className={rowCls("u" + u.id)}>
              <Avatar user={u} size={32} />
              <div><div className="text-sm font-medium">{u.displayName}</div><div className="text-xs text-muted">@{u.username}</div></div>
            </div>
          ))}
          {cat && (cat.tracks.length > 0 || cat.artists.length > 0 || cat.albums.length > 0) && <Group label="From all music" />}
          {cat?.artists.slice(0, 2).map((a) => (
            <div key={a.externalId} role="option" aria-selected={idxOf("xa" + a.externalId) === active} onMouseEnter={() => setActive(idxOf("xa" + a.externalId))} onClick={() => go(`/open/artist/${a.externalId}`)} className={rowCls("xa" + a.externalId)}>
              <span className="w-9 h-9 rounded-full bg-elev-2 flex items-center justify-center text-sm font-semibold">{a.name[0]}</span>
              <div className="min-w-0"><div className="text-sm font-medium truncate">{a.name}</div><div className="text-xs text-muted">Artist{a.genre ? ` · ${a.genre}` : ""}</div></div>
            </div>
          ))}
          {cat?.tracks.slice(0, 5).map((t) => (
            <div key={t.externalId} role="option" aria-selected={idxOf("xt" + t.externalId) === active} onMouseEnter={() => setActive(idxOf("xt" + t.externalId))} onClick={() => go(`/open/song/${t.externalId}`)} className={rowCls("xt" + t.externalId)}>
              <ExternalArt src={t.album.artworkUrl} className="w-10 h-10 rounded-[3px] shrink-0" />
              <div className="min-w-0"><div className="text-sm font-semibold truncate">{t.title}</div><div className="text-xs text-muted truncate">{t.artist.name}</div><div className="text-[11px] text-faint truncate">{[t.album.title, yearOf(t.album.releaseDate)].filter(Boolean).join(" · ")}</div></div>
            </div>
          ))}
          {cat?.albums.slice(0, 3).map((a) => (
            <div key={a.externalId} role="option" aria-selected={idxOf("xl" + a.externalId) === active} onMouseEnter={() => setActive(idxOf("xl" + a.externalId))} onClick={() => go(`/open/album/${a.externalId}`)} className={rowCls("xl" + a.externalId)}>
              <ExternalArt src={a.artworkUrl} className="w-9 h-9 rounded-[3px] shrink-0" />
              <div className="min-w-0"><div className="text-sm font-medium truncate">{a.title}</div><div className="text-xs text-muted truncate">{["Album", a.artist, yearOf(a.releaseDate)].filter(Boolean).join(" · ")}</div></div>
            </div>
          ))}
          {empty && !cat && <div className="px-3 py-4 text-sm text-muted">Searching all music for “{q}”…</div>}
          <Link href={`/search?q=${encodeURIComponent(q)}`} onClick={() => setOpen(false)} className="block border-t border-line px-3 py-2.5 text-xs text-muted hover:text-fg hover:bg-elev-2">
            {`See all results for “${q}” →`}
          </Link>
        </div>
      )}
    </div>
  );
}

function Group({ label }: { label: string }) {
  return <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>;
}
