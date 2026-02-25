/** Shimmer skeleton for bets table loading state (Stake design) */
const ROW_HEIGHT = 76;
const TABLE_GRID_COLS = '40px 130px minmax(160px,1fr) 56px 64px 80px 88px 88px 80px 100px';

export function BetTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-stake-bg-deep">
      <div
        className="grid bg-stake-bg-card text-xs font-bold text-stake-text-muted uppercase tracking-wider border-b border-stake-border shrink-0 animate-pulse"
        style={{ gridTemplateColumns: TABLE_GRID_COLS }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="p-3 border-r border-stake-border/50 last:border-r-0">
            <div className="h-3 bg-stake-border/50 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="grid border-b border-stake-border/30 gap-2 items-center px-3"
            style={{ height: ROW_HEIGHT, gridTemplateColumns: TABLE_GRID_COLS }}
          >
            <div className="h-4 w-4 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-3 w-20 rounded bg-stake-border/50 animate-pulse" />
            <div className="flex flex-col gap-1">
              <div className="h-3 w-full max-w-[180px] rounded bg-stake-border/50 animate-pulse" />
              <div className="h-2.5 w-24 rounded bg-stake-border/40 animate-pulse" />
            </div>
            <div className="h-3 w-8 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-3 w-12 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-3 w-14 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-3 w-16 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-3 w-16 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-5 w-14 rounded bg-stake-border/50 animate-pulse" />
            <div className="h-8 w-20 rounded bg-stake-border/50 animate-pulse justify-self-end" />
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center px-4 py-3 border-t border-stake-border bg-stake-bg-card text-xs text-stake-text-muted">
        <div className="h-3 w-24 rounded bg-stake-border/50 animate-pulse" />
      </div>
    </div>
  );
}
