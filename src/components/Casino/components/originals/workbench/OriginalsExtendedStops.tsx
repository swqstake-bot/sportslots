import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

interface OriginalsExtendedStopsProps {
  options: OriginalsWorkbenchOptions
  patch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  disabled?: boolean
  inputCls: string
  showDiceRoll?: boolean
}

function ToggleNum({
  label,
  enabled,
  value,
  onEnabled,
  onValue,
  disabled,
  inputCls,
  step = 'any',
  suffix,
}: {
  label: string
  enabled: boolean
  value: number
  onEnabled: (v: boolean) => void
  onValue: (v: number) => void
  disabled?: boolean
  inputCls: string
  step?: string
  suffix?: string
}) {
  return (
    <div className="originals-stop-row">
      <label className="flex items-center gap-2 cursor-pointer shrink-0">
        <input
          type="checkbox"
          disabled={disabled}
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        <span className="text-xs text-[var(--text)]">{label}</span>
      </label>
      <input
        type="number"
        min="0"
        step={step}
        disabled={disabled || !enabled}
        className={inputCls}
        value={value}
        onChange={(e) => onValue(Number(e.target.value) || 0)}
      />
      {suffix && <span className="text-xs text-[var(--text-muted)]">{suffix}</span>}
    </div>
  )
}

export default function OriginalsExtendedStops({
  options: o,
  patch,
  disabled,
  inputCls,
  showDiceRoll,
}: OriginalsExtendedStopsProps) {
  return (
    <div className="originals-extended-stops space-y-2">
      <ToggleNum
        label="Total wagered ($)"
        enabled={!!(o.stopOnTotalWagered && o.stopOnTotalWagered > 0) || !!o.stopOnWagerAbove}
        value={o.stopOnTotalWagered ?? o.stopOnWagerAbove ?? 0}
        onEnabled={(v) => patch({ stopOnTotalWagered: v ? o.stopOnTotalWagered || 100 : 0, stopOnWagerAbove: v ? o.stopOnWagerAbove || 100 : 0 })}
        onValue={(v) => patch({ stopOnTotalWagered: v, stopOnWagerAbove: v })}
        disabled={disabled}
        inputCls={inputCls}
      />
      <ToggleNum
        label="Drawdown from peak ($)"
        enabled={(o.stopOnDrawdown ?? 0) > 0}
        value={o.stopOnDrawdown ?? 0}
        onEnabled={(v) => patch({ stopOnDrawdown: v ? o.stopOnDrawdown || 10 : 0 })}
        onValue={(v) => patch({ stopOnDrawdown: v })}
        disabled={disabled}
        inputCls={inputCls}
      />
      <ToggleNum
        label="Win streak"
        enabled={!!o.isStopOnWinStreak}
        value={o.stopOnWinStreak ?? 0}
        onEnabled={(v) => patch({ isStopOnWinStreak: v, stopOnWinStreak: v ? o.stopOnWinStreak || 5 : 0 })}
        onValue={(v) => patch({ stopOnWinStreak: v })}
        disabled={disabled}
        inputCls={inputCls}
      />
      <ToggleNum
        label="Loss streak"
        enabled={!!o.isStopOnLossStreak}
        value={o.stopOnLossStreak ?? 0}
        onEnabled={(v) => patch({ isStopOnLossStreak: v, stopOnLossStreak: v ? o.stopOnLossStreak || 5 : 0 })}
        onValue={(v) => patch({ stopOnLossStreak: v })}
        disabled={disabled}
        inputCls={inputCls}
      />
      <ToggleNum
        label="Stop session at B2B streak"
        enabled={!!o.isStopOnB2bStreak}
        value={o.stopOnB2bStreak ?? 0}
        onEnabled={(v) => patch({ isStopOnB2bStreak: v, stopOnB2bStreak: v ? o.stopOnB2bStreak || 3 : 0 })}
        onValue={(v) => patch({ stopOnB2bStreak: v })}
        disabled={disabled}
        inputCls={inputCls}
      />
      <ToggleNum
        label="Multiplier ≥"
        enabled={!!o.isStopOnMultiplier}
        value={o.stopOnMultiplier ?? 0}
        onEnabled={(v) => patch({ isStopOnMultiplier: v, stopOnMultiplier: v ? o.stopOnMultiplier || 100 : 0 })}
        onValue={(v) => patch({ stopOnMultiplier: v })}
        disabled={disabled}
        inputCls={inputCls}
        suffix="×"
      />
      <ToggleNum
        label="B2B product sum ≥"
        enabled={!!o.isStopOnB2bMultiplierSum}
        value={o.stopOnB2bMultiplierSum ?? 0}
        onEnabled={(v) =>
          patch({ isStopOnB2bMultiplierSum: v, stopOnB2bMultiplierSum: v ? o.stopOnB2bMultiplierSum || 10 : 0 })
        }
        onValue={(v) => patch({ stopOnB2bMultiplierSum: v })}
        disabled={disabled}
        inputCls={inputCls}
        suffix="×"
      />
      {showDiceRoll && (
        <ToggleNum
          label="Exact dice roll"
          enabled={!!o.isStopOnExactRoll}
          value={o.stopOnExactRoll ?? 0}
          onEnabled={(v) => patch({ isStopOnExactRoll: v, stopOnExactRoll: v ? o.stopOnExactRoll || 50 : 0 })}
          onValue={(v) => patch({ stopOnExactRoll: v })}
          disabled={disabled}
          inputCls={inputCls}
        />
      )}
      <ToggleNum
        label="RTP above"
        enabled={!!o.isStopOnRTPAbove}
        value={o.stopOnRTPAbove ?? 0}
        onEnabled={(v) => patch({ isStopOnRTPAbove: v, stopOnRTPAbove: v ? o.stopOnRTPAbove || 100 : 0 })}
        onValue={(v) => patch({ stopOnRTPAbove: v })}
        disabled={disabled}
        inputCls={inputCls}
        suffix="%"
      />
      <ToggleNum
        label="RTP below"
        enabled={!!o.isStopOnRTPBelow}
        value={o.stopOnRTPBelow ?? 0}
        onEnabled={(v) => patch({ isStopOnRTPBelow: v, stopOnRTPBelow: v ? o.stopOnRTPBelow || 90 : 0 })}
        onValue={(v) => patch({ stopOnRTPBelow: v })}
        disabled={disabled}
        inputCls={inputCls}
        suffix="%"
      />

      <div className="originals-stop-subsection">
        <span className="originals-section-title">Bet ID stops</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!o.isStopIfBetIdContains}
            onChange={(e) => patch({ isStopIfBetIdContains: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs">ID contains</span>
        </label>
        {o.isStopIfBetIdContains && (
          <input
            type="text"
            disabled={disabled}
            className={inputCls}
            placeholder="substring"
            value={o.stopIfBetIdContains ?? ''}
            onChange={(e) => patch({ stopIfBetIdContains: e.target.value })}
          />
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!o.isStopIfBetIdEndsOn}
            onChange={(e) => patch({ isStopIfBetIdEndsOn: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs">ID ends with</span>
        </label>
        {o.isStopIfBetIdEndsOn && (
          <input
            type="text"
            disabled={disabled}
            className={inputCls}
            value={o.stopIfBetIdEndsOn ?? ''}
            onChange={(e) => patch({ stopIfBetIdEndsOn: e.target.value })}
          />
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!o.isStopIfBetIdIs}
            onChange={(e) => patch({ isStopIfBetIdIs: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs">ID parity</span>
        </label>
        {o.isStopIfBetIdIs && (
          <select
            disabled={disabled}
            className={inputCls}
            value={o.stopIfBetIdIs ?? 'even'}
            onChange={(e) => patch({ stopIfBetIdIs: e.target.value as 'even' | 'odd' })}
          >
            <option value="even">Even</option>
            <option value="odd">Odd</option>
          </select>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!o.isStopIfLast3BetIdDigitsContain}
            onChange={(e) => patch({ isStopIfLast3BetIdDigitsContain: e.target.checked })}
            className="accent-[var(--accent)]"
          />
          <span className="text-xs">Last 3 digits contain</span>
        </label>
        {o.isStopIfLast3BetIdDigitsContain && (
          <input
            type="text"
            disabled={disabled}
            className={inputCls}
            placeholder="e.g. 7"
            value={o.stopIfLast3BetIdDigitsContain ?? ''}
            onChange={(e) => patch({ stopIfLast3BetIdDigitsContain: e.target.value })}
          />
        )}
      </div>
    </div>
  )
}
