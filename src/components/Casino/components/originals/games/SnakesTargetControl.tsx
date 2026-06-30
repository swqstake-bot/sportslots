import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import GameTargetSummary from './GameTargetSummary'

import { DifficultyField, SelectField } from './gamePanelFields'



interface SnakesTargetControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



const ROLL_OPTS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} roll${n > 1 ? 's' : ''}` }))



export default function SnakesTargetControl({ options, onPatch, readOnly }: SnakesTargetControlProps) {

  const rolls = Math.min(5, Math.max(1, options.rollCount ?? options.rounds ?? 1))



  return (

    <>

      <GameTargetSummary gameSlug="snakes" options={options} gameOnly />

      <DifficultyField

        value={options.difficulty ?? 'easy'}

        readOnly={readOnly}

        onChange={(d) => onPatch({ difficulty: d as OriginalsWorkbenchOptions['difficulty'] })}

      />

      <SelectField

        label="Dice rolls per bet (rollCount)"

        value={String(rolls)}

        readOnly={readOnly}

        onChange={(v) => {

          const n = Math.min(5, Math.max(1, Number(v) || 1))

          onPatch({ rollCount: n, rounds: n })

        }}

        options={ROLL_OPTS}

      />

      <p className="originals-target-slider-hint">

        API: difficulty + rollCount ({rolls} throw{rolls > 1 ? 's' : ''} per bet).

      </p>

    </>

  )

}


