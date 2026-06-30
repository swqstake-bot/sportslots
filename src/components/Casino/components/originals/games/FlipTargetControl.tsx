import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import GameTargetSummary from './GameTargetSummary'

import GuessSequenceControl from './GuessSequenceControl'



interface FlipTargetControlProps {

  options: OriginalsWorkbenchOptions

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

  readOnly?: boolean

}



export default function FlipTargetControl({ options, onPatch, readOnly }: FlipTargetControlProps) {

  const count = options.numberOfFlips ?? options.guesses?.length ?? 1

  const guesses = options.guesses ?? ['heads']



  return (

    <>

      <GameTargetSummary gameSlug="flip" options={options} gameOnly />

      <GuessSequenceControl

        count={count}

        countLabel="Number of flips"

        countKey="numberOfFlips"

        maxCount={20}

        guesses={guesses}

        guessOptions={[

          { value: 'heads', label: 'Heads' },

          { value: 'tails', label: 'Tails' },

        ]}

        repeatGuess={options.repeatGuess}

        readOnly={readOnly}

        onPatch={onPatch}

      />

    </>

  )

}


