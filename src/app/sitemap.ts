import type { MetadataRoute } from "next";
import { data } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const s = await data.sitemapData();
  return [
    { url: base }, { url: `${base}/discover` }, { url: `${base}/lists` },
    ...s.songs.map((slug) => ({ url: `${base}/song/${slug}` })),
    ...s.artists.map((slug) => ({ url: `${base}/artist/${slug}` })),
    ...s.albums.map((slug) => ({ url: `${base}/album/${slug}` })),
    ...s.users.map((u) => ({ url: `${base}/${u}` })),
    ...s.lists.map((id) => ({ url: `${base}/list/${id}` })),
  ];
}
