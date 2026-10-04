import "server-only";
import { z } from "zod";

// Every server action argument is untrusted: TypeScript types vanish at the
// network boundary. These schemas are the trust boundary.

export const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");
/** Catalogue ids are `<provider>:<id>`: iTunes numeric ids or MusicBrainz UUIDs. Nothing else is ever fetched. */
export const EXTERNAL_ID = /^(itunes:\d{1,15}|mb:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const externalId = z.string().regex(EXTERNAL_ID, "Invalid catalogue id");
export const rating = z.number().min(0.5).max(5).refine((r) => Number.isInteger(r * 2), "Ratings go from ½ to 5 stars in half steps.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date");
const tag = z.string().max(24);
const text = (max: number) => z.string().max(max, `That's too long (max ${max.toLocaleString()} characters).`);

export const logInput = z
  .object({
    listenedAt: isoDate.optional(),
    rating: rating.nullable().optional(),
    liked: z.boolean().optional(),
    review: text(5000).optional(),
    hasSpoiler: z.boolean().optional(),
    tags: z.array(tag).max(8, "Up to 8 tags.").optional(),
    isRelisten: z.boolean().optional(),
    context: z.enum(["headphones", "car", "concert", "party", "vinyl", "radio", "other", ""]).optional(),
    memory: text(500).optional(),
  })
  .strict();

export const logSongInput = logInput.extend({ songId: id }).strict();

export const listInput = z
  .object({
    title: text(120),
    description: text(2000).optional(),
    isRanked: z.boolean().optional(),
    visibility: z.enum(["public", "unlisted", "private"]).optional(),
    items: z.array(z.object({ songId: id, note: text(500).optional() }).strict()).max(500, "Lists can hold up to 500 songs.").optional(),
  })
  .strict();

export const profileLyric = z
  .object({
    songId: id,
    startMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
    text: z.string().max(300, "Keep it short: a line or two (max 300 characters).").refine((t) => t.trim().length > 0, "Type the lyric you want to pin."),
  })
  .strict();

export const commentTarget = z.enum(["entry", "list"]);
export const reportTarget = z.enum(["entry", "comment", "list", "user"]);
export const commentBody = text(2000);
export const reportReason = text(500);
export const blockKind = z.enum(["block", "mute"]);
export const moderationAction = z.enum(["remove", "dismiss", "suspend"]);
export const idList = (max: number) => z.array(id).max(max);

export const username = z.string().regex(/^[a-z0-9_]{3,24}$/, "Usernames are 3–24 characters: letters, numbers and underscores.");
export const password = z.string().min(8, "Use at least 8 characters for your password.").max(256, "That password is too long.");

export const settingsInput = z
  .object({
    displayName: text(40),
    bio: text(300),
    location: text(60),
    website: z.union([z.literal(""), z.string().max(200).url().refine((u) => /^https?:\/\//i.test(u), "Website links should start with https://")]),
    profileVisibility: z.enum(["public", "followers", "private"]),
    avatarHue: z.coerce.number().int().min(0).max(359),
    currentPassword: z.string().max(256),
    newPassword: z.union([z.literal(""), password]),
  })
  .strict();

/** Parse or throw a user-facing message (first issue only). */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? "Invalid input.");
  return r.data;
}

export class ValidationError extends Error {}
