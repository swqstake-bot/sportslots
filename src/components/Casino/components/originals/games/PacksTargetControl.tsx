import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import GameTargetSummary from './GameTargetSummary'
import { DifficultyField, TextField } from './gamePanelFields'

interface PacksTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

export default function PacksTargetControl({ options, onPatch, readOnly }: PacksTargetControlProps) {
  const hasId = !!options.casesIdentifier?.trim()

  return (
    <>
      <GameTargetSummary gameSlug="packs" options={options} gameOnly />
      <TextField
        label="Pack identifier"
        placeholder="empty = REST packs/bet"
        readOnly={readOnly}
        value={options.casesIdentifier ?? ''}
        onChange={(v) => onPatch({ casesIdentifier: v })}
      />
      <DifficultyField
        value={options.difficulty ?? 'medium'}
        readOnly={readOnly}
        onChange={(d) => onPatch({ difficulty: d as OriginalsWorkbenchOptions['difficulty'] })}
      />
      <p className="originals-target-slider-hint">
        {hasId ? 'Uses GraphQL casesBet(identifier, difficulty)' : 'Uses REST /packs/bet'}
      </p>
    </>
  )
}
