"use server";

// All mutations. Security model:
//  • Identity comes only from the server session (requireUser) — never from arguments.
//  • Every argument is validated with zod (lib/server/validation.ts) before use.
//  • Ownership / visibility / block checks run against server state for every target id
//    (inside the data layer's commands, in the same transaction as the write).
//  • Rate limits per user+action, and per IP for unauthenticated auth endpoints.
//  • Next.js Server Actions only accept same-origin POSTs (Origin/Host check) — CSRF.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { data, commands } from "@/lib/server/data";
import { AuthError, endSession, getSessionUser, requireUser, revokeOtherSessions, startSession } from "@/lib/server/auth";
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from "@/lib/server/password";
import { rateLimit } from "@/lib/server/ratelimit";
import { importTrack, MetadataError } from "@/lib/server/metadata";
import { forgetUser } from "@/lib/server/import-queue";
import { track } from "@/lib/server/metrics";
import { reportError } from "@/lib/server/monitoring";
import { clientIp, isAdmin, safeRedirectPath, securityLog } from "@/lib/server/security";
import { Forbidden, UserError } from "@/lib/server/errors";
import * as v from "@/lib/server/validation";
import { newId, todayISO } from "@/lib/util";
import type { User } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const RESERVED = new Set(["discover", "search", "song", "artist", "album", "list", "lists", "listen-later", "settings", "login", "signup", "logout", "onboarding", "notifications", "genre", "review", "admin", "api", "about", "stats", "home", "feed", "_next", "year", "open", "musicbox", "support", "help", "security", "root", "moderator", "terms", "privacy", "copyright", "legal", "import"]);
const now = () => new Date().toISOString();
const SLOW_DOWN = "You're doing that a lot. Take a breath and try again in a moment.";

async function run<T>(key: string, fn: (user: User) => T | Promise<T>, limit = 60): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!rateLimit(`${user.id}:${key}`, limit, limit / 60)) {
      securityLog("ratelimit.exceeded", { action: key, user: user.id });
      return { ok: false, error: SLOW_DOWN };
    }
    const result = await fn(user);
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (e) {
    if (e instanceof Forbidden) securityLog("authz.denied", { action: key, reason: e.message });
    if (e instanceof AuthError || e instanceof UserError || e instanceof MetadataError || e instanceof v.ValidationError) return { ok: false, error: e.message };
    reportError(e, { kind: "action", route: `action:${key}` });
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
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
  if (await data.getUserByName(username)) return { ok: false, error: "That username is taken." };
  const user: User = {
    id: newId("us"), username, displayName, bio: "", avatarHue: Math.floor(Math.random() * 360), passwordHash: hashPassword(password),
    createdAt: now(), favoriteSongIds: [], favoriteArtistIds: [], profileVisibility: "public", role: "user", onboarded: false,
  };
  try {
    await commands.createUser(user);
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
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
  const user = await data.getUserByName(username);
  if (!user) dummyVerify(password);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    securityLog("auth.login_failed", { ip, reason: user ? "bad_password" : "unknown_user" });
    return { ok: false, error: "That username and password don't match." };
  }
  if (user.suspended) return { ok: false, error: "This account has been suspended." };
  if (needsRehash(user.passwordHash)) await commands.setPasswordHash(user.id, hashPassword(password));
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
  return run("rate", async (user) => {
    const sid = v.parse(v.id, songId);
    const r = v.parse(v.rating.nullable(), rating);
    await commands.rateSong(user, sid, r);
  }, 120);
}

export async function toggleLike(songId: string) {
  return run("like", async (user) => commands.toggleLike(user, v.parse(v.id, songId)), 120);
}

export async function toggleListenLater(songId: string) {
  return run("ll", async (user) => commands.toggleListenLater(user, v.parse(v.id, songId)), 120);
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
  return run("log", async (user) => {
    const p = v.parse(v.logSongInput, input);
    const n = normalizeLog(p);
    const { id, firstEver } = await commands.logSong(user, p.songId, { ...p, ...n });
    track("log");
    if (firstEver) track("first_log");
    return id;
  }, 60);
}

export async function updateEntry(id: string, input: LogInput) {
  return run("log", async (user) => {
    const eid = v.parse(v.id, id);
    const p = v.parse(v.logInput, input);
    const n = normalizeLog(p);
    await commands.updateEntry(user, eid, { ...p, ...n });
  });
}

export async function deleteEntry(id: string) {
  return run("log", async (user) => {
    const eid = v.parse(v.id, id);
    const { byAdmin } = await commands.deleteEntry(user, eid);
    if (byAdmin) securityLog("admin.action", { admin: user.id, action: "delete_entry", target: eid });
  });
}

// ── Social ──────────────────────────────────────────────────────────────

export async function toggleReviewLike(entryId: string) {
  return run("rlike", async (user) => commands.toggleReviewLike(user, v.parse(v.id, entryId)), 120);
}

export async function addComment(targetType: "entry" | "list", targetId: string, body: string, parentId?: string) {
  return run("comment", async (user) => {
    const type = v.parse(v.commentTarget, targetType);
    const tid = v.parse(v.id, targetId);
    const text = clean(v.parse(v.commentBody, body));
    const pid = parentId === undefined ? undefined : v.parse(v.id, parentId);
    if (!text) throw new UserError("Write something first.");
    return commands.addComment(user, type, tid, text, pid);
  }, 20);
}

export async function deleteComment(id: string) {
  return run("comment", async (user) => {
    const cid = v.parse(v.id, id);
    const { byAdmin } = await commands.deleteComment(user, cid);
    if (byAdmin) securityLog("admin.action", { admin: user.id, action: "delete_comment", target: cid });
  });
}

export async function toggleCommentLike(id: string) {
  return run("clike", async (user) => commands.toggleCommentLike(user, v.parse(v.id, id)), 120);
}

export async function toggleFollow(targetId: string) {
  return run("follow", async (user) => {
    const following = await commands.toggleFollow(user, v.parse(v.id, targetId));
    if (following) track("follow");
    return following;
  }, 60);
}

export async function toggleArtistFollow(artistId: string) {
  return run("afollow", async (user) => commands.toggleArtistFollow(user, v.parse(v.id, artistId)));
}

export async function toggleFavoriteArtist(artistId: string) {
  return run("fav", async (user) => commands.toggleFavoriteArtist(user, v.parse(v.id, artistId)));
}

export async function toggleFavoriteSong(songId: string) {
  return run("fav", async (user) => commands.toggleFavoriteSong(user, v.parse(v.id, songId)));
}

export async function reorderFavoriteSongs(ids: string[]) {
  return run("fav", async (user) => {
    await commands.reorderFavoriteSongs(user, v.parse(v.idList(8), ids));
  });
}

export async function setProfileLyric(songId: string, text: string, startMs?: number | null) {
  return run("lyric", async (user) => {
    const input = v.parse(v.profileLyric, { songId, text, startMs });
    const body = clean(input.text).replace(/\n{3,}/g, "\n\n");
    if (body.split("\n").length > 6) throw new UserError("Keep it to six lines or fewer.");
    await commands.setProfileLyric(user, input.songId, body, input.startMs);
  }, 20);
}

export async function clearProfileLyric() {
  return run("lyric", async (user) => {
    await commands.clearProfileLyric(user);
  }, 20);
}

// ── Lists ───────────────────────────────────────────────────────────────

export type ListInput = import("zod").infer<typeof v.listInput>;

function normalizeList(input: ListInput) {
  const p = v.parse(v.listInput, input);
  const title = clean(p.title);
  if (!title) throw new UserError("Give your list a title.");
  const seen = new Set<string>();
  const items = (p.items ?? [])
    .filter((it) => !seen.has(it.songId) && seen.add(it.songId))
    .map((it) => ({ songId: it.songId, note: clean(it.note) || undefined }));
  return { title, description: clean(p.description), isRanked: !!p.isRanked, visibility: p.visibility ?? "public", items };
}

export async function createList(input: ListInput) {
  return run("list", async (user) => commands.createList(user, normalizeList(input)), 20);
}

export async function updateList(id: string, input: ListInput) {
  return run("list", async (user) => {
    const lid = v.parse(v.id, id);
    await commands.updateList(user, lid, normalizeList(input));
  });
}

export async function addToList(listId: string, songId: string) {
  return run("list", async (user) => commands.addToList(user, v.parse(v.id, listId), v.parse(v.id, songId)), 120);
}

export async function deleteList(id: string) {
  return run("list", async (user) => {
    const lid = v.parse(v.id, id);
    const { username, byAdmin } = await commands.deleteList(user, lid);
    if (byAdmin) securityLog("admin.action", { admin: user.id, action: "delete_list", target: lid });
    return username;
  });
}

export async function cloneList(id: string) {
  return run("list", async (user) => commands.cloneList(user, v.parse(v.id, id)), 10);
}

export async function toggleListLike(id: string) {
  return run("llike", async (user) => commands.toggleListLike(user, v.parse(v.id, id)), 120);
}

// ── Moderation ──────────────────────────────────────────────────────────

export async function report(targetType: "entry" | "comment" | "list" | "user", targetId: string, reason: string) {
  return run("report", async (user) => {
    const type = v.parse(v.reportTarget, targetType);
    const tid = v.parse(v.id, targetId);
    const why = clean(v.parse(v.reportReason, reason)) || "No reason given";
    await commands.report(user, type, tid, why);
  }, 10);
}

export async function toggleBlock(targetId: string, kind: "block" | "mute") {
  return run("block", async (user) => commands.toggleBlock(user, v.parse(v.id, targetId), v.parse(v.blockKind, kind)));
}

export async function moderate(reportId: string, action: "remove" | "dismiss" | "suspend") {
  return run("mod", async (user) => {
    if (!isAdmin(user)) throw new Forbidden("Moderators only.");
    const rid = v.parse(v.id, reportId);
    const act = v.parse(v.moderationAction, action);
    const about = await commands.moderate(rid, act);
    securityLog("admin.action", { admin: user.id, action: `report_${act}`, target: about.targetId, type: about.targetType });
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
    await commands.updateProfile(user, {
      displayName: clean(p.displayName) || user.username,
      bio: clean(p.bio),
      location: clean(p.location) || undefined,
      website: p.website || undefined,
      profileVisibility: p.profileVisibility,
      avatarHue: p.avatarHue,
    }, changedPassword ? hashPassword(p.newPassword) : undefined);
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
    await commands.deleteAccount(user.id);
    forgetUser(user.id); // queued listening-history import data goes too
    securityLog("auth.account_deleted", { user: user.id });
  }, 3);
  if (!result.ok) return result;
  await endSession();
  redirect("/");
}

export async function completeOnboarding(followIds: string[], artistIds: string[]) {
  return run("onboard", async (user) => {
    await commands.completeOnboarding(user, v.parse(v.idList(50), followIds), v.parse(v.idList(50), artistIds));
  });
}

export async function markNotificationsRead() {
  return run("notif", async (user) => {
    await commands.markNotificationsRead(user);
  });
}

/** Import a song from the external catalogue (authenticated; per-user + per-IP limits). */
export async function importExternalSong(externalId: string) {
  const ip = await clientIp();
  if (!rateLimit(`import:ip:${ip}`, 30, 30 / 600)) return { ok: false as const, error: "Too many imports. Try again in a few minutes." };
  return run("import", async () => importTrack(v.parse(v.externalId, externalId)), 20);
}
