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
      className={`flex items-center gap-3 px-4 py-2 border-l border-r border-stake-border transition-all duration-300 ${
        enabled ? 'bg-stake-success/5 shadow-[inset_0_0_20px_rgba(0,231,1,0.1)]' : ''
      }`}
    >
      {selectedCount > 0 && (
        <button
          type="button"
          onClick={onCashoutSelected}
          className="bg-stake-success hover:bg-[#00c201] text-stake-bg-deep text-xs font-bold px-3 py-1.5 rounded shadow-[0_0_10px_rgba(0,231,1,0.4)]"
        >
          Cashout Selected ({selectedCount})
        </button>
      )}
      <div className="h-6 w-px bg-stake-border mx-1" />
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
            className={`w-9 h-5 rounded-full cursor-pointer transition-colors relative ${
              enabled ? 'bg-stake-success' : 'bg-stake-border'
            }`}
          >
            <div
              className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${enabled ? 'translate-x-4' : ''}`}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold ${enabled ? 'text-stake-success' : 'text-stake-text-muted'}`}
          >
            AUTO CASHOUT ≥
          </span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stake-text-muted text-xs">
              $
            </span>
            <input
              type="number"
              min={0}
              className={`bg-stake-bg-card border text-xs pl-4 pr-2 py-1 rounded w-20 outline-none transition-all ${
                enabled
                  ? 'border-stake-success text-stake-text'
                  : 'border-stake-border text-stake-text-muted focus:border-white focus:text-white'
              }`}
              value={targetUsd}
              onChange={(e) => onTargetChange(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
