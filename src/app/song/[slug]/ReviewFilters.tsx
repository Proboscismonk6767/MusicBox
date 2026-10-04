"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ReviewFilters({ current, signedIn }: { current: string; signedIn: boolean }) {
  const path = usePathname();
  const opts = [["popular", "Popular"], ["recent", "Recent"], ...(signedIn ? [["friends", "Friends"]] : [])];
  return (
    <div className="flex gap-3 text-[11px] uppercase tracking-wider">
      {opts.map(([k, l]) => (
        <Link key={k} href={`${path}?reviews=${k}`} scroll={false} replace className={current === k ? "text-fg" : "text-faint hover:text-muted"}>{l}</Link>
      ))}
    </div>
  );
}
