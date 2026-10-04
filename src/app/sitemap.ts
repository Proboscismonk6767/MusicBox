import type { MetadataRoute } from "next";
import { idx } from "@/lib/server/indexes";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { db } = idx();
  return [
    { url: base }, { url: `${base}/discover` }, { url: `${base}/lists` },
    ...db.songs.map((s) => ({ url: `${base}/song/${s.slug}` })),
    ...db.artists.map((a) => ({ url: `${base}/artist/${a.slug}` })),
    ...db.albums.map((a) => ({ url: `${base}/album/${a.slug}` })),
    ...db.users.filter((u) => u.profileVisibility === "public" && !u.suspended).map((u) => ({ url: `${base}/${u.username}` })),
    ...db.lists.filter((l) => l.visibility === "public" && !l.removed).map((l) => ({ url: `${base}/list/${l.id}` })),
  ];
}
