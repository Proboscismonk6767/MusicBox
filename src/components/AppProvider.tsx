"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SongCard, UserMini, ViewerSongState } from "@/lib/views";
import { LogModal, type LogTarget } from "./LogModal";
import { AddToListModal } from "./AddToListModal";
import { Icon } from "./ui";

export interface ViewerList {
  id: string;
  title: string;
  count: number;
  songIds: string[];
}

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error";
  action?: { label: string; href: string };
}

interface AppCtx {
  viewer: UserMini | null;
  lists: ViewerList[];
  toast: (message: string, tone?: "ok" | "error", action?: Toast["action"]) => void;
  openLog: (target: LogTarget) => void;
  openAddToList: (song: SongCard) => void;
  requireAuth: () => boolean;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export function AppProvider({ viewer, lists, children }: { viewer: UserMini | null; lists: ViewerList[]; children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [listSong, setListSong] = useState<SongCard | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const n = useRef(0);

  const toast = useCallback<AppCtx["toast"]>((message, tone = "ok", action) => {
    const id = ++n.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 5000 : 2600);
  }, []);

  const requireAuth = useCallback(() => {
    if (viewer) return true;
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
    return false;
  }, [viewer, router, pathname]);

  const openLog = useCallback((t: LogTarget) => requireAuth() && setLogTarget(t), [requireAuth]);
  const openAddToList = useCallback((s: SongCard) => requireAuth() && setListSong(s), [requireAuth]);

  // Global shortcut: "/" focuses search.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(el.tagName) && !el.isContentEditable) {
        const input = document.getElementById("global-search") as HTMLInputElement | null;
        if (input) { e.preventDefault(); input.focus(); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <Ctx.Provider value={{ viewer, lists, toast, openLog, openAddToList, requireAuth }}>
      {children}
      {logTarget && <LogModal target={logTarget} onClose={() => setLogTarget(null)} />}
      {listSong && <AddToListModal song={listSong} onClose={() => setListSong(null)} />}
      <div className="fixed z-[70] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto animate-fade-up flex items-center gap-3 rounded-full pl-3 pr-4 py-2 text-sm shadow-2xl shadow-black/60 border ${t.tone === "error" ? "bg-[#2a1416] border-danger/40 text-[#ffd0d0]" : "bg-[#1f1f23] border-line text-fg"}`}>
            <Icon name={t.tone === "error" ? "x" : "check"} size={15} className={t.tone === "error" ? "text-danger" : "text-accent"} strokeWidth={2.4} />
            <span>{t.message}</span>
            {t.action && <a href={t.action.href} className="font-semibold text-accent hover:underline">{t.action.label}</a>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export type { LogTarget, ViewerSongState };
