import "server-only";
import { env } from "./env";

/** For route handlers that change data (Server Actions get this check from Next.js itself).
 *  A browser always sends `Origin` on a cross-site POST, so a missing or foreign one is refused. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  const own = req.headers.get("host");
  if (own) allowed.add(own);
  const site = env().NEXT_PUBLIC_SITE_URL;
  if (site) allowed.add(new URL(site).host);
  return allowed.has(host);
}
