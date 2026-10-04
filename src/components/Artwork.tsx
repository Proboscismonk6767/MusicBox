import type { Cover } from "@/lib/views";
import { ArtworkImage, GeneratedCover } from "./ArtworkImage";

// Album artwork. Uses provider artwork when available (falling back to a generated
// cover if the image fails to load), otherwise a generated abstract cover from the
// album's palette so the grid never shows blanks.

export function Artwork({ cover, size, className = "", rounded = "rounded-[3px]", priority = false }: { cover: Cover; size?: number; className?: string; rounded?: string; priority?: boolean }) {
  const style = size ? { width: size, height: size } : undefined;
  if (cover.artworkUrl) {
    return (
      <div className={`relative aspect-square overflow-hidden bg-elev-2 shrink-0 ${rounded} ${className}`} style={style}>
        <ArtworkImage cover={cover} priority={priority} />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/5" />
      </div>
    );
  }
  return (
    <div className={`relative aspect-square overflow-hidden shrink-0 ${rounded} ${className}`} style={style} role="img" aria-label={cover.title}>
      <GeneratedCover cover={cover} />
      <div className="absolute inset-0 ring-1 ring-inset ring-white/5" />
    </div>
  );
}

export function Collage({ covers, className = "" }: { covers: Cover[]; className?: string }) {
  const four = [...covers];
  while (four.length < 4 && covers.length) four.push(covers[four.length % covers.length]);
  if (!four.length) return <div className={`aspect-square rounded bg-elev-2 ${className}`} />;
  return (
    <div className={`grid grid-cols-2 aspect-square overflow-hidden rounded-[4px] ${className}`}>
      {four.slice(0, 4).map((c, i) => (
        <Artwork key={i} cover={c} rounded="rounded-none" />
      ))}
    </div>
  );
}
