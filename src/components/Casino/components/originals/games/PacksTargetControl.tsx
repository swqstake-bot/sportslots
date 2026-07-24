import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import GameTargetSummary from './GameTargetSummary'
import { TextField } from './gamePanelFields'

interface PacksTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

export default function PacksTargetControl({ options, onPatch, readOnly }: PacksTargetControlProps) {
  return (
    <>
      <GameTargetSummary gameSlug="packs" options={options} gameOnly />
      <TextField
        label="Pack identifier"
        placeholder="empty = auto"
        readOnly={readOnly}
        value={options.casesIdentifier ?? ''}
        onChange={(v) => onPatch({ casesIdentifier: v })}
      />
      <p className="originals-target-slider-hint">
        Packs has no difficulty — amount + currency only (optional identifier).
      </p>
    </>
  )
}
