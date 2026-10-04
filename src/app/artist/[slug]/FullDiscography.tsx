import { externalDiscography } from "@/lib/server/metadata";
import { SectionHeader } from "@/components/ui";

/** Everything the artist has released, from the world catalogue. Albums not
 *  yet on MusicBox import on first open. */
export async function FullDiscography({ name, externalId, knownAlbumTitles }: { name: string; externalId?: string; knownAlbumTitles: string[] }) {
  const known = new Set(knownAlbumTitles.map((t) => t.toLowerCase()));
  let albums: Awaited<ReturnType<typeof externalDiscography>> = [];
  try {
    albums = (await externalDiscography({ name, externalId })).filter((a) => !known.has(a.title.toLowerCase()));
  } catch {
    return <p className="text-xs text-faint">Full discography is unavailable right now.</p>;
  }
  if (!albums.length) return null;
  return (
    <section>
      <SectionHeader title={`More releases · ${albums.length}`} />
      <div className="grid grid-cols-2 gap-4 max-h-[720px] overflow-y-auto pr-1">
        {albums.map((a) => (
          <a key={a.externalId} href={`/open/album/${a.externalId}`} className="group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.artworkUrl ? <img src={a.artworkUrl} alt={a.title} loading="lazy" className="aspect-square w-full rounded-[3px] object-cover transition-transform group-hover:scale-[1.03]" /> : <div className="aspect-square bg-elev-2 rounded-[3px]" />}
            <div className="text-sm font-medium mt-1.5 truncate group-hover:text-accent">{a.title}</div>
            <div className="text-xs text-muted">{a.releaseDate.slice(0, 4)}{a.trackCount ? ` · ${a.trackCount} songs` : ""}</div>
          </a>
        ))}
      </div>
    </section>
  );
}
