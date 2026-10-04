import "server-only";
import type { Album, Artist, DB, DiaryEntry, Rating, Song, SongList, User, Comment } from "../types";
import { getDB, getRev } from "./store";

// In-memory secondary indexes (the equivalent of DB indexes), rebuilt lazily
// after writes.

export interface Indexes {
  db: DB;
  song: Map<string, Song>;
  songBySlug: Map<string, Song>;
  album: Map<string, Album>;
  albumBySlug: Map<string, Album>;
  artist: Map<string, Artist>;
  artistBySlug: Map<string, Artist>;
  user: Map<string, User>;
  userByName: Map<string, User>;
  entry: Map<string, DiaryEntry>;
  entriesBySong: Map<string, DiaryEntry[]>;
  entriesByUser: Map<string, DiaryEntry[]>;
  ratingsByUser: Map<string, Map<string, Rating>>;
  ratingsBySong: Map<string, Rating[]>;
  likesByUser: Map<string, Set<string>>;
  likesBySong: Map<string, string[]>;
  reviewLikes: Map<string, Set<string>>;
  commentsByTarget: Map<string, Comment[]>;
  following: Map<string, Set<string>>;
  followers: Map<string, Set<string>>;
  listsBySong: Map<string, SongList[]>;
  listLikes: Map<string, Set<string>>;
  listenLater: Map<string, Map<string, string>>;
  songsByAlbum: Map<string, Song[]>;
  songsByArtist: Map<string, Song[]>;
  hidden: Map<string, Set<string>>; // viewer → users blocked/muted (either direction for blocks)
}

let cache: { rev: number; idx: Indexes } | null = null;

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}
function add<K, V>(m: Map<K, Set<V>>, k: K, v: V) {
  const s = m.get(k);
  if (s) s.add(v);
  else m.set(k, new Set([v]));
}

export function idx(): Indexes {
  const db = getDB();
  const rev = getRev();
  if (cache && cache.rev === rev && cache.idx.db === db) return cache.idx;
  const i: Indexes = {
    db,
    song: new Map(db.songs.map((s) => [s.id, s])),
    songBySlug: new Map(db.songs.map((s) => [s.slug, s])),
    album: new Map(db.albums.map((a) => [a.id, a])),
    albumBySlug: new Map(db.albums.map((a) => [a.slug, a])),
    artist: new Map(db.artists.map((a) => [a.id, a])),
    artistBySlug: new Map(db.artists.map((a) => [a.slug, a])),
    user: new Map(db.users.map((u) => [u.id, u])),
    userByName: new Map(db.users.map((u) => [u.username.toLowerCase(), u])),
    entry: new Map(),
    entriesBySong: new Map(),
    entriesByUser: new Map(),
    ratingsByUser: new Map(),
    ratingsBySong: new Map(),
    likesByUser: new Map(),
    likesBySong: new Map(),
    reviewLikes: new Map(),
    commentsByTarget: new Map(),
    following: new Map(),
    followers: new Map(),
    listsBySong: new Map(),
    listLikes: new Map(),
    listenLater: new Map(),
    songsByAlbum: new Map(),
    songsByArtist: new Map(),
    hidden: new Map(),
  };
  for (const e of db.entries) {
    if (e.removed) continue;
    i.entry.set(e.id, e);
    push(i.entriesBySong, e.songId, e);
    push(i.entriesByUser, e.userId, e);
  }
  for (const a of i.entriesByUser.values()) a.sort((x, y) => (y.listenedAt + y.createdAt).localeCompare(x.listenedAt + x.createdAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const r of db.ratings) {
    if (!i.ratingsByUser.has(r.userId)) i.ratingsByUser.set(r.userId, new Map());
    i.ratingsByUser.get(r.userId)!.set(r.songId, r);
    push(i.ratingsBySong, r.songId, r);
  }
  for (const l of db.likes) {
    add(i.likesByUser, l.userId, l.songId);
    push(i.likesBySong, l.songId, l.userId);
  }
  for (const l of db.reviewLikes) add(i.reviewLikes, l.entryId, l.userId);
  for (const c of db.comments) if (!c.removed) push(i.commentsByTarget, `${c.targetType}:${c.targetId}`, c);
  for (const f of db.follows) {
    add(i.following, f.followerId, f.followingId);
    add(i.followers, f.followingId, f.followerId);
  }
  for (const l of db.lists) {
    if (l.removed) continue;
    for (const it of l.items) push(i.listsBySong, it.songId, l);
  }
  for (const l of db.listLikes) add(i.listLikes, l.listId, l.userId);
  for (const l of db.listenLater) {
    if (!i.listenLater.has(l.userId)) i.listenLater.set(l.userId, new Map());
    i.listenLater.get(l.userId)!.set(l.songId, l.createdAt);
  }
  for (const s of db.songs) {
    push(i.songsByAlbum, s.albumId, s);
    for (const a of s.artistIds) push(i.songsByArtist, a, s);
  }
  for (const a of i.songsByAlbum.values()) a.sort((x, y) => x.trackNumber - y.trackNumber || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const b of db.blocks) {
    add(i.hidden, b.userId, b.targetId);
    if (b.kind === "block") add(i.hidden, b.targetId, b.userId);
  }
  cache = { rev, idx: i };
  return i;
}
