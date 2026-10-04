import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { allGenres, friendsListening, hiddenGems, highlyRated, newReleases, popularLists, trendingReviews, trendingSongs, viewerStates, suggestedUsers } from "@/lib/server/queries";
import { becauseYouLike, recommendations } from "@/lib/server/insights";
import { ListCardView } from "@/components/cards";
import { SongTile } from "@/components/song-controls";
import { FollowButton, ReviewCard } from "@/components/social";
import { Avatar, SectionHeader, Stars } from "@/components/ui";
import type { SongCard } from "@/lib/views";

export const metadata = { title: "Discover", description: "Popular, highly rated and hidden-gem songs on MusicBox." };
export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const viewer = await getViewer();
  const trending = trendingSongs(12);
  const top = highlyRated(12);
  const gems = hiddenGems(12);
  const fresh = newReleases(12);
  const reviews = trendingReviews(6, viewer?.id);
  const lists = popularLists(6, viewer?.id);
  const friends = viewer ? friendsListening(viewer.id, 12) : [];
  const recs = viewer ? recommendations(viewer.id, 12) : [];
  const because = viewer ? becauseYouLike(viewer.id) : null;
  const people = suggestedUsers(viewer?.id, 6);
  const all: SongCard[] = [...trending, ...top, ...gems, ...fresh, ...friends.map((f) => f.song), ...recs.map((r) => r.song), ...(because?.songs ?? [])];
  const states = viewerStates([...new Set(all.map((s) => s.id))], viewer?.id);
  const row = (songs: SongCard[], sub?: (s: SongCard, i: number) => React.ReactNode) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {songs.slice(0, 12).map((s, i) => <SongTile key={s.id} song={s} state={states[s.id]} sub={sub?.(s, i)} />)}
    </div>
  );

  return (
    <div className="space-y-14">
      <header>
        <h1 className="display text-4xl md:text-6xl">Discover</h1>
        <p className="text-muted mt-2">Songs moving through the community right now — and a few you might have missed.</p>
        <div className="flex flex-wrap gap-1.5 mt-5">
          {allGenres().slice(0, 16).map((g) => <Link key={g.slug} href={`/genre/${g.slug}`} className="chip">{g.name}</Link>)}
        </div>
      </header>

      {recs.length > 0 && (
        <section id="for-you">
          <SectionHeader title="For you" />
          {row(recs.map((r) => r.song), (s) => <div className="text-[10px] text-faint mt-0.5 line-clamp-2 leading-snug">{recs.find((r) => r.song.id === s.id)?.reason}</div>)}
        </section>
      )}

      <section>
        <SectionHeader title="Popular this week" />
        {row(trending)}
      </section>

      {friends.length > 0 && (
        <section>
          <SectionHeader title="Friends are listening" />
          {row(friends.map((f) => f.song), (s) => {
            const f = friends.find((x) => x.song.id === s.id)!;
            return <div className="flex items-center gap-1 mt-1"><Avatar user={f.user} size={14} /><Stars rating={f.rating} size={9} /></div>;
          })}
        </section>
      )}

      <section>
        <SectionHeader title="Highly rated" />
        {row(top, (s) => <div className="text-[11px] text-muted mt-0.5 tabular-nums">★ {s.avg.toFixed(2)} · {s.ratingCount}</div>)}
      </section>

      {because && because.songs.length > 0 && (
        <section>
          <SectionHeader title={`Because you like “${because.anchor.title}”`} />
          {row(because.songs)}
        </section>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-10">
        <section className="min-w-0">
          <SectionHeader title="Trending reviews" />
          {reviews.map((r) => <ReviewCard key={r.id} r={r} withSong compact />)}
        </section>
        <section>
          <SectionHeader title="People with great taste" />
          <div className="space-y-4">
            {people.map((u) => (
              <div key={u.id} className="flex items-start gap-3">
                <Link href={`/${u.username}`}><Avatar user={u} size={40} /></Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/${u.username}`} className="font-medium text-sm hover:text-accent">{u.displayName}</Link>
                  <div className="text-xs text-accent/80">{u.reason}</div>
                  <p className="text-xs text-muted line-clamp-2 mt-0.5">{u.bio}</p>
                </div>
                {viewer && <FollowButton userId={u.id} following={false} size="sm" />}
              </div>
            ))}
          </div>
        </section>
      </div>

      {gems.length > 0 && (
        <section>
          <SectionHeader title="Hidden gems" action={<span className="text-[11px] text-faint">Loved by a few, heard by fewer</span>} />
          {row(gems, (s) => <div className="text-[11px] text-muted mt-0.5">★ {s.avg.toFixed(1)} · {s.ratingCount} ratings</div>)}
        </section>
      )}

      <section>
        <SectionHeader title="Recently released" />
        {row(fresh, (s) => <div className="text-[11px] text-faint">{s.year}</div>)}
      </section>

      <section>
        <SectionHeader title="Popular lists" href="/lists" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">{lists.map((l) => <ListCardView key={l.id} list={l} size="sm" />)}</div>
      </section>
    </div>
  );
}
