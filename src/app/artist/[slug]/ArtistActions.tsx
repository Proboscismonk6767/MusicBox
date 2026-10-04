"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleArtistFollow, toggleFavoriteArtist } from "@/app/actions";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/ui";

export function ArtistActions({ artistId, following, favourite }: { artistId: string; following: boolean; favourite: boolean }) {
  const [s, setS] = useState({ following, favourite });
  const { requireAuth, toast } = useApp();
  const router = useRouter();
  const [, start] = useTransition();
  const run = (key: "following" | "favourite") => {
    if (!requireAuth()) return;
    const prev = s;
    setS({ ...s, [key]: !s[key] });
    start(async () => {
      const r = key === "following" ? await toggleArtistFollow(artistId) : await toggleFavoriteArtist(artistId);
      if (!r.ok) { setS(prev); toast(r.error, "error"); }
      else router.refresh();
    });
  };
  return (
    <div className="flex justify-center sm:justify-start gap-2 mt-5">
      <button onClick={() => run("following")} className={s.following ? "btn-secondary" : "btn-primary"} aria-pressed={s.following}>{s.following ? <><Icon name="check" size={14} /> Following</> : "Follow artist"}</button>
      <button onClick={() => run("favourite")} className={`btn-secondary ${s.favourite ? "!text-heart" : ""}`} aria-pressed={s.favourite}><Icon name="heart" size={14} filled={s.favourite} /> {s.favourite ? "Favourite" : "Add to favourites"}</button>
    </div>
  );
}
