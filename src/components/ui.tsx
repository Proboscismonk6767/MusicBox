import Link from "next/link";
import type { ReactNode } from "react";
import type { UserMini } from "@/lib/views";

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  book: <><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" /><path d="M4 17a3 3 0 0 1 3-3h11" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  heart: <path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.4 3.8 4.5 7 4.5c2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 3.2 0 5.3 2.9 4.2 6.2C19.5 15.4 12 20 12 20z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  more: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  grip: <><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>,
  shuffle: <><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></>,
  external: <><path d="M14 4h6v6M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  pin: <path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z" />,
  flag: <path d="M5 21V4h11l-1.5 4L16 12H5" />,
  logout: <><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  play: <path d="M7 4v16l13-8z" />,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
};

export function Icon({ name, size = 18, className = "", filled = false, strokeWidth = 1.8 }: { name: keyof typeof PATHS | string; size?: number; className?: string; filled?: boolean; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function Avatar({ user, size = 32, className = "" }: { user: Pick<UserMini, "displayName" | "avatarHue" | "avatarUrl" | "username">; size?: number; className?: string }) {
  const initials = user.displayName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={user.displayName} width={size} height={size} className={`rounded-full object-cover shrink-0 ${className}`} />;
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${user.avatarHue} 45% 42%), hsl(${(user.avatarHue + 40) % 360} 55% 26%))`, color: `hsl(${user.avatarHue} 80% 92%)` }}
      aria-label={user.displayName}
    >
      {initials}
    </span>
  );
}

export function UserLink({ user, className = "" }: { user: UserMini; className?: string }) {
  return (
    <Link href={`/${user.username}`} className={`font-medium text-fg hover:text-accent transition-colors ${className}`}>
      {user.displayName}
    </Link>
  );
}

/** Static star display. */
export function Stars({ rating, size = 12, className = "" }: { rating?: number | null; size?: number; className?: string }) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const half = rating % 1 !== 0;
  return (
    <span className={`inline-flex items-center text-accent ${className}`} aria-label={`${rating} stars`} title={`${rating} / 5`}>
      {Array.from({ length: full }).map((_, i) => (
        <Icon key={i} name="star" size={size} filled strokeWidth={0} />
      ))}
      {half && <span style={{ fontSize: size * 1.05, lineHeight: 1 }} className="font-semibold -ml-px">½</span>}
    </span>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-sm bg-elev-2 border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-muted ${className}`}>{children}</span>;
}

export function SectionHeader({ title, href, action, className = "" }: { title: string; href?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between border-b border-line pb-2 mb-4 ${className}`}>
      <h2 className="section-title">{href ? <Link href={href} className="link">{title}</Link> : title}</h2>
      {action ?? (href && <Link href={href} className="text-[11px] uppercase tracking-wider text-faint hover:text-fg">More</Link>)}
    </div>
  );
}

export function EmptyState({ title, body, action, icon = "sparkle" }: { title: string; body: string; action?: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 border border-dashed border-line rounded-lg">
      <div className="mb-4 rounded-full bg-elev-2 p-3 text-accent"><Icon name={icon} size={20} /></div>
      <h3 className="display text-2xl mb-1.5">{title}</h3>
      <p className="text-sm text-muted max-w-sm mb-5">{body}</p>
      {action}
    </div>
  );
}

export function ExplicitBadge() {
  return <span title="Explicit" className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-[2px] bg-muted/30 text-[9px] font-bold text-fg/80 shrink-0">E</span>;
}
