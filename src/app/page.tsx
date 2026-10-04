import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { Feed } from "@/components/Feed";
import { Artwork, Collage } from "@/components/Artwork";
import { ListCardView, MiniSong } from "@/components/cards";
import { SongTile } from "@/components/song-controls";
import { FollowButton, ReviewCard } from "@/components/social";
import { Avatar, Icon, SectionHeader, Stars } from "@/components/ui";
import { Logo } from "@/components/Shell";
import { demoDataEnabled } from "@/lib/server/env";
import { data } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) return <Landing />;
  const full = await data.getUserByName(viewer.username);
  if (full && !full.onboarded) redirect("/onboarding");

  const { items, next } = await data.getFeed(viewer.id);
  const trending = await data.trendingSongs(8);
  const favs = await data.friendsFavourites(viewer.id, 5);
  const people = await data.suggestedUsers(viewer.id, 4);
  const lists = await data.popularLists(3, viewer.id);
  const recs = await data.recommendations(viewer.id, 6);
  const states = await data.viewerStates(recs.map((r) => r.song.id), viewer.id);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-10">
      <div className="min-w-0">
        <h1 className="display text-3xl md:text-4xl mb-1">Hey {viewer.displayName.split(" ")[0]}.</h1>
        <p className="text-muted mb-6">Here&apos;s what people you follow have been listening to.</p>

        {recs.length > 0 && (
          <section className="mb-8">
            <SectionHeader title="Picked for you" href="/discover#for-you" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {recs.map((r) => <SongTile key={r.song.id} song={r.song} state={states[r.song.id]} sub={<div className="text-[10px] text-faint mt-0.5 line-clamp-2 leading-snug">{r.reason}</div>} />)}
            </div>
          </section>
        )}

        <SectionHeader title="Friends activity" />
        <Feed initial={items} next={next} />
      </div>

      {/* Right sidebar (§28) */}
      <aside className="hidden lg:block space-y-8">
        <section>
          <SectionHeader title="Popular this week" href="/discover" />
          <div className="grid grid-cols-4 gap-2">
            {trending.map((s, i) => (
              <Link key={s.id} href={`/song/${s.slug}`} title={`${s.title} — ${s.artists[0]?.name}`} className="relative group">
                <Artwork cover={s.cover} className="transition-transform group-hover:scale-[1.04]" />
                <span className="absolute top-0.5 left-1 text-[10px] font-bold text-white drop-shadow">{i + 1}</span>
              </Link>
            ))}
          </div>
        </section>
        {favs.length > 0 && (
          <section>
            <SectionHeader title="Friends' favourites" />
            {favs.map((f) => (
              <MiniSong key={f.song.id} song={f.song} right={<span className="flex -space-x-1.5">{f.users.map((u) => <Avatar key={u.id} user={u} size={18} className="ring-2 ring-bg" />)}</span>} />
            ))}
          </section>
        )}
        {people.length > 0 && (
          <section>
            <SectionHeader title="Suggested people" />
            <div className="space-y-3">
              {people.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5">
                  <Link href={`/${u.username}`}><Avatar user={u} size={36} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/${u.username}`} className="text-sm font-medium hover:text-accent block truncate">{u.displayName}</Link>
                    <div className="text-xs text-accent/80 truncate">{u.reason}</div>
                  </div>
                  <FollowButton userId={u.id} following={false} size="sm" />
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <SectionHeader title="Trending lists" href="/lists" />
          <div className="space-y-4">
            {lists.map((l) => (
              <Link key={l.id} href={`/list/${l.id}`} className="flex gap-3 group">
                <Collage covers={l.covers} className="w-14 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug group-hover:text-accent line-clamp-2">{l.title}</div>
                  <div className="text-xs text-muted mt-0.5">{l.owner.displayName} · {l.count} songs</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

// ── Logged-out landing (§27) ────────────────────────────────────────────

async function Landing() {
  const showDemo = demoDataEnabled();
  const trending = await data.trendingSongs(18);
  const wall = await data.artworkWall(72);
  const reviews = await data.recentReviews(4);
  const lists = await data.popularLists(4);
  const size = await data.catalogueSize();
  return (
    <div className="min-h-dvh">
      <header className="absolute top-0 inset-x-0 z-20">
        <div className="max-w-[1240px] mx-auto px-4 h-16 flex items-center gap-3">
          <Logo />
          <nav className="ml-auto flex items-center gap-1">
            <Link href="/discover" className="btn-ghost hidden sm:inline-flex">Explore</Link>
            <Link href="/login" className="btn-ghost">Sign in</Link>
            <Link href="/signup" className="btn-primary">Create account</Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-line-soft">
        {/* Album-art wall */}
        <div className="absolute inset-0 opacity-35 rotate-[-4deg] scale-125 -translate-y-8 overflow-hidden" aria-hidden>
          <div className="wall-scroll">
            {[0, 1].map((copy) => (
              <div key={copy} className="grid grid-cols-6 md:grid-cols-9 gap-1 pb-1">
                {wall.map((s, i) => <Artwork key={i} cover={s.cover} rounded="rounded-none" />)}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/85 to-bg" />
        <div className="relative max-w-[1240px] mx-auto px-4 pt-36 pb-24 md:pt-44 md:pb-32">
          <h1 className="display text-[52px] leading-[0.95] md:text-[92px] max-w-4xl">Your music taste deserves a history.</h1>
          <p className="mt-6 text-lg md:text-xl text-fg/80 max-w-xl leading-relaxed">Track the songs you listen to. Rate them. Review them. Make lists. Discover music through people whose taste you trust.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary h-12 px-6 text-base">Create your music diary</Link>
            <Link href="/discover" className="btn-secondary h-12 px-6 text-base">Explore popular songs</Link>
          </div>
          <p className="mt-6 text-xs text-faint">{size.logs.toLocaleString()} songs logged · {size.reviews.toLocaleString()} reviews{showDemo && <> · Demo account: <span className="text-muted">abtin / musicbox-demo</span></>}</p>
        </div>
      </section>

      <div className="max-w-[1240px] mx-auto px-4 py-16 space-y-20">
        <section className="grid md:grid-cols-3 gap-8">
          {[
            { icon: "check", t: "Log every listen", d: "Two clicks to log a song with a rating, a heart, a date and a few words. Relistens count — songs are meant to be replayed." },
            { icon: "star", t: "Ratings ≠ favourites", d: "Stars are your critical opinion. Hearts are personal. A 3½-star song can still be the one that defined your summer." },
            { icon: "list", t: "Curate & discover", d: "Rank songs into lists, follow people with great taste, and find music through humans — not an infinite feed." },
          ].map((f) => (
            <div key={f.t} className="border-t border-line pt-5">
              <Icon name={f.icon} size={20} className="text-accent mb-3" />
              <h3 className="display text-2xl mb-2">{f.t}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.d}</p>
            </div>
          ))}
        </section>

        <section>
          <SectionHeader title="Trending on MusicBox" href="/discover" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {trending.slice(0, 12).map((s, i) => <SongTile key={s.id} song={s} priority={i < 6} />)}
          </div>
        </section>

        <div className="grid lg:grid-cols-[1fr_380px] gap-12">
          <section>
            <SectionHeader title="Recent reviews" />
            {reviews.map((r) => <ReviewCard key={r.id} r={r} withSong compact />)}
          </section>
          <section>
            <SectionHeader title="Popular lists" href="/lists" />
            <div className="grid grid-cols-2 gap-4">
              {lists.map((l) => <ListCardView key={l.id} list={l} size="sm" />)}
            </div>
          </section>
        </div>

        <section className="text-center border-t border-line pt-16">
          <h2 className="display text-4xl md:text-6xl max-w-3xl mx-auto leading-tight">Spotify records what was played. <span className="text-accent">MusicBox records what it meant.</span></h2>
          <div className="mt-8 flex justify-center gap-2 items-center text-muted text-sm">
            <Stars rating={4.5} size={16} />
          </div>
          <Link href="/signup" className="btn-primary h-12 px-6 text-base mt-6">Start your diary — it&apos;s free</Link>
        </section>
      </div>
      <footer className="border-t border-line-soft py-8 text-center text-xs text-faint">
        MusicBox · Song metadata via public catalogues. No audio is stored.
        <span className="mx-2">·</span><Link href="/terms" className="hover:text-fg">Terms</Link>
        <span className="mx-2">·</span><Link href="/privacy" className="hover:text-fg">Privacy</Link>
        <span className="mx-2">·</span><Link href="/copyright" className="hover:text-fg">Copyright</Link>
      </footer>
    </div>
  );
}
