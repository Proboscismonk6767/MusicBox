// View models passed from server to client components. Client-safe.

export interface UserMini {
  id: string;
  username: string;
  displayName: string;
  avatarHue: number;
  avatarUrl?: string;
}

export interface Cover {
  title: string;
  artworkUrl?: string;
  palette: [string, string, string];
  pattern: number;
}

export interface SongCard {
  id: string;
  slug: string;
  title: string;
  artists: { name: string; slug: string }[];
  featured: string[];
  album: { title: string; slug: string };
  cover: Cover;
  year: number;
  releaseDate: string;
  durationMs: number;
  explicit: boolean;
  avg: number;
  ratingCount: number;
  trackNumber: number;
}

export interface ViewerSongState {
  rating?: number;
  liked: boolean;
  listenLater: boolean;
  logCount: number;
}

export interface ReviewView {
  id: string;
  user: UserMini;
  song: SongCard;
  rating?: number;
  liked: boolean;
  review?: string;
  hasSpoiler?: boolean;
  listenedAt: string;
  isRelisten: boolean;
  tags: string[];
  likeCount: number;
  commentCount: number;
  viewerLiked: boolean;
  createdAt: string;
  followedByViewer?: boolean;
}

export interface CommentView {
  id: string;
  user: UserMini;
  body: string;
  createdAt: string;
  likeCount: number;
  viewerLiked: boolean;
  replies: CommentView[];
  canDelete: boolean;
}

export interface ListCard {
  id: string;
  title: string;
  description: string;
  owner: UserMini;
  count: number;
  likeCount: number;
  commentCount: number;
  covers: Cover[];
  isRanked: boolean;
  visibility: "public" | "unlisted" | "private";
  updatedAt: string;
}

export type FeedItem =
  | { kind: "entry"; id: string; at: string; actor: UserMini; review: ReviewView }
  | { kind: "like"; id: string; at: string; actor: UserMini; song: SongCard }
  | { kind: "list"; id: string; at: string; actor: UserMini; list: ListCard; verb: "created" | "updated"; count?: number }
  | { kind: "follow"; id: string; at: string; actor: UserMini; target: UserMini };

export interface Recommendation {
  song: SongCard;
  reason: string;
  score: number;
}
