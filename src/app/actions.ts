"use server";

// All mutations. Security model:
//  • Identity comes only from the server session (requireUser) — never from arguments.
//  • Every argument is validated with zod (lib/server/validation.ts) before use.
//  • Ownership / visibility / block checks run against server state for every target id.
//  • Rate limits per user+action, and per IP for unauthenticated auth endpoints.
//  • Next.js Server Actions only accept same-origin POSTs (Origin/Host check) — CSRF.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mutate, getDB } from "@/lib/server/store";
import { AuthError, endSession, getSessionUser, requireUser, revokeOtherSessions, startSession } from "@/lib/server/auth";
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from "@/lib/server/password";
import { rateLimit } from "@/lib/server/ratelimit";
import { recomputeAllStats, recomputeSongStats } from "@/lib/server/stats";
import { importTrack, MetadataError } from "@/lib/server/metadata";
import { forgetUser } from "@/lib/server/import-queue";
import { track } from "@/lib/server/metrics";
import { reportError } from "@/lib/server/monitoring";
import { clientIp, isAdmin, safeRedirectPath, securityLog } from "@/lib/server/security";
import * as v from "@/lib/server/validation";
import { newId, todayISO } from "@/lib/util";
import type { DB, DiaryEntry, NotificationType, User } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const RESERVED = new Set(["discover", "search", "song", "artist", "album", "list", "lists", "listen-later", "settings", "login", "signup", "logout", "onboarding", "notifications", "genre", "review", "admin", "api", "about", "stats", "home", "feed", "_next", "year", "open", "musicbox", "support", "help", "security", "root", "moderator", "terms", "privacy", "copyright", "legal", "import"]);
const now = () => new Date().toISOString();
const SLOW_DOWN = "You're doing that a lot. Take a breath and try again in a moment.";

class UserError extends Error {}
class Forbidden extends UserError {}

async function run<T>(key: string, fn: (user: User) => T | Promise<T>, limit = 60): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!rateLimit(`${user.id}:${key}`, limit, limit / 60)) {
      securityLog("ratelimit.exceeded", { action: key, user: user.id });
      return { ok: false, error: SLOW_DOWN };
    }
    const data = await fn(user);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof Forbidden) securityLog("authz.denied", { action: key, reason: e.message });
    if (e instanceof AuthError || e instanceof UserError || e instanceof MetadataError || e instanceof v.ValidationError) return { ok: false, error: e.message };
    reportError(e, { kind: "action", route: `action:${key}` });
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}

// ── Server-side access helpers ──────────────────────────────────────────

function blocked(db: DB, a: string, b: string) {
  return db.blocks.some((x) => x.kind === "block" && ((x.userId === a && x.targetId === b) || (x.userId === b && x.targetId === a)));
}

/** Can `viewerId` see content owned by `ownerId`? (privacy + blocks + suspension) */
function canSeeOwner(db: DB, viewerId: string, ownerId: string) {
  if (viewerId === ownerId) return true;
  const owner = db.users.find((u) => u.id === ownerId);
  if (!owner || owner.suspended || blocked(db, viewerId, ownerId)) return false;
  if (owner.profileVisibility === "private") return false;
  if (owner.profileVisibility === "followers") return db.follows.some((f) => f.followerId === viewerId && f.followingId === ownerId);
  return true;
}

function visibleEntry(db: DB, viewerId: string, entryId: string): DiaryEntry {
  const e = db.entries.find((x) => x.id === entryId && !x.removed);
  if (!e || !canSeeOwner(db, viewerId, e.userId)) throw new UserError("That review is no longer available.");
  return e;
}

function visibleList(db: DB, viewerId: string, listId: string) {
  const l = db.lists.find((x) => x.id === listId && !x.removed);
  if (!l || (l.visibility === "private" && l.userId !== viewerId) || !canSeeOwner(db, viewerId, l.userId)) throw new UserError("That list is unavailable.");
  return l;
}

function ownedEntry(db: DB, user: User, entryId: string, allowAdmin = false) {
  const e = db.entries.find((x) => x.id === entryId);
  if (!e) throw new UserError("That entry no longer exists.");
  if (e.userId !== user.id && !(allowAdmin && isAdmin(user))) throw new Forbidden("You can only change your own entries.");
  return e;
}

function ownedList(db: DB, user: User, listId: string, allowAdmin = false) {
  const l = db.lists.find((x) => x.id === listId);
  if (!l) throw new UserError("That list no longer exists.");
  if (l.userId !== user.id && !(allowAdmin && isAdmin(user))) throw new Forbidden("You can only change your own lists.");
  return l;
}

function notify(db: DB, userId: string, actorId: string, type: NotificationType, targetId?: string) {
  if (userId === actorId || blocked(db, userId, actorId)) return;
  if (db.blocks.some((b) => b.userId === userId && b.targetId === actorId)) return; // muted
  db.notifications.push({ id: newId("no"), userId, actorId, type, targetId, createdAt: now() });
}

function songExists(db: DB, songId: string) {
  if (!db.songs.some((s) => s.id === songId)) throw new UserError("That song is unavailable.");
}

const clean = (s: string | undefined) => (s ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
const formStr = (form: FormData, key: string) => {
  const val = form.get(key);
  return typeof val === "string" ? val : "";
};

// ── Auth ────────────────────────────────────────────────────────────────

export async function signup(_: unknown, form: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  if (!rateLimit(`signup:ip:${ip}`, 5, 5 / 3600)) {
    securityLog("ratelimit.exceeded", { action: "signup", ip });
    return { ok: false, error: "Too many sign-ups from your network. Please try again later." };
  }
  let username: string, password: string;
  try {
    username = v.parse(v.username, formStr(form, "username").trim().toLowerCase());
    password = v.parse(v.password, formStr(form, "password"));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const displayName = clean(formStr(form, "displayName")).slice(0, 40) || username;
  if (RESERVED.has(username)) return { ok: false, error: "That username is reserved. Try another." };
  if (getDB().users.some((u) => u.username.toLowerCase() === username)) return { ok: false, error: "That username is taken." };
  const user: User = {
    id: newId("us"), username, displayName, bio: "", avatarHue: Math.floor(Math.random() * 360), passwordHash: hashPassword(password),
    createdAt: now(), favoriteSongIds: [], favoriteArtistIds: [], profileVisibility: "public", role: "user", onboarded: false,
  };
  mutate((db) => {
    if (db.users.some((u) => u.username.toLowerCase() === username)) throw new UserError("That username is taken.");
    db.users.push(user);
  });
  securityLog("auth.signup", { user: user.id, ip });
  track("signup");
  await startSession(user.id);
  redirect("/onboarding");
}

export async function login(_: unknown, form: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  const username = formStr(form, "username").trim().toLowerCase().replace(/^@/, "").slice(0, 40);
  const password = formStr(form, "password").slice(0, 257);
  // Per IP (brute force) and per IP+account (targeted). Not per-account alone,
  // so an attacker can't lock a real user out from elsewhere.
  if (!rateLimit(`login:ip:${ip}`, 20, 20 / 300) || !rateLimit(`login:acct:${ip}:${username}`, 6, 6 / 300)) {
    securityLog("ratelimit.exceeded", { action: "login", ip });
    return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  }
  const user = getDB().users.find((u) => u.username.toLowerCase() === username);
  if (!user) dummyVerify(password);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    securityLog("auth.login_failed", { ip, reason: user ? "bad_password" : "unknown_user" });
    return { ok: false, error: "That username and password don't match." };
  }
  if (user.suspended) return { ok: false, error: "This account has been suspended." };
  if (needsRehash(user.passwordHash)) mutate(() => void (user.passwordHash = hashPassword(password)));
  await startSession(user.id);
  securityLog("auth.login", { user: user.id, ip });
  track("login");
  redirect(safeRedirectPath(formStr(form, "next")));
}

export async function logout() {
  const user = await getSessionUser();
  await endSession();
  if (user) securityLog("auth.logout", { user: user.id });
  redirect("/");
}

// ── Taste ───────────────────────────────────────────────────────────────

export async function rateSong(songId: string, rating: number | null) {
  return run("rate", (user) => {
    const sid = v.parse(v.id, songId);
    const r = v.parse(v.rating.nullable(), rating);
    return mutate((db) => {
      songExists(db, sid);
      const existing = db.ratings.find((x) => x.userId === user.id && x.songId === sid);
      if (r == null) db.ratings = db.ratings.filter((x) => x !== existing);
      else if (existing) Object.assign(existing, { rating: r, updatedAt: now() });
      else db.ratings.push({ userId: user.id, songId: sid, rating: r, createdAt: now(), updatedAt: now() });
      recomputeSongStats(db, sid);
    });
  }, 120);
}

function setLike(db: DB, userId: string, songId: string, liked: boolean) {
  const has = db.likes.some((l) => l.userId === userId && l.songId === songId);
  if (liked && !has) {
    db.likes.push({ userId, songId, createdAt: now() });
    db.activity.push({ id: newId("ac"), actorId: userId, type: "song_liked", songId, createdAt: now() });
  } else if (!liked && has) {
    db.likes = db.likes.filter((l) => !(l.userId === userId && l.songId === songId));
    db.activity = db.activity.filter((a) => !(a.actorId === userId && a.type === "song_liked" && a.songId === songId));
  }
}

export async function toggleLike(songId: string) {
  return run("like", (user) => {
    const sid = v.parse(v.id, songId);
    return mutate((db) => {
      songExists(db, sid);
      const liked = !db.likes.some((l) => l.userId === user.id && l.songId === sid);
      setLike(db, user.id, sid, liked);
      recomputeSongStats(db, sid);
      return liked;
    });
  }, 120);
}

export async function toggleListenLater(songId: string) {
  return run("ll", (user) => {
    const sid = v.parse(v.id, songId);
    return mutate((db) => {
      songExists(db, sid);
      const has = db.listenLater.some((l) => l.userId === user.id && l.songId === sid);
      if (has) db.listenLater = db.listenLater.filter((l) => !(l.userId === user.id && l.songId === sid));
      else {
        if (db.listenLater.filter((l) => l.userId === user.id).length >= 5000) throw new UserError("Your Listen Later is full (5,000 songs).");
        db.listenLater.push({ userId: user.id, songId: sid, createdAt: now() });
      }
      return !has;
    });
  }, 120);
}

export type LogInput = import("zod").infer<typeof v.logInput>;

function normalizeLog(input: LogInput) {
  const listenedAt = input.listenedAt ?? todayISO();
  if (listenedAt > todayISO()) throw new UserError("You can't log a listen in the future.");
  if (listenedAt < "1900-01-01") throw new UserError("That date is too far in the past.");
  const tags = [...new Set((input.tags ?? []).map((t) => t.toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 24)).filter(Boolean))].slice(0, 8);
  return { listenedAt, tags, review: clean(input.review) || undefined, memory: clean(input.memory) || undefined, context: input.context || undefined };
}

export async function logSong(input: LogInput & { songId: string }) {
  return run("log", (user) => {
    const p = v.parse(v.logSongInput, input);
    const n = normalizeLog(p);
    return mutate((db) => {
      songExists(db, p.songId);
      const firstEver = !db.entries.some((e) => e.userId === user.id);
      const t = now();
      const entry: DiaryEntry = {
        id: newId("en"), userId: user.id, songId: p.songId, rating: p.rating ?? undefined, liked: !!p.liked, review: n.review,
        hasSpoiler: !!p.hasSpoiler, listenedAt: n.listenedAt, isRelisten: !!p.isRelisten, tags: n.tags,
        context: n.context, memory: n.memory, createdAt: t, updatedAt: t,
      };
      db.entries.push(entry);
      db.activity.push({ id: newId("ac"), actorId: user.id, type: entry.review ? "song_reviewed" : "song_logged", songId: p.songId, entryId: entry.id, createdAt: t });
      if (p.rating != null) {
        const r = db.ratings.find((x) => x.userId === user.id && x.songId === p.songId);
        if (r) Object.assign(r, { rating: p.rating, updatedAt: t });
        else db.ratings.push({ userId: user.id, songId: p.songId, rating: p.rating, createdAt: t, updatedAt: t });
      }
      if (p.liked != null) setLike(db, user.id, p.songId, p.liked);
      db.activity = db.activity.filter((a) => !(a.actorId === user.id && a.type === "song_liked" && a.songId === p.songId && a.createdAt === t));
      db.listenLater = db.listenLater.filter((l) => !(l.userId === user.id && l.songId === p.songId));
      if (entry.review) {
        const followers = new Set(db.follows.filter((f) => f.followingId === user.id).map((f) => f.followerId));
        for (const r of db.ratings) if (r.songId === p.songId && followers.has(r.userId)) notify(db, r.userId, user.id, "friend_reviewed", entry.id);
      }
      recomputeSongStats(db, p.songId);
      track("log");
      if (firstEver) track("first_log");
      return entry.id;
    });
  }, 60);
}

export async function updateEntry(id: string, input: LogInput) {
  return run("log", (user) => {
    const eid = v.parse(v.id, id);
    const p = v.parse(v.logInput, input);
    const n = normalizeLog(p);
    return mutate((db) => {
      const e = ownedEntry(db, user, eid);
      if (e.removed) throw new UserError("That entry was removed by a moderator.");
      // Explicit allow-list of editable fields (no mass assignment).
      Object.assign(e, { listenedAt: n.listenedAt, rating: p.rating ?? undefined, liked: !!p.liked, review: n.review, hasSpoiler: !!p.hasSpoiler, tags: n.tags, isRelisten: !!p.isRelisten, context: n.context, memory: n.memory, updatedAt: now() });
      const act = db.activity.find((a) => a.entryId === e.id);
      if (act) act.type = e.review ? "song_reviewed" : "song_logged";
      recomputeSongStats(db, e.songId);
    });
  });
}

export async function deleteEntry(id: string) {
  return run("log", (user) => {
    const eid = v.parse(v.id, id);
    return mutate((db) => {
      const e = ownedEntry(db, user, eid, true);
      if (e.userId !== user.id) securityLog("admin.action", { admin: user.id, action: "delete_entry", target: eid });
      db.entries = db.entries.filter((x) => x.id !== eid);
      db.activity = db.activity.filter((a) => a.entryId !== eid);
      db.reviewLikes = db.reviewLikes.filter((l) => l.entryId !== eid);
      db.comments = db.comments.filter((c) => !(c.targetType === "entry" && c.targetId === eid));
      recomputeSongStats(db, e.songId);
    });
  });
}

// ── Social ──────────────────────────────────────────────────────────────

export async function toggleReviewLike(entryId: string) {
  return run("rlike", (user) => {
    const eid = v.parse(v.id, entryId);
    return mutate((db) => {
      const e = visibleEntry(db, user.id, eid);
      const has = db.reviewLikes.some((l) => l.userId === user.id && l.entryId === eid);
      if (has) db.reviewLikes = db.reviewLikes.filter((l) => !(l.userId === user.id && l.entryId === eid));
      else {
        db.reviewLikes.push({ userId: user.id, entryId: eid, createdAt: now() });
        notify(db, e.userId, user.id, "review_like", eid);
      }
      return !has;
    });
  }, 120);
}

export async function addComment(targetType: "entry" | "list", targetId: string, body: string, parentId?: string) {
  return run("comment", (user) => {
    const type = v.parse(v.commentTarget, targetType);
    const tid = v.parse(v.id, targetId);
    const text = clean(v.parse(v.commentBody, body));
    const pid = parentId === undefined ? undefined : v.parse(v.id, parentId);
    if (!text) throw new UserError("Write something first.");
    return mutate((db) => {
      const owner = type === "entry" ? visibleEntry(db, user.id, tid).userId : visibleList(db, user.id, tid).userId;
      if (blocked(db, owner, user.id)) throw new Forbidden("You can't comment here.");
      // Anti-spam: identical comment twice in a row on the same target.
      const last = db.comments.filter((c) => c.userId === user.id && c.targetId === tid).at(-1);
      if (last && last.body === text && Date.now() - Date.parse(last.createdAt) < 600_000) throw new UserError("You just posted that.");
      let parent = pid ? db.comments.find((c) => c.id === pid && c.targetId === tid && c.targetType === type && !c.removed) : undefined;
      if (pid && !parent) throw new UserError("That comment is no longer available.");
      if (parent?.parentId) parent = db.comments.find((c) => c.id === parent!.parentId); // one reply depth max
      const c = { id: newId("co"), userId: user.id, targetType: type, targetId: tid, parentId: parent?.id, body: text, createdAt: now() };
      db.comments.push(c);
      notify(db, owner, user.id, type === "entry" ? "review_comment" : "list_comment", tid);
      if (parent && parent.userId !== owner) notify(db, parent.userId, user.id, "comment_reply", tid);
      return c.id;
    });
  }, 20);
}

export async function deleteComment(id: string) {
  return run("comment", (user) => {
    const cid = v.parse(v.id, id);
    return mutate((db) => {
      const c = db.comments.find((x) => x.id === cid);
      if (!c) throw new UserError("That comment no longer exists.");
      if (c.userId !== user.id && !isAdmin(user)) throw new Forbidden("You can only delete your own comments.");
      if (c.userId !== user.id) securityLog("admin.action", { admin: user.id, action: "delete_comment", target: cid });
      db.comments = db.comments.filter((x) => x.id !== cid && x.parentId !== cid);
    });
  });
}

export async function toggleCommentLike(id: string) {
  return run("clike", (user) => {
    const cid = v.parse(v.id, id);
    return mutate((db) => {
      const c = db.comments.find((x) => x.id === cid && !x.removed);
      if (!c) throw new UserError("That comment is no longer available.");
      if (c.targetType === "entry") visibleEntry(db, user.id, c.targetId);
      else visibleList(db, user.id, c.targetId);
      const has = db.commentLikes.some((l) => l.userId === user.id && l.commentId === cid);
      if (has) db.commentLikes = db.commentLikes.filter((l) => !(l.userId === user.id && l.commentId === cid));
      else db.commentLikes.push({ userId: user.id, commentId: cid });
      return !has;
    });
  }, 120);
}

export async function toggleFollow(targetId: string) {
  return run("follow", (user) => {
    const tid = v.parse(v.id, targetId);
    return mutate((db) => {
      if (tid === user.id) throw new UserError("You can't follow yourself.");
      const target = db.users.find((u) => u.id === tid && !u.suspended);
      if (!target) throw new UserError("That account doesn't exist.");
      const has = db.follows.some((f) => f.followerId === user.id && f.followingId === tid);
      if (has) {
        db.follows = db.follows.filter((f) => !(f.followerId === user.id && f.followingId === tid));
        db.activity = db.activity.filter((a) => !(a.type === "user_followed" && a.actorId === user.id && a.targetUserId === tid));
      } else {
        if (blocked(db, user.id, tid)) throw new Forbidden("You can't follow this account.");
        if (db.follows.filter((f) => f.followerId === user.id).length >= 5000) throw new UserError("You're following the maximum number of accounts.");
        db.follows.push({ followerId: user.id, followingId: tid, createdAt: now() });
        db.activity.push({ id: newId("ac"), actorId: user.id, type: "user_followed", targetUserId: tid, createdAt: now() });
        notify(db, tid, user.id, "follow");
        track("follow");
      }
      return !has;
    });
  }, 60);
}

function artistExists(db: DB, artistId: string) {
  if (!db.artists.some((a) => a.id === artistId)) throw new UserError("That artist is unavailable.");
}

export async function toggleArtistFollow(artistId: string) {
  return run("afollow", (user) => {
    const aid = v.parse(v.id, artistId);
    return mutate((db) => {
      artistExists(db, aid);
      const has = db.artistFollows.some((f) => f.userId === user.id && f.artistId === aid);
      if (has) db.artistFollows = db.artistFollows.filter((f) => !(f.userId === user.id && f.artistId === aid));
      else db.artistFollows.push({ userId: user.id, artistId: aid, createdAt: now() });
      return !has;
    });
  });
}

export async function toggleFavoriteArtist(artistId: string) {
  return run("fav", (user) => {
    const aid = v.parse(v.id, artistId);
    return mutate((db) => {
      artistExists(db, aid);
      const u = db.users.find((x) => x.id === user.id)!;
      const has = u.favoriteArtistIds.includes(aid);
      if (has) u.favoriteArtistIds = u.favoriteArtistIds.filter((a) => a !== aid);
      else {
        if (u.favoriteArtistIds.length >= 8) throw new UserError("You can pin up to 8 favourite artists.");
        u.favoriteArtistIds.push(aid);
      }
      return !has;
    });
  });
}

export async function toggleFavoriteSong(songId: string) {
  return run("fav", (user) => {
    const sid = v.parse(v.id, songId);
    return mutate((db) => {
      songExists(db, sid);
      const u = db.users.find((x) => x.id === user.id)!;
      const has = u.favoriteSongIds.includes(sid);
      if (has) u.favoriteSongIds = u.favoriteSongIds.filter((a) => a !== sid);
      else {
        if (u.favoriteSongIds.length >= 8) throw new UserError("You can pin up to 8 favourite songs. Unpin one first.");
        u.favoriteSongIds.push(sid);
      }
      return !has;
    });
  });
}

export async function reorderFavoriteSongs(ids: string[]) {
  return run("fav", (user) => {
    const list = v.parse(v.idList(8), ids);
    return mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      u.favoriteSongIds = [...new Set(list)].filter((id) => u.favoriteSongIds.includes(id));
    });
  });
}

export async function setProfileLyric(songId: string, text: string, startMs?: number | null) {
  return run("lyric", (user) => {
    const input = v.parse(v.profileLyric, { songId, text, startMs });
    const body = clean(input.text).replace(/\n{3,}/g, "\n\n");
    if (body.split("\n").length > 6) throw new UserError("Keep it to six lines or fewer.");
    return mutate((db) => {
      songExists(db, input.songId);
      const u = db.users.find((x) => x.id === user.id)!;
      u.profileLyric = { songId: input.songId, text: body, ...(input.startMs != null ? { startMs: input.startMs } : {}), updatedAt: now() };
    });
  }, 20);
}

export async function clearProfileLyric() {
  return run("lyric", (user) => {
    mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      delete u.profileLyric;
    });
  }, 20);
}

// ── Lists ───────────────────────────────────────────────────────────────

export type ListInput = import("zod").infer<typeof v.listInput>;

function normalizeList(input: ListInput, db: DB) {
  const p = v.parse(v.listInput, input);
  const title = clean(p.title);
  if (!title) throw new UserError("Give your list a title.");
  const seen = new Set<string>();
  const items = (p.items ?? [])
    .filter((it) => !seen.has(it.songId) && seen.add(it.songId) && db.songs.some((s) => s.id === it.songId))
    .map((it) => ({ songId: it.songId, note: clean(it.note) || undefined }));
  return { title, description: clean(p.description), isRanked: !!p.isRanked, visibility: p.visibility ?? "public", items };
}

export async function createList(input: ListInput) {
  return run("list", (user) =>
    mutate((db) => {
      const n = normalizeList(input, db);
      if (db.lists.filter((l) => l.userId === user.id).length >= 1000) throw new UserError("You've reached the maximum number of lists.");
      const t = now();
      const list = { id: newId("li"), userId: user.id, ...n, createdAt: t, updatedAt: t };
      db.lists.push(list);
      if (n.visibility === "public") db.activity.push({ id: newId("ac"), actorId: user.id, type: "list_created", listId: list.id, count: n.items.length, createdAt: t });
      return list.id;
    }), 20);
}

export async function updateList(id: string, input: ListInput) {
  return run("list", (user) => {
    const lid = v.parse(v.id, id);
    return mutate((db) => {
      const l = ownedList(db, user, lid);
      if (l.removed) throw new UserError("That list was removed by a moderator.");
      const n = normalizeList(input, db);
      const added = n.items.filter((it) => !l.items.some((x) => x.songId === it.songId)).length;
      Object.assign(l, { title: n.title, description: n.description, isRanked: n.isRanked, visibility: n.visibility, items: n.items, updatedAt: now() });
      if (n.visibility !== "public") db.activity = db.activity.filter((a) => a.listId !== l.id);
      else if (added) db.activity.push({ id: newId("ac"), actorId: user.id, type: "list_updated", listId: l.id, count: added, createdAt: now() });
    });
  });
}

export async function addToList(listId: string, songId: string) {
  return run("list", (user) => {
    const lid = v.parse(v.id, listId);
    const sid = v.parse(v.id, songId);
    return mutate((db) => {
      const l = ownedList(db, user, lid);
      if (l.removed) throw new UserError("That list was removed by a moderator.");
      songExists(db, sid);
      if (l.items.some((it) => it.songId === sid)) throw new UserError(`Already in “${l.title}”.`);
      if (l.items.length >= 500) throw new UserError("Lists can hold up to 500 songs.");
      l.items.push({ songId: sid });
      l.updatedAt = now();
      const recent = db.activity.find((a) => a.listId === l.id && a.type === "list_updated" && a.actorId === user.id && Date.now() - Date.parse(a.createdAt) < 3600e3);
      if (recent) { recent.count = (recent.count ?? 0) + 1; recent.createdAt = now(); }
      else if (l.visibility === "public") db.activity.push({ id: newId("ac"), actorId: user.id, type: "list_updated", listId: l.id, count: 1, createdAt: now() });
      return l.title;
    });
  }, 120);
}

export async function deleteList(id: string) {
  return run("list", (user) => {
    const lid = v.parse(v.id, id);
    return mutate((db) => {
      const l = ownedList(db, user, lid, true);
      if (l.userId !== user.id) securityLog("admin.action", { admin: user.id, action: "delete_list", target: lid });
      db.lists = db.lists.filter((x) => x.id !== lid);
      db.activity = db.activity.filter((a) => a.listId !== lid);
      db.listLikes = db.listLikes.filter((x) => x.listId !== lid);
      db.comments = db.comments.filter((c) => !(c.targetType === "list" && c.targetId === lid));
      return db.users.find((u) => u.id === l.userId)!.username;
    });
  });
}

export async function cloneList(id: string) {
  return run("list", (user) => {
    const lid = v.parse(v.id, id);
    return mutate((db) => {
      const l = visibleList(db, user.id, lid);
      if (db.lists.filter((x) => x.userId === user.id).length >= 1000) throw new UserError("You've reached the maximum number of lists.");
      const t = now();
      // Explicit fields only — never copy ownership/moderation fields.
      const copy = { id: newId("li"), userId: user.id, title: `${l.title} (copy)`.slice(0, 120), description: l.description, isRanked: l.isRanked, items: l.items.map((x) => ({ ...x })), clonedFromId: l.id, visibility: "private" as const, createdAt: t, updatedAt: t };
      db.lists.push(copy);
      return copy.id;
    });
  }, 10);
}

export async function toggleListLike(id: string) {
  return run("llike", (user) => {
    const lid = v.parse(v.id, id);
    return mutate((db) => {
      const l = visibleList(db, user.id, lid);
      const has = db.listLikes.some((x) => x.userId === user.id && x.listId === lid);
      if (has) db.listLikes = db.listLikes.filter((x) => !(x.userId === user.id && x.listId === lid));
      else {
        db.listLikes.push({ userId: user.id, listId: lid, createdAt: now() });
        notify(db, l.userId, user.id, "list_like", lid);
      }
      return !has;
    });
  }, 120);
}

// ── Moderation ──────────────────────────────────────────────────────────

export async function report(targetType: "entry" | "comment" | "list" | "user", targetId: string, reason: string) {
  return run("report", (user) => {
    const type = v.parse(v.reportTarget, targetType);
    const tid = v.parse(v.id, targetId);
    const why = clean(v.parse(v.reportReason, reason)) || "No reason given";
    return mutate((db) => {
      const exists =
        type === "entry" ? db.entries.some((x) => x.id === tid) :
        type === "comment" ? db.comments.some((x) => x.id === tid) :
        type === "list" ? db.lists.some((x) => x.id === tid) : db.users.some((x) => x.id === tid);
      if (!exists) throw new UserError("That content no longer exists.");
      if (db.reports.some((r) => r.reporterId === user.id && r.targetId === tid && r.status === "open")) throw new UserError("You've already reported this. Our moderators will take a look.");
      db.reports.push({ id: newId("re"), reporterId: user.id, targetType: type, targetId: tid, reason: why, status: "open", createdAt: now() });
    });
  }, 10);
}

export async function toggleBlock(targetId: string, kind: "block" | "mute") {
  return run("block", (user) => {
    const tid = v.parse(v.id, targetId);
    const k = v.parse(v.blockKind, kind);
    return mutate((db) => {
      if (tid === user.id) throw new UserError("You can't do that to yourself.");
      if (!db.users.some((u) => u.id === tid)) throw new UserError("That account doesn't exist.");
      const has = db.blocks.some((b) => b.userId === user.id && b.targetId === tid && b.kind === k);
      if (has) db.blocks = db.blocks.filter((b) => !(b.userId === user.id && b.targetId === tid && b.kind === k));
      else {
        db.blocks.push({ userId: user.id, targetId: tid, kind: k });
        if (k === "block") db.follows = db.follows.filter((f) => !((f.followerId === user.id && f.followingId === tid) || (f.followerId === tid && f.followingId === user.id)));
      }
      return !has;
    });
  });
}

export async function moderate(reportId: string, action: "remove" | "dismiss" | "suspend") {
  return run("mod", (user) => {
    if (!isAdmin(user)) throw new Forbidden("Moderators only.");
    const rid = v.parse(v.id, reportId);
    const act = v.parse(v.moderationAction, action);
    return mutate((db) => {
      const r = db.reports.find((x) => x.id === rid);
      if (!r) throw new UserError("Report not found.");
      securityLog("admin.action", { admin: user.id, action: `report_${act}`, target: r.targetId, type: r.targetType });
      if (act === "dismiss") { r.status = "dismissed"; return; }
      r.status = "resolved";
      if (act === "remove") {
        if (r.targetType === "entry") { const e = db.entries.find((x) => x.id === r.targetId); if (e) { e.removed = true; recomputeSongStats(db, e.songId); } }
        if (r.targetType === "comment") { const c = db.comments.find((x) => x.id === r.targetId); if (c) c.removed = true; }
        if (r.targetType === "list") { const l = db.lists.find((x) => x.id === r.targetId); if (l) l.removed = true; }
      }
      if (act === "suspend") {
        const authorId = r.targetType === "user" ? r.targetId
          : r.targetType === "entry" ? db.entries.find((x) => x.id === r.targetId)?.userId
          : r.targetType === "comment" ? db.comments.find((x) => x.id === r.targetId)?.userId
          : db.lists.find((x) => x.id === r.targetId)?.userId;
        const u = db.users.find((x) => x.id === authorId);
        if (u && !isAdmin(u)) { u.suspended = true; db.sessions = db.sessions.filter((s) => s.userId !== u.id); }
      }
    });
  }, 120);
}

// ── Account ─────────────────────────────────────────────────────────────

export async function updateSettings(_: unknown, form: FormData): Promise<ActionResult<void>> {
  return run("settings", async (user) => {
    // Allow-list of fields; role/suspended/username/etc. can never be set here.
    const p = v.parse(v.settingsInput, {
      displayName: formStr(form, "displayName"), bio: formStr(form, "bio"), location: formStr(form, "location"), website: formStr(form, "website").trim(),
      profileVisibility: formStr(form, "profileVisibility"), avatarHue: formStr(form, "avatarHue") || "0",
      currentPassword: formStr(form, "currentPassword"), newPassword: formStr(form, "newPassword"),
    });
    let changedPassword = false;
    if (p.newPassword) {
      const ip = await clientIp();
      if (!rateLimit(`pwchange:${user.id}:${ip}`, 5, 5 / 900)) throw new UserError(SLOW_DOWN);
      if (!verifyPassword(p.currentPassword, user.passwordHash)) {
        securityLog("auth.login_failed", { user: user.id, reason: "password_change_bad_current" });
        throw new UserError("Your current password is incorrect.");
      }
      changedPassword = true;
    }
    mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      u.displayName = clean(p.displayName) || u.username;
      u.bio = clean(p.bio);
      u.location = clean(p.location) || undefined;
      u.website = p.website || undefined;
      u.profileVisibility = p.profileVisibility;
      u.avatarHue = p.avatarHue;
      if (changedPassword) u.passwordHash = hashPassword(p.newPassword);
    });
    if (changedPassword) {
      await revokeOtherSessions(user.id);
      securityLog("auth.password_changed", { user: user.id });
    }
  }, 20);
}

/** Permanently delete the account and all personal data (requires password). */
export async function deleteAccount(_: unknown, form: FormData): Promise<ActionResult> {
  const result = await run("delete_account", async (user) => {
    if (formStr(form, "confirm") !== user.username) throw new UserError("Type your username to confirm.");
    if (!verifyPassword(formStr(form, "password").slice(0, 257), user.passwordHash)) throw new UserError("Your password is incorrect.");
    mutate((db) => {
      const uid = user.id;
      const entryIds = new Set(db.entries.filter((e) => e.userId === uid).map((e) => e.id));
      const listIds = new Set(db.lists.filter((l) => l.userId === uid).map((l) => l.id));
      const commentIds = new Set(db.comments.filter((c) => c.userId === uid).map((c) => c.id));
      db.users = db.users.filter((u) => u.id !== uid);
      db.sessions = db.sessions.filter((s) => s.userId !== uid);
      db.ratings = db.ratings.filter((r) => r.userId !== uid);
      db.likes = db.likes.filter((l) => l.userId !== uid);
      db.entries = db.entries.filter((e) => e.userId !== uid);
      db.reviewLikes = db.reviewLikes.filter((l) => l.userId !== uid && !entryIds.has(l.entryId));
      db.follows = db.follows.filter((f) => f.followerId !== uid && f.followingId !== uid);
      db.artistFollows = db.artistFollows.filter((f) => f.userId !== uid);
      db.lists = db.lists.filter((l) => l.userId !== uid);
      db.listLikes = db.listLikes.filter((l) => l.userId !== uid && !listIds.has(l.listId));
      db.comments = db.comments.filter((c) => c.userId !== uid && !(c.parentId && commentIds.has(c.parentId)) && !(c.targetType === "entry" && entryIds.has(c.targetId)) && !(c.targetType === "list" && listIds.has(c.targetId)));
      db.commentLikes = db.commentLikes.filter((l) => l.userId !== uid && !commentIds.has(l.commentId));
      db.listenLater = db.listenLater.filter((l) => l.userId !== uid);
      db.notifications = db.notifications.filter((n) => n.userId !== uid && n.actorId !== uid);
      db.activity = db.activity.filter((a) => a.actorId !== uid && a.targetUserId !== uid);
      db.reports = db.reports.filter((r) => r.reporterId !== uid);
      db.blocks = db.blocks.filter((b) => b.userId !== uid && b.targetId !== uid);
      forgetUser(uid); // queued listening-history import data goes too
      for (const u of db.users) u.favoriteSongIds = u.favoriteSongIds.filter(Boolean);
      recomputeAllStats(db);
    });
    securityLog("auth.account_deleted", { user: user.id });
  }, 3);
  if (!result.ok) return result;
  await endSession();
  redirect("/");
}

export async function completeOnboarding(followIds: string[], artistIds: string[]) {
  return run("onboard", (user) => {
    const follows = v.parse(v.idList(50), followIds);
    const artists = v.parse(v.idList(50), artistIds);
    return mutate((db) => {
      const u = db.users.find((x) => x.id === user.id)!;
      for (const id of new Set(follows)) {
        const target = db.users.find((x) => x.id === id && !x.suspended);
        if (id !== u.id && target && !blocked(db, u.id, id) && !db.follows.some((f) => f.followerId === u.id && f.followingId === id)) {
          db.follows.push({ followerId: u.id, followingId: id, createdAt: now() });
          notify(db, id, u.id, "follow");
        }
      }
      for (const a of [...new Set(artists)].slice(0, 8)) {
        if (!db.artists.some((x) => x.id === a)) continue;
        if (!u.favoriteArtistIds.includes(a) && u.favoriteArtistIds.length < 8) u.favoriteArtistIds.push(a);
        if (!db.artistFollows.some((f) => f.userId === u.id && f.artistId === a)) db.artistFollows.push({ userId: u.id, artistId: a, createdAt: now() });
      }
      if (!u.favoriteSongIds.length) u.favoriteSongIds = db.ratings.filter((r) => r.userId === u.id && r.rating >= 4.5).slice(0, 4).map((r) => r.songId);
      u.onboarded = true;
    });
  });
}

export async function markNotificationsRead() {
  return run("notif", (user) =>
    mutate((db) => {
      for (const n of db.notifications) if (n.userId === user.id && !n.readAt) n.readAt = now();
    }));
}

/** Import a song from the external catalogue (authenticated; per-user + per-IP limits). */
export async function importExternalSong(externalId: string) {
  const ip = await clientIp();
  if (!rateLimit(`import:ip:${ip}`, 30, 30 / 600)) return { ok: false as const, error: "Too many imports. Try again in a few minutes." };
  return run("import", async () => importTrack(v.parse(v.externalId, externalId)), 20);
}
