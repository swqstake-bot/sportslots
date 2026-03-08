interface AutoCashoutControlsProps {
  enabled: boolean;
  targetUsd: number;
  onEnabledChange: (v: boolean) => void;
  onTargetChange: (v: number) => void;
  selectedCount: number;
  onCashoutSelected: () => void;
}

export function AutoCashoutControls({
  enabled,
  targetUsd,
  onEnabledChange,
  onTargetChange,
  selectedCount,
  onCashoutSelected,
}: AutoCashoutControlsProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-l border-r transition-all duration-300"
      style={{
        borderColor: 'var(--app-border)',
        ...(enabled ? { background: 'rgba(var(--app-accent-rgb), 0.06)', boxShadow: 'inset 0 0 20px rgba(var(--app-accent-rgb), 0.08)' } : {}),
      }}
    >
      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onCashoutSelected}
          className="text-xs font-bold px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
          style={{ background: 'var(--app-accent)', color: 'var(--app-bg-deep)', boxShadow: '0 0 10px var(--app-accent-glow)' }}
        >
          Cashout Selected ({selectedCount})
        </button>
      )}
      <div className="h-6 w-px mx-1" style={{ background: 'var(--app-border)' }} />
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <input
            type="checkbox"
            id="auto-cashout-toggle"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="peer sr-only"
          />
          <label
            htmlFor="auto-cashout-toggle"
            className="w-9 h-5 rounded-full cursor-pointer transition-colors relative"
            style={{ background: enabled ? 'var(--app-accent)' : 'var(--app-border)' }}
          >
            <div
              className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${enabled ? 'translate-x-4' : ''}`}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold"
            style={{ color: enabled ? 'var(--app-accent)' : 'var(--app-text-muted)' }}
          >
            AUTO CASHOUT ≥
          </span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
              $
            </span>
            <input
              type="number"
              min={0}
              className="bg-[var(--app-bg-card)] border text-xs pl-4 pr-2 py-1 rounded w-20 outline-none transition-all focus:ring-2 focus:ring-[var(--app-accent)]"
              style={{
                borderColor: enabled ? 'var(--app-accent)' : 'var(--app-border)',
                color: 'var(--app-text)',
              }}
              value={targetUsd}
              onChange={(e) => onTargetChange(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
