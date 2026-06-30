import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import GameTargetSummary from './GameTargetSummary'

import { DifficultyField } from './gamePanelFields'

import { formatPayoutMulti } from './payoutTables/formatPayoutMulti'

import { tarotPayoutOptions } from './payoutTables/rhPayoutLookup'



interface DifficultyGameControlProps {

  gameSlug: 'darts' | 'cases' | 'tarot'

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



export default function DifficultyGameControl({ gameSlug, options, onPatch, readOnly }: DifficultyGameControlProps) {

  const defaultDiff = gameSlug === 'tarot' ? 'medium' : 'easy'

  const tarotOpts = gameSlug === 'tarot' ? tarotPayoutOptions() : []



  return (

    <>

      <GameTargetSummary gameSlug={gameSlug} options={options} gameOnly />

      <DifficultyField

        value={options.difficulty ?? defaultDiff}

        readOnly={readOnly}

        onChange={(d) => onPatch({ difficulty: d as OriginalsWorkbenchOptions['difficulty'] })}

      />

      {tarotOpts.length > 0 ? (

        <div className="originals-payout-table-ref">

          <span className="originals-field-label">Tarot payout ladder</span>

          <ul className="originals-payout-table-ref-list">

            {tarotOpts.map((o, i) => (

              <li key={o.label}>

                Card {i + 1}: {formatPayoutMulti(o.multi)}

              </li>

            ))}

          </ul>

        </div>

      ) : null}

    </>

  )

}


