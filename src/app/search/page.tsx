import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { search, viewerStates, allGenres } from "@/lib/server/queries";
import { ArtistBubble, ListCardView } from "@/components/cards";
import { SongRow } from "@/components/song-controls";
import { Artwork } from "@/components/Artwork";
import { Avatar, SectionHeader } from "@/components/ui";
import { SearchBox } from "@/components/SearchBox";
import { ExternalResults } from "./ExternalResults";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { q = "", error } = await searchParams;
  const viewer = await getViewer();
  const r = q ? search(q, 20, viewer?.id) : null;
  const states = r ? viewerStates(r.songs.map((s) => s.id), viewer?.id) : {};
  const total = r ? r.songs.length + r.artists.length + r.albums.length + r.users.length + r.lists.length : 0;
  return (
    <div className="max-w-5xl">
      <h1 className="display text-4xl mb-4">{q ? <>Results for “{q}”</> : "Search"}</h1>
      <SearchBox className="md:hidden mb-6" autoFocus={!q} />
      {error && <p role="alert" className="mb-6 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-[#ffd0d0]">{error === "busy" ? "Lots of requests right now — give it a few seconds and try again." : error === "unavailable" ? "That item isn't available in the music catalogue anymore." : "We couldn't open that from the music catalogue. Please try again."}</p>}
      {!q && (
        <div>
          <p className="text-muted mb-6">Search every song, artist and album in the world — plus people and lists on MusicBox. Tip: press <kbd className="border border-line rounded px-1 text-xs">/</kbd> anywhere to search.</p>
          <SectionHeader title="Browse by genre" />
          <div className="flex flex-wrap gap-2">{allGenres().map((g) => <Link key={g.slug} href={`/genre/${g.slug}`} className="chip">{g.name} <span className="text-faint">{g.count}</span></Link>)}</div>
        </div>
      )}
      {r && (
        <div className="space-y-10">
          {r.songs.length > 0 && (
            <section>
              <SectionHeader title={`Songs · ${r.songs.length}`} />
              {r.songs.map((s) => <SongRow key={s.id} song={s} state={states[s.id]} />)}
            </section>
          )}
          {r.artists.length > 0 && (
            <section>
              <SectionHeader title="Artists" />
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">{r.artists.map((a) => <ArtistBubble key={a.slug} artist={a} sub={a.genres[0]} />)}</div>
            </section>
          )}
          {r.albums.length > 0 && (
            <section>
              <SectionHeader title="Albums" />
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                {r.albums.map((a) => <Link key={a.slug} href={`/album/${a.slug}`} className="group"><Artwork cover={a.cover} /><div className="text-sm font-medium mt-1.5 truncate group-hover:text-accent">{a.title}</div><div className="text-xs text-muted">{a.artist} · {a.year}</div></Link>)}
              </div>
            </section>
          )}
          {r.users.length > 0 && (
            <section>
              <SectionHeader title="People" />
              <div className="flex flex-wrap gap-5">{r.users.map((u) => <Link key={u.id} href={`/${u.username}`} className="flex items-center gap-2 group"><Avatar user={u} size={36} /><div><div className="text-sm font-medium group-hover:text-accent">{u.displayName}</div><div className="text-xs text-muted">@{u.username}</div></div></Link>)}</div>
            </section>
          )}
          {r.lists.length > 0 && (
            <section>
              <SectionHeader title="Lists" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">{r.lists.map((l) => <ListCardView key={l.id} list={l} size="sm" />)}</div>
            </section>
          )}
          {total === 0 && <p className="text-muted">Nobody on MusicBox has opened this yet — pick it from all music below and be the first to log it.</p>}
          <ExternalResults q={q} />
        </div>
      )}
    </div>
  );
}
