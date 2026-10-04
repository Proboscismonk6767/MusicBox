import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { Artwork } from "@/components/Artwork";
import { ArtistBubble, Histogram, ListCardView } from "@/components/cards";
import { ReviewCard } from "@/components/social";
import { EmptyState, Icon, SectionHeader, Stars } from "@/components/ui";
import { SongTile } from "@/components/song-controls";
import { FavouritesEditor } from "./FavouritesEditor";
import { data } from "@/lib/server/data";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getViewer();
  const p = await data.getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const o = await data.profileOverview(p.raw, viewer?.id);
  const states = await data.viewerStates(o.favourites.map((s) => s.id), viewer?.id);
  const avg = o.ratingCount ? o.histogram.reduce((a, n, i) => a + (n * (i + 1)) / 2, 0) / o.ratingCount : 0;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-10">
      <div className="min-w-0 space-y-12">
        <section>
          <SectionHeader title="Favourite songs" action={p.isSelf ? <FavouritesEditor favourites={o.favourites} /> : undefined} />
          {o.favourites.length ? (
            <div className={`grid gap-3 sm:gap-4 ${o.favourites.length === 5 || o.favourites.length === 6 ? "grid-cols-3 sm:grid-cols-6" : o.favourites.length > 6 ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
              {o.favourites.map((s) => <SongTile key={s.id} song={s} state={states[s.id]} />)}
            </div>
          ) : p.isSelf ? (
            <EmptyState icon="pin" title="Pin your favourites" body="Choose 4–8 songs that define you. They'll sit at the top of your profile." action={<FavouritesEditor favourites={[]} asButton />} />
          ) : (
            <p className="text-sm text-muted">No favourites pinned yet.</p>
          )}
        </section>

        <section>
          <SectionHeader title="Recently logged" href={`/${p.user.username}/diary`} />
          {o.recent.length ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {o.recent.map((r) => (
                <Link key={r.entryId} href={`/review/${r.entryId}`} className="group relative" title={`${r.song.title} — ${r.song.artists[0]?.name}`}>
                  <Artwork cover={r.song.cover} className="transition-transform duration-200 group-hover:scale-[1.03]" />
                  <div className="absolute inset-x-0 top-0 aspect-square rounded-[3px] bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-1.5 flex flex-col justify-end">
                    <div className="text-[11px] font-semibold leading-tight line-clamp-2">{r.song.title}</div>
                    <div className="text-[10px] text-white/70 truncate">{r.song.artists[0]?.name}</div>
                  </div>
                  <div className="flex items-center gap-1 mt-1 h-3">
                    <Stars rating={r.rating} size={9} />
                    {r.liked && <Icon name="heart" size={9} filled className="text-heart" />}
                    {r.isRelisten && <Icon name="repeat" size={9} className="text-faint" />}
                    {r.review && <Icon name="chat" size={9} className="text-faint" />}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="book"
              title={p.isSelf ? "Your diary is empty" : "Nothing logged yet"}
              body={p.isSelf ? "Search for a song you've listened to recently and start building your music history." : "When they log songs, they'll show up here."}
              action={p.isSelf ? <Link href="/search" className="btn-primary">Find a song</Link> : undefined}
            />
          )}
        </section>

        {o.reviews.length > 0 && (
          <section>
            <SectionHeader title="Recent reviews" href={`/${p.user.username}/reviews`} />
            {o.reviews.map((r) => <ReviewCard key={r.id} r={r} withSong compact />)}
          </section>
        )}

        {o.lists.length > 0 && (
          <section>
            <SectionHeader title="Lists" href={`/${p.user.username}/lists`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">{o.lists.map((l) => <ListCardView key={l.id} list={l} />)}</div>
          </section>
        )}
      </div>

      <aside className="space-y-10">
        <section>
          <SectionHeader title="Ratings" action={<span className="text-[11px] text-faint">{o.ratingCount} · avg {avg.toFixed(1)}</span>} />
          <Histogram data={o.histogram} height={56} />
        </section>
        {o.favArtists.length > 0 && (
          <section>
            <SectionHeader title="Favourite artists" />
            <div className="grid grid-cols-4 gap-3">{o.favArtists.map((a) => <ArtistBubble key={a.slug} artist={a} />)}</div>
          </section>
        )}
        <section className="card p-4 space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Logged this year</span><span className="font-semibold tabular-nums">{p.counts.thisYear}</span></div>
          <div className="flex justify-between"><span className="text-muted">Songs rated</span><span className="font-semibold tabular-nums">{p.counts.rated}</span></div>
          <div className="flex justify-between"><span className="text-muted">Hearts</span><Link href={`/${p.user.username}/likes`} className="font-semibold tabular-nums hover:text-accent">{p.counts.likes}</Link></div>
          {p.isSelf && <div className="flex justify-between"><span className="text-muted">Listen later</span><Link href="/listen-later" className="font-semibold tabular-nums hover:text-accent">{p.counts.listenLater} songs to listen to</Link></div>}
          <Link href={`/${p.user.username}/stats`} className="btn-secondary w-full mt-2"><Icon name="chart" size={14} /> Full stats</Link>
          <Link href={`/${p.user.username}/year/${new Date().getFullYear()}`} className="btn-ghost w-full">Year in review →</Link>
        </section>
        {p.compatibility && p.compatibility.sharedTop.length > 0 && (
          <section>
            <SectionHeader title="You both love" />
            <div className="grid grid-cols-4 gap-2">{p.compatibility.sharedTop.map((s) => <Link key={s.id} href={`/song/${s.slug}`} title={s.title}><Artwork cover={s.cover} /></Link>)}</div>
          </section>
        )}
      </aside>
    </div>
  );
}
