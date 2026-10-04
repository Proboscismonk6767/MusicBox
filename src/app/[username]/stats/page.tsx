import { safeDecode } from "@/lib/util";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/queries";
import { userStats } from "@/lib/server/insights";
import { BarList, BigStat, Columns, Heatmap } from "@/components/charts";
import { Histogram } from "@/components/cards";
import { Artwork } from "@/components/Artwork";
import { EmptyState, SectionHeader, Stars } from "@/components/ui";
import { monthShort } from "@/lib/format";
import { slugify } from "@/lib/util";

export const metadata = { title: "Stats" };

export default async function StatsPage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ year?: string }> }) {
  const { username } = await params;
  const { year: y } = await searchParams;
  const viewer = await getViewer();
  const p = getProfile(safeDecode(username), viewer?.id);
  if (!p) notFound();
  if (!p.canView) return null;
  const year = y === "all" ? undefined : Number(y) || new Date().getFullYear();
  const s = userStats(p.raw.id, year);
  const heatYear = year ?? s.years[0] ?? new Date().getFullYear();

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="display text-4xl">{year ? `${year} in music` : "All-time stats"}</h2>
        <div className="flex flex-wrap gap-1.5">
          {s.years.map((yy) => <Link key={yy} href={`?year=${yy}`} className={`chip ${yy === year ? "chip-on" : ""}`}>{yy}</Link>)}
          <Link href="?year=all" className={`chip ${!year ? "chip-on" : ""}`}>All time</Link>
          {year && <Link href={`/${p.user.username}/year/${year}`} className="btn-primary btn-sm ml-2">Year in review →</Link>}
        </div>
      </div>

      {!s.logged ? (
        <EmptyState icon="chart" title="No listening data for this period" body="Stats appear as you log songs. Every log counts — including relistens." action={p.isSelf ? <Link href="/discover" className="btn-primary">Find songs to log</Link> : undefined} />
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6">
            <BigStat value={s.logged.toLocaleString()} label="Songs logged" sub={`${s.relistens} relistens`} />
            <BigStat value={s.unique.toLocaleString()} label="Unique songs" />
            <BigStat value={s.artists} label="Artists" />
            <BigStat value={s.avgRating ? s.avgRating.toFixed(2) : "—"} label="Average rating" />
            <BigStat value={<span className="text-2xl md:text-3xl">{s.favouriteArtist ?? "—"}</span>} label="Favourite artist" />
            <BigStat value={<span className="text-2xl md:text-3xl">{s.favouriteGenre ?? "—"}</span>} label="Favourite genre" />
            <BigStat value={<span className="text-2xl md:text-3xl">{s.mostActiveDay ?? "—"}</span>} label="Most active day" />
            <BigStat value={<span className="text-2xl md:text-3xl">{s.mostActiveMonth ?? "—"}</span>} label="Most active month" />
          </section>

          <section>
            <SectionHeader title={`Listening calendar · ${heatYear}`} />
            <Heatmap year={heatYear} data={s.calendar} />
          </section>

          <div className="grid lg:grid-cols-2 gap-10">
            <section>
              <SectionHeader title="Listening by month" />
              <Columns data={s.months} labels={s.months.map((_, i) => monthShort(i))} />
            </section>
            <section>
              <SectionHeader title="Ratings distribution" />
              <Histogram data={s.histogram} height={120} />
            </section>
            <section>
              <SectionHeader title="Most listened artists" />
              <BarList items={s.topArtists.map((a) => ({ key: a.slug, label: <Link href={`/artist/${a.slug}`} className="hover:text-accent">{a.name}</Link>, value: a.count }))} />
            </section>
            <section>
              <SectionHeader title="Highest rated artists" action={<span className="text-[11px] text-faint">min. 3 ratings</span>} />
              {s.highestArtists.length ? <BarList items={s.highestArtists.map((a) => ({ key: a.slug, label: <Link href={`/artist/${a.slug}`} className="hover:text-accent">{a.name}</Link>, value: a.avg }))} unit="★" /> : <p className="text-sm text-muted">Rate a few more songs per artist.</p>}
            </section>
            <section>
              <SectionHeader title="Top genres" />
              <BarList items={s.topGenres.map((g) => ({ key: g.name, label: <Link href={`/genre/${slugify(g.name)}`} className="hover:text-accent">{g.name}</Link>, value: g.count }))} />
            </section>
            <section>
              <SectionHeader title="Most reviewed artists" />
              {s.mostReviewed.length ? <BarList items={s.mostReviewed.map((a) => ({ key: a.slug, label: a.name, value: a.count }))} /> : <p className="text-sm text-muted">No reviews in this period.</p>}
            </section>
            <section>
              <SectionHeader title="Decades" />
              <Columns data={s.decades.map(([, n]) => n)} labels={s.decades.map(([d]) => `${String(d).slice(2)}s`)} height={100} />
            </section>
            <section>
              <SectionHeader title="Day of week" />
              <Columns data={s.weekdays} labels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]} height={100} />
            </section>
          </div>

          <section>
            <SectionHeader title="Most played songs" />
            <ol className="grid sm:grid-cols-2 gap-x-8">
              {s.topSongs.map((t, i) => (
                <li key={t.song.id} className="flex items-center gap-3 py-2 border-b border-line-soft">
                  <span className="w-5 text-right text-faint tabular-nums text-sm">{i + 1}</span>
                  <Link href={`/song/${t.song.slug}`}><Artwork cover={t.song.cover} size={40} /></Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/song/${t.song.slug}`} className="text-sm font-medium truncate block hover:text-accent">{t.song.title}</Link>
                    <div className="text-xs text-muted truncate">{t.song.artists[0]?.name}</div>
                  </div>
                  <Stars rating={t.rating} size={10} />
                  <span className="text-xs text-muted tabular-nums w-8 text-right">{t.count}×</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
