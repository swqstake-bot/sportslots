/**
 * Basic Strategy for Stake Originals Blackjack (Script mode).
 * Rules: European, dealer S17, DAS. No surrender on Stake — Rh/Rs map to hit/stand.
 */

export function isTenValue(rank: string): boolean {
  const r = String(rank || '').toUpperCase()
  return r === '10' || r === 'J' || r === 'Q' || r === 'K'
}

/** Dealer up-card → 2–10 or 11 (Ace). */
export function dealerUpRankToValue(rank: string): number {
  const r = String(rank || '').toUpperCase()
  if (r === 'A') return 11
  if (isTenValue(r)) return 10
  const n = parseInt(r, 10)
  return Number.isFinite(n) ? n : 0
}

function normalizeRank(rank: string): string {
  return String(rank || '').toUpperCase()
}

/** Two cards: pair type for strategy (10/J/Q/K → shared ten pair logic). */
export function classifyPair(cards: { rank: string }[]): 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | null {
  if (!cards || cards.length !== 2) return null
  const a = normalizeRank(cards[0].rank)
  const b = normalizeRank(cards[1].rank)
  if (a === 'A' && b === 'A') return 'A'
  if (isTenValue(cards[0].rank) && isTenValue(cards[1].rank)) return 'T'
  if (a === b && /^[2-9]$/.test(a)) return a as '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  return null
}

export interface HandTotals {
  total: number
  isSoft: boolean
}

/** Value open cards (Ace as 1 or 11). */
export function analyzeHandTotals(cards: { rank: string }[]): HandTotals {
  let hard = 0
  let acesAs11 = 0
  for (const c of cards || []) {
    const r = normalizeRank(c.rank)
    if (r === 'A') {
      hard += 1
      acesAs11 += 1
    } else if (isTenValue(c.rank)) {
      hard += 10
    } else {
      const n = parseInt(r, 10)
      hard += Number.isFinite(n) ? n : 0
    }
  }
  let soft = hard
  let isSoft = false
  if (acesAs11 > 0) {
    const with11 = hard + 10
    if (with11 <= 21) {
      soft = with11
      isSoft = true
    }
  }
  const total = isSoft ? soft : hard
  return { total, isSoft }
}

type ChartAction = 'H' | 'S' | 'P' | 'Dh' | 'Ds' | 'Rh' | 'Rs'

/** Dealer index: 2–9 → 0–7, 10 → 8, A → 9 */
function dealerIdx(dealerUpValue: number): number {
  if (dealerUpValue === 11) return 9
  if (dealerUpValue === 10) return 8
  return dealerUpValue - 2
}

function lookup(table: ChartAction[], dealerUpValue: number): ChartAction {
  return table[dealerIdx(dealerUpValue)] ?? 'H'
}

const HARD: Record<string, ChartAction[]> = {
  '5-8': ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],
  '9': ['H', 'Dh', 'Dh', 'Dh', 'Dh', 'H', 'H', 'H', 'H', 'H'],
  '10': ['Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'H', 'H'],
  '11': ['Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'H'],
  '12': ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'Rh'],
  '13': ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'Rh'],
  '14': ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh', 'Rh'],
  '15': ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'Rh'],
  '16': ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'Rh'],
  '17': ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'Rs'],
  '18+': ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

const SOFT: Record<number, ChartAction[]> = {
  13: ['H', 'H', 'H', 'Dh', 'Dh', 'H', 'H', 'H', 'H', 'H'],
  14: ['H', 'H', 'H', 'Dh', 'Dh', 'H', 'H', 'H', 'H', 'H'],
  15: ['H', 'H', 'Dh', 'Dh', 'Dh', 'H', 'H', 'H', 'H', 'H'],
  16: ['H', 'H', 'Dh', 'Dh', 'Dh', 'H', 'H', 'H', 'H', 'H'],
  17: ['H', 'Dh', 'Dh', 'Dh', 'Dh', 'H', 'H', 'H', 'H', 'H'],
  18: ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'],
  19: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  20: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  21: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
}

const PAIRS: Record<string, ChartAction[]> = {
  '2': ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'],
  '3': ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'Rh'],
  '4': ['H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H'],
  '5': ['Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'Dh', 'H', 'H'],
  '6': ['P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'Rh'],
  '7': ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'Rh', 'Rh', 'Rh'],
  '8': ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'Rh', 'Rh'],
  '9': ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'],
  T: ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],
  A: ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'H'],
}

function hardKey(total: number): string {
  if (total <= 8) return '5-8'
  if (total >= 18) return '18+'
  return String(total)
}

/** Rh/Rs: Stake has no surrender — use hit / stand instead. */
function chartToStrategy(chart: ChartAction, canDouble: boolean): StrategyAction {
  switch (chart) {
    case 'H':
    case 'Rh':
      return 'hit'
    case 'S':
    case 'Rs':
      return 'stand'
    case 'P':
      return 'split'
    case 'Dh':
      return canDouble ? 'double' : 'hit'
    case 'Ds':
      return canDouble ? 'double' : 'stand'
    default:
      return 'hit'
  }
}

export type StrategyAction = 'hit' | 'stand' | 'double' | 'split'

/**
 * Basic strategy (pairs, soft, hard).
 * `canSplit` only on exactly two cards.
 */
export function decideBasicStrategy(input: {
  cards: { rank: string }[]
  dealerUpValue: number
  canSplit: boolean
  canDouble: boolean
}): StrategyAction {
  const { cards, dealerUpValue: dv } = input
  const canSplit = input.canSplit && cards.length === 2
  const canDouble = input.canDouble

  const pairKind = canSplit ? classifyPair(cards) : null
  if (pairKind) {
    const chart = lookup(PAIRS[pairKind], dv)
    const action = chartToStrategy(chart, canDouble)
    if (action === 'split' && pairKind === '5') {
      return chartToStrategy(lookup(HARD['10'], dv), canDouble)
    }
    if (action === 'split' && !canSplit) {
      /* fall through to hard/soft */
    } else {
      return action
    }
  }

  const { total, isSoft } = analyzeHandTotals(cards)

  if (!isSoft && total >= 5 && total <= 7 && dv === 11) {
    return 'hit'
  }

  if (isSoft && total <= 21 && SOFT[total]) {
    return chartToStrategy(lookup(SOFT[total], dv), canDouble)
  }

  return chartToStrategy(lookup(HARD[hardKey(total)], dv), canDouble)
}

/** Map strategy decision to first allowed API action. */
export function mapStrategyToApiAction(decision: StrategyAction, allowedActions: string[]): string | null {
  const allowed = new Set(allowedActions)
  const tryOne = (a: StrategyAction): string | null => {
    return allowed.has(a) ? a : null
  }
  const first = tryOne(decision)
  if (first) return first
  if (decision === 'double') {
    if (tryOne('hit')) return 'hit'
    if (tryOne('stand')) return 'stand'
  }
  if (decision !== 'hit' && tryOne('hit')) return 'hit'
  if (decision !== 'stand' && tryOne('stand')) return 'stand'
  if (tryOne('double')) return 'double'
  if (tryOne('split')) return 'split'
  return null
}
