import "server-only";

// Shared by every catalogue provider: the provider contract, its error type and
// the sanitisers that treat provider data as untrusted input.

export interface ExternalTrack {
  externalId: string;
  title: string;
  artist: { externalId: string; name: string };
  /** Other credited artists, shown as "featured" on the song. */
  featured?: string[];
  album: { externalId: string; title: string; artworkUrl?: string; releaseDate: string; trackCount?: number };
  durationMs: number;
  trackNumber: number;
  explicit: boolean;
  genre?: string;
  previewUrl?: string;
  url?: string;
}

export interface ExternalArtist { externalId: string; name: string; genre?: string }
export interface ExternalAlbum { externalId: string; title: string; artist: string; artworkUrl?: string; releaseDate: string; trackCount?: number; kind?: "album" | "ep" | "single" }

export interface MetadataProvider {
  name: string;
  searchTracks(q: string, limit?: number): Promise<ExternalTrack[]>;
  getTrack(externalId: string): Promise<ExternalTrack | null>;
  getAlbumTracks(albumExternalId: string): Promise<ExternalTrack[]>;
  searchArtists(q: string, limit?: number): Promise<ExternalArtist[]>;
  searchAlbums(q: string, limit?: number): Promise<ExternalAlbum[]>;
  getArtistAlbums(artistExternalId: string): Promise<ExternalAlbum[]>;
}

/** Safe to show to users: never includes upstream response bodies. */
export class MetadataError extends Error {}

// Provider data is untrusted input: strings are length-capped and control
// characters stripped; numbers are clamped; URLs are host-allowlisted by callers.
export const str = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "");
export const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), max) : 0);

/** Accepts YYYY, YYYY-MM or YYYY-MM-DD and returns YYYY-MM-DD (missing parts become 01). */
export const date = (v: unknown) => {
  if (typeof v !== "string") return "1970-01-01";
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(v);
  return m ? `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}` : "1970-01-01";
};

export const titleCase = (s: string) => s.replace(/(^|[\s\-/])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
