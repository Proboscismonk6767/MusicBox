// Core domain model. Mirrors the relational schema in /db/schema.sql so the
// JSON-backed store can be swapped for Postgres without touching the UI.

export type ID = string;
export type Visibility = "public" | "unlisted" | "private";
export type ProfileVisibility = "public" | "followers" | "private";

export interface User {
  id: ID;
  username: string;
  displayName: string;
  bio: string;
  location?: string;
  website?: string;
  avatarHue: number;
  avatarUrl?: string;
  passwordHash: string;
  createdAt: string;
  favoriteSongIds: ID[]; // pinned, 4–8
  favoriteArtistIds: ID[];
  profileLyric?: { songId: ID; text: string; startMs?: number; updatedAt: string }; // one user-typed lyric pinned to the profile header
  profileVisibility: ProfileVisibility;
  role: "user" | "admin";
  suspended?: boolean;
  onboarded: boolean;
}

export type PublicUser = Omit<User, "passwordHash">;

export interface Artist {
  id: ID;
  externalId?: string;
  slug: string;
  name: string;
  imageUrl?: string;
  genres: string[];
  hue: number;
  bio?: string;
}

export interface Album {
  id: ID;
  externalId?: string;
  slug: string;
  title: string;
  artistId: ID;
  releaseDate: string; // YYYY-MM-DD
  genres: string[];
  label?: string;
  artworkUrl?: string;
  palette: [string, string, string];
  pattern: number;
  producers: string[];
}

export interface Song {
  id: ID;
  externalId?: string;
  slug: string;
  title: string;
  albumId: ID;
  artistIds: ID[]; // primary artists
  featured: string[]; // featured artist names
  durationMs: number;
  trackNumber: number;
  releaseDate: string;
  isrc?: string;
  explicit: boolean;
  writers: string[];
  producers: string[];
  genres: string[];
  popularity: number; // 0–100, external
  previewUrl?: string;
  links: { spotify?: string; apple?: string; youtube?: string };
}

export interface Rating {
  userId: ID;
  songId: ID;
  rating: number; // 0.5–5 in 0.5 steps
  createdAt: string;
  updatedAt: string;
}

export interface SongLike {
  userId: ID;
  songId: ID;
  createdAt: string;
}

export type ListeningContext = "headphones" | "car" | "concert" | "party" | "vinyl" | "radio" | "other";

export interface DiaryEntry {
  id: ID;
  userId: ID;
  songId: ID;
  rating?: number; // rating_at_time
  liked: boolean;
  review?: string;
  hasSpoiler?: boolean;
  listenedAt: string; // YYYY-MM-DD
  isRelisten: boolean;
  tags: string[];
  context?: ListeningContext;
  memory?: string;
  createdAt: string;
  updatedAt: string;
  removed?: boolean;
}

export interface ListItem {
  songId: ID;
  note?: string;
}

export interface SongList {
  id: ID;
  userId: ID;
  title: string;
  description: string;
  isRanked: boolean;
  visibility: Visibility;
  items: ListItem[]; // order == position
  createdAt: string;
  updatedAt: string;
  clonedFromId?: ID;
  removed?: boolean;
}

export type CommentTarget = "entry" | "list";

export interface Comment {
  id: ID;
  userId: ID;
  targetType: CommentTarget;
  targetId: ID;
  parentId?: ID;
  body: string;
  createdAt: string;
  removed?: boolean;
}

export interface Follow {
  followerId: ID;
  followingId: ID;
  createdAt: string;
}

export type NotificationType =
  | "follow"
  | "review_like"
  | "review_comment"
  | "list_like"
  | "list_comment"
  | "comment_reply"
  | "friend_reviewed";

export interface Notification {
  id: ID;
  userId: ID;
  actorId: ID;
  type: NotificationType;
  targetId?: ID;
  readAt?: string;
  createdAt: string;
}

export type ActivityType =
  | "song_logged"
  | "song_reviewed"
  | "song_liked"
  | "song_rated"
  | "list_created"
  | "list_updated"
  | "user_followed";

export interface ActivityEvent {
  id: ID;
  actorId: ID;
  type: ActivityType;
  songId?: ID;
  listId?: ID;
  entryId?: ID;
  targetUserId?: ID;
  count?: number;
  createdAt: string;
}

export interface Report {
  id: ID;
  reporterId: ID;
  targetType: "entry" | "comment" | "list" | "user";
  targetId: ID;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
}

export interface SongStats {
  ratingCount: number;
  ratingSum: number;
  histogram: number[]; // 10 buckets, 0.5 → 5
  logCount: number;
  reviewCount: number;
  likeCount: number;
}

export interface Session {
  tokenHash: string; // sha256 of the cookie token; the raw token is never stored
  createdAt: string;
  userId: ID;
  expiresAt: string;
}

export interface DB {
  version: number;
  users: User[];
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  ratings: Rating[];
  likes: SongLike[];
  entries: DiaryEntry[];
  reviewLikes: { userId: ID; entryId: ID; createdAt: string }[];
  follows: Follow[];
  artistFollows: { userId: ID; artistId: ID; createdAt: string }[];
  lists: SongList[];
  listLikes: { userId: ID; listId: ID; createdAt: string }[];
  comments: Comment[];
  commentLikes: { userId: ID; commentId: ID }[];
  listenLater: { userId: ID; songId: ID; createdAt: string }[];
  notifications: Notification[];
  activity: ActivityEvent[];
  reports: Report[];
  blocks: { userId: ID; targetId: ID; kind: "block" | "mute" }[];
  sessions: Session[];
  songStats: Record<ID, SongStats>; // aggregation table (see §36)
}
