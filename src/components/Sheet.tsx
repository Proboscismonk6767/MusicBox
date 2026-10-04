"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./ui";

/** Modal on desktop, bottom sheet on mobile. */
export function Sheet({ title, onClose, children, width = "max-w-lg" }: { title: string; onClose: () => void; children: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("[data-autofocus], textarea, input, button")?.focus();
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] animate-[fade-up_150ms_ease-out]" onClick={onClose} />
      <div ref={ref} className={`relative w-full ${width} max-h-[92dvh] overflow-y-auto bg-elev border border-line rounded-t-2xl md:rounded-xl shadow-2xl shadow-black/70 animate-fade-up`}>
        <div className="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="section-title">{title}</h2>
          <button onClick={onClose} className="btn-ghost h-8 w-8 px-0 -mr-2" aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
