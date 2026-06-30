import TargetSliderControl from './TargetSliderControl'
import GameTargetSummary from './GameTargetSummary'
import { SegToggle } from './gamePanelFields'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

interface WheelTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

const RISK_OPTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export default function WheelTargetControl({ options, onPatch, readOnly }: WheelTargetControlProps) {
  const segments = Math.min(50, Math.max(1, options.segments ?? 10))
  const risk = options.risk ?? 'low'

  return (
    <div className="originals-wheel-target">
      <GameTargetSummary gameSlug="wheel" options={options} gameOnly />

      <TargetSliderControl
        label="Wheel segments"
        value={segments}
        onChange={(n) => onPatch({ segments: Math.min(50, Math.max(1, Math.round(n) || 10)) })}
        min={1}
        max={50}
        step={1}
        readOnly={readOnly}
        prominent={false}
      />

      <SegToggle
        label="Risk"
        value={risk}
        readOnly={readOnly}
        options={RISK_OPTS}
        onChange={(v) => onPatch({ risk: v as OriginalsWorkbenchOptions['risk'] })}
      />
    </div>
  )
}
