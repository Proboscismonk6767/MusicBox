"use client";

import Link from "next/link";
import { SiteFooter } from "./Legal";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { Avatar, Icon } from "./ui";
import { SearchBox } from "./SearchBox";
import { logout } from "@/app/actions";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 group ${className}`} aria-label="MusicBox home">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="text-accent">
        <path d="M5 3h14v18l-7-4.5L5 21z" fill="currentColor" />
        <circle cx="12" cy="9.5" r="2.6" fill="#0d0d0f" />
      </svg>
      <span className="display text-[22px] leading-none tracking-tight">MusicBox</span>
    </Link>
  );
}

export function Shell({ children, unread }: { children: ReactNode; unread: number }) {
  const { viewer } = useApp();
  const path = usePathname();
  const bare = path === "/login" || path === "/signup" || path === "/onboarding" || (!viewer && path === "/");

  if (bare) return <>{children}</>;

  if (!viewer) {
    return (
      <>
        <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur border-b border-line-soft">
          <div className="max-w-[1240px] mx-auto px-4 h-14 flex items-center gap-4">
            <Logo />
            <nav className="hidden md:flex items-center gap-1 ml-4">
              <Link href="/discover" className="btn-ghost">Discover</Link>
              <Link href="/lists" className="btn-ghost">Lists</Link>
            </nav>
            <SearchBox className="flex-1 max-w-md ml-auto" />
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn-ghost">Sign in</Link>
            <Link href="/signup" className="btn-primary hidden sm:inline-flex">Create account</Link>
          </div>
        </header>
        <main className="max-w-[1240px] mx-auto px-4 py-6 md:py-8">{children}</main>
        <SiteFooter />
      </>
    );
  }

  const nav = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/discover", label: "Discover", icon: "compass" },
    { href: `/${viewer.username}/diary`, label: "Diary", icon: "book" },
    { href: "/lists", label: "Lists", icon: "list" },
    { href: "/listen-later", label: "Listen Later", icon: "bookmark" },
    { href: "/notifications", label: "Notifications", icon: "bell", badge: unread },
    { href: `/${viewer.username}`, label: "Profile", icon: "user" },
  ];
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop/tablet sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 sticky top-0 h-dvh w-16 lg:w-[220px] border-r border-line-soft px-2 lg:px-4 py-5">
        <div className="px-2 mb-7 hidden lg:block"><Logo /></div>
        <Link href="/" className="mb-7 lg:hidden mx-auto text-accent" aria-label="Home"><svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 3h14v18l-7-4.5L5 21z" fill="currentColor" /><circle cx="12" cy="9.5" r="2.6" fill="#0d0d0f" /></svg></Link>
        <nav className="flex flex-col gap-0.5">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} title={n.label} className={`relative flex items-center gap-3 rounded-md px-2.5 h-10 text-sm transition-colors justify-center lg:justify-start ${isActive(n.href) ? "text-fg bg-elev-2 font-medium" : "text-muted hover:text-fg hover:bg-elev"}`}>
              <Icon name={n.icon} size={19} filled={isActive(n.href) && n.icon !== "compass" && n.icon !== "list" && n.icon !== "book"} strokeWidth={isActive(n.href) ? 2 : 1.7} />
              <span className="hidden lg:inline">{n.label}</span>
              {!!n.badge && <span className="absolute lg:static top-1.5 right-1.5 lg:ml-auto min-w-[18px] h-[18px] rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center px-1">{n.badge > 99 ? "99+" : n.badge}</span>}
            </Link>
          ))}
        </nav>
        <Link href="/search" className="lg:hidden mt-1 flex items-center justify-center h-10 rounded-md text-muted hover:text-fg hover:bg-elev" title="Search"><Icon name="search" size={19} /></Link>
        <div className="mt-auto flex flex-col gap-0.5">
          <Link href={`/${viewer.username}/stats`} title="Stats" className={`flex items-center gap-3 rounded-md px-2.5 h-9 text-sm justify-center lg:justify-start ${isActive(`/${viewer.username}/stats`) ? "text-fg bg-elev-2" : "text-muted hover:text-fg hover:bg-elev"}`}><Icon name="chart" size={17} /><span className="hidden lg:inline">Stats</span></Link>
          <Link href="/settings" title="Settings" className={`flex items-center gap-3 rounded-md px-2.5 h-9 text-sm justify-center lg:justify-start ${isActive("/settings") ? "text-fg bg-elev-2" : "text-muted hover:text-fg hover:bg-elev"}`}><Icon name="settings" size={17} /><span className="hidden lg:inline">Settings</span></Link>
          <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-line-soft px-1 justify-center lg:justify-start">
            <Link href={`/${viewer.username}`}><Avatar user={viewer} size={30} /></Link>
            <div className="hidden lg:block min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{viewer.displayName}</div>
              <div className="text-xs text-faint truncate">@{viewer.username}</div>
            </div>
            <form action={logout} className="hidden lg:block"><button className="btn-ghost h-8 w-8 px-0" title="Sign out" aria-label="Sign out"><Icon name="logout" size={15} /></button></form>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-bg/85 backdrop-blur border-b border-line-soft">
          <div className="max-w-[1240px] mx-auto px-4 h-14 flex items-center gap-3">
            <Logo className="md:hidden" />
            <SearchBox className="hidden md:block w-full max-w-md" />
            <div className="ml-auto flex items-center gap-1">
              <Link href="/notifications" className="md:hidden relative btn-ghost h-9 w-9 px-0" aria-label="Notifications">
                <Icon name="bell" size={19} />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />}
              </Link>
              <Link href="/search" className="hidden md:inline-flex btn-ghost text-xs">Advanced search</Link>
            </div>
          </div>
        </header>
        <main className="max-w-[1240px] mx-auto px-4 py-6 md:py-8 pb-6 md:pb-8">{children}</main>
        <SiteFooter />
      </div>

      {/* Mobile bottom nav (§34) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bg/95 backdrop-blur border-t border-line-soft pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-14">
          {[
            { href: "/", label: "Home", icon: "home" },
            { href: "/discover", label: "Discover", icon: "compass" },
            { href: "/search", label: "Search", icon: "search" },
            { href: `/${viewer.username}/diary`, label: "Diary", icon: "book" },
            { href: `/${viewer.username}`, label: "Profile", icon: "user" },
          ].map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center justify-center gap-0.5 text-[10px] ${isActive(n.href) && (n.href !== `/${viewer.username}` || path === n.href) ? "text-fg" : "text-faint"}`}>
              <Icon name={n.icon} size={21} />
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
