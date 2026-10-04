import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/queries";
import { yearInReview } from "@/lib/server/insights";
import { Artwork } from "@/components/Artwork";
import { ArtistImage } from "@/components/cards";
import { EmptyState, Stars } from "@/components/ui";
import { ShareCard } from "./ShareCard";

export async function generateMetadata({ params }: { params: Promise<{ username: string; year: string }> }) {
  const { username, year } = await params;
  return { title: `@${username}'s ${year} in Music` };
}

export default async function YearPage({ params }: { params: Promise<{ username: string; year: string }> }) {
  const { username, year: ys } = await params;
  const year = Number(ys);
  const viewer = await getViewer();
  const p = getProfile(safeDecode(username), viewer?.id);
  if (!p || !year) notFound();
  if (!p.canView) return null;
  const y = yearInReview(p.raw.id, year);
  if (!y.logged) return <EmptyState icon="calendar" title={`No logs in ${year}`} body="Year in review appears once there's listening history for the year." action={<Link href={`/${p.user.username}/stats`} className="btn-secondary">Back to stats</Link>} />;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <div className="text-[11px] uppercase tracking-[0.2em] text-accent mb-3">Year in review</div>
        <h2 className="display text-5xl md:text-7xl leading-none">{p.user.displayName.split(" ")[0]}&apos;s {year} in Music</h2>
        <div className="flex justify-center gap-2 mt-6">
          {y.years.map((yy) => <Link key={yy} href={`/${p.user.username}/year/${yy}`} className={`chip ${yy === year ? "chip-on" : ""}`}>{yy}</Link>)}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ShareCard className="sm:col-span-2" title={`${p.user.username}'s ${year}`}>
          <div className="grid grid-cols-3 gap-6 text-center py-6">
            <div><div className="display text-6xl md:text-7xl text-accent">{y.logged.toLocaleString()}</div><div className="text-xs uppercase tracking-widest text-muted mt-1">songs logged</div></div>
            <div><div className="display text-6xl md:text-7xl">{y.unique}</div><div className="text-xs uppercase tracking-widest text-muted mt-1">unique songs</div></div>
            <div><div className="display text-6xl md:text-7xl">{y.artists}</div><div className="text-xs uppercase tracking-widest text-muted mt-1">artists</div></div>
          </div>
        </ShareCard>

        {y.topArtists[0] && (
          <ShareCard title="Most-listened artist">
            <div className="flex items-center gap-4">
              <ArtistImage artist={y.topArtists[0]} className="w-24 text-3xl" />
              <div><div className="display text-3xl">{y.topArtists[0].name}</div><div className="text-sm text-muted">{y.topArtists[0].count} logs</div></div>
            </div>
          </ShareCard>
        )}
        {y.highestArtist && (
          <ShareCard title="Highest-rated artist">
            <div className="flex items-center gap-4">
              <ArtistImage artist={y.highestArtist} className="w-24 text-3xl" />
              <div><div className="display text-3xl">{y.highestArtist.name}</div><div className="text-sm text-muted">{y.highestArtist.avg.toFixed(2)} ★ average</div></div>
            </div>
          </ShareCard>
        )}
        {y.mostReplayed && (
          <ShareCard title="Most replayed">
            <div className="flex items-center gap-4">
              <Artwork cover={y.mostReplayed.song.cover} size={96} />
              <div className="min-w-0"><div className="display text-3xl leading-tight">{y.mostReplayed.song.title}</div><div className="text-sm text-muted">{y.mostReplayed.song.artists[0]?.name} · {y.mostReplayed.count} plays</div></div>
            </div>
          </ShareCard>
        )}
        {y.discovery && (
          <ShareCard title="Favourite discovery">
            <div className="flex items-center gap-4">
              <Artwork cover={y.discovery.cover} size={96} />
              <div className="min-w-0"><div className="display text-3xl leading-tight">{y.discovery.title}</div><div className="text-sm text-muted">{y.discovery.artists[0]?.name}</div></div>
            </div>
          </ShareCard>
        )}
        <ShareCard title="Favourite genre">
          <div className="display text-4xl">{y.favouriteGenre}</div>
          <div className="text-sm text-muted mt-1">Most active on {y.mostActiveDay}s · busiest month: {y.mostActiveMonth}</div>
        </ShareCard>
        <ShareCard title="Average rating">
          <div className="flex items-center gap-3"><span className="display text-5xl">{y.avgRating.toFixed(2)}</span><Stars rating={Math.round(y.avgRating * 2) / 2} size={18} /></div>
        </ShareCard>
        {y.fives.length > 0 && (
          <ShareCard className="sm:col-span-2" title="Five-star songs">
            <div className="grid grid-cols-5 gap-2">
              {y.fives.map((s) => <Link key={s.id} href={`/song/${s.slug}`} title={s.title}><Artwork cover={s.cover} /></Link>)}
            </div>
          </ShareCard>
        )}
      </div>
    </div>
  );
}
