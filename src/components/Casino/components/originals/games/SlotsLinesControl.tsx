import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import GameTargetSummary from './GameTargetSummary'
import TargetSliderControl from './TargetSliderControl'

interface SlotsLinesControlProps {
  gameSlug: 'tome-of-life' | 'slots-scarab'
  options: OriginalsWorkbenchOptions
  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

export default function SlotsLinesControl({ gameSlug, options, onPatch, readOnly }: SlotsLinesControlProps) {
  const lines = options.lines ?? 1
  const api = gameSlug === 'tome-of-life' ? 'slotsTomeOfLifeBet(lines)' : 'REST slots/bet(lines)'

  return (
    <>
      <GameTargetSummary gameSlug={gameSlug} options={options} gameOnly />
      <p className="originals-target-slider-hint">{api}</p>
      <TargetSliderControl
        label="Paylines"
        value={lines}
        min={1}
        max={20}
        step={1}
        readOnly={readOnly}
        prominent
        onChange={(n) => onPatch({ lines: n || 1 })}
      />
    </>
  )
}
