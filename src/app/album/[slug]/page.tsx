import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { getAlbumPage } from "@/lib/server/queries";
import { Artwork } from "@/components/Artwork";
import { SongRow } from "@/components/song-controls";
import { SectionHeader, Stars } from "@/components/ui";
import { formatRuntime } from "@/lib/format";
import { slugify } from "@/lib/util";
import { RateTracks } from "./RateTracks";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getAlbumPage((await params).slug);
  if (!page) return { title: "Album not found" };
  return { title: `${page.album.title} by ${page.artist.name} — Track Ratings`, description: `Every track on ${page.album.title} (${page.album.releaseDate.slice(0, 4)}), rated by the MusicBox community.`, alternates: { canonical: `/album/${page.album.slug}` } };
}

export default async function AlbumPage({ params }: Props) {
  const viewer = await getViewer();
  const page = getAlbumPage((await params).slug, viewer?.id);
  if (!page) notFound();
  const { album, artist, tracks } = page;
  return (
    <div>
      <header className="flex flex-col sm:flex-row gap-6 mb-10">
        <div className="w-full max-w-[240px] sm:w-[220px] shrink-0 self-start shadow-2xl shadow-black/60 mx-auto sm:mx-0"><Artwork cover={page.cover} priority rounded="rounded" /></div>
        <div className="flex flex-col justify-end min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted mb-2">Album</div>
          <h1 className="display text-4xl md:text-6xl leading-[1.02]">{album.title}</h1>
          <div className="mt-2 text-lg"><Link href={`/artist/${artist.slug}`} className="font-medium hover:text-accent">{artist.name}</Link></div>
          <div className="mt-1 text-sm text-muted">{album.releaseDate.slice(0, 4)} · {tracks.length} songs · {formatRuntime(page.runtimeMs)}{album.label && <> · {album.label}</>}</div>
          <div className="flex flex-wrap gap-1.5 mt-3">{album.genres.map((g) => <Link key={g} href={`/genre/${slugify(g)}`} className="chip h-6">{g}</Link>)}</div>
          <div className="flex flex-wrap items-center gap-6 mt-5 text-sm">
            {page.avgTrack > 0 && <div><span className="text-2xl font-semibold tabular-nums">{page.avgTrack.toFixed(2)}</span> <span className="text-muted">avg track rating</span></div>}
            {page.myRatedCount > 0 && <div className="flex items-center gap-2"><span className="text-muted">You:</span> <Stars rating={Math.round(page.myAvg * 2) / 2} size={13} /> <span className="text-xs text-faint">{page.myRatedCount}/{tracks.length} rated</span></div>}
          </div>
          {viewer && <RateTracks tracks={tracks} states={page.states} />}
        </div>
      </header>

      <section className="max-w-4xl">
        <SectionHeader title="Tracklist" />
        <div>{tracks.map((t) => <SongRow key={t.id} song={t} state={page.states[t.id]} index={t.trackNumber} showAlbum={false} showCover={false} />)}</div>
        {album.producers.length > 0 && <p className="text-xs text-muted mt-6">Produced by {album.producers.join(", ")}</p>}
      </section>

      {page.otherAlbums.length > 0 && (
        <section className="mt-12">
          <SectionHeader title={`More by ${artist.name}`} href={`/artist/${artist.slug}`} />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {page.otherAlbums.map((a) => (
              <Link key={a.slug} href={`/album/${a.slug}`} className="group"><Artwork cover={a.cover} className="transition-transform group-hover:scale-[1.03]" /><div className="text-sm mt-1.5 truncate group-hover:text-accent">{a.title}</div><div className="text-xs text-muted">{a.year}</div></Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
