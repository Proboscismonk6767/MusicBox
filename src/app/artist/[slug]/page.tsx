import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { Artwork } from "@/components/Artwork";
import { ArtistImage, ListCardView } from "@/components/cards";
import { SongRow } from "@/components/song-controls";
import { ReviewCard } from "@/components/social";
import { Avatar, SectionHeader } from "@/components/ui";
import { slugify } from "@/lib/util";
import { ArtistActions } from "./ArtistActions";
import { Suspense } from "react";
import { FullDiscography } from "./FullDiscography";
import { data } from "@/lib/server/data";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await data.getArtistPage((await params).slug);
  if (!page) return { title: "Artist not found" };
  return { title: `${page.artist.name} — Songs, Ratings & Reviews`, description: `The best ${page.artist.name} songs, ranked by the MusicBox community.`, alternates: { canonical: `/artist/${page.artist.slug}` } };
}

export default async function ArtistPage({ params }: Props) {
  const viewer = await getViewer();
  const page = await data.getArtistPage((await params).slug, viewer?.id);
  if (!page) notFound();
  const { artist } = page;
  const states = await data.viewerStates([...page.popular, ...page.highest].map((s) => s.id), viewer?.id);
  return (
    <div>
      <header className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-10">
        <ArtistImage artist={artist} className="w-40 md:w-48 text-5xl shadow-2xl shadow-black/60" />
        <div className="text-center sm:text-left min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted mb-2">Artist</div>
          <h1 className="display text-5xl md:text-7xl leading-none">{artist.name}</h1>
          <div className="flex flex-wrap justify-center sm:justify-start items-center gap-x-5 gap-y-1 mt-4 text-sm text-muted">
            {page.ratingCount > 0 && <span className="flex items-center gap-1.5"><span className="text-fg font-semibold">{page.avg.toFixed(2)}</span> avg song rating</span>}
            <span><span className="text-fg font-semibold">{page.ratingCount}</span> ratings</span>
            <span><span className="text-fg font-semibold">{page.fans.length}</span> fans</span>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-3">
            {artist.genres.map((g) => <Link key={g} href={`/genre/${slugify(g)}`} className="chip h-6">{g}</Link>)}
          </div>
          <ArtistActions artistId={artist.id} following={page.following} favourite={page.favourite} />
        </div>
      </header>
      {artist.bio && <p className="text-fg/80 max-w-2xl mb-10 leading-relaxed">{artist.bio}</p>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-10">
        <div className="min-w-0 space-y-10">
          <section>
            <SectionHeader title="Popular on MusicBox" />
            {page.popular.map((s, i) => <SongRow key={s.id} song={s} index={i + 1} state={states[s.id]} />)}
          </section>
          {page.highest.length > 0 && (
            <section>
              <SectionHeader title="Highest rated" />
              {page.highest.slice(0, 5).map((s, i) => <SongRow key={s.id} song={s} index={i + 1} state={states[s.id]} />)}
            </section>
          )}
          <section>
            <SectionHeader title="Community reviews" />
            {page.reviews.length ? page.reviews.map((r) => <ReviewCard key={r.id} r={r} withSong />) : <p className="text-sm text-muted">No reviews yet.</p>}
          </section>
        </div>
        <aside className="space-y-10">
          <section>
            <SectionHeader title="Discography" />
            <div className="grid grid-cols-2 gap-4">
              {page.albums.map((a) => (
                <Link key={a.slug} href={`/album/${a.slug}`} className="group">
                  <Artwork cover={a.cover} className="transition-transform group-hover:scale-[1.03]" />
                  <div className="text-sm font-medium mt-1.5 truncate group-hover:text-accent">{a.title}</div>
                  <div className="text-xs text-muted">{a.year} · {a.count} songs</div>
                </Link>
              ))}
            </div>
          </section>
          <Suspense fallback={<div className="grid grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton aspect-square" />)}</div>}>
            <FullDiscography name={artist.name} externalId={artist.externalId} knownAlbumTitles={page.albums.map((x) => x.title)} />
          </Suspense>
          {page.lists.length > 0 && (
            <section>
              <SectionHeader title={`Lists featuring ${artist.name}`} />
              <div className="grid grid-cols-2 gap-4">{page.lists.map((l) => <ListCardView key={l.id} list={l} size="sm" />)}</div>
            </section>
          )}
          {page.fans.length > 0 && (
            <section>
              <SectionHeader title="Fans" />
              <div className="flex flex-wrap gap-2">
                {page.fans.map((u) => <Link key={u.id} href={`/${u.username}`} title={u.displayName}><Avatar user={u} size={34} /></Link>)}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
