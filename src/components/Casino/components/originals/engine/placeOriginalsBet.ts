/**
 * Unified bet placement for Stake Originals workbench session.
 */

import {
  placeDiceBet,
  placeLimboBet,
  placeMinesBet,
  minesReveal,
  minesCashout,
  placePlinkoBet,
  placeKenoBet,
  placeSnakesBet,
  placeFlipBet,
  placeWheelBet,
  placePumpBet,
  placeDiamondsBet,
  placeTomeOfLifeBet,
  placeHiloBet,
  placeDragonTowerBet,
  placeDartsBet,
  placeCasesBet,
  placeBarsBet,
  placeChickenBet,
  placeTarotBet,
  placeRockPaperScissorsBet,
  placeScarabSpinBet,
  placeSamuraiBet,
  placePacksRestBet,
  placePacksBet,
  placeUnsupportedOriginalsBet,
} from '../../../api/stakeOriginalsBets'
import { playBlackjackScriptRound } from '../blackjack/blackjackScriptRound'
import { eggLevelsToApi, normalizeEggLevels } from '../games/DragonTowerEggGrid'
import type { OriginalsBetApiRow } from './originalsRoundResult'

const GRID_SIZE = 25

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function optFrom(o: Record<string, unknown>, key: string, def: number): number {
  return (o[key] as number) ?? def
}

function optBoolFrom(o: Record<string, unknown>, key: string, def: boolean): boolean {
  return (o[key] as boolean) ?? def
}

function optStrFrom(o: Record<string, unknown>, key: string, def: string): string {
  const v = o[key]
  return v != null ? String(v) : def
}

function optStrArrayFrom(o: Record<string, unknown>, key: string, def: string[]): string[] {
  const v = o[key]
  if (Array.isArray(v) && v.length > 0) return v.map(String)
  return def
}

function resolveGuessSequence(
  opts: Record<string, unknown>,
  countKey: string,
  defaultGuess: string
): string[] {
  const guesses = optStrArrayFrom(opts, 'guesses', [defaultGuess])
  const count = Math.max(1, optFrom(opts, countKey, guesses.length || 1))
  const out = guesses.slice(0, count)
  while (out.length < count) out.push(guesses[0] ?? defaultGuess)
  return out
}

function optNumArrayFrom(o: Record<string, unknown>, key: string): number[] {
  const v = o[key]
  if (!Array.isArray(v)) return []
  return v.map(Number).filter((n) => Number.isFinite(n))
}

function resultFromApi(
  res: OriginalsBetApiRow | null,
  amountMajor: number,
  game: string
): OriginalsBetResult {
  const betApiId = res?.betApiId ?? res?.id
  return {
    payout: res?.payout ?? 0,
    betIid: betApiId != null ? String(betApiId) : undefined,
    betApi: res ? { ...res, game: res.game ?? game } : null,
    wageredMajor: amountMajor,
    game,
  }
}

export type OriginalsBetResult = {
  payout: number
  betIid?: string
  betApi: OriginalsBetApiRow | null
  wageredMajor: number
  game: string
}

export async function placeOriginalsBet(
  game: string,
  opts: Record<string, unknown>,
  amountMajor: number,
  currency: string,
  signal: { cancelled: boolean },
  onLog?: (msg: string) => void
): Promise<OriginalsBetResult> {
  const cur = currency.toLowerCase()
  const g = game.toLowerCase()

  if (g === 'blackjack') {
    const res = await playBlackjackScriptRound({
      amount: amountMajor,
      currency: cur,
      signal,
      onLog,
    })
    return {
      payout: res.payout,
      betApi: { amount: res.amount, payout: res.payout },
      wageredMajor: res.amount,
      game: g,
    }
  }

  if (g === 'dice') {
    const rollUnder = optFrom(opts, 'rollUnder', 49.5)
    const rollOver = Boolean(opts.rollOver)
    const res = await placeDiceBet({ amount: amountMajor, currency: cur, rollUnder, rollOver })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'limbo') {
    const mult = Math.max(1.01, optFrom(opts, 'targetMultiplier', 2))
    const res = await placeLimboBet({ amount: amountMajor, currency: cur, targetMultiplier: mult })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'plinko') {
    const rows = optFrom(opts, 'rows', 16)
    const risk = String(opts.plinkoRisk || opts.risk || 'low').toLowerCase()
    const res = await placePlinkoBet({
      amount: amountMajor,
      currency: cur,
      rows,
      risk: risk as 'low' | 'medium' | 'high' | 'expert',
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'keno') {
    const useHeatmap = optBoolFrom(opts, 'useHeatmapHotNumbers', false) && optFrom(opts, 'heatmapHotNumbers', 0) > 0
    const fixedNumbers = (opts.numbers as number[]) || []
    let numbers: number[]
    if (useHeatmap) {
      const hotCount = Math.max(1, Math.min(10, optFrom(opts, 'heatmapHotNumbers', 5)))
      const range = Math.max(1, Math.min(39, optFrom(opts, 'heatmapRange', 30)))
      numbers = shuffle(Array.from({ length: range }, (_, i) => i + 1)).slice(0, hotCount)
    } else if (Array.isArray(fixedNumbers) && fixedNumbers.length > 0) {
      numbers = fixedNumbers.filter((n) => n >= 1 && n <= 39).slice(0, 10)
    } else {
      numbers = shuffle(Array.from({ length: 39 }, (_, i) => i + 1)).slice(0, 8)
    }
    if (numbers.length === 0) numbers = [1]
    const riskRaw = String(opts.risk || 'medium').toLowerCase()
    const risk = riskRaw === 'classic' ? 'medium' : riskRaw
    const res = await placeKenoBet({
      amount: amountMajor,
      currency: cur,
      picks: numbers,
      risk: risk as 'low' | 'medium' | 'high',
    })
    const result = resultFromApi(res, amountMajor, g)
    if (result.betApi) {
      const state = result.betApi.state ?? {}
      result.betApi = {
        ...result.betApi,
        game: g,
        state: {
          ...state,
          selectedNumbers:
            Array.isArray(state.selectedNumbers) && state.selectedNumbers.length > 0
              ? state.selectedNumbers
              : numbers,
        },
      }
    }
    return result
  }

  if (g === 'mines') {
    const mines = Math.min(24, Math.max(1, optFrom(opts, 'mines', 3)))
    const diamonds = Math.min(24, Math.max(1, optFrom(opts, 'diamonds', 2)))
    const preferred = Array.isArray(opts.minesFields)
      ? (opts.minesFields as number[]).filter((i) => i >= 0 && i < GRID_SIZE)
      : []
    const fields =
      preferred.length >= diamonds
        ? preferred.slice(0, diamonds)
        : preferred.length > 0
          ? preferred
          : shuffle(Array.from({ length: GRID_SIZE }, (_, i) => i)).slice(0, diamonds)

    if (fields.length >= diamonds) {
      const res = await placeMinesBet({
        amount: amountMajor,
        currency: cur,
        mineCount: mines,
        fields,
      })
      return {
        payout: res?.payout ?? 0,
        betIid: res?.iid ?? res?.id,
        betApi: res,
        wageredMajor: amountMajor,
        game: g,
      }
    }

    const res = await placeMinesBet({ amount: amountMajor, currency: cur, mineCount: mines, fields: [] })
    if (!res?.id && !res?.iid) {
      return { payout: 0, betApi: null, wageredMajor: amountMajor, game: g }
    }
    const identifier = res.id ?? res.iid ?? ''
    let gemsRevealed = 0
    let payout = 0
    let betApi: OriginalsBetApiRow | null = res
    for (const idx of fields.length > 0 ? fields : shuffle(Array.from({ length: GRID_SIZE }, (_, i) => i))) {
      if (signal.cancelled || gemsRevealed >= diamonds) break
      const rev = await minesReveal({ identifier, fields: [idx] })
      if (!rev) break
      betApi = rev as OriginalsBetApiRow
      if (rev.active === false) break
      gemsRevealed++
    }
    if (gemsRevealed >= diamonds) {
      const cash = await minesCashout({ identifier })
      payout = cash?.payout ?? 0
      if (cash) betApi = cash as OriginalsBetApiRow
    }
    return { payout, betIid: res.iid ?? res.id, betApi, wageredMajor: amountMajor, game: g }
  }

  if (g === 'snakes') {
    const res = await placeSnakesBet({
      amount: amountMajor,
      currency: cur,
      difficulty: optStrFrom(opts, 'difficulty', 'easy'),
      rollCount: Math.min(5, Math.max(1, optFrom(opts, 'rollCount', optFrom(opts, 'rounds', 1)))),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'flip') {
    const guesses = resolveGuessSequence(opts, 'numberOfFlips', 'heads')
    const res = await placeFlipBet({ amount: amountMajor, currency: cur, guesses })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'wheel') {
    const res = await placeWheelBet({
      amount: amountMajor,
      currency: cur,
      segments: optFrom(opts, 'segments', 10),
      risk: optStrFrom(opts, 'risk', 'low'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'pump') {
    const res = await placePumpBet({
      amount: amountMajor,
      currency: cur,
      round: optFrom(opts, 'round', 1),
      difficulty: optStrFrom(opts, 'difficulty', 'easy'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'diamonds') {
    const res = await placeDiamondsBet({ amount: amountMajor, currency: cur })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'tome-of-life') {
    const res = await placeTomeOfLifeBet({
      amount: amountMajor,
      currency: cur,
      lines: optFrom(opts, 'lines', 1),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'hilo') {
    const startCard =
      opts.startCardRank && opts.startCardSuit
        ? { rank: String(opts.startCardRank), suit: String(opts.startCardSuit) }
        : undefined
    const res = await placeHiloBet({
      amount: amountMajor,
      currency: cur,
      startCard,
      rounds: optFrom(opts, 'hiloRounds', optFrom(opts, 'rounds', 1)),
      guess: optStrFrom(opts, 'hiloGuess', 'higher'),
      pattern: optStrFrom(opts, 'hiloPattern', ''),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'dragon-tower') {
    const eggLevels = normalizeEggLevels(opts.eggLevels ?? opts.eggs)
    const res = await placeDragonTowerBet({
      amount: amountMajor,
      currency: cur,
      difficulty: optStrFrom(opts, 'difficulty', 'easy'),
      eggs: eggLevelsToApi(eggLevels),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'darts') {
    const res = await placeDartsBet({
      amount: amountMajor,
      currency: cur,
      difficulty: optStrFrom(opts, 'difficulty', 'easy'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'cases') {
    const res = await placeCasesBet({
      amount: amountMajor,
      currency: cur,
      difficulty: optStrFrom(opts, 'difficulty', 'easy'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'bars') {
    const res = await placeBarsBet({
      amount: amountMajor,
      currency: cur,
      difficulty: optStrFrom(opts, 'difficulty', 'easy'),
      tiles: optNumArrayFrom(opts, 'tiles'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'chicken') {
    const res = await placeChickenBet({
      amount: amountMajor,
      currency: cur,
      round: optFrom(opts, 'round', 5),
      difficulty: optStrFrom(opts, 'difficulty', 'medium'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'tarot') {
    const res = await placeTarotBet({
      amount: amountMajor,
      currency: cur,
      difficulty: optStrFrom(opts, 'difficulty', 'medium'),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'rock-paper-scissors') {
    const guesses = resolveGuessSequence(opts, 'numberOfRounds', 'rock')
    const res = await placeRockPaperScissorsBet({
      amount: amountMajor,
      currency: cur,
      guesses,
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'slots-scarab') {
    const res = await placeScarabSpinBet({
      amount: amountMajor,
      currency: cur,
      lines: optFrom(opts, 'lines', 1),
    })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'slots-samurai') {
    const res = await placeSamuraiBet({ amount: amountMajor, currency: cur })
    return resultFromApi(res, amountMajor, g)
  }

  if (g === 'packs') {
    const identifier = optStrFrom(opts, 'casesIdentifier', '').trim()
    const res = identifier
      ? await placePacksBet({
          amount: amountMajor,
          currency: cur,
          identifier,
          difficulty: optStrFrom(opts, 'difficulty', 'medium'),
        })
      : await placePacksRestBet({ amount: amountMajor, currency: cur })
    return resultFromApi(res, amountMajor, g)
  }

  if (['roulette', 'baccarat', 'video-poker', 'drill', 'moles', 'blitz'].includes(g)) {
    await placeUnsupportedOriginalsBet(g)
  }

  onLog?.(`Game not implemented: ${g}`)
  throw new Error(`Game not implemented: ${g}`)
}
