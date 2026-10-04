import Link from "next/link";
import type { ListCard, SongCard } from "@/lib/views";
import { Collage, Artwork } from "./Artwork";
import { Avatar, Icon, Stars } from "./ui";
import { compact } from "@/lib/format";

export function ListCardView({ list, size = "md" }: { list: ListCard; size?: "sm" | "md" }) {
  return (
    <Link href={`/list/${list.id}`} className="group block min-w-0">
      <div className="relative transition-transform duration-200 group-hover:scale-[1.02]">
        <Collage covers={list.covers} className="shadow-lg shadow-black/40" />
        {list.visibility !== "public" && <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{list.visibility}</span>}
      </div>
      <div className="mt-2">
        <div className={`font-semibold leading-snug group-hover:text-accent transition-colors line-clamp-2 ${size === "sm" ? "text-sm" : "text-[15px]"}`}>{list.title}</div>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
          <Avatar user={list.owner} size={16} />
          <span className="truncate">{list.owner.displayName}</span>
          <span className="text-faint">·</span>
          <span className="shrink-0">{list.count} songs</span>
          {list.likeCount > 0 && <span className="shrink-0 flex items-center gap-0.5"><Icon name="heart" size={11} filled className="text-faint" />{list.likeCount}</span>}
        </div>
      </div>
    </Link>
  );
}

/** Wide list card with fanned covers (for list index pages). */
export function ListRowCard({ list }: { list: ListCard }) {
  return (
    <Link href={`/list/${list.id}`} className="group flex gap-4 py-4 border-b border-line-soft">
      <div className="flex shrink-0 w-[180px] sm:w-[220px]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-1/3 first:w-[40%] -ml-[6%] first:ml-0 shadow-[4px_0_12px_rgba(0,0,0,0.6)] transition-transform duration-200 group-hover:-translate-y-0.5" style={{ zIndex: 4 - i, flex: "none", width: "38%" }}>
            {list.covers[i] ? <Artwork cover={list.covers[i]} /> : <div className="aspect-square bg-elev-2 rounded-[3px]" />}
          </div>
        ))}
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-lg leading-tight group-hover:text-accent transition-colors">{list.title}</h3>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted">
          <Avatar user={list.owner} size={16} /> {list.owner.displayName} · {list.count} songs
          {list.isRanked && <> · Ranked</>}
          <span className="flex items-center gap-0.5 ml-1"><Icon name="heart" size={11} filled className="text-faint" />{list.likeCount}</span>
          <span className="flex items-center gap-0.5"><Icon name="chat" size={11} className="text-faint" />{list.commentCount}</span>
        </div>
        {list.description && <p className="text-sm text-muted mt-2 line-clamp-2">{list.description}</p>}
      </div>
    </Link>
  );
}

export function Histogram({ data, total, height = 64, showLabels = true }: { data: number[]; total?: number; height?: number; showLabels?: boolean }) {
  const max = Math.max(1, ...data);
  const sum = total ?? data.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((n, i) => {
          const r = (i + 1) / 2;
          const pct = sum ? Math.round((n / sum) * 100) : 0;
          return (
            <div key={i} className="group relative flex-1 h-full flex items-end" tabIndex={0} aria-label={`${r} stars: ${n} ratings (${pct}%)`}>
              <div className="w-full rounded-t-[2px] bg-[#3a3a42] group-hover:bg-accent group-focus:bg-accent transition-colors" style={{ height: `${Math.max(3, (n / max) * 100)}%` }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-fg px-2 py-1 text-[11px] font-medium text-bg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-10">
                {r}★ · {compact(n)} ({pct}%)
              </div>
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="flex justify-between mt-1.5 text-[10px] text-faint">
          <span className="flex items-center text-accent/70"><Icon name="star" size={9} filled strokeWidth={0} /></span>
          <span className="flex items-center text-accent/70"><Stars rating={5} size={9} /></span>
        </div>
      )}
    </div>
  );
}

export function MiniSong({ song, right }: { song: SongCard; right?: React.ReactNode }) {
  return (
    <Link href={`/song/${song.slug}`} className="group flex items-center gap-2.5 py-1.5">
      <Artwork cover={song.cover} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate group-hover:text-accent">{song.title}</div>
        <div className="text-xs text-muted truncate">{song.artists[0]?.name}</div>
      </div>
      {right}
    </Link>
  );
}

export function ArtistBubble({ artist, sub }: { artist: { name: string; slug: string; imageUrl?: string; hue: number }; sub?: React.ReactNode }) {
  return (
    <Link href={`/artist/${artist.slug}`} className="group flex flex-col items-center text-center min-w-0">
      <ArtistImage artist={artist} className="w-full transition-transform duration-200 group-hover:scale-[1.03]" />
      <div className="mt-2 text-sm font-medium truncate w-full group-hover:text-accent">{artist.name}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Link>
  );
}

export function ArtistImage({ artist, className = "" }: { artist: { name: string; imageUrl?: string; hue: number }; className?: string }) {
  return (
    <div className={`aspect-square rounded-full overflow-hidden relative ${className}`} style={{ background: `radial-gradient(circle at 30% 25%, hsl(${artist.hue} 40% 45%), hsl(${artist.hue} 35% 14%))` }}>
      {artist.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artist.imageUrl} alt={artist.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center display text-[2.2em] text-white/85">{artist.name.replace(/^The /, "")[0]}</span>
      )}
    </div>
  );
}

export function Grid({ children, cols = "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6" }: { children: React.ReactNode; cols?: string }) {
  return <div className={`grid ${cols} gap-x-3 gap-y-5`}>{children}</div>;
}
