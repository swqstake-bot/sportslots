/** Map Hilo pattern codes (SSP) to Stake hiloNext guess enums. */



const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']



function rankValue(rank: string): number {

  const i = RANK_ORDER.indexOf(rank)

  return i >= 0 ? i : 0

}



function randomHiloGuess(rank: string): string {

  if (rank === 'A') return Math.random() < 0.5 ? 'higher' : 'equal'

  if (rank === 'K') return Math.random() < 0.5 ? 'lower' : 'equal'

  return Math.random() < 0.5 ? 'lowerEqual' : 'higherEqual'

}



function guessFromCode(code: string, rank: string): string | 'skip' {

  switch (code.trim()) {

    case '0':

      if (rank === 'A') return 'equal'

      if (rank === 'K') return 'lower'

      return 'lowerEqual'

    case '1':

      if (rank === 'A') return 'higher'

      if (rank === 'K') return 'equal'

      return 'higherEqual'

    case '2':

      return 'equal'

    case '3':

      return randomHiloGuess(rank)

    case '4':

      return rankValue(rank) % 2 === 0 ? 'higherEqual' : 'lowerEqual'

    case '5':

      return rankValue(rank) % 2 === 0 ? 'lowerEqual' : 'higherEqual'

    case '7':

      return 'skip'

    default:

      return randomHiloGuess(rank)

  }

}



export function parseHiloPattern(raw: string | undefined): string[] {

  if (!raw?.trim()) return []

  return raw.split(',').map((s) => s.trim()).filter(Boolean)

}



export function resolveHiloPatternGuess(codes: string[], index: number, rank: string): string | 'skip' {

  if (!codes.length) return 'higher'

  const code = codes[index % codes.length]

  return guessFromCode(code, rank)

}



export function resolveSimpleHiloGuess(guess: string, rank: string): string {

  const g = guess.toLowerCase()

  if (g === 'higher') return rank === 'A' ? 'higher' : rank === 'K' ? 'equal' : 'higherEqual'

  if (g === 'lower') return rank === 'K' ? 'lower' : rank === 'A' ? 'equal' : 'lowerEqual'

  if (g === 'equal') return 'equal'

  return g

}


