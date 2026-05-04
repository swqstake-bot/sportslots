/** Shimmer skeleton for bets table loading — uses app design tokens (no legacy Stake blue palette). */
const ROW_HEIGHT = 76;
const TABLE_GRID_COLS = '40px 130px minmax(160px,1fr) 56px 64px 80px 88px 88px 80px 100px';

const shimmer = {
  bar: {
    background: 'color-mix(in srgb, var(--app-border) 42%, transparent)',
  },
} as const;

export function BetTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(var(--app-accent-rgb), 0.05) 0%, transparent 40%), var(--app-bg-deep)',
      }}
    >
      <div
        className="grid text-xs font-bold uppercase tracking-wider border-b shrink-0 animate-pulse"
        style={{
          gridTemplateColumns: TABLE_GRID_COLS,
          background: 'color-mix(in srgb, var(--app-bg-card) 92%, transparent)',
          borderColor: 'var(--app-border)',
          color: 'var(--app-text-muted)',
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="p-3 border-r last:border-r-0"
            style={{ borderColor: 'color-mix(in srgb, var(--app-border) 55%, transparent)' }}
          >
            <div className="h-3 rounded animate-pulse" style={shimmer.bar} />
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="grid gap-2 items-center px-3 border-b"
            style={{
              height: ROW_HEIGHT,
              gridTemplateColumns: TABLE_GRID_COLS,
              borderColor: 'color-mix(in srgb, var(--app-border) 35%, transparent)',
            }}
          >
            <div className="h-4 w-4 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-3 w-20 rounded animate-pulse" style={shimmer.bar} />
            <div className="flex flex-col gap-1">
              <div className="h-3 w-full max-w-[180px] rounded animate-pulse" style={shimmer.bar} />
              <div className="h-2.5 w-24 rounded animate-pulse" style={shimmer.bar} />
            </div>
            <div className="h-3 w-8 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-3 w-12 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-3 w-14 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-3 w-16 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-3 w-16 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-5 w-14 rounded animate-pulse" style={shimmer.bar} />
            <div className="h-8 w-20 rounded animate-pulse justify-self-end" style={shimmer.bar} />
          </div>
        ))}
      </div>
      <div
        className="flex justify-between items-center px-4 py-3 border-t text-xs"
        style={{
          borderColor: 'var(--app-border)',
          background: 'color-mix(in srgb, var(--app-bg-card) 94%, transparent)',
          color: 'var(--app-text-muted)',
        }}
      >
        <div className="h-3 w-24 rounded animate-pulse" style={shimmer.bar} />
      </div>
    </div>
  );
}
