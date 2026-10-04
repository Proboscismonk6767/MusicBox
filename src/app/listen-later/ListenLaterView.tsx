"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SongCard, ViewerSongState } from "@/lib/views";
import { SongRow } from "@/components/song-controls";
import { Artwork } from "@/components/Artwork";
import { EmptyState, Icon } from "@/components/ui";
import { useApp } from "@/components/AppProvider";

type Item = { song: SongCard; addedAt: string; genres: string[] };

export function ListenLaterView({ items, states }: { items: Item[]; states: Record<string, ViewerSongState> }) {
  const [sort, setSort] = useState("added");
  const [genre, setGenre] = useState("");
  const [pick, setPick] = useState<Item | null>(null);
  const { openLog } = useApp();
  const genres = useMemo(() => [...new Set(items.flatMap((i) => i.genres))].sort(), [items]);
  const shown = useMemo(() => {
    const list = items.filter((i) => !genre || i.genres.includes(genre));
    if (sort === "added") list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    if (sort === "oldest") list.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    if (sort === "rating") list.sort((a, b) => b.song.avg - a.song.avg);
    if (sort === "release") list.sort((a, b) => b.song.releaseDate.localeCompare(a.song.releaseDate));
    if (sort === "artist") list.sort((a, b) => a.song.artists[0].name.localeCompare(b.song.artists[0].name));
    if (sort === "length") list.sort((a, b) => a.song.durationMs - b.song.durationMs);
    return list;
  }, [items, sort, genre]);

  const shuffle = () => {
    const pool = shown.filter((i) => i.song.id !== pick?.song.id);
    if (pool.length) setPick(pool[Math.floor(Math.random() * pool.length)]);
  };

  return (
    <div className="max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="display text-4xl md:text-5xl">Listen Later</h1>
          <p className="text-muted mt-1">{items.length} {items.length === 1 ? "song" : "songs"} to listen to</p>
        </div>
        {items.length > 1 && <button onClick={shuffle} className="btn-primary"><Icon name="shuffle" size={15} /> Suggest one</button>}
      </header>

      {pick && (
        <div className="card p-4 mb-6 flex items-center gap-4 animate-fade-up">
          <Artwork cover={pick.song.cover} size={72} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-accent mb-1">Tonight, try…</div>
            <Link href={`/song/${pick.song.slug}`} className="text-lg font-semibold hover:text-accent">{pick.song.title}</Link>
            <div className="text-sm text-muted">{pick.song.artists[0]?.name} · {pick.song.year}</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => openLog({ song: pick.song, state: states[pick.song.id] })} className="btn-primary btn-sm">Log it</button>
            <button onClick={shuffle} className="btn-ghost btn-sm">Another</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon="bookmark" title="Nothing saved yet" body="Tap the bookmark on any song to save it here. It's your queue of things to get to — no pressure." action={<Link href="/discover" className="btn-primary">Discover songs</Link>} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 rounded-md bg-elev border border-line px-2 text-xs outline-none" aria-label="Sort">
              <option value="added">Recently added</option>
              <option value="oldest">Oldest first</option>
              <option value="rating">Community rating</option>
              <option value="release">Newest releases</option>
              <option value="artist">Artist A–Z</option>
              <option value="length">Shortest first</option>
            </select>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className="h-8 rounded-md bg-elev border border-line px-2 text-xs outline-none" aria-label="Filter by genre">
              <option value="">All genres</option>
              {genres.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>{shown.map((i) => <SongRow key={i.song.id} song={i.song} state={states[i.song.id]} />)}</div>
        </>
      )}
    </div>
  );
}
