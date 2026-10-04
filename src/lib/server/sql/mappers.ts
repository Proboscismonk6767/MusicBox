import type { Album, Artist, Comment, DiaryEntry, ListeningContext, Notification, NotificationType, Song, SongList, SongStats, User } from "../../types";
import type { Row } from "./driver";

// Rows → the objects the rest of the app already uses. Null columns become
// "absent" (undefined), the way the JSON store represents optional fields.

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);
const s = (r: Row, k: string) => r[k] as string;
const n = (r: Row, k: string) => r[k] as number;
const b = (r: Row, k: string) => r[k] as boolean;
const a = (r: Row, k: string) => (r[k] as string[] | null) ?? [];

export function toArtist(r: Row): Artist {
  return { id: s(r, "id"), externalId: opt(r.external_id as string | null), slug: s(r, "slug"), name: s(r, "name"), imageUrl: opt(r.image_url as string | null), genres: a(r, "genres"), hue: n(r, "hue"), bio: opt(r.bio as string | null) };
}

export function toAlbum(r: Row): Album {
  return {
    id: s(r, "id"), externalId: opt(r.external_id as string | null), slug: s(r, "slug"), title: s(r, "title"), artistId: s(r, "artist_id"),
    releaseDate: s(r, "release_date"), genres: a(r, "genres"), label: opt(r.label as string | null), artworkUrl: opt(r.artwork_url as string | null),
    palette: a(r, "palette") as [string, string, string], pattern: n(r, "pattern"), producers: a(r, "producers"),
  };
}

/** `artist_ids` must be selected as an ordered array (see SONG_COLS). */
export function toSong(r: Row): Song {
  return {
    id: s(r, "id"), externalId: opt(r.external_id as string | null), slug: s(r, "slug"), title: s(r, "title"), albumId: s(r, "album_id"),
    artistIds: a(r, "artist_ids"), featured: a(r, "featured"), durationMs: n(r, "duration_ms"), trackNumber: (r.track_number as number | null) ?? 0,
    releaseDate: s(r, "release_date"), isrc: opt(r.isrc as string | null), explicit: b(r, "explicit"), writers: a(r, "writers"), producers: a(r, "producers"),
    genres: a(r, "genres"), popularity: (r.popularity as number | null) ?? 0, previewUrl: opt(r.preview_url as string | null),
    links: (r.links as Song["links"] | null) ?? {},
  };
}

/** Select list that makes a songs row mappable by toSong. Use with `from songs s`. */
export const SONG_COLS = `s.id, s.external_id, s.slug, s.title, s.album_id, s.featured, s.duration_ms, s.track_number, s.release_date, s.isrc, s.explicit,
  s.writers, s.producers, s.genres, s.popularity, s.preview_url, s.links,
  array(select sa.artist_id from song_artists sa where sa.song_id = s.id order by sa.position) as artist_ids`;

export function toUser(r: Row): User {
  return {
    id: s(r, "id"), username: s(r, "username"), displayName: s(r, "display_name"), bio: s(r, "bio"), location: opt(r.location as string | null), website: opt(r.website as string | null),
    avatarHue: n(r, "avatar_hue"), avatarUrl: opt(r.avatar_url as string | null), passwordHash: s(r, "password_hash"), createdAt: s(r, "created_at"),
    favoriteSongIds: a(r, "favorite_song_ids"), favoriteArtistIds: a(r, "favorite_artist_ids"),
    profileLyric: r.profile_lyric_song_id
      ? { songId: s(r, "profile_lyric_song_id"), text: s(r, "profile_lyric_text"), ...(r.profile_lyric_start_ms != null ? { startMs: n(r, "profile_lyric_start_ms") } : {}), updatedAt: s(r, "profile_lyric_updated_at") }
      : undefined,
    profileVisibility: s(r, "profile_visibility") as User["profileVisibility"], role: s(r, "role") as User["role"],
    suspended: b(r, "suspended") || undefined, onboarded: b(r, "onboarded"),
  };
}

export function toEntry(r: Row): DiaryEntry {
  return {
    id: s(r, "id"), userId: s(r, "user_id"), songId: s(r, "song_id"), rating: opt(r.rating_at_time as number | null), liked: b(r, "liked"),
    review: opt(r.review_text as string | null), hasSpoiler: b(r, "has_spoiler") || undefined, listenedAt: s(r, "listened_at"), isRelisten: b(r, "is_relisten"),
    tags: a(r, "tags"), context: opt(r.context as ListeningContext | null), memory: opt(r.memory as string | null),
    createdAt: s(r, "created_at"), updatedAt: s(r, "updated_at"), removed: b(r, "removed") || undefined,
  };
}

/** `items` is attached by the caller (list_items ordered by position). */
export function toList(r: Row, items: SongList["items"]): SongList {
  return {
    id: s(r, "id"), userId: s(r, "user_id"), title: s(r, "title"), description: s(r, "description"), isRanked: b(r, "is_ranked"),
    visibility: s(r, "visibility") as SongList["visibility"], items, createdAt: s(r, "created_at"), updatedAt: s(r, "updated_at"),
    clonedFromId: opt(r.cloned_from_id as string | null), removed: b(r, "removed") || undefined,
  };
}

export function toComment(r: Row): Comment {
  return {
    id: s(r, "id"), userId: s(r, "user_id"), targetType: s(r, "target_type") as Comment["targetType"], targetId: s(r, "target_id"),
    parentId: opt(r.parent_id as string | null), body: s(r, "body"), createdAt: s(r, "created_at"), removed: b(r, "removed") || undefined,
  };
}

export function toNotification(r: Row): Notification {
  return {
    id: s(r, "id"), userId: s(r, "user_id"), actorId: s(r, "actor_id"), type: s(r, "type") as NotificationType,
    targetId: opt(r.target_id as string | null), readAt: opt(r.read_at as string | null), createdAt: s(r, "created_at"),
  };
}

export function toStats(r: Row | undefined): SongStats | undefined {
  if (!r) return undefined;
  return { ratingCount: n(r, "rating_count"), ratingSum: n(r, "rating_sum"), histogram: r.histogram as number[], logCount: n(r, "log_count"), reviewCount: n(r, "review_count"), likeCount: n(r, "like_count") };
}
