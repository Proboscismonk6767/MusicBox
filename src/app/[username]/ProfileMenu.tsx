"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";

export function ProfileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn-ghost h-7 w-7 px-0" aria-label="More options" aria-expanded={open}><Icon name="more" size={16} /></button>
      {open && <div className="absolute left-0 top-full mt-1 z-30 w-44 card p-1 shadow-xl shadow-black/60 animate-fade-up">{children}</div>}
    </div>
  );
}
