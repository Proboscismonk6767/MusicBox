import "server-only";
import { idx } from "./indexes";
import { songCard, suggestedUsers } from "./queries";
import { normalizeArtist, normalizeTitle } from "../spotify-import";
import type { Song } from "../types";


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
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
    .map((al) => [...(i.songsByAlbum.get(al.id) ?? [])].sort((a, b) => logs(b.id) - logs(a.id) || byId(a.id, b.id))[0])
    .filter(Boolean)
    .sort((a, b) => logs(b.id) - logs(a.id) || byId(a.id, b.id));
  const topIds = new Set(top.map((s) => s.id));
  const rest = i.db.songs.filter((s) => !topIds.has(s.id)).sort((a, b) => logs(b.id) - logs(a.id) || byId(a.id, b.id));
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


// ── Catalogue lookups used when importing from the world catalogue ──────

export function songSlugByExternalId(externalId: string): string | undefined {
  return idx().db.songs.find((s) => s.externalId === externalId)?.slug;
}

export function songIdBySlug(slug: string): string | undefined {
  return idx().songBySlug.get(slug)?.id;
}

export function albumByExternalId(externalId: string): { slug: string; songCount: number } | null {
  const i = idx();
  const a = i.db.albums.find((x) => x.externalId === externalId);
  return a ? { slug: a.slug, songCount: i.songsByAlbum.get(a.id)?.length ?? 0 } : null;
}

/** Finds an artist by catalogue id, or (when none matches) by exact name, ignoring case. */
export function artistLookup(q: { externalId?: string; name?: string }): { id: string; slug: string; externalId?: string } | null {
  const artists = idx().db.artists;
  const a = (q.externalId && artists.find((x) => x.externalId === q.externalId)) || (q.name && artists.find((x) => x.name.toLowerCase() === q.name!.toLowerCase())) || null;
  return a ? { id: a.id, slug: a.slug, externalId: a.externalId } : null;
}

/** Which of these catalogue results does MusicBox already have? (by catalogue id, or by title and artist) */
export function knownTracks(tracks: { externalId: string; title: string; artist: string }[]): boolean[] {
  const i = idx();
  const known = new Set(i.db.songs.map((s) => s.externalId).filter(Boolean));
  const titles = new Set(i.db.songs.map((s) => `${s.title.toLowerCase()}|${i.artist.get(s.artistIds[0])?.name.toLowerCase()}`));
  return tracks.map((t) => known.has(t.externalId) || titles.has(`${t.title.toLowerCase()}|${t.artist.toLowerCase()}`));
}

/** The subset of these artist names MusicBox already has (lower-cased). */
export function knownArtistNames(names: string[]): string[] {
  const have = new Set(idx().db.artists.map((a) => a.name.toLowerCase()));
  return names.map((n) => n.toLowerCase()).filter((n) => have.has(n));
}

/** The subset of these catalogue album ids MusicBox already has. */
export function knownAlbumIds(externalIds: string[]): string[] {
  const have = new Set(idx().db.albums.map((a) => a.externalId).filter(Boolean));
  return externalIds.filter((id) => have.has(id));
}

// ── Listening-history import ────────────────────────────────────────────

/** For each track the user played, the id of the matching song MusicBox already has (same title and artist), or null. */
export function findLocalSongs(tracks: { t: string; a: string }[]): (string | null)[] {
  const i = idx();
  const byTitle = new Map<string, Song[]>();
  for (const s of i.db.songs) {
    const k = normalizeTitle(s.title);
    const list = byTitle.get(k);
    if (list) list.push(s); else byTitle.set(k, [s]);
  }
  return tracks.map((t) => {
    const artist = normalizeArtist(t.a);
    const hit = byTitle.get(normalizeTitle(t.t))?.find((s) => [...s.artistIds.map((id) => i.artist.get(id)?.name ?? ""), ...s.featured].filter(Boolean).map(normalizeArtist).includes(artist));
    return hit?.id ?? null;
  });
}

export function userActive(userId: string): boolean {
  return idx().db.users.some((u) => u.id === userId && !u.suspended);
}
