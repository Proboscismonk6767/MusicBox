"use client";

import { useId, useState } from "react";

// Half-star rating input. Click a star's left/right half; click the current
// value again to clear. Arrow keys adjust by ½.

export function StarInput({ value, onChange, size = 28, label = "Rating" }: { value?: number | null; onChange: (v: number | null) => void; size?: number; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const set = (v: number) => onChange(v === value ? null : v);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-valuenow={value ?? 0}
      aria-valuetext={value ? `${value} stars` : "Not rated"}
      className="inline-flex items-center gap-0.5 rounded outline-none"
      onMouseLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (value ?? 0) + 0.5)); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); const v = (value ?? 0) - 0.5; onChange(v >= 0.5 ? v : null); }
        if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") onChange(null);
        if (/^[1-5]$/.test(e.key)) onChange(Number(e.key));
      }}
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = shown >= i ? 1 : shown >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className="relative cursor-pointer" style={{ width: size, height: size }}>
            <StarShape size={size} fill={fill} active={hover != null} />
            <button type="button" tabIndex={-1} aria-label={`${i - 0.5} stars`} className="absolute inset-y-0 left-0 w-1/2 cursor-pointer" onMouseEnter={() => setHover(i - 0.5)} onClick={() => set(i - 0.5)} />
            <button type="button" tabIndex={-1} aria-label={`${i} stars`} className="absolute inset-y-0 right-0 w-1/2 cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => set(i)} />
          </span>
        );
      })}
    </div>
  );
}

function StarShape({ size, fill, active }: { size: number; fill: number; active: boolean }) {
  const id = "st" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="pointer-events-none transition-transform duration-150" style={{ transform: fill && active ? "scale(1.06)" : undefined }}>
      <defs>
        <linearGradient id={id}>
          <stop offset={fill === 0.5 ? "50%" : fill ? "100%" : "0%"} stopColor="var(--color-accent)" />
          <stop offset={fill === 0.5 ? "50%" : fill ? "100%" : "0%"} stopColor="#2e2e34" />
        </linearGradient>
      </defs>
      <path d="m12 2.6 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.1l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill={`url(#${id})`} style={{ transition: "fill 180ms ease" }} />
    </svg>
  );
}
