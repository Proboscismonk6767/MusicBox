import "server-only";
import { idx } from "./indexes";

// "Download my data": everything a user has put into MusicBox, as one portable
// JSON file. Built from an explicit allow-list so that a field added to User
// later (a secret, an internal flag) can never leak into an export by accident.
// Other people appear only by username, and only where the user's own data
// refers to them (who they follow, who follows them, who they blocked).

export const EXPORT_VERSION = 1;

export function exportUserData(userId: string) {
  const i = idx();
  const u = i.user.get(userId);
  if (!u) return null;
  const db = i.db;

  const song = (id: string) => {
    const s = i.song.get(id);
    if (!s) return { id };
    return { id, title: s.title, artists: s.artistIds.map((a) => i.artist.get(a)?.name).filter(Boolean), album: i.album.get(s.albumId)?.title, isrc: s.isrc };
  };
  const name = (id: string) => i.user.get(id)?.username;
  const mine = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId === userId);

  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    note: "Everything MusicBox holds about this account, except your sign-in credentials.",
    profile: {
      username: u.username, displayName: u.displayName, bio: u.bio, location: u.location, website: u.website,
      createdAt: u.createdAt, profileVisibility: u.profileVisibility, avatarHue: u.avatarHue,
      favouriteSongs: u.favoriteSongIds.map(song), favouriteArtists: u.favoriteArtistIds.map((a) => i.artist.get(a)?.name).filter(Boolean),
      pinnedLyric: u.profileLyric ? { text: u.profileLyric.text, song: song(u.profileLyric.songId) } : undefined,
    },
    diary: db.entries.filter((e) => e.userId === userId && !e.removed).map((e) => ({
      id: e.id, song: song(e.songId), listenedAt: e.listenedAt, rating: e.rating, liked: e.liked, review: e.review, hasSpoiler: e.hasSpoiler,
      relisten: e.isRelisten, tags: e.tags, context: e.context, memory: e.memory, createdAt: e.createdAt, updatedAt: e.updatedAt,
    })),
    ratings: mine(db.ratings).map((r) => ({ song: song(r.songId), rating: r.rating, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    likedSongs: mine(db.likes).map((l) => ({ song: song(l.songId), createdAt: l.createdAt })),
    listenLater: mine(db.listenLater).map((l) => ({ song: song(l.songId), createdAt: l.createdAt })),
    lists: db.lists.filter((l) => l.userId === userId && !l.removed).map((l) => ({
      id: l.id, title: l.title, description: l.description, ranked: l.isRanked, visibility: l.visibility, createdAt: l.createdAt, updatedAt: l.updatedAt,
      items: l.items.map((it) => ({ song: song(it.songId), note: it.note })),
    })),
    comments: db.comments.filter((c) => c.userId === userId && !c.removed).map((c) => ({ id: c.id, on: `${c.targetType}:${c.targetId}`, replyTo: c.parentId, body: c.body, createdAt: c.createdAt })),
    following: db.follows.filter((f) => f.followerId === userId).map((f) => ({ username: name(f.followingId), since: f.createdAt })),
    followers: db.follows.filter((f) => f.followingId === userId).map((f) => ({ username: name(f.followerId), since: f.createdAt })),
    followedArtists: mine(db.artistFollows).map((f) => ({ artist: i.artist.get(f.artistId)?.name, since: f.createdAt })),
    blockedAndMuted: db.blocks.filter((b) => b.userId === userId).map((b) => ({ username: name(b.targetId), kind: b.kind })),
  };
}
