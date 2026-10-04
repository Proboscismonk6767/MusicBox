import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { ArtistBubble, ListCardView } from "@/components/cards";
import { SongTile } from "@/components/song-controls";
import { ReviewCard } from "@/components/social";
import { SectionHeader } from "@/components/ui";
import { data } from "@/lib/server/data";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await data.getGenrePage((await params).slug);
  return page ? { title: `Best ${page.name} Songs`, description: `Top-rated and popular ${page.name} songs on MusicBox.` } : { title: "Genre not found" };
}

export default async function GenrePage({ params }: Props) {
  const viewer = await getViewer();
  const { slug } = await params;
  const page = await data.getGenrePage(slug, viewer?.id);
  if (!page) notFound();
  const states = await data.viewerStates([...page.topRated, ...page.popular].map((s) => s.id), viewer?.id);
  const related = (await data.allGenres()).filter((g) => g.slug !== slug).slice(0, 14);
  return (
    <div className="space-y-12">
      <header>
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted mb-2">Genre · {page.count} songs</div>
        <h1 className="display text-5xl md:text-7xl">{page.name}</h1>
        <div className="flex flex-wrap gap-1.5 mt-5">{related.map((g) => <Link key={g.slug} href={`/genre/${g.slug}`} className="chip">{g.name}</Link>)}</div>
      </header>
      <section>
        <SectionHeader title="Top rated" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">{page.topRated.map((s) => <SongTile key={s.id} song={s} state={states[s.id]} />)}</div>
      </section>
      <section>
        <SectionHeader title="Popular" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">{page.popular.map((s) => <SongTile key={s.id} song={s} state={states[s.id]} />)}</div>
      </section>
      <section>
        <SectionHeader title="Notable artists" />
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-4">{page.artists.map((a) => <ArtistBubble key={a.slug} artist={a} />)}</div>
      </section>
      <div className="grid lg:grid-cols-[1fr_340px] gap-10">
        <section>
          <SectionHeader title="Recent reviews" />
          {page.reviews.length ? page.reviews.map((r) => <ReviewCard key={r.id} r={r} withSong compact />) : <p className="text-sm text-muted">No reviews yet.</p>}
        </section>
        {page.lists.length > 0 && (
          <section>
            <SectionHeader title="Popular lists" />
            <div className="grid grid-cols-2 gap-4">{page.lists.map((l) => <ListCardView key={l.id} list={l} size="sm" />)}</div>
          </section>
        )}
      </div>
    </div>
  );
}
