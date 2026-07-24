import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { computeComboMultiplier } from '../schema/workbenchOptions'
import { gameUsesMultiplierStrategy } from '../registry/gameApiSchema'
import { clampMultiplier, clampLimboMultiplier, diceRollThreshold, diceWinChance } from '../games/targetMath'
import { roundMultiplierFor } from '../games/roundMultiplierTables'
import { formatPayoutMulti } from '../games/payoutTables/formatPayoutMulti'
import {
  barsPayoutMulti,
  chickenPayoutMulti,
  dragonTowerPayoutMulti,
  minesPayoutMulti,
  pumpPayoutMulti,
  rpsPayoutMulti,
} from '../games/payoutTables/rhPayoutLookup'

export type TargetItem = { label: string; value: string }

export function buildActiveTargetItems(
  gameSlug: string,
  options: OriginalsWorkbenchOptions,
  currency: string
): TargetItem[] {
  const g = gameSlug.toLowerCase()
  const bet = options.initialBetSize ?? options.betSize ?? 0.01
  const fmt = (n: number) => (n !== 0 && Math.abs(n) < 0.1 ? n.toFixed(4) : n.toFixed(2))

  const items: TargetItem[] = [
    { label: 'Currency', value: currency.toUpperCase() },
    { label: 'Base bet', value: `$${fmt(bet)}` },
  ]

  switch (g) {
    case 'dice': {
      const mult = clampMultiplier(options.targetMultiplier ?? 2)
      const rollOver = options.rollOver !== false
      const mode = options.targetSelectionMode ?? 'static'
      if (mode === 'combo' && (options.comboParts?.length ?? 0) > 0) {
        items.push({ label: 'Combo', value: `${options.comboParts!.length} legs · ${computeComboMultiplier(options.comboParts!).toFixed(2)}×` })
      } else if (mode === 'random') {
        items.push({ label: 'Target', value: `${(options.targetMultiplierFrom ?? 2).toFixed(2)}× – ${(options.targetMultiplierTo ?? 10).toFixed(2)}×` })
      } else {
        items.push(
          { label: 'Chance', value: `${diceWinChance(mult).toFixed(2)}%` },
          { label: 'Payout', value: `${mult.toFixed(2)}×` },
          { label: rollOver ? 'Roll over' : 'Roll under', value: diceRollThreshold(mult, rollOver).toFixed(2) }
        )
      }
      break
    }
    case 'limbo': {
      const mult = clampLimboMultiplier(options.targetMultiplier ?? 2)
      const mode = options.targetSelectionMode ?? 'static'
      if (mode === 'combo' && (options.comboParts?.length ?? 0) > 0) {
        items.push({ label: 'Combo', value: `${options.comboParts!.length} legs · ${computeComboMultiplier(options.comboParts!).toFixed(2)}×` })
      } else if (mode === 'random') {
        items.push({ label: 'Crash', value: `${(options.targetMultiplierFrom ?? 2).toFixed(2)}× – ${(options.targetMultiplierTo ?? 10).toFixed(2)}×` })
      } else {
        items.push({ label: 'Crash target', value: `${mult.toFixed(2)}×` }, { label: 'Chance', value: `${(99 / mult).toFixed(2)}%` })
      }
      break
    }
    case 'plinko':
      items.push(
        { label: 'Target slot', value: `${options.plinkoTarget ?? options.stopOnMultiplier ?? '—'}×` },
        { label: 'Rows', value: String(options.rows ?? 16) },
        { label: 'Risk', value: (options.plinkoRisk ?? 'low').toUpperCase() }
      )
      break
    case 'mines': {
      const m = options.mines ?? 3
      const d = options.diamonds ?? 2
      const multi = minesPayoutMulti(m, d)
      items.push(
        { label: 'Mines', value: String(m) },
        { label: 'Gems', value: String(d) },
        { label: 'Payout', value: multi != null ? formatPayoutMulti(multi) : '—' },
        { label: 'Picks', value: String((options.minesFields ?? []).length || 'auto') }
      )
      break
    }
    case 'keno': {
      const n = options.useHeatmapHotNumbers ? options.heatmapHotNumbers ?? 5 : options.numbers?.length ?? 0
      items.push(
        { label: 'Risk', value: (options.risk ?? 'medium').toUpperCase() },
        { label: 'Numbers', value: options.useHeatmapHotNumbers ? `heatmap ${n}` : String(n) }
      )
      break
    }
    case 'wheel':
      items.push(
        { label: 'Segments', value: String(options.segments ?? 10) },
        { label: 'Risk', value: (options.risk ?? 'low').toUpperCase() },
        { label: 'Per slice', value: `~${(100 / Math.max(1, options.segments ?? 10)).toFixed(1)}%` }
      )
      break
    case 'snakes': {
      const rolls = Math.min(5, options.rollCount ?? options.rounds ?? 1)
      items.push(
        { label: 'Difficulty', value: (options.difficulty ?? 'easy').toUpperCase() },
        { label: 'Roll count', value: String(rolls) }
      )
      break
    }
    case 'pump':
    case 'chicken': {
      const diff = options.difficulty ?? (g === 'chicken' ? 'medium' : 'hard')
      const round = options.round ?? 1
      const rhMulti = g === 'chicken' ? chickenPayoutMulti(diff, round) : pumpPayoutMulti(round)
      const legacyMult = roundMultiplierFor(g, diff, round)
      const multi = rhMulti ?? legacyMult
      items.push(
        { label: 'Round', value: String(round) },
        { label: 'Difficulty', value: diff.toUpperCase() },
        { label: 'Payout', value: multi != null ? formatPayoutMulti(multi) : '—' }
      )
      break
    }
    case 'hilo':
      items.push(
        { label: 'Rounds', value: String(options.hiloRounds ?? options.rounds ?? 1) },
        {
          label: 'Pattern',
          value: options.hiloPattern?.trim() || (options.hiloGuess ?? 'higher').toUpperCase(),
        },
        {
          label: 'Start card',
          value: options.startCardRank ? `${options.startCardRank}${options.startCardSuit ?? ''}` : 'random',
        }
      )
      break
    case 'flip': {
      const n = options.numberOfFlips ?? (options.guesses ?? ['heads']).length
      items.push(
        { label: 'Flips', value: String(n) },
        { label: 'Guesses', value: (options.guesses ?? ['heads']).slice(0, n).join(', ') }
      )
      break
    }
    case 'rock-paper-scissors': {
      const n = options.numberOfRounds ?? (options.guesses ?? ['rock']).length
      const multi = rpsPayoutMulti(n)
      items.push(
        { label: 'Rounds', value: String(n) },
        { label: 'Guesses', value: (options.guesses ?? ['rock']).slice(0, n).join(', ') },
        { label: 'Payout', value: multi != null ? formatPayoutMulti(multi) : '—' }
      )
      break
    }
    case 'dragon-tower': {
      const levels = options.eggLevels ?? options.eggs ?? []
      const count = Array.isArray(levels) ? levels.filter((v) => v != null).length : 0
      const diff = options.difficulty ?? 'easy'
      const multi = count > 0 ? dragonTowerPayoutMulti(diff, count) : null
      items.push(
        { label: 'Difficulty', value: diff.toUpperCase() },
        { label: 'Levels', value: `${count}/9` },
        { label: 'Payout', value: multi != null ? formatPayoutMulti(multi) : '—' }
      )
      break
    }
    case 'darts':
    case 'cases':
    case 'tarot':
      items.push({ label: 'Difficulty', value: (options.difficulty ?? 'easy').toUpperCase() })
      break
    case 'bars': {
      const diff = options.difficulty ?? 'easy'
      const t = options.tiles ?? []
      const barCount = t.length > 0 ? Math.min(5, t.length) : 0
      const multi = barCount > 0 ? barsPayoutMulti(diff, barCount) : null
      items.push(
        { label: 'Difficulty', value: diff.toUpperCase() },
        { label: 'Tiles', value: t.length ? t.join(', ') : 'auto' },
        { label: 'Payout', value: multi != null ? formatPayoutMulti(multi) : '—' }
      )
      break
    }
    case 'packs':
      items.push({
        label: 'Pack ID',
        value: options.casesIdentifier?.trim() || 'auto',
      })
      break
    case 'tome-of-life':
    case 'slots-scarab':
      items.push({ label: 'Lines', value: String(options.lines ?? 1) })
      break
    case 'diamonds':
    case 'slots-samurai':
    case 'blackjack':
      items.push({ label: 'Params', value: 'amount + currency only' })
      break
    default:
      if (['roulette', 'baccarat', 'video-poker', 'drill', 'moles', 'blitz'].includes(g)) {
        items.push({ label: 'Status', value: 'API pending' })
      } else if (!gameUsesMultiplierStrategy(g)) {
        items.push({ label: 'Game', value: 'See Game tab' })
      }
      break
  }

  return items
}
