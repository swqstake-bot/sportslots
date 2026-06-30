import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import {

  clampMultiplier,

  diceRollThreshold,

  diceWinChance,

  DICE_MAX_MULTIPLIER,

  DICE_MAX_WIN_CHANCE,

  DICE_MIN_WIN_CHANCE,

  formatDiceMultiplier,

  multiplierFromWinChance,

  multiplierToRollUnder,

} from './targetMath'

import TargetSliderControl from './TargetSliderControl'

import GameTargetSummary from './GameTargetSummary'

import { SegToggle, fieldInputCls } from './gamePanelFields'

import PayoutMultiBadge from './payoutTables/PayoutMultiBadge'



interface DiceChanceControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (partial: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

  compact?: boolean

}



function patchDiceTarget(

  onPatch: DiceChanceControlProps['onPatch'],

  mult: number,

  rollOver: boolean

) {

  const m = clampMultiplier(mult)

  onPatch({

    targetMultiplier: m,

    rollUnder: multiplierToRollUnder(m),

    rollOver,

    betHigh: rollOver,

  })

}



/** Dice API: condition + target — win chance 0.01%–98% → payout up to 9900×. */

export default function DiceChanceControl({ options, onPatch, readOnly, compact }: DiceChanceControlProps) {

  const mult = clampMultiplier(options.targetMultiplier ?? 2)

  const rollOver = options.rollOver !== false

  const chance = diceWinChance(mult)

  const apiTarget = diceRollThreshold(mult, rollOver)



  const setChance = (c: number) => patchDiceTarget(onPatch, multiplierFromWinChance(c), rollOver)



  return (

    <div className={`originals-dice-target${compact ? ' originals-dice-target--compact' : ''}`}>

      <GameTargetSummary gameSlug="dice" options={options} gameOnly />



      <PayoutMultiBadge

        multi={mult}

        label="Payout"

        hint={`${chance < 1 ? chance.toFixed(2) : chance.toFixed(2)}% win · target ${rollOver ? 'over' : 'under'} ${apiTarget}`}

      />



      <label className="originals-field">

        <span className="originals-field-label">Target multiplier (1.01–9900×)</span>

        <input

          type="number"

          min={1.01}

          max={DICE_MAX_MULTIPLIER}

          step={0.01}

          disabled={readOnly}

          className={fieldInputCls}

          value={mult}

          onChange={(e) => patchDiceTarget(onPatch, Number(e.target.value) || mult, rollOver)}

        />

      </label>



      <TargetSliderControl

        label="Win chance"

        value={chance}

        onChange={setChance}

        min={DICE_MIN_WIN_CHANCE}

        max={DICE_MAX_WIN_CHANCE}

        step={0.01}

        readOnly={readOnly}

        prominent={false}

        suffix="%"

        hint={`Stake formula: ${formatDiceMultiplier(mult)} ≈ 99 / ${chance < 1 ? chance.toFixed(2) : chance.toFixed(2)}%`}

      />



      <SegToggle

        label="Direction"

        value={rollOver ? 'over' : 'under'}

        readOnly={readOnly}

        options={[

          { value: 'over', label: 'Roll over' },

          { value: 'under', label: 'Roll under' },

        ]}

        onChange={(v) => {

          const over = v === 'over'

          patchDiceTarget(onPatch, mult, over)

        }}

      />

    </div>

  )

}


