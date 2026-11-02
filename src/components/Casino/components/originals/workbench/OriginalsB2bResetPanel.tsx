import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import {
  DEFAULT_PAROLI_WINS,
  DEFAULT_UNIT_PCT,
  STRATEGY_PRESET_OPTIONS,
  isStrategyPresetId,
  type StrategyPresetId,
} from '../engine/betProgression'

interface OriginalsB2bResetPanelProps {
  options: OriginalsWorkbenchOptions
  patch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  disabled?: boolean
  inputCls: string
  /** Profile sidebar: single column grids */
  compact?: boolean
}

export function OriginalsWinLossFields({
  options: o,
  patch,
  disabled,
  inputCls,
}: OriginalsB2bResetPanelProps) {
  const preset: StrategyPresetId = isStrategyPresetId(o.strategyPreset) ? o.strategyPreset : 'custom'
  const presetActive = preset !== 'custom'
  const presetHint = STRATEGY_PRESET_OPTIONS.find((x) => x.value === preset)?.hint
  const selectPreset = (next: StrategyPresetId) => {
    if (next === 'custom') {
      patch({ strategyPreset: 'custom' })
      return
    }
    // A preset owns bet sizing: neutralise the manual rules so a leftover B2B / increase rule cannot interfere.
    patch({ strategyPreset: next, onWin: 'reset', onLoss: 'reset', increaseOnWin: 0, increaseOnLoss: 0 })
  }
  const showMaxSteps =
    preset === 'martingale' || preset === 'anti-martingale' || preset === 'dalembert' || preset === 'fibonacci'
  return (
    <section className="originals-options-section">
      <h4 className="originals-section-title">On win / loss</h4>
      <label className="block min-w-0 mb-2">
        <span className="text-xs text-[var(--text-muted)]">Strategy preset</span>
        <select
          disabled={disabled}
          className={inputCls}
          value={preset}
          onChange={(e) => selectPreset(e.target.value as StrategyPresetId)}
        >
          {STRATEGY_PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {presetHint && (
          <span className="block text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
            {presetHint}
            {presetActive ? ' Replaces the manual On win / On loss rules.' : ''}
          </span>
        )}
      </label>
      {presetActive && (preset === 'paroli' || preset === 'dalembert' || showMaxSteps) && (
        <div className="originals-b2b-field-grid mb-2">
          {preset === 'paroli' && (
            <label className="block min-w-0" title="Reset to base after this many consecutive wins">
              <span className="text-xs text-[var(--text-muted)]">Wins before reset</span>
              <input
                type="number"
                min="1"
                step="1"
                disabled={disabled}
                className={inputCls}
                value={o.strategyParoliWins ?? DEFAULT_PAROLI_WINS}
                onChange={(e) =>
                  patch({ strategyParoliWins: Math.max(1, Math.floor(Number(e.target.value)) || DEFAULT_PAROLI_WINS) })
                }
              />
            </label>
          )}
          {preset === 'dalembert' && (
            <label className="block min-w-0" title="One unit as % of the base bet (100 = base bet)">
              <span className="text-xs text-[var(--text-muted)]">Unit (% of base)</span>
              <input
                type="number"
                min="0.01"
                step="any"
                disabled={disabled}
                className={inputCls}
                value={o.strategyUnitPct ?? DEFAULT_UNIT_PCT}
                onChange={(e) => patch({ strategyUnitPct: Math.max(0.01, Number(e.target.value) || DEFAULT_UNIT_PCT) })}
              />
            </label>
          )}
          {showMaxSteps && (
            <label
              className="block min-w-0"
              title="Safety cap. Martingale / Anti-Martingale / Fibonacci reset to base, D'Alembert stops growing. 0 = off"
            >
              <span className="text-xs text-[var(--text-muted)]">Max steps (0 = off)</span>
              <input
                type="number"
                min="0"
                step="1"
                disabled={disabled}
                className={inputCls}
                value={o.strategyMaxSteps ?? 0}
                onChange={(e) => patch({ strategyMaxSteps: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
              />
            </label>
          )}
        </div>
      )}
      <div className="originals-b2b-field-grid">
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">On win</span>
          <select
            disabled={disabled || presetActive}
            className={inputCls}
            value={o.onWin ?? 'reset'}
            onChange={(e) => patch({ onWin: e.target.value as OriginalsWorkbenchOptions['onWin'] })}
          >
            <option value="reset">Reset</option>
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
            <option value="martingale">Martingale</option>
            <option value="b2b">B2B (reinvest)</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">On loss</span>
          <select
            disabled={disabled || presetActive}
            className={inputCls}
            value={o.onLoss ?? 'reset'}
            onChange={(e) => patch({ onLoss: e.target.value as OriginalsWorkbenchOptions['onLoss'] })}
          >
            <option value="reset">Reset</option>
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
            <option value="martingale">Martingale</option>
            <option value="none">None</option>
          </select>
        </label>
        {(o.onWin === 'increase' || o.onLoss === 'increase' || o.onWin === 'decrease' || o.onLoss === 'decrease') && (
          <>
            {(o.onWin === 'increase' || o.onWin === 'decrease') && (
              <label className="block min-w-0">
                <span className="text-xs text-[var(--text-muted)]">
                  {o.onWin === 'decrease' ? 'Win −%' : 'Win +%'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={disabled}
                  className={inputCls}
                  value={o.increaseOnWin ?? 0}
                  onChange={(e) => patch({ increaseOnWin: Number(e.target.value) || 0 })}
                />
              </label>
            )}
            {(o.onLoss === 'increase' || o.onLoss === 'decrease') && (
              <label className="block min-w-0">
                <span className="text-xs text-[var(--text-muted)]">
                  {o.onLoss === 'decrease' ? 'Loss −%' : 'Loss +%'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  disabled={disabled}
                  className={inputCls}
                  value={o.increaseOnLoss ?? 0}
                  onChange={(e) => patch({ increaseOnLoss: Number(e.target.value) || 0 })}
                />
              </label>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** B2B reset / take profit — resets bet size to base (not session stop). */
export default function OriginalsB2bResetPanel({
  options: o,
  patch,
  disabled,
  inputCls,
  compact,
}: OriginalsB2bResetPanelProps) {
  if ((o.onWin ?? 'reset') !== 'b2b') return null

  return (
    <section className="originals-options-section">
      <h4 className="originals-section-title">B2B reset (take profit)</h4>
      <p className="text-[10px] text-[var(--text-muted)] mb-2 leading-relaxed">
        Resets bet size to base when a rule matches (OR). Profit stays — unlike &quot;Stop at B2B streak&quot; in
        Conditions, which ends the session.
      </p>

      <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wide">
        Reset bet size
      </p>
      <div className={`originals-b2b-field-grid${compact ? ' originals-b2b-field-grid--compact' : ''}`}>
        <label className="block min-w-0" title="After N wins in the B2B chain → reset bet to base">
          <span className="text-xs text-[var(--text-muted)]">After B2B wins (0=off)</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bTakeProfitAfterWins ?? 0}
            onChange={(e) => patch({ b2bTakeProfitAfterWins: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0" title="Next stake ≥ chain start × multiplier">
          <span className="text-xs text-[var(--text-muted)]">At chain multiplier</span>
          <input
            type="number"
            min="0"
            step="0.1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bTakeProfitAtChainMultiplier ?? 0}
            onChange={(e) => patch({ b2bTakeProfitAtChainMultiplier: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Chain profit % of base</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bTakeProfitChainProfitPct ?? 0}
            onChange={(e) => patch({ b2bTakeProfitChainProfitPct: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Chain profit ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            className={inputCls}
            value={o.b2bTakeProfitChainProfitUsd ?? 0}
            onChange={(e) => patch({ b2bTakeProfitChainProfitUsd: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1 mt-3 uppercase tracking-wide">
        Smart take profit
      </p>
      <p className="text-[10px] text-[var(--text-muted)] mb-2 leading-relaxed">
        Peel % secured; remainder stays in B2B chain (no full reset to base).
      </p>
      <div className={`originals-b2b-field-grid${compact ? ' originals-b2b-field-grid--compact' : ''}`}>
        <label className="block min-w-0" title="Stake ÷ base ≥ X (2 = 200%)">
          <span className="text-xs text-[var(--text-muted)]">Smart TP at × base</span>
          <input
            type="number"
            min="0"
            step="0.1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bSmartTakeProfitAtMulti ?? 0}
            onChange={(e) => patch({ b2bSmartTakeProfitAtMulti: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Smart TP chain profit ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            className={inputCls}
            value={o.b2bSmartTakeProfitAtChainProfitUsd ?? 0}
            onChange={(e) => patch({ b2bSmartTakeProfitAtChainProfitUsd: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0" title="200 = chain profit ≥ 200% of base">
          <span className="text-xs text-[var(--text-muted)]">Smart TP chain % base</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bSmartTakeProfitAtChainProfitPctOfBase ?? 0}
            onChange={(e) => patch({ b2bSmartTakeProfitAtChainProfitPctOfBase: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Smart TP peel %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bSmartTakeProfitPeelPct ?? 0}
            onChange={(e) => patch({ b2bSmartTakeProfitPeelPct: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Escalate base every N TPs</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bEscalateBaseEveryTakeProfits ?? 0}
            onChange={(e) => patch({ b2bEscalateBaseEveryTakeProfits: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Escalate base +%</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.b2bEscalateBasePct ?? 0}
            onChange={(e) => patch({ b2bEscalateBasePct: Number(e.target.value) || 0 })}
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-[var(--text-muted)]">Max base bet ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            className={inputCls}
            value={o.b2bMaxBaseBetUsd ?? 0}
            onChange={(e) => patch({ b2bMaxBaseBetUsd: Number(e.target.value) || 0 })}
          />
        </label>
      </div>
      <label className="originals-settings-check mt-2">
        <input
          type="checkbox"
          checked={!!o.b2bRotateSeedOnTakeProfit}
          disabled={disabled}
          onChange={(e) => patch({ b2bRotateSeedOnTakeProfit: e.target.checked })}
          className="accent-[var(--accent)]"
        />
        <span>Rotate seed on take profit</span>
      </label>
    </section>
  )
}
