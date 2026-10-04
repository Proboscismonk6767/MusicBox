import "server-only";
import { headers } from "next/headers";
import { adminUsernames, env, isProduction } from "./env";
import type { PublicUser, User } from "../types";

// ── Authorization ───────────────────────────────────────────────────────

/** Single source of truth for admin rights. In production only ADMIN_USERNAMES
 *  grants admin; a stored `role` alone is never trusted there. */
export function isAdmin(user: Pick<User | PublicUser, "username" | "role"> | null | undefined): boolean {
  if (!user) return false;
  if (adminUsernames().has(user.username.toLowerCase())) return true;
  return !isProduction() && user.role === "admin";
}

// ── Client identity for rate limiting ───────────────────────────────────

/** Client IP from the header your platform guarantees (CLIENT_IP_HEADER).
 *  Falls back to common proxy headers in development only. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return ipFromHeaders(h);
}

export function ipFromHeaders(h: Headers): string {
  const configured = env().CLIENT_IP_HEADER;
  const raw = configured ? h.get(configured) : h.get("x-real-ip") ?? h.get("x-forwarded-for");
  const ip = raw?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : "unknown";
}

// ── Redirects ───────────────────────────────────────────────────────────

/** Only same-origin relative paths. Blocks `//evil`, `/\evil`, `javascript:`, encoded tricks. */
export function safeRedirectPath(input: unknown, fallback = "/"): string {
  if (typeof input !== "string" || input.length > 512) return fallback;
  if (!/^\/(?![/\\])/.test(input) || /[\\\u0000-\u001f]/.test(input)) return fallback;
  try {
    const u = new URL(input, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}

// ── Output encoding ─────────────────────────────────────────────────────

/** JSON safe to embed inside <script type="application/ld+json">. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Accept only http(s) URLs, optionally restricted to host suffixes. */
export function safeExternalUrl(input: unknown, hosts?: string[]): string | undefined {
  if (typeof input !== "string" || input.length > 2048) return undefined;
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (hosts && !hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) return undefined;
    if (hosts) u.protocol = "https:";
    return u.toString();
  } catch {
    return undefined;
  }
}

// ── Security logging ────────────────────────────────────────────────────

type SecurityEvent = "auth.login_failed" | "auth.login" | "auth.signup" | "auth.logout" | "auth.password_changed" | "auth.account_deleted" | "ratelimit.exceeded" | "authz.denied" | "admin.action" | "catalogue.error";

/** Structured security log. Never pass secrets, tokens, passwords or request bodies. */
export function securityLog(event: SecurityEvent, fields: Record<string, string | number | boolean | undefined> = {}) {
  if (env().NODE_ENV === "test") return;
  const safe = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 200) : v]));
  console.log(JSON.stringify({ level: event.startsWith("auth.login_failed") || event.startsWith("authz") || event.startsWith("ratelimit") ? "warn" : "info", type: "security", event, at: new Date().toISOString(), ...safe }));
}
