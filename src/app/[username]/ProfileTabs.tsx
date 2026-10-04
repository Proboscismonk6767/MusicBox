"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProfileTabs({ username, isSelf }: { username: string; isSelf: boolean }) {
  const path = usePathname();
  const base = `/${username}`;
  const tabs = [
    ["Profile", base], ["Diary", `${base}/diary`], ["Reviews", `${base}/reviews`], ["Lists", `${base}/lists`], ["Likes", `${base}/likes`], ["Stats", `${base}/stats`],
    ...(isSelf ? [["Listen Later", "/listen-later"]] : []),
  ];
  return (
    <nav className="flex gap-1 border-b border-line mb-8 overflow-x-auto overflow-y-hidden -mx-4 px-4 [scrollbar-width:none]">
      {tabs.map(([label, href]) => {
        const active = href === base ? path === base : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}>
            {label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-accent rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}
