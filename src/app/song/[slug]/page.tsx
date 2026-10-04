import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { Artwork } from "@/components/Artwork";
import { Histogram, ListCardView } from "@/components/cards";
import { SongActionPanel, SongTile } from "@/components/song-controls";
import { ReviewCard } from "@/components/social";
import { Avatar, EmptyState, ExplicitBadge, Icon, SectionHeader, Stars } from "@/components/ui";
import { compact, formatDate, formatDuration, plural } from "@/lib/format";
import { slugify } from "@/lib/util";
import { avg } from "@/lib/server/stats";
import { ReviewFilters } from "./ReviewFilters";
import { jsonForScript } from "@/lib/server/security";
import { data } from "@/lib/server/data";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ reviews?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await data.getSongPage(slug);
  if (!page) return { title: "Song not found" };
  const title = `${page.song.title} by ${page.artists.map((a) => a.name).join(", ")} — Ratings, Reviews & More`;
  const description = `${page.song.title} (${page.album.releaseDate.slice(0, 4)}) from ${page.album.title}. Rated ${avg(page.stats).toFixed(1)}/5 from ${page.stats?.ratingCount ?? 0} ratings on MusicBox.`;
  return { title: { absolute: title }, description, alternates: { canonical: `/song/${slug}` }, openGraph: { title, description } }; // share image: ./opengraph-image.tsx
}

export default async function SongPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { reviews: reviewFilter = "popular" } = await searchParams;
  const viewer = await getViewer();
  const page = await data.getSongPage(slug, viewer?.id);
  if (!page) notFound();
  const { song, album, artists, stats, card, friends, lists, similar, viewer: vstate, myEntries, evolution } = page;
  const average = avg(stats);
  const similarStates = await data.viewerStates(similar.map((s) => s.id), viewer?.id);

  let reviews = page.reviews;
  if (reviewFilter === "recent") reviews = [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (reviewFilter === "friends") reviews = reviews.filter((r) => r.followedByViewer);

  const jsonLd = {
    "@context": "https://schema.org", "@type": "MusicRecording", name: song.title, byArtist: artists.map((a) => ({ "@type": "MusicGroup", name: a.name })),
    inAlbum: { "@type": "MusicAlbum", name: album.title }, duration: `PT${Math.floor(song.durationMs / 60000)}M${Math.round((song.durationMs % 60000) / 1000)}S`, isrcCode: song.isrc,
    ...(stats?.ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: average.toFixed(2), ratingCount: stats.ratingCount, bestRating: 5, worstRating: 0.5 } } : {}),
  };

  return (
    <div>
      {/* eslint-disable-next-line react/no-danger -- JSON-LD, escaped by jsonForScript */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(jsonLd) }} />
      {/* Backdrop from artwork colours */}
      <div className="absolute inset-x-0 top-14 h-[420px] -z-10 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute inset-0 opacity-30 blur-3xl scale-110" style={{ background: `radial-gradient(ellipse at 30% 20%, ${album.palette[0]}, transparent 60%), radial-gradient(ellipse at 70% 0%, ${album.palette[1]}, transparent 55%)` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_260px] gap-8 lg:gap-10">
        <div className="min-w-0">
          {/* Header */}
          <header className="flex flex-col sm:flex-row gap-6 mb-8">
            <div className="w-full max-w-[240px] sm:w-[220px] shrink-0 self-start shadow-2xl shadow-black/60 mx-auto sm:mx-0">
              <Artwork cover={card.cover} priority rounded="rounded" />
            </div>
            <div className="min-w-0 flex flex-col justify-end">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted mb-2">Song {song.explicit && <ExplicitBadge />}</div>
              <h1 className="display text-4xl md:text-6xl leading-[1.02] break-words">{song.title}</h1>
              <div className="mt-2 text-lg">
                {artists.map((a, i) => <span key={a.id}>{i > 0 && ", "}<Link href={`/artist/${a.slug}`} className="font-medium hover:text-accent">{a.name}</Link></span>)}
                {song.featured.length > 0 && <span className="text-muted"> feat. {song.featured.join(", ")}</span>}
              </div>
              <div className="mt-1 text-sm text-muted">
                <Link href={`/album/${album.slug}`} className="hover:text-fg">{album.title}</Link> · {song.releaseDate.slice(0, 4)} · {formatDuration(song.durationMs)}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-5 text-sm">
                <div className="flex items-baseline gap-1.5"><span className="text-3xl font-semibold tabular-nums">{stats?.ratingCount ? average.toFixed(1) : "—"}</span><span className="text-muted">/ 5</span></div>
                <Stat n={stats?.ratingCount ?? 0} label="rating" />
                <Stat n={stats?.logCount ?? 0} label="log" />
                <Stat n={stats?.reviewCount ?? 0} label="review" />
                <Stat n={stats?.likeCount ?? 0} label="heart" icon />
              </div>
              <div className="flex flex-wrap gap-2 mt-5">
                {song.links.spotify && <a href={song.links.spotify} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><Icon name="play" size={11} filled /> Spotify</a>}
                {song.links.apple && <a href={song.links.apple} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><Icon name="play" size={11} filled /> Apple Music</a>}
                {song.links.youtube && <a href={song.links.youtube} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><Icon name="play" size={11} filled /> YouTube</a>}
                {song.previewUrl && <audio controls preload="none" src={song.previewUrl} className="h-7 max-w-[220px]" aria-label="30-second preview" />}
              </div>
            </div>
          </header>

          {/* Mobile action panel */}
          <div className="md:hidden mb-8"><SongActionPanel song={card} state={vstate} /></div>

          {/* Your history: relistens + rating evolution (§46) */}
          {myEntries.length > 0 && (
            <section className="mb-10 card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-sm"><span className="text-muted">You&apos;ve logged this</span> <span className="font-semibold text-accent">{plural(myEntries.length, "time")}</span></h2>
                {evolution.length > 1 && (
                  <div className="flex items-center gap-3 text-xs" aria-label="Your rating over time">
                    {evolution.map((e, i) => (
                      <span key={e.year} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-faint">→</span>}
                        <span className="text-muted">{e.year}</span><Stars rating={e.rating} size={10} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {myEntries.slice(0, 12).map((e) => (
                  <Link key={e.id} href={`/review/${e.id}`} className="shrink-0 rounded border border-line px-2.5 py-1.5 hover:border-muted text-xs">
                    <div className="text-muted">{formatDate(e.listenedAt)}</div>
                    <div className="flex items-center gap-1 mt-0.5"><Stars rating={e.rating} size={9} />{e.liked && <Icon name="heart" size={9} filled className="text-heart" />}{e.isRelisten && <Icon name="repeat" size={9} className="text-faint" />}{e.review && <Icon name="chat" size={9} className="text-faint" />}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Friends */}
          {friends.length > 0 && (
            <section className="mb-10">
              <SectionHeader title="Friends who rated this" />
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {friends.slice(0, 10).map((f) => (
                  <Link key={f.user.id} href={`/${f.user.username}`} className="flex items-center gap-2 group">
                    <Avatar user={f.user} size={30} />
                    <div className="leading-tight">
                      <div className="text-xs text-muted group-hover:text-fg">{f.user.displayName}</div>
                      <div className="flex items-center gap-1"><Stars rating={f.rating} size={10} />{f.liked && <Icon name="heart" size={9} filled className="text-heart" />}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          <section className="mb-10">
            <SectionHeader title="Reviews" action={<ReviewFilters current={reviewFilter} signedIn={!!viewer} />} />
            {reviews.length ? reviews.slice(0, 12).map((r) => <ReviewCard key={r.id} r={r} />) : (
              <EmptyState icon="chat" title={reviewFilter === "friends" ? "No friends have reviewed this" : "No reviews yet"} body="Be the first to say what you think about this song — one line is plenty." />
            )}
          </section>

          {/* Similar */}
          {similar.length > 0 && (
            <section className="mb-10">
              <SectionHeader title="Similar songs" />
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {similar.map((s) => <SongTile key={s.id} song={s} state={similarStates[s.id]} />)}
              </div>
            </section>
          )}

          {lists.length > 0 && (
            <section className="mb-10">
              <SectionHeader title="Lists featuring this song" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                {lists.map((l) => <ListCardView key={l.id} list={l} size="sm" />)}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-8">
          <div className="hidden md:block"><SongActionPanel song={card} state={vstate} /></div>
          <section>
            <SectionHeader title="Community rating" />
            {stats?.ratingCount ? (
              <>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-2xl font-semibold">{average.toFixed(1)}</span><Stars rating={Math.round(average * 2) / 2} size={13} /><span className="text-xs text-muted ml-auto">{compact(stats.ratingCount)} ratings</span></div>
                <Histogram data={stats.histogram} total={stats.ratingCount} height={72} />
              </>
            ) : <p className="text-sm text-muted">Not enough ratings yet.</p>}
          </section>
          <section>
            <SectionHeader title="Details" />
            <dl className="text-sm space-y-2.5">
              <Detail label="Released">{formatDate(song.releaseDate, false)}, {song.releaseDate.slice(0, 4)}</Detail>
              <Detail label="Album"><Link href={`/album/${album.slug}`} className="link">{album.title}</Link> <span className="text-faint">· Track {song.trackNumber}</span></Detail>
              <Detail label="Artist">{artists.map((a, i) => <span key={a.id}>{i > 0 && ", "}<Link href={`/artist/${a.slug}`} className="link">{a.name}</Link></span>)}</Detail>
              {song.featured.length > 0 && <Detail label="Featuring">{song.featured.join(", ")}</Detail>}
              {song.writers.length > 0 && <Detail label="Writers">{song.writers.join(", ")}</Detail>}
              {song.producers.length > 0 && <Detail label="Producers">{song.producers.join(", ")}</Detail>}
              <Detail label="Genres"><span className="flex flex-wrap gap-1">{song.genres.map((g) => <Link key={g} href={`/genre/${slugify(g)}`} className="chip h-6">{g}</Link>)}</span></Detail>
              {album.label && <Detail label="Label">{album.label}</Detail>}
              <Detail label="Length">{formatDuration(song.durationMs)}</Detail>
              {song.isrc && <Detail label="ISRC"><span className="font-mono text-xs text-muted">{song.isrc}</span></Detail>}
            </dl>
          </section>
          {page.otherTracks.length > 0 && (
            <section>
              <SectionHeader title={`More from ${album.title}`} href={`/album/${album.slug}`} />
              <ol className="text-sm space-y-1.5">
                {page.otherTracks.map((t) => (
                  <li key={t.id} className="flex gap-2"><span className="text-faint w-4 text-right tabular-nums">{t.trackNumber}</span><Link href={`/song/${t.slug}`} className="link truncate">{t.title}</Link></li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ n, label, icon }: { n: number; label: string; icon?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      {icon && <Icon name="heart" size={11} filled className="text-heart/80 self-center" />}
      <span className="font-semibold tabular-nums">{compact(n)}</span>
      <span className="text-muted">{n === 1 ? label : label + "s"}</span>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <dt className="text-muted text-xs uppercase tracking-wider pt-0.5">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
