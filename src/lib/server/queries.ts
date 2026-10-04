import "server-only";
import type { DiaryEntry, PublicUser, Song, SongList, User } from "../types";
import type { CommentView, Cover, FeedItem, ListCard, ReviewView, SongCard, UserMini, ViewerSongState } from "../views";
import { idx, type Indexes } from "./indexes";
import { avg, weightedAvg } from "./stats";
import { slugify } from "../util";
import { toPublic } from "./auth";
import { compat, matcher } from "./algorithms";

const MAX_DIARY_ROWS = 1000;
const MAX_COMMENTS = 300;
const MAX_SONG_REVIEWS = 200;
const MAX_LIST_CARDS = 200;

/** Ties in any ranking fall back to id order, so a page never reshuffles between requests. */
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ── Mappers ─────────────────────────────────────────────────────────────

export function userMini(u: User | PublicUser): UserMini {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarHue: u.avatarHue, avatarUrl: u.avatarUrl };
}

export function coverOf(i: Indexes, albumId: string): Cover {
  const a = i.album.get(albumId)!;
  return { title: a.title, artworkUrl: a.artworkUrl, palette: a.palette, pattern: a.pattern };
}

export function songCard(i: Indexes, s: Song): SongCard {
  const al = i.album.get(s.albumId)!;
  const st = i.db.songStats[s.id];
  return {
    id: s.id, slug: s.slug, title: s.title,
    artists: s.artistIds.map((a) => i.artist.get(a)!).map((a) => ({ name: a.name, slug: a.slug })),
    featured: s.featured, album: { title: al.title, slug: al.slug }, cover: coverOf(i, al.id),
    year: Number(s.releaseDate.slice(0, 4)), releaseDate: s.releaseDate, durationMs: s.durationMs, explicit: s.explicit,
    avg: avg(st), ratingCount: st?.ratingCount ?? 0, trackNumber: s.trackNumber,
  };
}

export function reviewView(i: Indexes, e: DiaryEntry, viewerId?: string): ReviewView {
  const likes = i.reviewLikes.get(e.id);
  return {
    id: e.id, user: userMini(i.user.get(e.userId)!), song: songCard(i, i.song.get(e.songId)!), rating: e.rating, liked: e.liked,
    review: e.review, hasSpoiler: e.hasSpoiler, listenedAt: e.listenedAt, isRelisten: e.isRelisten, tags: e.tags,
    likeCount: likes?.size ?? 0, commentCount: i.commentsByTarget.get(`entry:${e.id}`)?.length ?? 0,
    viewerLiked: !!viewerId && !!likes?.has(viewerId), createdAt: e.createdAt,
    followedByViewer: !!viewerId && !!i.following.get(viewerId)?.has(e.userId),
  };
}

export function canSeeList(l: SongList, viewerId?: string) {
  return !l.removed && (l.visibility !== "private" || l.userId === viewerId);
}

export function listCard(i: Indexes, l: SongList): ListCard {
  const covers: Cover[] = [];
  const seen = new Set<string>();
  for (const it of l.items) {
    const s = i.song.get(it.songId);
    if (!s || seen.has(s.albumId)) continue;
    seen.add(s.albumId);
    covers.push(coverOf(i, s.albumId));
    if (covers.length === 4) break;
  }
  return {
    id: l.id, title: l.title, description: l.description, owner: userMini(i.user.get(l.userId)!), count: l.items.length,
    likeCount: i.listLikes.get(l.id)?.size ?? 0, commentCount: i.commentsByTarget.get(`list:${l.id}`)?.length ?? 0,
    covers, isRanked: l.isRanked, visibility: l.visibility, updatedAt: l.updatedAt,
  };
}

export function viewerState(i: Indexes, songId: string, viewerId?: string): ViewerSongState {
  if (!viewerId) return { liked: false, listenLater: false, logCount: 0 };
  return {
    rating: i.ratingsByUser.get(viewerId)?.get(songId)?.rating,
    liked: !!i.likesByUser.get(viewerId)?.has(songId),
    listenLater: !!i.listenLater.get(viewerId)?.has(songId),
    logCount: (i.entriesBySong.get(songId) ?? []).filter((e) => e.userId === viewerId).length,
  };
}

export function viewerStates(songIds: string[], viewerId?: string): Record<string, ViewerSongState> {
  const i = idx();
  return Object.fromEntries(songIds.map((id) => [id, viewerState(i, id, viewerId)]));
}

function isHidden(i: Indexes, viewerId: string | undefined, userId: string) {
  return !!viewerId && !!i.hidden.get(viewerId)?.has(userId);
}

function visibleUser(i: Indexes, u: User, viewerId?: string) {
  if (u.suspended) return false;
  if (u.id === viewerId) return true;
  if (u.profileVisibility === "private") return false;
  if (u.profileVisibility === "followers") return !!viewerId && !!i.following.get(viewerId)?.has(u.id);
  return true;
}

/** Entry visible to viewer: not removed, author visible, not blocked/muted. */
function entryOk(i: Indexes, e: DiaryEntry, viewerId?: string) {
  const author = i.user.get(e.userId);
  return !e.removed && !!author && visibleUser(i, author, viewerId) && !isHidden(i, viewerId, e.userId);
}

/** List visible to viewer in listings and by direct id. */
function listOk(i: Indexes, l: SongList, viewerId?: string) {
  const owner = i.user.get(l.userId);
  return canSeeList(l, viewerId) && !!owner && visibleUser(i, owner, viewerId) && !isHidden(i, viewerId, l.userId);
}

// ── Time windows ────────────────────────────────────────────────────────

function windowStart(days: number) {
  return new Date(Date.now() - days * 864e5).toISOString();
}

/** Songs with the most platform activity in a recent window. Falls back to a
 *  wider window when the platform is quiet so sections are never empty. */
export function trendingSongs(limit = 12): SongCard[] {
  const i = idx();
  for (const days of [7, 30, 120, 3650]) {
    const since = windowStart(days);
    const score = new Map<string, number>();
    for (const e of i.db.entries) {
      if (e.removed || e.createdAt < since) continue;
      score.set(e.songId, (score.get(e.songId) ?? 0) + 1 + (e.review ? 0.5 : 0) + (e.liked ? 0.5 : 0));
    }
    if (score.size >= limit) {
      return [...score.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).slice(0, limit).map(([id]) => songCard(i, i.song.get(id)!));
    }
  }
  return [];
}

export function highlyRated(limit = 12, minCount = 4): SongCard[] {
  const i = idx();
  return i.db.songs
    .filter((s) => (i.db.songStats[s.id]?.ratingCount ?? 0) >= minCount)
    .sort((a, b) => weightedAvg(i.db.songStats[b.id]) - weightedAvg(i.db.songStats[a.id]) || byId(a.id, b.id))
    .slice(0, limit)
    .map((s) => songCard(i, s));
}

export function hiddenGems(limit = 12): SongCard[] {
  const i = idx();
  return i.db.songs
    .filter((s) => {
      const st = i.db.songStats[s.id];
      return st && st.ratingCount >= 2 && st.ratingCount <= 5 && avg(st) >= 3.9;
    })
    .sort((a, b) => avg(i.db.songStats[b.id]) - avg(i.db.songStats[a.id]) || byId(a.id, b.id))
    .slice(0, limit)
    .map((s) => songCard(i, s));
}

export function newReleases(limit = 12): SongCard[] {
  const i = idx();
  const albums = [...i.db.albums].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || byId(a.id, b.id)).slice(0, 6);
  const out: Song[] = [];
  for (const al of albums) {
    const songs = [...(i.songsByAlbum.get(al.id) ?? [])].sort((a, b) => (i.db.songStats[b.id]?.logCount ?? 0) - (i.db.songStats[a.id]?.logCount ?? 0));
    out.push(...songs.slice(0, 2));
  }
  return out.slice(0, limit).map((s) => songCard(i, s));
}

export function trendingReviews(limit = 8, viewerId?: string): ReviewView[] {
  const i = idx();
  const since = windowStart(60);
  return i.db.entries
    .filter((e) => e.review && entryOk(i, e, viewerId))
    .map((e) => ({ e, s: (i.reviewLikes.get(e.id)?.size ?? 0) * (e.createdAt > since ? 2 : 1) + (i.commentsByTarget.get(`entry:${e.id}`)?.length ?? 0) }))
    .sort((a, b) => b.s - a.s || byId(a.e.id, b.e.id))
    .slice(0, limit)
    .map(({ e }) => reviewView(i, e, viewerId));
}

export function popularLists(limit = 6, viewerId?: string): ListCard[] {
  const i = idx();
  return i.db.lists
    .filter((l) => l.visibility === "public" && listOk(i, l, viewerId))
    .sort((a, b) => (i.listLikes.get(b.id)?.size ?? 0) - (i.listLikes.get(a.id)?.size ?? 0) || byId(a.id, b.id))
    .slice(0, limit)
    .map((l) => listCard(i, l));
}

export function recentReviews(limit = 6): ReviewView[] {
  const i = idx();
  return i.db.entries
    .filter((e) => e.review && (e.rating ?? 0) >= 4 && entryOk(i, e))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a.id, b.id))
    .slice(0, limit)
    .map((e) => reviewView(i, e));
}

export function friendsListening(viewerId: string, limit = 12): { song: SongCard; user: UserMini; rating?: number }[] {
  const i = idx();
  const following = i.following.get(viewerId) ?? new Set();
  const seen = new Set<string>();
  const out: { song: SongCard; user: UserMini; rating?: number }[] = [];
  const entries = i.db.entries.filter((e) => following.has(e.userId) && entryOk(i, e, viewerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a.id, b.id));
  for (const e of entries) {
    if (seen.has(e.songId)) continue;
    seen.add(e.songId);
    out.push({ song: songCard(i, i.song.get(e.songId)!), user: userMini(i.user.get(e.userId)!), rating: e.rating });
    if (out.length >= limit) break;
  }
  return out;
}

export function friendsFavourites(viewerId: string, limit = 5): { song: SongCard; count: number; users: UserMini[] }[] {
  const i = idx();
  const following = i.following.get(viewerId) ?? new Set();
  const counts = new Map<string, string[]>();
  const likes = [...i.db.likes].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a.userId, b.userId));
  for (const l of likes) if (following.has(l.userId) && visibleUser(i, i.user.get(l.userId)!, viewerId) && !isHidden(i, viewerId, l.userId)) counts.set(l.songId, [...(counts.get(l.songId) ?? []), l.userId]);
  return [...counts.entries()]
    .sort((a, b) => b[1].length - a[1].length || byId(a[0], b[0]))
    .slice(0, limit)
    .map(([sid, us]) => ({ song: songCard(i, i.song.get(sid)!), count: us.length, users: us.slice(0, 3).map((u) => userMini(i.user.get(u)!)) }));
}

export function suggestedUsers(viewerId: string | undefined, limit = 4): (UserMini & { reason: string; bio: string })[] {
  const i = idx();
  const following = viewerId ? i.following.get(viewerId) ?? new Set() : new Set<string>();
  const candidates = i.db.users.filter((u) => u.id !== viewerId && !following.has(u.id) && !u.suspended && u.profileVisibility === "public" && !isHidden(i, viewerId, u.id));
  const scored = candidates.map((u) => {
    const comp = viewerId ? compatibility(viewerId, u.id) : null;
    const mutual = viewerId ? [...(i.followers.get(u.id) ?? [])].filter((f) => following.has(f)).length : 0;
    const followers = i.followers.get(u.id)?.size ?? 0;
    return { u, s: (comp?.score ?? 50) + mutual * 6 + followers, comp, mutual };
  });
  return scored
    .sort((a, b) => b.s - a.s || byId(a.u.id, b.u.id))
    .slice(0, limit)
    .map(({ u, comp, mutual }) => ({
      ...userMini(u), bio: u.bio,
      reason: comp && comp.shared >= 3 ? `${comp.score}% taste match` : mutual ? `Followed by ${mutual} you follow` : `${i.followers.get(u.id)?.size ?? 0} followers`,
    }));
}

// ── Song page ───────────────────────────────────────────────────────────

export function getSongPage(slug: string, viewerId?: string) {
  const i = idx();
  const song = i.songBySlug.get(slug);
  if (!song) return null;
  const album = i.album.get(song.albumId)!;
  const artists = song.artistIds.map((a) => i.artist.get(a)!);
  const stats = i.db.songStats[song.id];
  const entries = (i.entriesBySong.get(song.id) ?? []).filter((e) => entryOk(i, e, viewerId));
  const following = viewerId ? i.following.get(viewerId) ?? new Set<string>() : new Set<string>();

  // Review ranking: followed users, then likes, recency and length (relevance).
  const now = Date.now();
  const reviews = entries
    .filter((e) => e.review)
    .map((e) => {
      const likes = i.reviewLikes.get(e.id)?.size ?? 0;
      const ageDays = (now - Date.parse(e.createdAt)) / 864e5;
      const score = (following.has(e.userId) ? 12 : 0) + Math.log2(1 + likes) * 4 + Math.max(0, 6 - ageDays / 30) + Math.min(3, (e.review?.length ?? 0) / 80);
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || byId(a.e.id, b.e.id))
    .slice(0, MAX_SONG_REVIEWS)
    .map(({ e }) => reviewView(i, e, viewerId));

  const friends = viewerId
    ? [...following]
        .map((uid) => ({ u: i.user.get(uid)!, r: i.ratingsByUser.get(uid)?.get(song.id), liked: !!i.likesByUser.get(uid)?.has(song.id) }))
        .filter((x) => x.u && x.r && visibleUser(i, x.u, viewerId) && !isHidden(i, viewerId, x.u.id))
        .map((x) => ({ user: userMini(x.u), rating: x.r!.rating, liked: x.liked }))
        .sort((a, b) => b.rating - a.rating || byId(a.user.id, b.user.id))
    : [];

  const myEntries = viewerId ? entries.filter((e) => e.userId === viewerId).sort((a, b) => a.listenedAt.localeCompare(b.listenedAt) || a.createdAt.localeCompare(b.createdAt) || byId(a.id, b.id)) : [];
  const evolution: { year: number; rating: number }[] = [];
  for (const e of myEntries) {
    if (e.rating == null) continue;
    const y = Number(e.listenedAt.slice(0, 4));
    const last = evolution[evolution.length - 1];
    if (last?.year === y) last.rating = e.rating;
    else evolution.push({ year: y, rating: e.rating });
  }

  const lists = [...(i.listsBySong.get(song.id) ?? [])].sort(byCreated).filter((l) => l.visibility === "public" && listOk(i, l, viewerId)).slice(0, 6).map((l) => listCard(i, l));

  return {
    song, album, artists, stats, card: songCard(i, song), reviews, friends, lists,
    similar: similarSongs(song.id, 12),
    viewer: viewerState(i, song.id, viewerId),
    myEntries: myEntries.reverse().map((e) => reviewView(i, e, viewerId)),
    evolution,
    favouriteCount: stats?.likeCount ?? 0,
    otherTracks: (i.songsByAlbum.get(album.id) ?? []).filter((s) => s.id !== song.id).slice(0, 6).map((s) => songCard(i, s)),
  };
}

/** Oldest list first; the order lists are shown in when only a few fit. */
const byCreated = (a: SongList, b: SongList) => a.createdAt.localeCompare(b.createdAt) || byId(a.id, b.id);

/** Item-item similarity: co-rating listeners, shared lists, artist and genre. Scores are in tenths so the sums are exact. */
export function similarSongs(songId: string, limit = 12): SongCard[] {
  const i = idx();
  const song = i.song.get(songId)!;
  const score = new Map<string, number>();
  const bump = (id: string, v: number) => id !== songId && score.set(id, (score.get(id) ?? 0) + v);
  for (const r of i.ratingsBySong.get(songId) ?? []) {
    if (r.rating < 4) continue;
    for (const [sid, rr] of i.ratingsByUser.get(r.userId) ?? []) if (rr.rating >= 4) bump(sid, 10);
  }
  for (const l of i.listsBySong.get(songId) ?? []) for (const it of l.items) bump(it.songId, 15);
  for (const s of i.db.songs) {
    if (s.albumId === song.albumId) bump(s.id, 5);
    else if (s.artistIds.some((a) => song.artistIds.includes(a))) bump(s.id, 10);
    const shared = s.genres.filter((g) => song.genres.includes(g)).length;
    if (shared) bump(s.id, shared * 12);
  }
  // Diversify: max 2 per album.
  const perAlbum = new Map<string, number>();
  const out: SongCard[] = [];
  for (const [sid] of [...score.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0]))) {
    const s = i.song.get(sid)!;
    const n = perAlbum.get(s.albumId) ?? 0;
    if (n >= 2) continue;
    perAlbum.set(s.albumId, n + 1);
    out.push(songCard(i, s));
    if (out.length >= limit) break;
  }
  return out;
}

// ── Artist / album / genre ──────────────────────────────────────────────

export function getArtistPage(slug: string, viewerId?: string) {
  const i = idx();
  const artist = i.artistBySlug.get(slug);
  if (!artist) return null;
  const songs = i.songsByArtist.get(artist.id) ?? [];
  const st = (id: string) => i.db.songStats[id];
  const popular = [...songs].sort((a, b) => (st(b.id)?.logCount ?? 0) - (st(a.id)?.logCount ?? 0) || byId(a.id, b.id)).slice(0, 10).map((s) => songCard(i, s));
  const highest = [...songs].filter((s) => (st(s.id)?.ratingCount ?? 0) >= 2).sort((a, b) => weightedAvg(st(b.id)) - weightedAvg(st(a.id)) || byId(a.id, b.id)).slice(0, 10).map((s) => songCard(i, s));
  const albums = i.db.albums.filter((a) => a.artistId === artist.id).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || byId(a.id, b.id));
  const songIds = new Set(songs.map((s) => s.id));
  const totals = songs.reduce((acc, s) => ({ sum: acc.sum + (st(s.id)?.ratingSum ?? 0), n: acc.n + (st(s.id)?.ratingCount ?? 0) }), { sum: 0, n: 0 });
  const reviews = i.db.entries
    .filter((e) => e.review && songIds.has(e.songId) && entryOk(i, e, viewerId))
    .sort((a, b) => (i.reviewLikes.get(b.id)?.size ?? 0) - (i.reviewLikes.get(a.id)?.size ?? 0) || byId(a.id, b.id))
    .slice(0, 6)
    .map((e) => reviewView(i, e, viewerId));
  const lists = [...i.db.lists].sort(byCreated).filter((l) => l.visibility === "public" && listOk(i, l, viewerId) && l.items.some((it) => songIds.has(it.songId))).slice(0, 4).map((l) => listCard(i, l));
  const fanIds = i.db.artistFollows.filter((f) => f.artistId === artist.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a.userId, b.userId)).map((f) => f.userId);
  const fans = fanIds.map((u) => i.user.get(u)!).filter((u) => u && visibleUser(i, u, viewerId) && !isHidden(i, viewerId, u.id)).map(userMini);
  return {
    artist, songCount: songs.length, popular, highest, lists, reviews, fans,
    albums: albums.map((a) => ({ slug: a.slug, title: a.title, year: Number(a.releaseDate.slice(0, 4)), cover: coverOf(i, a.id), count: i.songsByAlbum.get(a.id)?.length ?? 0 })),
    avg: totals.n ? totals.sum / totals.n : 0, ratingCount: totals.n,
    following: !!viewerId && i.db.artistFollows.some((f) => f.userId === viewerId && f.artistId === artist.id),
    favourite: !!viewerId && !!i.user.get(viewerId)?.favoriteArtistIds.includes(artist.id),
  };
}

export function getAlbumPage(slug: string, viewerId?: string) {
  const i = idx();
  const album = i.albumBySlug.get(slug);
  if (!album) return null;
  const artist = i.artist.get(album.artistId)!;
  const songs = i.songsByAlbum.get(album.id) ?? [];
  const tracks = songs.map((s) => songCard(i, s));
  const rated = tracks.filter((t) => t.ratingCount);
  const myRatings = songs.map((s) => (viewerId ? i.ratingsByUser.get(viewerId)?.get(s.id)?.rating : undefined));
  const mine = myRatings.filter((r): r is number => r != null);
  return {
    album, artist, tracks, cover: coverOf(i, album.id),
    runtimeMs: songs.reduce((a, s) => a + s.durationMs, 0),
    avgTrack: rated.length ? rated.reduce((a, t) => a + t.avg, 0) / rated.length : 0,
    myAvg: mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : 0,
    myRatedCount: mine.length,
    states: viewerStates(songs.map((s) => s.id), viewerId),
    otherAlbums: i.db.albums.filter((a) => a.artistId === artist.id && a.id !== album.id).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || byId(a.id, b.id)).map((a) => ({ slug: a.slug, title: a.title, year: Number(a.releaseDate.slice(0, 4)), cover: coverOf(i, a.id) })),
  };
}

export function allGenres(): { name: string; slug: string; count: number }[] {
  const i = idx();
  const counts = new Map<string, number>();
  for (const s of i.db.songs) for (const g of s.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).map(([name, count]) => ({ name, slug: slugify(name), count }));
}

export function getGenrePage(slug: string, viewerId?: string) {
  const i = idx();
  const name = allGenres().find((g) => g.slug === slug)?.name;
  if (!name) return null;
  const songs = i.db.songs.filter((s) => s.genres.includes(name));
  const ids = new Set(songs.map((s) => s.id));
  const st = (id: string) => i.db.songStats[id];
  const artistCount = new Map<string, number>();
  for (const s of songs) for (const a of s.artistIds) artistCount.set(a, (artistCount.get(a) ?? 0) + (st(s.id)?.logCount ?? 0));
  return {
    name,
    topRated: [...songs].filter((s) => (st(s.id)?.ratingCount ?? 0) >= 2).sort((a, b) => weightedAvg(st(b.id)) - weightedAvg(st(a.id)) || byId(a.id, b.id)).slice(0, 12).map((s) => songCard(i, s)),
    popular: [...songs].sort((a, b) => (st(b.id)?.logCount ?? 0) - (st(a.id)?.logCount ?? 0) || byId(a.id, b.id)).slice(0, 12).map((s) => songCard(i, s)),
    reviews: i.db.entries.filter((e) => e.review && ids.has(e.songId) && entryOk(i, e, viewerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a.id, b.id)).slice(0, 6).map((e) => reviewView(i, e, viewerId)),
    lists: [...i.db.lists].sort(byCreated).filter((l) => l.visibility === "public" && listOk(i, l, viewerId) && l.items.filter((it) => ids.has(it.songId)).length >= 3).slice(0, 4).map((l) => listCard(i, l)),
    artists: [...artistCount.entries()].sort((a, b) => b[1] - a[1] || byId(a[0], b[0])).slice(0, 8).map(([id]) => i.artist.get(id)!).map((a) => ({ name: a.name, slug: a.slug, imageUrl: a.imageUrl, hue: a.hue })),
    count: songs.length,
  };
}

// ── Users / profiles ────────────────────────────────────────────────────

export function getUserByName(username: string): User | undefined {
  return idx().userByName.get(username.toLowerCase());
}

export function getProfile(username: string, viewerId?: string) {
  const i = idx();
  const user = getUserByName(username);
  if (!user || user.suspended) return null;
  const canView = visibleUser(i, user, viewerId) && !isHidden(i, viewerId, user.id);
  const entries = i.entriesByUser.get(user.id) ?? [];
  const ratings = i.ratingsByUser.get(user.id) ?? new Map();
  const lists = i.db.lists.filter((l) => l.userId === user.id && canSeeList(l, viewerId) && (l.visibility === "public" || l.userId === viewerId));
  const header = {
    user: { ...userMini(user), bio: user.bio, location: user.location, website: user.website, createdAt: user.createdAt },
    counts: {
      logged: entries.length, rated: ratings.size, reviews: entries.filter((e) => e.review).length, lists: lists.length,
      followers: i.followers.get(user.id)?.size ?? 0, following: i.following.get(user.id)?.size ?? 0,
      listenLater: i.listenLater.get(user.id)?.size ?? 0, likes: i.likesByUser.get(user.id)?.size ?? 0,
      thisYear: entries.filter((e) => e.listenedAt.startsWith(String(new Date().getFullYear()))).length,
    },
    isSelf: viewerId === user.id,
    viewerFollows: !!viewerId && !!i.following.get(viewerId)?.has(user.id),
    followsViewer: !!viewerId && !!i.following.get(user.id)?.has(viewerId),
    blocked: !!viewerId && i.db.blocks.some((b) => b.userId === viewerId && b.targetId === user.id && b.kind === "block"),
    muted: !!viewerId && i.db.blocks.some((b) => b.userId === viewerId && b.targetId === user.id && b.kind === "mute"),
    compatibility: viewerId && viewerId !== user.id ? compatibility(viewerId, user.id) : null,
    lyric: canView && user.profileLyric && i.song.has(user.profileLyric.songId) ? { text: user.profileLyric.text, startMs: user.profileLyric.startMs ?? null, song: songCard(i, i.song.get(user.profileLyric.songId)!) } : null,
    canView,
  };
  // Never the full record: the password hash stays server-side.
  return { ...header, raw: toPublic(user) };
}

export type ProfileHeader = NonNullable<ReturnType<typeof getProfile>>;

export function profileOverview(user: PublicUser, viewerId?: string) {
  const i = idx();
  const entries = i.entriesByUser.get(user.id) ?? [];
  const favourites = user.favoriteSongIds.map((id) => i.song.get(id)).filter(Boolean).map((s) => songCard(i, s!));
  const recent = entries.slice(0, 12).map((e) => ({ entryId: e.id, song: songCard(i, i.song.get(e.songId)!), rating: e.rating, liked: e.liked, isRelisten: e.isRelisten, review: !!e.review }));
  const reviews = entries.filter((e) => e.review).slice(0, 4).map((e) => reviewView(i, e, viewerId));
  const favArtists = user.favoriteArtistIds.map((a) => i.artist.get(a)).filter(Boolean).map((a) => ({ name: a!.name, slug: a!.slug, imageUrl: a!.imageUrl, hue: a!.hue }));
  const lists = i.db.lists.filter((l) => l.userId === user.id && !l.removed && (l.visibility === "public" || l.userId === viewerId)).sort(byUpdated).slice(0, 3).map((l) => listCard(i, l));
  const ratings = [...(i.ratingsByUser.get(user.id)?.values() ?? [])];
  const histogram = Array(10).fill(0);
  for (const r of ratings) histogram[r.rating * 2 - 1]++;
  return { favourites, recent, reviews, favArtists, lists, histogram, ratingCount: ratings.length };
}

export interface DiaryFilters {
  year?: string;
  month?: string;
  artist?: string;
  rating?: string;
  genre?: string;
  relisten?: string;
  liked?: string;
  tag?: string;
}

export function getDiary(user: PublicUser, f: DiaryFilters, viewerId?: string) {
  const i = idx();
  const all = i.entriesByUser.get(user.id) ?? [];
  const years = [...new Set(all.map((e) => e.listenedAt.slice(0, 4)))].sort().reverse();
  const artistSet = new Map<string, string>();
  const genreSet = new Set<string>();
  const tagSet = new Set<string>();
  for (const e of all) {
    const s = i.song.get(e.songId)!;
    const a = i.artist.get(s.artistIds[0])!;
    artistSet.set(a.slug, a.name);
    s.genres.forEach((g) => genreSet.add(g));
    e.tags.forEach((t) => tagSet.add(t));
  }
  const filtered = all.filter((e) => {
    const s = i.song.get(e.songId)!;
    if (f.year && !e.listenedAt.startsWith(f.year)) return false;
    if (f.month && e.listenedAt.slice(5, 7) !== f.month.padStart(2, "0")) return false;
    if (f.artist && !s.artistIds.some((a) => i.artist.get(a)?.slug === f.artist)) return false;
    if (f.rating && String(e.rating ?? "") !== f.rating) return false;
    if (f.genre && !s.genres.includes(f.genre)) return false;
    if (f.relisten === "1" && !e.isRelisten) return false;
    if (f.relisten === "0" && e.isRelisten) return false;
    if (f.liked === "1" && !e.liked) return false;
    if (f.tag && !e.tags.includes(f.tag)) return false;
    return true;
  });
  const listenCounts = new Map<string, number>();
  for (const e of all) listenCounts.set(e.songId, (listenCounts.get(e.songId) ?? 0) + 1);
  return {
    entries: filtered.slice(0, MAX_DIARY_ROWS).map((e) => ({ ...reviewView(i, e, viewerId), playCount: listenCounts.get(e.songId) ?? 1 })),
    truncated: filtered.length > MAX_DIARY_ROWS,
    total: all.length,
    years,
    artists: [...artistSet.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    genres: [...genreSet].sort(),
    tags: [...tagSet].sort(),
  };
}

export function getUserReviews(user: PublicUser, sort: string, viewerId?: string) {
  const i = idx();
  const reviews = (i.entriesByUser.get(user.id) ?? []).filter((e) => e.review);
  if (sort === "popular") reviews.sort((a, b) => (i.reviewLikes.get(b.id)?.size ?? 0) - (i.reviewLikes.get(a.id)?.size ?? 0));
  else if (sort === "rating") reviews.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return reviews.slice(0, MAX_DIARY_ROWS).map((e) => reviewView(i, e, viewerId));
}

/** Most recently changed list first. */
const byUpdated = (a: SongList, b: SongList) => b.updatedAt.localeCompare(a.updatedAt) || byId(a.id, b.id);

export function getUserLists(user: PublicUser, viewerId?: string) {
  const i = idx();
  return i.db.lists
    .filter((l) => l.userId === user.id && canSeeList(l, viewerId) && (l.visibility === "public" || l.userId === viewerId))
    .sort(byUpdated)
    .map((l) => listCard(i, l));
}

export function getUserLikes(user: PublicUser) {
  const i = idx();
  return i.db.likes
    .filter((l) => l.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a.songId, b.songId))
    .map((l) => ({ song: songCard(i, i.song.get(l.songId)!), rating: i.ratingsByUser.get(user.id)?.get(l.songId)?.rating }));
}

export function getFollowList(user: PublicUser, kind: "followers" | "following", viewerId?: string) {
  const i = idx();
  const rows = i.db.follows.filter((f) => (kind === "followers" ? f.followingId : f.followerId) === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byId(kind === "followers" ? a.followerId : a.followingId, kind === "followers" ? b.followerId : b.followingId));
  const ids = rows.map((f) => (kind === "followers" ? f.followerId : f.followingId));
  const vf = viewerId ? i.following.get(viewerId) ?? new Set() : new Set<string>();
  return ids
    .map((id) => i.user.get(id)!)
    .filter((u) => u && !u.suspended)
    .map((u) => ({ ...userMini(u), bio: u.bio, viewerFollows: vf.has(u.id), logged: i.entriesByUser.get(u.id)?.length ?? 0 }));
}

// ── Review detail ───────────────────────────────────────────────────────

export function getReview(id: string, viewerId?: string) {
  const i = idx();
  const e = i.entry.get(id);
  if (!e || !e.review && !e.rating) return null;
  if (!entryOk(i, e, viewerId)) return null;
  const plays = (i.entriesBySong.get(e.songId) ?? []).filter((x) => x.userId === e.userId).length;
  return { review: reviewView(i, e, viewerId), comments: getComments("entry", id, viewerId), isOwner: viewerId === e.userId, plays, entry: e };
}

export function getComments(targetType: "entry" | "list", targetId: string, viewerId?: string): CommentView[] {
  const i = idx();
  const all = [...(i.commentsByTarget.get(`${targetType}:${targetId}`) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || byId(a.id, b.id)).filter((c) => !isHidden(i, viewerId, c.userId) && !i.user.get(c.userId)?.suspended).slice(0, MAX_COMMENTS);
  const likes = new Map<string, Set<string>>();
  for (const l of i.db.commentLikes) {
    if (!likes.has(l.commentId)) likes.set(l.commentId, new Set());
    likes.get(l.commentId)!.add(l.userId);
  }
  const toView = (c: (typeof all)[number]): CommentView => ({
    id: c.id, user: userMini(i.user.get(c.userId)!), body: c.body, createdAt: c.createdAt,
    likeCount: likes.get(c.id)?.size ?? 0, viewerLiked: !!viewerId && !!likes.get(c.id)?.has(viewerId),
    replies: [], canDelete: viewerId === c.userId,
  });
  const roots = all.filter((c) => !c.parentId).map(toView);
  const rootById = new Map(roots.map((r) => [r.id, r]));
  for (const c of all.filter((c) => c.parentId)) rootById.get(c.parentId!)?.replies.push(toView(c));
  return roots;
}

// ── Lists ───────────────────────────────────────────────────────────────

export function getListPage(id: string, viewerId?: string) {
  const i = idx();
  const list = i.db.lists.find((l) => l.id === id);
  if (!list || !listOk(i, list, viewerId)) return null;
  return {
    list, card: listCard(i, list),
    items: list.items.map((it) => ({ song: songCard(i, i.song.get(it.songId)!), note: it.note })),
    states: viewerStates(list.items.map((it) => it.songId), viewerId),
    isOwner: viewerId === list.userId,
    viewerLiked: !!viewerId && !!i.listLikes.get(list.id)?.has(viewerId),
    comments: getComments("list", list.id, viewerId),
    clonedFrom: list.clonedFromId ? i.db.lists.find((l) => l.id === list.clonedFromId) : undefined,
  };
}

export function viewerLists(viewerId: string) {
  const i = idx();
  return i.db.lists.filter((l) => l.userId === viewerId && !l.removed).sort(byUpdated).map((l) => ({ id: l.id, title: l.title, count: l.items.length, songIds: l.items.map((x) => x.songId) }));
}

export function browseLists(sort: string, viewerId?: string): ListCard[] {
  const i = idx();
  const lists = i.db.lists.filter((l) => l.visibility === "public" && listOk(i, l, viewerId));
  if (sort === "recent") lists.sort(byUpdated);
  else lists.sort((a, b) => (i.listLikes.get(b.id)?.size ?? 0) - (i.listLikes.get(a.id)?.size ?? 0) || byId(a.id, b.id));
  return lists.slice(0, MAX_LIST_CARDS).map((l) => listCard(i, l));
}

// ── Listen later ────────────────────────────────────────────────────────

export function getListenLater(viewerId: string) {
  const i = idx();
  const m = i.listenLater.get(viewerId) ?? new Map();
  return [...m.entries()].sort((a, b) => (a[1] as string).localeCompare(b[1] as string) || byId(a[0], b[0])).map(([sid, at]) => ({ song: songCard(i, i.song.get(sid)!), addedAt: at as string, genres: i.song.get(sid)!.genres }));
}

// ── Feed ────────────────────────────────────────────────────────────────

export function getFeed(viewerId: string, before?: string, limit = 25): { items: FeedItem[]; next?: string } {
  const i = idx();
  const following = i.following.get(viewerId) ?? new Set<string>();
  const actors = new Set([...following, viewerId]);
  const events = i.db.activity
    .filter((a) => actors.has(a.actorId) && (!before || a.createdAt < before) && !isHidden(i, viewerId, a.actorId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a.id, b.id));
  const items: FeedItem[] = [];
  const likedSeen = new Set<string>();
  for (const a of events) {
    const actorU = i.user.get(a.actorId);
    if (!actorU || !visibleUser(i, actorU, viewerId)) continue;
    const actor = userMini(actorU);
    if ((a.type === "song_logged" || a.type === "song_reviewed") && a.entryId) {
      const e = i.entry.get(a.entryId);
      if (!e || !entryOk(i, e, viewerId)) continue;
      items.push({ kind: "entry", id: a.id, at: a.createdAt, actor, review: reviewView(i, e, viewerId) });
    } else if (a.type === "song_liked" && a.songId) {
      // Skip a like immediately duplicated by a log card for the same song.
      const k = a.actorId + a.songId;
      if (likedSeen.has(k)) continue;
      likedSeen.add(k);
      items.push({ kind: "like", id: a.id, at: a.createdAt, actor, song: songCard(i, i.song.get(a.songId)!) });
    } else if ((a.type === "list_created" || a.type === "list_updated") && a.listId) {
      const l = i.db.lists.find((x) => x.id === a.listId);
      if (!l || !canSeeList(l, viewerId) || l.visibility !== "public") continue;
      items.push({ kind: "list", id: a.id, at: a.createdAt, actor, list: listCard(i, l), verb: a.type === "list_created" ? "created" : "updated", count: a.count });
    } else if (a.type === "user_followed" && a.targetUserId) {
      const t = i.user.get(a.targetUserId);
      if (!t) continue;
      items.push({ kind: "follow", id: a.id, at: a.createdAt, actor, target: userMini(t) });
    }
    if (items.length >= limit) break;
  }
  // Collapse likes that duplicate a log of the same song by the same actor.
  const logged = new Set(items.filter((x) => x.kind === "entry").map((x) => x.kind === "entry" ? x.actor.id + x.review.song.id : ""));
  const deduped = items.filter((x) => !(x.kind === "like" && logged.has(x.actor.id + x.song.id)));
  return { items: deduped, next: items.length >= limit ? items[items.length - 1].at : undefined };
}

// ── Notifications ───────────────────────────────────────────────────────

export function getNotifications(userId: string) {
  const i = idx();
  return i.db.notifications
    .filter((n) => n.userId === userId && !isHidden(i, userId, n.actorId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a.id, b.id))
    .slice(0, 80)
    .map((n) => {
      const actor = i.user.get(n.actorId);
      let target: { href: string; label: string; cover?: Cover } | undefined;
      if (n.targetId && (n.type === "review_like" || n.type === "review_comment" || n.type === "comment_reply" || n.type === "friend_reviewed")) {
        const e = i.entry.get(n.targetId);
        const s = e && i.song.get(e.songId);
        if (s) target = { href: `/review/${e!.id}`, label: s.title, cover: coverOf(i, s.albumId) };
      } else if (n.targetId && (n.type === "list_like" || n.type === "list_comment")) {
        const l = i.db.lists.find((x) => x.id === n.targetId);
        if (l) target = { href: `/list/${l.id}`, label: l.title };
      }
      return { ...n, actor: actor ? userMini(actor) : null, target };
    })
    .filter((n) => n.actor);
}

export function unreadCount(userId: string) {
  const i = idx();
  return i.db.notifications.filter((n) => n.userId === userId && !n.readAt && !isHidden(i, userId, n.actorId)).length;
}

// ── Taste compatibility ─────────────────────────────────────────────────

export function compatibility(aId: string, bId: string): { score: number; shared: number; sharedTop: SongCard[] } {
  const i = idx();
  const ratings = (id: string) => new Map([...(i.ratingsByUser.get(id) ?? [])].map(([sid, r]) => [sid, r.rating]));
  const c = compat(ratings(aId), ratings(bId), (sid) => i.song.get(sid)?.genres ?? []);
  return { score: c.score, shared: c.shared, sharedTop: c.topIds.map((id) => songCard(i, i.song.get(id)!)) };
}

// ── Search ──────────────────────────────────────────────────────────────

export function search(q: string, limit = 8, viewerId?: string) {
  const i = idx();
  const m = matcher(q);
  if (!m.tokens.length) return { songs: [], artists: [], albums: [], users: [], lists: [] };
  const matchScore = m.score;
  const songs = i.db.songs
    .map((s) => {
      const artist = s.artistIds.map((a) => i.artist.get(a)!.name).join(" ");
      const album = i.album.get(s.albumId)!.title;
      const pop = Math.log2(1 + (i.db.songStats[s.id]?.logCount ?? 0)) * 3 + s.popularity / 20;
      return { s, score: matchScore(s.title, `${artist} ${album} ${s.featured.join(" ")}`, pop) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byId(a.s.id, b.s.id))
    .slice(0, limit)
    .map((x) => songCard(i, x.s));
  const artists = i.db.artists
    .map((a) => ({ a, score: matchScore(a.name, a.genres.join(" "), (i.songsByArtist.get(a.id)?.length ?? 0) / 5) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || byId(a.a.id, b.a.id)).slice(0, 5)
    .map(({ a }) => ({ name: a.name, slug: a.slug, imageUrl: a.imageUrl, hue: a.hue, genres: a.genres }));
  const albums = i.db.albums
    .map((al) => ({ al, score: matchScore(al.title, i.artist.get(al.artistId)!.name, 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || byId(a.al.id, b.al.id)).slice(0, 5)
    .map(({ al }) => ({ title: al.title, slug: al.slug, artist: i.artist.get(al.artistId)!.name, year: Number(al.releaseDate.slice(0, 4)), cover: coverOf(i, al.id) }));
  const users = i.db.users
    .filter((u) => !u.suspended && !isHidden(i, viewerId, u.id))
    .map((u) => ({ u, score: matchScore(u.username, u.displayName, 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || byId(a.u.id, b.u.id)).slice(0, 5)
    .map(({ u }) => userMini(u));
  const lists = i.db.lists
    .filter((l) => l.visibility === "public" && listOk(i, l, viewerId))
    .map((l) => ({ l, score: matchScore(l.title, l.description, 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || byId(a.l.id, b.l.id)).slice(0, 5)
    .map(({ l }) => listCard(i, l));
  return { songs, artists, albums, users, lists };
}

export function catalogueSize() {
  const db = idx().db;
  const live = db.entries.filter((e) => !e.removed);
  return { songs: db.songs.length, users: db.users.length, logs: live.length, reviews: live.filter((e) => e.review).length };
}

/** Distinct album covers (one song per artwork) for decorative walls. */
export function artworkWall(limit = 60): SongCard[] {
  const i = idx();
  const seen = new Set<string>();
  const out: SongCard[] = [];
  for (const s of [...i.db.songs].sort((a, b) => byId(a.id, b.id))) {
    const card = songCard(i, s);
    const key = card.cover.artworkUrl ?? `${card.cover.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}
