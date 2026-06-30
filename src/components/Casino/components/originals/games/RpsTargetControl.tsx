import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import GameTargetSummary from './GameTargetSummary'

import GuessSequenceControl from './GuessSequenceControl'

import PayoutMultiBadge from './payoutTables/PayoutMultiBadge'

import { rpsPayoutMulti } from './payoutTables/rhPayoutLookup'



interface RpsTargetControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



const RPS = ['rock', 'paper', 'scissors'] as const



export default function RpsTargetControl({ options, onPatch, readOnly }: RpsTargetControlProps) {

  const count = options.numberOfRounds ?? options.guesses?.length ?? 1

  const guesses = options.guesses ?? ['rock']

  const payoutMulti = rpsPayoutMulti(count)



  return (

    <>

      <GameTargetSummary gameSlug="rock-paper-scissors" options={options} gameOnly />

      <PayoutMultiBadge multi={payoutMulti} label="Win all rounds" hint={`${count} round${count !== 1 ? 's' : ''}`} />

      <GuessSequenceControl

        count={count}

        countLabel="Number of rounds"

        countKey="numberOfRounds"

        maxCount={20}

        guesses={guesses}

        guessOptions={RPS.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}

        repeatGuess={options.repeatGuess}

        readOnly={readOnly}

        onPatch={onPatch}

      />

    </>

  )

}


