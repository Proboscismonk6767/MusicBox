// Content-Security-Policy built around what the app actually loads:
// self-hosted scripts/fonts (next/font), album art from Apple's CDN, and 30s
// previews from Apple. Scripts require a per-request nonce ('strict-dynamic'),
// so injected <script> tags can't run even if markup were injected.
// style-src keeps 'unsafe-inline' because React style attributes (artwork
// palettes, chart sizes) can't carry nonces; CSS cannot execute script.

export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Cover Art Archive redirects (coverartarchive.org → archive.org storage hosts), so each hop is allowed.
    "img-src": ["'self'", "data:", "blob:", "https://*.mzstatic.com", "https://coverartarchive.org", "https://archive.org", "https://*.archive.org"],
    "media-src": ["'self'", "https://*.apple.com", "https://*.mzstatic.com"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:", "wss:"] : [])],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
