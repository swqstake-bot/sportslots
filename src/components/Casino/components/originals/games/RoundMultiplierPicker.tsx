import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import { maxRoundsFor } from './roundMultiplierTables'

import TargetSliderControl from './TargetSliderControl'

import GameTargetSummary from './GameTargetSummary'

import { DifficultyField } from './gamePanelFields'

import PayoutMultiBadge from './payoutTables/PayoutMultiBadge'

import { chickenPayoutMulti, pumpPayoutMulti } from './payoutTables/rhPayoutLookup'



interface RoundMultiplierPickerProps {

  game: 'chicken' | 'pump'

  options: OriginalsWorkbenchOptions

  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



export default function RoundMultiplierPicker({ game, options, onPatch, readOnly }: RoundMultiplierPickerProps) {

  const difficulty = options.difficulty ?? (game === 'chicken' ? 'medium' : 'hard')

  const round = options.round ?? (game === 'chicken' ? 5 : 1)

  const maxRound = maxRoundsFor(game, difficulty)

  const safeRound = Math.min(maxRound, Math.max(1, round))

  const payoutMulti =

    game === 'chicken' ? chickenPayoutMulti(difficulty, safeRound) : pumpPayoutMulti(safeRound)



  return (

    <div className="originals-round-target">

      <GameTargetSummary gameSlug={game} options={options} gameOnly />



      <PayoutMultiBadge multi={payoutMulti} label="Cashout at" hint={`Round ${safeRound}`} />



      {game === 'chicken' ? (

        <DifficultyField

          value={difficulty}

          readOnly={readOnly}

          onChange={(d) => onPatch({ difficulty: d as OriginalsWorkbenchOptions['difficulty'], round: 1 })}

        />

      ) : null}



      <TargetSliderControl

        label="Target round"

        value={safeRound}

        onChange={(n) => onPatch({ round: Math.min(maxRound, Math.max(1, Math.round(n) || 1)) })}

        min={1}

        max={maxRound}

        step={1}

        readOnly={readOnly}

        prominent={false}

      />

    </div>

  )

}


