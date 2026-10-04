import type { Album, Artist, DB, DiaryEntry, Song, User } from "../types";
import { SEED_ALBUMS, SEED_ARTISTS, HIT_SONGS, type SeedAlbum, type SeedArtist } from "./catalog";
import { SEED_USERS, SEED_LISTS, REVIEWS, SONG_REVIEWS, SEED_PASSWORD, TAG_POOL } from "./social";
import { mulberry32, parseDuration, slugify, clampRating } from "../util";
import { hashPassword } from "../server/password";
import { recomputeAllStats } from "../server/stats";

export const DB_VERSION = 4;

export function emptyDB(): DB {
  return {
    version: DB_VERSION, users: [], artists: [], albums: [], songs: [], ratings: [], likes: [], entries: [], reviewLikes: [],
    follows: [], artistFollows: [], lists: [], listLikes: [], comments: [], commentLikes: [], listenLater: [], notifications: [],
    activity: [], reports: [], blocks: [], sessions: [], songStats: {},
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function addArtist(db: DB, a: SeedArtist, id: (p: string) => string): Artist {
  const artist: Artist = { id: id("ar"), slug: slugify(a.name), name: a.name, genres: a.genres, hue: hash(a.name) % 360, bio: a.bio };
  db.artists.push(artist);
  return artist;
}

function addAlbum(db: DB, al: SeedAlbum, artist: Artist, id: (p: string) => string, rnd: () => number, songSlugs: Set<string>) {
  const album: Album = {
    id: id("al"), slug: slugify(`${al.title}-${al.artist}`), title: al.title, artistId: artist.id, releaseDate: al.date,
    genres: al.genres, label: al.label, palette: al.palette, pattern: al.pattern, producers: al.producers,
  };
  db.albums.push(album);
  const members = SEED_ARTISTS.find((a) => a.name === al.artist)?.members;
  al.tracks.forEach((t, i) => {
    const parts = t.split("|");
    const [title, dur] = parts;
    const explicit = parts.includes("E");
    const feat = parts.slice(2).filter((p) => p !== "E").join(";");
    const featured = feat ? feat.split(";") : [];
    let slug = slugify(`${title}-${al.artist}`);
    if (songSlugs.has(slug)) slug = slugify(`${title}-${al.artist}-${al.title}`);
    songSlugs.add(slug);
    const hit = HIT_SONGS.has(title);
    const song: Song = {
      id: id("so"), slug, title, albumId: album.id, artistIds: [artist.id], featured, durationMs: parseDuration(dur),
      trackNumber: i + 1, releaseDate: al.date, explicit,
      isrc: `${["US", "GB", "FR", "AU"][hash(al.title) % 4]}${(hash(title) % 900 + 100)}${al.date.slice(2, 4)}${String(hash(title + al.artist) % 100000).padStart(5, "0")}`,
      writers: al.writers ?? members?.slice(0, 2) ?? [al.artist], producers: al.producers, genres: al.genres,
      popularity: Math.min(98, Math.round((hit ? 72 : 42) + rnd() * 22)),
      links: {
        spotify: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${al.artist}`)}`,
        apple: `https://music.apple.com/us/search?term=${encodeURIComponent(`${title} ${al.artist}`)}`,
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${al.artist}`)}`,
      },
    };
    db.songs.push(song);
  });
}

/**
 * Appends seed artists (and their albums) that an existing database doesn't have yet, so growing
 * the catalogue never needs a schema bump or wipes user data. Returns true if anything was added.
 */
export function appendMissingCatalogue(db: DB): boolean {
  const have = new Set(db.artists.map((a) => a.slug));
  const missing = SEED_ARTISTS.filter((a) => !have.has(slugify(a.name)));
  if (!missing.length) return false;
  const used = new Set<string>([...db.artists, ...db.albums, ...db.songs].map((x) => x.id));
  let n = 0;
  const id = (p: string) => {
    let v: string;
    do v = `${p}n${(++n).toString(36)}`; while (used.has(v));
    used.add(v);
    return v;
  };
  const rnd = mulberry32(hash(missing.map((a) => a.name).join("|")));
  const songSlugs = new Set(db.songs.map((s) => s.slug));
  const artistByName = new Map(missing.map((a) => [a.name, addArtist(db, a, id)] as const));
  for (const al of SEED_ALBUMS) {
    const artist = artistByName.get(al.artist);
    if (artist) addAlbum(db, al, artist, id, rnd, songSlugs);
  }
  return true;
}

/** Catalogue always; demo community (shared public password) only when `demo`. */
export function generateSeed({ demo: withDemoUsers }: { demo: boolean }): DB {
  const db = emptyDB();
  const rnd = mulberry32(20261004);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  let idc = 0;
  const id = (p: string) => `${p}${(++idc).toString(36).padStart(5, "0")}`;

  // ── Catalogue ───────────────────────────────────────────────
  const artistByName = new Map<string, Artist>();
  for (const a of SEED_ARTISTS) artistByName.set(a.name, addArtist(db, a, id));
  const songSlugs = new Set<string>();
  for (const al of SEED_ALBUMS) addAlbum(db, al, artistByName.get(al.artist)!, id, rnd, songSlugs);
  const albumById = new Map(db.albums.map((a) => [a.id, a]));
  const findSong = (q: string) => {
    const [title, artistName] = q.split(" @ ");
    return db.songs.find((s) => s.title === title && (!artistName || db.artists.find((a) => a.id === s.artistIds[0])?.name === artistName));
  };

  if (!withDemoUsers) {
    recomputeAllStats(db);
    return db;
  }

  // ── Users ───────────────────────────────────────────────────
  const pw = hashPassword(SEED_PASSWORD);
  const START = Date.parse("2024-01-05T00:00:00Z");
  const END = Date.parse("2026-10-03T22:00:00Z");
  for (const su of SEED_USERS) {
    const user: User = {
      id: id("us"), username: su.username, displayName: su.displayName, bio: su.bio, location: su.location, website: su.website,
      avatarHue: su.hue, passwordHash: pw, createdAt: new Date(START - rnd() * 1e10).toISOString(), favoriteSongIds: [], favoriteArtistIds: [],
      profileVisibility: "public", role: su.role ?? "user", onboarded: true,
    };
    db.users.push(user);
  }

  // ── Ratings, diary, likes ──────────────────────────────────
  const affinity = (su: (typeof SEED_USERS)[number], song: Song) => {
    let a = 0;
    for (const g of song.genres) for (const [k, w] of Object.entries(su.taste)) if (g.includes(k)) a = Math.max(a, w);
    return a;
  };
  const randDate = () => {
    const r = Math.pow(rnd(), 0.65); // skew towards recent
    return new Date(START + r * (END - START));
  };
  db.users.forEach((user, ui) => {
    const su = SEED_USERS[ui];
    const target = Math.round((45 + rnd() * 40) * su.activity);
    const scored = db.songs
      .map((s) => ({ s, w: (affinity(su, s) + 0.15) * (HIT_SONGS.has(s.title) ? 2.4 : 1) * (0.4 + rnd()) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, target);
    for (const { s } of scored) {
      const aff = affinity(su, s);
      const base = 2.6 + aff * 1.4 + (HIT_SONGS.has(s.title) ? 0.5 : 0) + su.generosity + (rnd() - 0.5) * 1.4;
      const rating = clampRating(base);
      const plays = rating >= 4.5 ? 1 + Math.floor(rnd() * 5) : rating >= 4 ? 1 + Math.floor(rnd() * 2) : 1;
      const dates = Array.from({ length: plays }, randDate).sort((a, b) => a.getTime() - b.getTime());
      const liked = rating >= 4.5 ? rnd() < 0.75 : rating >= 3.5 ? rnd() < 0.15 : false;
      dates.forEach((d, i) => {
        const isLast = i === dates.length - 1;
        const r = isLast ? rating : clampRating(rating - (rnd() < 0.5 ? 0.5 : 0));
        const writeReview = rnd() < (isLast ? 0.38 : 0.12);
        const band = r >= 4 ? "high" : r >= 3 ? "mid" : "low";
        const specific = SONG_REVIEWS[s.title];
        const review = writeReview ? (specific && band === "high" && rnd() < 0.6 ? pick(specific) : pick(REVIEWS[band])) : undefined;
        const listened = d.toISOString().slice(0, 10);
        const created = new Date(d.getTime() + rnd() * 3 * 3600e3).toISOString();
        const entry: DiaryEntry = {
          id: id("en"), userId: user.id, songId: s.id, rating: rnd() < 0.92 ? r : undefined, liked: liked && isLast, review,
          listenedAt: listened, isRelisten: i > 0, tags: rnd() < 0.3 ? [pick(TAG_POOL)] : [], createdAt: created, updatedAt: created,
        };
        db.entries.push(entry);
        db.activity.push({ id: id("ac"), actorId: user.id, type: review ? "song_reviewed" : "song_logged", songId: s.id, entryId: entry.id, createdAt: created });
        if (isLast) {
          db.ratings.push({ userId: user.id, songId: s.id, rating, createdAt: dates[0].toISOString(), updatedAt: created });
          if (liked) {
            db.likes.push({ userId: user.id, songId: s.id, createdAt: created });
            db.activity.push({ id: id("ac"), actorId: user.id, type: "song_liked", songId: s.id, createdAt: created });
          }
        }
      });
    }
    // Favourites: top-rated liked songs, varied albums.
    const mine = db.ratings.filter((r) => r.userId === user.id).sort((a, b) => b.rating - a.rating || rnd() - 0.5);
    const favAlbums = new Set<string>();
    for (const r of mine) {
      const s = db.songs.find((x) => x.id === r.songId)!;
      if (favAlbums.has(s.albumId)) continue;
      favAlbums.add(s.albumId);
      user.favoriteSongIds.push(s.id);
      if (user.favoriteSongIds.length >= (ui % 2 ? 4 : 6)) break;
    }
    const artistCounts = new Map<string, number>();
    for (const r of mine.slice(0, 30)) {
      const a = db.songs.find((x) => x.id === r.songId)!.artistIds[0];
      artistCounts.set(a, (artistCounts.get(a) ?? 0) + r.rating);
    }
    user.favoriteArtistIds = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a]) => a);
    for (const a of user.favoriteArtistIds) db.artistFollows.push({ userId: user.id, artistId: a, createdAt: user.createdAt });

    // Listen later
    const rated = new Set(mine.map((r) => r.songId));
    const ll = db.songs.filter((s) => !rated.has(s.id) && rnd() < 0.06);
    for (const s of ll) db.listenLater.push({ userId: user.id, songId: s.id, createdAt: randDate().toISOString() });
  });

  // ── Follows ─────────────────────────────────────────────────
  for (const u of db.users) {
    const others = db.users.filter((o) => o.id !== u.id).sort(() => rnd() - 0.5);
    const n = u.username === "abtin" ? 8 : 4 + Math.floor(rnd() * 5);
    for (const o of others.slice(0, n)) {
      const at = randDate().toISOString();
      db.follows.push({ followerId: u.id, followingId: o.id, createdAt: at });
      db.activity.push({ id: id("ac"), actorId: u.id, type: "user_followed", targetUserId: o.id, createdAt: at });
    }
  }
  // Make sure the demo account has followers.
  const demo = db.users[0];
  for (const u of db.users.slice(1, 9)) {
    if (!db.follows.some((f) => f.followerId === u.id && f.followingId === demo.id)) {
      db.follows.push({ followerId: u.id, followingId: demo.id, createdAt: randDate().toISOString() });
    }
  }

  // ── Lists ───────────────────────────────────────────────────
  for (const sl of SEED_LISTS) {
    const owner = db.users.find((u) => u.username === sl.owner)!;
    const items = sl.songs
      .map((x) => (typeof x === "string" ? { q: x } : { q: x[0], note: x[1] }))
      .map(({ q, note }) => ({ song: findSong(q), note }))
      .filter((x) => x.song)
      .map((x) => ({ songId: x.song!.id, note: x.note }));
    const created = randDate().toISOString();
    const list = { id: id("li"), userId: owner.id, title: sl.title, description: sl.description, isRanked: sl.ranked, visibility: "public" as const, items, createdAt: created, updatedAt: created };
    db.lists.push(list);
    db.activity.push({ id: id("ac"), actorId: owner.id, type: "list_created", listId: list.id, count: items.length, createdAt: created });
  }

  // ── Social engagement ──────────────────────────────────────
  const reviews = db.entries.filter((e) => e.review);
  for (const e of reviews) {
    const hit = HIT_SONGS.has(db.songs.find((s) => s.id === e.songId)!.title);
    for (const u of db.users) {
      if (u.id === e.userId) continue;
      if (rnd() < (hit ? 0.22 : 0.08)) db.reviewLikes.push({ userId: u.id, entryId: e.id, createdAt: new Date(Date.parse(e.createdAt) + rnd() * 864e5 * 3).toISOString() });
    }
  }
  const COMMENTS = ["So real.", "This is exactly how I feel about it.", "Hard disagree but I respect it.", "The bridge!!!", "Adding this to my listen later.", "You always find the best stuff.", "Okay you've convinced me to revisit this.", "Underrated take.", "This review made me relisten immediately.", "Same. Every time."];
  for (const e of reviews.filter(() => rnd() < 0.18)) {
    const u = pick(db.users.filter((x) => x.id !== e.userId));
    const c = { id: id("co"), userId: u.id, targetType: "entry" as const, targetId: e.id, body: pick(COMMENTS), createdAt: new Date(Date.parse(e.createdAt) + rnd() * 864e5).toISOString() };
    db.comments.push(c);
    if (rnd() < 0.4) db.comments.push({ id: id("co"), userId: e.userId, targetType: "entry", targetId: e.id, parentId: c.id, body: pick(["Thank you!", "Haha exactly", "Right?? Go listen again.", "Glad someone gets it."]), createdAt: new Date(Date.parse(c.createdAt) + 3600e3).toISOString() });
  }
  for (const l of db.lists) {
    for (const u of db.users) if (u.id !== l.userId && rnd() < 0.45) db.listLikes.push({ userId: u.id, listId: l.id, createdAt: randDate().toISOString() });
    for (let i = 0; i < Math.floor(rnd() * 3); i++) {
      const u = pick(db.users.filter((x) => x.id !== l.userId));
      db.comments.push({ id: id("co"), userId: u.id, targetType: "list", targetId: l.id, body: pick(["Great list.", "Missing a few but this is strong.", "Following this one.", "Saved half of these to listen later.", "#1 is correct."]), createdAt: randDate().toISOString() });
    }
  }

  // ── Notifications for everyone (derived) ────────────────────
  for (const f of db.follows) db.notifications.push({ id: id("no"), userId: f.followingId, actorId: f.followerId, type: "follow", createdAt: f.createdAt, readAt: f.createdAt < "2026-09-20" ? f.createdAt : undefined });
  for (const rl of db.reviewLikes) {
    const e = db.entries.find((x) => x.id === rl.entryId)!;
    db.notifications.push({ id: id("no"), userId: e.userId, actorId: rl.userId, type: "review_like", targetId: e.id, createdAt: rl.createdAt, readAt: rl.createdAt < "2026-09-25" ? rl.createdAt : undefined });
  }
  for (const c of db.comments.filter((c) => c.targetType === "entry")) {
    const e = db.entries.find((x) => x.id === c.targetId)!;
    if (c.userId !== e.userId) db.notifications.push({ id: id("no"), userId: e.userId, actorId: c.userId, type: "review_comment", targetId: e.id, createdAt: c.createdAt, readAt: c.createdAt < "2026-09-25" ? c.createdAt : undefined });
  }

  void albumById;
  recomputeAllStats(db);
  return db;
}
