import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import DragonTowerEggGrid from './DragonTowerEggGrid'

import GameTargetSummary from './GameTargetSummary'

import { DifficultyField } from './gamePanelFields'

import PayoutMultiBadge from './payoutTables/PayoutMultiBadge'

import { dragonTowerPayoutMulti } from './payoutTables/rhPayoutLookup'



interface DragonTowerTargetControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



export default function DragonTowerTargetControl({ options, onPatch, readOnly }: DragonTowerTargetControlProps) {

  const difficulty = options.difficulty ?? 'easy'

  const eggLevels = options.eggLevels ?? options.eggs

  const levels = eggLevels ?? []

  const stage = Array.isArray(levels) ? levels.filter((v) => v != null).length : 0

  const payoutMulti = stage > 0 ? dragonTowerPayoutMulti(difficulty, stage) : null



  return (

    <>

      <GameTargetSummary gameSlug="dragon-tower" options={options} gameOnly />

      <DifficultyField

        value={difficulty}

        readOnly={readOnly}

        onChange={(d) => onPatch({ difficulty: d as OriginalsWorkbenchOptions['difficulty'] })}

      />

      <PayoutMultiBadge

        multi={payoutMulti}

        label="Cashout at"

        hint={stage > 0 ? `Level ${stage}/9` : 'Pick eggs per level'}

      />

      <DragonTowerEggGrid

        difficulty={difficulty}

        eggLevels={eggLevels ?? []}

        readOnly={readOnly}

        onChange={(lv) => onPatch({ eggLevels: lv })}

      />

    </>

  )

}


