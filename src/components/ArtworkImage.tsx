"use client";

import { useState } from "react";
import type { Cover } from "@/lib/views";

// Provider artwork can 404 (Cover Art Archive only has covers someone uploaded),
// so the image falls back to the generated cover instead of a broken-image icon.

export function ArtworkImage({ cover, priority = false }: { cover: Cover; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed || !cover.artworkUrl) return <GeneratedCover cover={cover} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cover.artworkUrl} alt={cover.title} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
  );
}

/** Small thumbnail for catalogue results that aren't on MusicBox yet. */
export function ExternalArt({ src, className }: { src?: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`${className} bg-elev-2`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover bg-elev-2`} />;
}

export function GeneratedCover({ cover }: { cover: Cover }) {
  const [a, b, c] = cover.palette;
  const p = cover.pattern % 6;
  return (
    <>
      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${a}, ${c})` }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {p === 0 && <circle cx="62" cy="40" r="26" fill={b} opacity="0.85" />}
        {p === 1 && <rect x="14" y="14" width="72" height="72" fill="none" stroke={b} strokeWidth="5" />}
        {p === 2 && [0, 1, 2, 3, 4].map((k) => <rect key={k} x="0" y={14 + k * 16} width="100" height="6" fill={b} opacity={0.3 + k * 0.14} />)}
        {p === 3 && <path d="M0 100 L50 30 L100 100 Z" fill={b} opacity="0.8" />}
        {p === 4 && [10, 22, 34].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={b} strokeWidth="2.5" opacity="0.8" />)}
        {p === 5 && <rect x="0" y="58" width="100" height="42" fill={b} opacity="0.75" />}
        <text x="8" y="92" fontSize="7.5" fontFamily="ui-sans-serif, system-ui" fontWeight="700" fill={c} opacity="0.85" style={{ mixBlendMode: "multiply" }}>
          {cover.title.length > 22 ? cover.title.slice(0, 21) + "…" : cover.title}
        </text>
      </svg>
    </>
  );
}
