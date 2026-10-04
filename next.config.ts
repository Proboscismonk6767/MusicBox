import type { NextConfig } from "next";
import path from "path";

const isProd = process.env.NODE_ENV === "production";

// Static security headers (CSP is per-request, see src/middleware.ts).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" }, // legacy browsers; CSP frame-ancestors is authoritative
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  // Dev server gets its own build folder so it never clobbers the production `.next` that `next start` serves.
  distDir: isProd ? ".next" : ".next-dev",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "*.mzstatic.com" }] },
  outputFileTracingRoot: path.resolve("."),
  // Database drivers are loaded at runtime, not bundled.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  experimental: {
    serverActions: {
      bodySizeLimit: "256kb", // largest legit payload: a 500-song list with notes
      allowedOrigins: process.env.NEXT_PUBLIC_SITE_URL ? [new URL(process.env.NEXT_PUBLIC_SITE_URL).host] : undefined,
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Personal / authenticated responses must never be stored by shared caches.
      { source: "/api/feed", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/(settings|notifications|listen-later|admin|onboarding)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
