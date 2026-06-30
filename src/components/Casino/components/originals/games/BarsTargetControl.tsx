import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import BarsTileGrid from './BarsTileGrid'
import GameTargetSummary from './GameTargetSummary'
import { SelectField } from './gamePanelFields'
import PayoutMultiBadge from './payoutTables/PayoutMultiBadge'
import { barsPayoutMulti } from './payoutTables/rhPayoutLookup'

interface BarsTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
}

const BARS_DIFF_OPTS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
]

export default function BarsTargetControl({ options, onPatch, readOnly }: BarsTargetControlProps) {
  const difficulty = options.difficulty ?? 'easy'
  const tiles = options.tiles ?? []
  const barCount = tiles.length > 0 ? Math.min(5, tiles.length) : 0
  const payoutMulti = barCount > 0 ? barsPayoutMulti(difficulty, barCount) : null

  return (
    <>
      <GameTargetSummary gameSlug="bars" options={options} gameOnly />
      <SelectField
        label="Difficulty"
        value={difficulty}
        readOnly={readOnly}
        onChange={(d) => onPatch({ difficulty: d as OriginalsWorkbenchOptions['difficulty'] })}
        options={BARS_DIFF_OPTS}
      />
      <PayoutMultiBadge
        multi={payoutMulti}
        label={barCount > 0 ? 'Cashout at' : 'Payout'}
        hint={barCount > 0 ? `${barCount} bar${barCount !== 1 ? 's' : ''} revealed` : 'Pick tiles to see payout'}
      />
      <BarsTileGrid selected={tiles} readOnly={readOnly} onChange={(t) => onPatch({ tiles: t })} />
    </>
  )
}
