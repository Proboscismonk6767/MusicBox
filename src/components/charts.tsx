import { monthShort } from "@/lib/format";

export function BarList({ items, unit = "" }: { items: { label: React.ReactNode; value: number; key: string }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center text-sm">
          <div className="relative h-7 flex items-center px-2.5 rounded-sm overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-accent/15 border-r-2 border-accent/60" style={{ width: `${(it.value / max) * 100}%` }} />
            <span className="relative truncate">{it.label}</span>
          </div>
          <span className="tabular-nums text-muted text-xs">{Number.isInteger(it.value) ? it.value : it.value.toFixed(2)}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

export function Columns({ data, labels, height = 120 }: { data: number[]; labels: string[]; height?: number }) {
  const max = Math.max(1, ...data);
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((n, i) => (
          <div key={i} className="group relative flex-1 h-full flex items-end" tabIndex={0} aria-label={`${labels[i]}: ${n}`}>
            <div className="w-full rounded-t-[2px] bg-[#3a3a42] group-hover:bg-accent group-focus:bg-accent transition-colors" style={{ height: `${Math.max(2, (n / max) * 100)}%` }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 rounded bg-fg px-1.5 py-0.5 text-[10px] font-medium text-bg opacity-0 group-hover:opacity-100 group-focus:opacity-100 whitespace-nowrap z-10">{n}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">{labels.map((l, i) => <div key={i} className="flex-1 text-center text-[10px] text-faint truncate">{l}</div>)}</div>
    </div>
  );
}

/** GitHub-style listening heatmap for one year. */
export function Heatmap({ year, data }: { year: number; data: Record<string, number> }) {
  const start = new Date(Date.UTC(year, 0, 1));
  const offset = start.getUTCDay();
  const days = (Date.UTC(year + 1, 0, 1) - start.getTime()) / 864e5;
  const max = Math.max(1, ...Object.values(data));
  const cells: { date: string; n: number; col: number; row: number }[] = [];
  for (let d = 0; d < days; d++) {
    const dt = new Date(start.getTime() + d * 864e5);
    const iso = dt.toISOString().slice(0, 10);
    cells.push({ date: iso, n: data[iso] ?? 0, col: Math.floor((d + offset) / 7), row: (d + offset) % 7 });
  }
  const cols = Math.ceil((days + offset) / 7);
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const colors = ["#1c1c20", "#4a3a17", "#7a5c1c", "#b8862c", "#f2b544"];
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${cols * 12 + 2} ${7 * 12 + 16}`} className="w-full min-w-[640px]" role="img" aria-label={`Listening calendar for ${year}`}>
        {Array.from({ length: 12 }).map((_, m) => {
          const d = (Date.UTC(year, m, 1) - start.getTime()) / 864e5;
          return <text key={m} x={Math.floor((d + offset) / 7) * 12} y={8} fontSize="7" fill="#66666c">{monthShort(m)}</text>;
        })}
        {cells.map((c) => (
          <rect key={c.date} x={c.col * 12} y={c.row * 12 + 14} width="10" height="10" rx="2" fill={colors[level(c.n)]}>
            <title>{`${c.date}: ${c.n} ${c.n === 1 ? "song" : "songs"}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

export function BigStat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="text-3xl md:text-4xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted mt-1">{label}</div>
      {sub && <div className="text-xs text-faint mt-0.5">{sub}</div>}
    </div>
  );
}
