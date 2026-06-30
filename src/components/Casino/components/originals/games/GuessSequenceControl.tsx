import { useEffect } from 'react'

import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

import TargetSliderControl from './TargetSliderControl'

import { SelectField } from './gamePanelFields'



interface GuessSequenceControlProps {

  count: number

  countLabel: string

  countKey: 'numberOfFlips' | 'numberOfRounds'

  maxCount?: number

  guesses: string[]

  guessOptions: { value: string; label: string }[]

  repeatGuess?: boolean

  readOnly?: boolean

  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void

}



export default function GuessSequenceControl({

  count,

  countLabel,

  countKey,

  maxCount = 20,

  guesses,

  guessOptions,

  repeatGuess = false,

  readOnly,

  onPatch,

}: GuessSequenceControlProps) {

  const n = Math.max(1, Math.min(maxCount, count || 1))

  const first = guesses[0] ?? guessOptions[0]?.value ?? ''



  useEffect(() => {

    if (guesses.length === n) return

    if (repeatGuess) {

      onPatch({ guesses: Array(n).fill(first), [countKey]: n })

      return

    }

    onPatch({

      [countKey]: n,

      guesses: guesses.length > n ? guesses.slice(0, n) : [...guesses, ...Array(n - guesses.length).fill(first)],

    })

    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync length when count/repeat toggles

  }, [n, repeatGuess])



  const setCount = (next: number) => {

    const c = Math.max(1, Math.min(maxCount, next || 1))

    if (repeatGuess) {

      onPatch({ [countKey]: c, guesses: Array(c).fill(first) })

      return

    }

    onPatch({

      [countKey]: c,

      guesses:

        guesses.length >= c

          ? guesses.slice(0, c)

          : [...guesses, ...Array(c - guesses.length).fill(first)],

    })

  }



  const setGuessAt = (idx: number, value: string) => {

    const next = [...guesses]

    while (next.length < n) next.push(first)

    next[idx] = value

    if (repeatGuess && idx === 0) {

      onPatch({ guesses: Array(n).fill(value) })

      return

    }

    onPatch({ guesses: next.slice(0, n) })

  }



  const toggleRepeat = (on: boolean) => {

    onPatch({

      repeatGuess: on,

      guesses: on ? Array(n).fill(first) : guesses.slice(0, n),

    })

  }



  return (

    <>

      <TargetSliderControl

        label={countLabel}

        value={n}

        min={1}

        max={maxCount}

        step={1}

        readOnly={readOnly}

        prominent={false}

        onChange={setCount}

      />

      <div className="originals-field originals-field--full">

        <span className="originals-field-label">Per-throw guesses</span>

        <div className="originals-guess-seq-row">

          {Array.from({ length: n }, (_, idx) => (

            <SelectField

              key={idx}

              label={`#${idx + 1}`}

              value={guesses[idx] ?? first}

              readOnly={readOnly || (repeatGuess && idx > 0)}

              onChange={(v) => setGuessAt(idx, v)}

              options={guessOptions}

            />

          ))}

        </div>

      </div>

      <label className="originals-check-row">

        <input

          type="checkbox"

          disabled={readOnly}

          checked={repeatGuess}

          onChange={(e) => toggleRepeat(e.target.checked)}

        />

        <span>Repeat first guess for all throws</span>

      </label>

    </>

  )

}


