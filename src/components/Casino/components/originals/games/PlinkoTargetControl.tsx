import { useMemo } from 'react'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import {
  findPlinkoConfigForTarget,
  PLINKO_ALL_TARGETS,
  plinkoMultipliersFor,
  type PlinkoRiskKey,
} from './plinkoMultipliers'
import TargetSliderControl from './TargetSliderControl'
import GameTargetSummary from './GameTargetSummary'
import { SegToggle, fieldInputCls } from './gamePanelFields'

interface PlinkoTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

export default function PlinkoTargetControl({ options, onPatch, readOnly }: PlinkoTargetControlProps) {
  const rows = Math.min(16, Math.max(8, options.rows ?? 16))
  const risk = (options.plinkoRisk ?? 'low') as PlinkoRiskKey
  const plinkoTarget = options.plinkoTarget ?? options.stopOnMultiplier ?? 2

  const available = useMemo(() => plinkoMultipliersFor(rows, risk), [rows, risk])

  const pickTarget = (target: number) => {
    const cfg = findPlinkoConfigForTarget(target)
    const patch: Partial<OriginalsWorkbenchOptions> = {
      plinkoTarget: target,
      stopOnMultiplier: target,
      isStopOnMultiplier: true,
    }
    if (cfg) {
      patch.rows = cfg.rows
      patch.plinkoRisk = cfg.risk
    }
    onPatch(patch)
  }

  return (
    <div className="originals-plinko-target">
      <GameTargetSummary gameSlug="plinko" options={options} gameOnly />

      <label className="originals-field originals-field--full">
        <span className="originals-field-label">Select target multiplier</span>
        <select
          disabled={readOnly}
          className={fieldInputCls}
          value={String(plinkoTarget)}
          onChange={(e) => pickTarget(Number(e.target.value) || 2)}
        >
          {PLINKO_ALL_TARGETS.map((t) => (
            <option key={t} value={t}>
              {t}×
            </option>
          ))}
        </select>
      </label>

      <TargetSliderControl
        label="Board rows"
        value={rows}
        onChange={(n) => onPatch({ rows: Math.min(16, Math.max(8, Math.round(n) || 16)) })}
        min={8}
        max={16}
        step={1}
        readOnly={readOnly}
        prominent={false}
      />

      <SegToggle
        label="Risk"
        value={risk}
        readOnly={readOnly}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'expert', label: 'Expert' },
        ]}
        onChange={(v) => onPatch({ plinkoRisk: v as PlinkoRiskKey })}
      />

      {available.length > 0 && (
        <div className="originals-plinko-slots">
          <span className="originals-field-label">Slots this board</span>
          <div className="originals-plinko-slot-row">
            {available.map((m) => (
              <button
                key={m}
                type="button"
                disabled={readOnly}
                className={`originals-plinko-slot${m === plinkoTarget ? ' is-active' : ''}`}
                onClick={() => onPatch({ plinkoTarget: m, stopOnMultiplier: m })}
              >
                {m}×
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
