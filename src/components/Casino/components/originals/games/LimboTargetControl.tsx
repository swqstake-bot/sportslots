import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { clampMultiplier } from './targetMath'
import { fieldInputCls } from './gamePanelFields'
import GameTargetSummary from './GameTargetSummary'

interface LimboTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

/** Limbo API: multiplierTarget — exact multiplier input (no continuous slider). */
export default function LimboTargetControl({ options, onPatch, readOnly }: LimboTargetControlProps) {
  const mult = clampMultiplier(options.targetMultiplier ?? 2)

  return (
    <div className="originals-limbo-target">
      <GameTargetSummary gameSlug="limbo" options={options} gameOnly />

      <label className="originals-field">
        <span className="originals-field-label">Target multiplier (API: multiplierTarget)</span>
        <input
          type="number"
          min={1.01}
          max={9900}
          step={0.01}
          disabled={readOnly}
          className={fieldInputCls}
          value={mult}
          onChange={(e) => onPatch({ targetMultiplier: clampMultiplier(Number(e.target.value) || 2) })}
        />
      </label>
    </div>
  )
}
