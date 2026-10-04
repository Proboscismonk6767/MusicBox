"use client";

import { usePathname, useRouter } from "next/navigation";
import type { DiaryFilters } from "@/lib/server/queries";
import { MONTH_NAMES } from "@/lib/format";
import { Icon } from "@/components/ui";

export function DiaryFilterBar({ filters, years, artists, genres, tags }: { filters: DiaryFilters; years: string[]; artists: [string, string][]; genres: string[]; tags: string[] }) {
  const router = useRouter();
  const path = usePathname();
  const set = (k: keyof DiaryFilters, v: string | undefined) => {
    const next = new URLSearchParams(Object.entries({ ...filters, [k]: v }).filter(([, x]) => x) as [string, string][]);
    router.push(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const sel = "h-8 rounded-md bg-elev border border-line px-2 text-xs text-fg outline-none focus:border-accent/70 cursor-pointer max-w-[160px]";
  const active = Object.values(filters).some(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <select aria-label="Year" className={sel} value={filters.year ?? ""} onChange={(e) => set("year", e.target.value || undefined)}>
        <option value="">All years</option>
        {years.map((y) => <option key={y}>{y}</option>)}
      </select>
      <select aria-label="Month" className={sel} value={filters.month ?? ""} onChange={(e) => set("month", e.target.value || undefined)}>
        <option value="">Any month</option>
        {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
      </select>
      <select aria-label="Artist" className={sel} value={filters.artist ?? ""} onChange={(e) => set("artist", e.target.value || undefined)}>
        <option value="">All artists</option>
        {artists.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
      </select>
      <select aria-label="Genre" className={sel} value={filters.genre ?? ""} onChange={(e) => set("genre", e.target.value || undefined)}>
        <option value="">All genres</option>
        {genres.map((g) => <option key={g}>{g}</option>)}
      </select>
      <select aria-label="Rating" className={sel} value={filters.rating ?? ""} onChange={(e) => set("rating", e.target.value || undefined)}>
        <option value="">Any rating</option>
        {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((r) => <option key={r} value={String(r)}>{r} ★</option>)}
      </select>
      {tags.length > 0 && (
        <select aria-label="Tag" className={sel} value={filters.tag ?? ""} onChange={(e) => set("tag", e.target.value || undefined)}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
        </select>
      )}
      <button onClick={() => set("relisten", filters.relisten === "1" ? undefined : "1")} className={`chip h-8 ${filters.relisten === "1" ? "chip-on" : ""}`}><Icon name="repeat" size={12} /> Relistens</button>
      <button onClick={() => set("liked", filters.liked === "1" ? undefined : "1")} className={`chip h-8 ${filters.liked === "1" ? "chip-on" : ""}`}><Icon name="heart" size={12} filled={filters.liked === "1"} /> Liked</button>
      {active && <button onClick={() => router.push(path)} className="text-xs text-muted hover:text-fg ml-1">Clear</button>}
    </div>
  );
}
