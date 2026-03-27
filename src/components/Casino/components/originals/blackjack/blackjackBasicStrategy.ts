/**
 * Basic Strategy für Stake Originals Blackjack (Script-Mode), gemäß Nutzer-Regeln.
 */

export function isTenValue(rank: string): boolean {
  const r = String(rank || '').toUpperCase()
  return r === '10' || r === 'J' || r === 'Q' || r === 'K'
}

/** Dealer-Up-Karte → 2–10 oder 11 (Ass). */
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

/** Zwei Karten: Paar-Typ für Strategie (10/J/Q/K → gemeinsame „Zehner“-Paar-Logik). */
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
  /** Beste Summe für Entscheidung (Soft zählt Ass als 11 wenn möglich). */
  total: number
  isSoft: boolean
}

/** Werte aus offenen Karten (Ass als 1 oder 11). */
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

function inRange(d: number, lo: number, hi: number): boolean {
  return d >= lo && d <= hi
}

export type StrategyAction = 'hit' | 'stand' | 'double' | 'split'

/**
 * Basic Strategy (Paare, Soft, Hard). `canSplit` nur bei genau zwei Karten und erlaubtem Split.
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

  const chooseDouble = (primary: StrategyAction, fallback: StrategyAction): StrategyAction => {
    if (primary === 'double' && !canDouble) return fallback
    return primary
  }

  if (pairKind) {
    switch (pairKind) {
      case 'A':
        return 'split'
      case '2':
      case '3':
        return inRange(dv, 2, 7) ? 'split' : 'hit'
      case '4':
        return inRange(dv, 5, 6) ? 'split' : 'hit'
      case '5':
        return chooseDouble(inRange(dv, 2, 9) ? 'double' : 'hit', inRange(dv, 2, 9) ? 'hit' : 'hit')
      case '6':
        return inRange(dv, 2, 6) ? 'split' : 'hit'
      case '7':
        return inRange(dv, 2, 7) ? 'split' : 'hit'
      case '8':
        return 'split'
      case '9':
        if (dv === 7 || dv === 10 || dv === 11) return 'stand'
        if (inRange(dv, 2, 6) || dv === 8 || dv === 9) return 'split'
        return 'stand'
      case 'T':
        return 'stand'
      default:
        break
    }
  }

  const { total, isSoft } = analyzeHandTotals(cards)

  if (isSoft) {
    if (total >= 20) return 'stand'
    if (total === 19) return chooseDouble(dv === 6 ? 'double' : 'stand', 'stand')
    if (total >= 16 && total <= 18) return chooseDouble(inRange(dv, 2, 6) ? 'double' : 'stand', 'stand')
    if (total >= 13 && total <= 15) return chooseDouble(inRange(dv, 5, 6) ? 'double' : 'hit', 'hit')
    if (total <= 12) return 'hit'
    return 'stand'
  }

  if (total <= 8) return 'hit'
  if (total === 9) return chooseDouble(inRange(dv, 3, 6) ? 'double' : 'hit', 'hit')
  if (total === 10) return chooseDouble(inRange(dv, 2, 9) ? 'double' : 'hit', 'hit')
  if (total === 11) return chooseDouble(inRange(dv, 2, 10) ? 'double' : 'hit', 'hit')
  if (total === 12) return inRange(dv, 4, 6) ? 'stand' : 'hit'
  if (total >= 13 && total <= 16) return inRange(dv, 2, 6) ? 'stand' : 'hit'
  return 'stand'
}

/** Erste erlaubte Aktion passend zur Strategie (Reihenfolge: Entscheidung → hit → stand). */
export function mapStrategyToApiAction(decision: StrategyAction, allowedActions: string[]): string | null {
  const allowed = new Set(allowedActions)
  const tryOne = (a: StrategyAction): string | null => {
    const key = a === 'double' ? 'double' : a
    return allowed.has(key) ? key : null
  }
  const first = tryOne(decision)
  if (first) return first
  if (decision !== 'hit' && tryOne('hit')) return 'hit'
  if (decision !== 'stand' && tryOne('stand')) return 'stand'
  if (tryOne('double')) return 'double'
  if (tryOne('split')) return 'split'
  return null
}
