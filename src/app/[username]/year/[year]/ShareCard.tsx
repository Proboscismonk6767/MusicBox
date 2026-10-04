"use client";

import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/ui";

export function ShareCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  const { toast } = useApp();
  const share = async () => {
    const url = window.location.href;
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "share_clicked" }), keepalive: true }).catch(() => {});
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); toast("Link copied — share your year."); }
    } catch { /* cancelled */ }
  };
  return (
    <div className={`group relative rounded-xl border border-line p-6 bg-[radial-gradient(ellipse_at_top_left,rgba(242,181,68,0.10),transparent_60%)] bg-elev ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted">{title}</span>
        <button onClick={share} className="md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 text-muted hover:text-fg transition-opacity" aria-label="Share"><Icon name="share" size={14} /></button>
      </div>
      {children}
      <div className="absolute bottom-3 right-4 text-[10px] text-faint tracking-wider">MUSICBOX</div>
    </div>
  );
}
