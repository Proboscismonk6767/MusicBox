export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="flex gap-6">
        <div className="skeleton w-44 h-44 shrink-0" />
        <div className="flex-1 space-y-3 pt-8"><div className="skeleton h-3 w-24" /><div className="skeleton h-10 w-2/3" /><div className="skeleton h-4 w-1/3" /></div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton aspect-square" />)}</div>
    </div>
  );
}
