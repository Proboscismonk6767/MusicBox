import "server-only";
import { idx } from "./indexes";
import { songCard, suggestedUsers } from "./queries";


// Small reads for pages and routes that used to reach into the store directly.
// They live behind the same `data` facade as everything else, so a backend
// that isn't an in-memory document can answer them too.

export interface AdminReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter?: string;
  text: string;
  href?: string;
  author?: string;
}

/** Moderation queue: open reports first, then newest first. */
export function adminOverview(): { reports: AdminReport[]; openCount: number; suspendedCount: number } {
  const i = idx();
  const sorted = [...i.db.reports].sort((a, b) => (a.status === "open" ? -1 : 1) - (b.status === "open" ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
  const describe = (type: string, id: string): { text: string; href?: string; author?: string } => {
    if (type === "entry") { const e = i.db.entries.find((x) => x.id === id); return { text: e?.review ?? "(removed)", href: `/review/${id}`, author: e && i.user.get(e.userId)?.username }; }
    if (type === "comment") { const c = i.db.comments.find((x) => x.id === id); return { text: c?.body ?? "(removed)", author: c && i.user.get(c.userId)?.username }; }
    if (type === "list") { const l = i.db.lists.find((x) => x.id === id); return { text: l?.title ?? "(removed)", href: `/list/${id}`, author: l && i.user.get(l.userId)?.username }; }
    const u = i.user.get(id);
    return { text: u ? `@${u.username}` : "(unknown)", href: u && `/${u.username}`, author: u?.username };
  };
  return {
    reports: sorted.map((r) => ({ id: r.id, targetType: r.targetType, targetId: r.targetId, reason: r.reason, status: r.status, createdAt: r.createdAt, reporter: i.user.get(r.reporterId)?.username, ...describe(r.targetType, r.targetId) })),
    openCount: sorted.filter((r) => r.status === "open").length,
    suspendedCount: i.db.users.filter((u) => u.suspended).length,
  };
}

/** Just enough of a song for the lyrics and preview routes. */
export interface SongLite {
  id: string;
  title: string;
  durationMs: number;
  previewUrl?: string;
  artist: string;
  album: string;
}

export function songLite(songId: string): SongLite | null {
  const i = idx();
  const s = i.song.get(songId);
  if (!s) return null;
  return { id: s.id, title: s.title, durationMs: s.durationMs, previewUrl: s.previewUrl, artist: i.artist.get(s.artistIds[0])?.name ?? "", album: i.album.get(s.albumId)?.title ?? "" };
}

export function followingIds(userId: string): string[] {
  return [...(idx().following.get(userId) ?? [])];
}

/** The onboarding screen offers this many songs: the most-logged song per album first, then the rest by popularity. */
export const ONBOARDING_SONGS = 400;

export function onboardingData(userId: string) {
  const i = idx();
  const logs = (id: string) => i.db.songStats[id]?.logCount ?? 0;
  const top = i.db.albums
    .map((al) => [...(i.songsByAlbum.get(al.id) ?? [])].sort((a, b) => logs(b.id) - logs(a.id))[0])
    .filter(Boolean)
    .sort((a, b) => logs(b.id) - logs(a.id));
  const topIds = new Set(top.map((s) => s.id));
  const rest = i.db.songs.filter((s) => !topIds.has(s.id)).sort((a, b) => logs(b.id) - logs(a.id));
  const songs = [...top, ...rest].slice(0, ONBOARDING_SONGS).map((s) => songCard(i, s));
  const artists = i.db.artists.map((a) => ({ id: a.id, name: a.name, slug: a.slug, imageUrl: a.imageUrl, hue: a.hue }));
  const people = suggestedUsers(userId, 8).map((u) => ({ ...u, logged: i.entriesByUser.get(u.id)?.length ?? 0 }));
  const ratings = Object.fromEntries([...(i.ratingsByUser.get(userId)?.values() ?? [])].map((r) => [r.songId, r.rating]));
  return { songs, artists, people, ratings };
}

export function sitemapData() {
  const { db } = idx();
  return {
    songs: db.songs.map((s) => s.slug),
    artists: db.artists.map((a) => a.slug),
    albums: db.albums.map((a) => a.slug),
    users: db.users.filter((u) => u.profileVisibility === "public" && !u.suspended).map((u) => u.username),
    lists: db.lists.filter((l) => l.visibility === "public" && !l.removed).map((l) => l.id),
  };
}

/** Throws if the store can't be read. For /api/health. */
export function ping(): true {
  if (!idx().db) throw new Error("no store");
  return true;
}

