import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { getViewer } from "@/lib/server/auth";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import { data } from "@/lib/server/data";

// Letterboxd uses Graphik (commercial). Graphik is used when licensed files are in
// public/fonts or installed locally; Hanken Grotesk is the closest free fallback.
const grotesk = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-fallback", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MusicBox — Your music taste deserves a history", template: "%s · MusicBox" },
  description: "Log, rate, review and collect the songs that matter to you. Discover music through people whose taste you trust.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: { siteName: "MusicBox", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0d0d0f", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const lists = viewer ? await data.viewerLists(viewer.id) : [];
  const unread = viewer ? await data.unreadCount(viewer.id) : 0;
  const mini = viewer ? { id: viewer.id, username: viewer.username, displayName: viewer.displayName, avatarHue: viewer.avatarHue, avatarUrl: viewer.avatarUrl } : null;
  return (
    <html lang="en" className={`${grotesk.variable}`}>
      <body className="font-sans min-h-dvh">
        <AppProvider viewer={mini} lists={lists}>
          <Shell unread={unread}>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
