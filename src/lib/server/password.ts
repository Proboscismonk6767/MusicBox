import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt via Node's crypto (no custom crypto). Parameters follow OWASP's
// password storage guidance (N=2^17, r=8, p=1) and are stored with each hash
// so they can be raised later without breaking existing accounts.

const N = 2 ** 17;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 256 * 1024 * 1024;
export const MAX_PASSWORD_LENGTH = 256; // bounds hashing cost (DoS)

export function hashPassword(password: string): string {
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error("Password too long");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }).toString("hex");
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const parts = stored.split("$");
  let n = 16384, r = 8, p = 1, salt: string, hash: string;
  if (parts[0] !== "scrypt") return false;
  if (parts.length === 6) [, n, r, p] = parts.slice(0, 4).map(Number) as [number, number, number, number];
  if (parts.length === 6) [salt, hash] = [parts[4], parts[5]];
  else if (parts.length === 3) [salt, hash] = [parts[1], parts[2]]; // legacy format
  else return false;
  if (!salt || !hash || n > 2 ** 20) return false;
  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

/** True when a hash uses weaker-than-current parameters (rehash on next login). */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  return parts.length !== 6 || Number(parts[1]) < N;
}

// A real hash so "unknown user" logins cost the same as "wrong password".
let dummy: string | null = null;
export function dummyVerify(password: string) {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  verifyPassword(password.slice(0, MAX_PASSWORD_LENGTH), dummy);
}
