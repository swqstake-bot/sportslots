import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import MinesGridPicker from './MinesGridPicker'

import TargetSliderControl from './TargetSliderControl'

import GameTargetSummary from './GameTargetSummary'

import PayoutMultiBadge from './payoutTables/PayoutMultiBadge'

import MinesPayoutSelect from './payoutTables/MinesPayoutSelect'

import { maxMinesDiamonds, minesPayoutMulti } from './payoutTables/rhPayoutLookup'



interface MinesTargetControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



export default function MinesTargetControl({ options, onPatch, readOnly }: MinesTargetControlProps) {

  const mines = options.mines ?? 3

  const maxGems = maxMinesDiamonds(mines)

  const gems = Math.min(maxGems, Math.max(1, options.diamonds ?? 2))

  const payoutMulti = minesPayoutMulti(mines, gems)



  const setMines = (n: number) => {

    const m = n || 3

    const maxD = maxMinesDiamonds(m)

    const d = Math.min(maxD, gems)

    onPatch({ mines: m, diamonds: d })

  }



  return (

    <>

      <GameTargetSummary gameSlug="mines" options={options} gameOnly />

      <PayoutMultiBadge

        multi={payoutMulti}

        label="Cashout at"

        hint={`${mines} mine${mines !== 1 ? 's' : ''} · ${gems} gem${gems !== 1 ? 's' : ''}`}

      />

      <div className="originals-game-grid originals-game-grid--2">

        <TargetSliderControl

          label="Mines on grid"

          value={mines}

          min={1}

          max={24}

          step={1}

          readOnly={readOnly}

          prominent={false}

          onChange={setMines}

        />

        <TargetSliderControl

          label="Gems to reveal"

          value={gems}

          min={1}

          max={maxGems}

          step={1}

          readOnly={readOnly}

          prominent={false}

          onChange={(n) => onPatch({ diamonds: Math.min(maxGems, Math.max(1, n || 1)) })}

        />

      </div>

      <MinesPayoutSelect

        mines={mines}

        diamonds={gems}

        readOnly={readOnly}

        onDiamondsChange={(d) => onPatch({ diamonds: d })}

      />

      <MinesGridPicker

        minesCount={mines}

        gemsTarget={gems}

        fields={options.minesFields ?? []}

        readOnly={readOnly}

        onChange={(fields) => onPatch({ minesFields: fields })}

        payoutMulti={payoutMulti}

      />

    </>

  )

}


