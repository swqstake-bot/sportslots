import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { clampLimboMultiplier, LIMBO_MAX_MULTIPLIER } from './targetMath'
import { fieldInputCls } from './gamePanelFields'
import GameTargetSummary from './GameTargetSummary'

interface LimboTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

/** Limbo API: multiplierTarget — exact multiplier input (no continuous slider). */
export default function LimboTargetControl({ options, onPatch, readOnly }: LimboTargetControlProps) {
  const mult = clampLimboMultiplier(options.targetMultiplier ?? 2)

  return (
    <div className="originals-limbo-target">
      <GameTargetSummary gameSlug="limbo" options={options} gameOnly />

      <label className="originals-field">
        <span className="originals-field-label">Target multiplier (1.01–{LIMBO_MAX_MULTIPLIER.toLocaleString('en-US')}×)</span>
        <input
          type="number"
          min={1.01}
          max={LIMBO_MAX_MULTIPLIER}
          step={0.01}
          disabled={readOnly}
          className={fieldInputCls}
          value={mult}
          onChange={(e) => onPatch({ targetMultiplier: clampLimboMultiplier(Number(e.target.value) || 2) })}
        />
      </label>
    </div>
  )
}
