import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { getDB, mutate } from "./store";
import { isProduction } from "./env";
import type { PublicUser, User } from "../types";

// Sessions: 256-bit random token in an HttpOnly cookie; only its SHA-256 is
// stored server-side, so a leaked data file cannot be replayed as sessions.

const cookieName = () => (isProduction() ? "__Host-mb_session" : "mb_session");
const MAX_AGE_DAYS = 30;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function toPublic(u: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || token.length > 128) return null;
  return hashToken(token);
}

export async function getSessionUser(): Promise<User | null> {
  const tokenHash = await currentTokenHash();
  if (!tokenHash) return null;
  const db = getDB();
  const session = db.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session || session.expiresAt < new Date().toISOString()) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || user.suspended) return null;
  return user;
}

export async function getViewer(): Promise<PublicUser | null> {
  const u = await getSessionUser();
  return u ? toPublic(u) : null;
}

export async function requireUser(): Promise<User> {
  const u = await getSessionUser();
  if (!u) throw new AuthError();
  return u;
}

export class AuthError extends Error {
  constructor() {
    super("Your session has expired. Please sign in again.");
  }
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAX_AGE_DAYS * 864e5).toISOString();
  mutate((db) => {
    db.sessions = db.sessions.filter((s) => s.expiresAt > now.toISOString());
    db.sessions.push({ tokenHash: hashToken(token), userId, expiresAt, createdAt: now.toISOString() });
  });
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: MAX_AGE_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const tokenHash = await currentTokenHash();
  if (tokenHash) mutate((db) => void (db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash)));
  jar.delete(cookieName());
}

/** Revoke every session for a user except (optionally) the current one. */
export async function revokeOtherSessions(userId: string) {
  const keep = await currentTokenHash();
  mutate((db) => void (db.sessions = db.sessions.filter((s) => s.userId !== userId || s.tokenHash === keep)));
}
