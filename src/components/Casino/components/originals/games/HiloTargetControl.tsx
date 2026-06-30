import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import HiloCardDisplay from './HiloCardDisplay'

import GameTargetSummary from './GameTargetSummary'

import TargetSliderControl from './TargetSliderControl'

import { SelectField, TextField } from './gamePanelFields'



interface HiloTargetControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



export default function HiloTargetControl({ options, onPatch, readOnly }: HiloTargetControlProps) {

  const suit = (options.startCardSuit ?? '').toUpperCase().slice(0, 1)

  const rounds = options.hiloRounds ?? options.rounds ?? 1

  const usePattern = Boolean(options.hiloPattern?.trim())



  return (

    <>

      <GameTargetSummary gameSlug="hilo" options={options} gameOnly />

      <TargetSliderControl

        label="Rounds before cashout"

        value={rounds}

        min={1}

        max={20}

        step={1}

        readOnly={readOnly}

        prominent={false}

        onChange={(n) => onPatch({ hiloRounds: n || 1, rounds: n || 1 })}

      />

      <TextField

        label="Guess pattern (comma codes)"

        placeholder="e.g. 1,0,2,3 — empty = single direction below"

        readOnly={readOnly}

        value={options.hiloPattern ?? ''}

        onChange={(v) => onPatch({ hiloPattern: v || undefined })}

      />

      <p className="originals-target-slider-hint">

        0=low · 1=high · 2=equal · 3=random · 4/5=odd bias · 7=skip

      </p>

      {!usePattern && (

        <SelectField

          label="Guess direction (all rounds)"

          value={options.hiloGuess ?? 'higher'}

          readOnly={readOnly}

          onChange={(v) => onPatch({ hiloGuess: v as 'higher' | 'lower' | 'equal' })}

          options={[

            { value: 'higher', label: 'Higher ↑' },

            { value: 'lower', label: 'Lower ↓' },

            { value: 'equal', label: 'Equal =' },

          ]}

        />

      )}

      <div className="originals-game-grid originals-game-grid--2">

        <TextField

          label="Start rank (A–K)"

          placeholder="random"

          readOnly={readOnly}

          value={options.startCardRank ?? ''}

          onChange={(v) => onPatch({ startCardRank: v || undefined })}

        />

        <SelectField

          label="Start suit"

          value={suit || ''}

          readOnly={readOnly}

          onChange={(v) => onPatch({ startCardSuit: v || undefined })}

          options={[

            { value: '', label: 'Random' },

            { value: 'C', label: '♣ Clubs' },

            { value: 'D', label: '♦ Diamonds' },

            { value: 'H', label: '♥ Hearts' },

            { value: 'S', label: '♠ Spades' },

          ]}

        />

      </div>

      {(options.startCardRank || suit) && (

        <div className="flex justify-center py-2">

          <HiloCardDisplay rank={options.startCardRank} suit={suit} />

        </div>

      )}

    </>

  )

}


