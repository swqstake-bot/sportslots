function currencyAmountToUsd(amount: number, currency: string, usdRates?: Record<string, number>): number {
  if (!usdRates || amount <= 0) return amount
  const rate = usdRates[currency.toLowerCase()]
  if (rate == null || rate <= 0) return amount
  return Math.round(amount * rate * 1e8) / 1e8
}

export type HiloCardState = { suit?: string; rank?: string }

export type MinesRoundState = { field?: number; payoutMultiplier?: number }

export type HiloRoundState = { card?: HiloCardState; guess?: string; payoutMultiplier?: number }

export type OriginalsBetApiState = {
  drawnNumbers?: number[]
  selectedNumbers?: number[]
  result?: number
  target?: number
  condition?: string
  multiplierTarget?: number
  mines?: number[]
  minesCount?: number
  rounds?: Array<MinesRoundState | HiloRoundState>
  startCard?: HiloCardState
}

export type OriginalsBetApiRow = {
  id?: string
  betApiId?: string
  amount?: number
  payout?: number
  payoutMultiplier?: number
  game?: string
  state?: OriginalsBetApiState
}

export type PlacementContext = {
  diceTarget?: number
  diceCondition?: string
  limboTarget?: number
  minesCount?: number
  diamondsCount?: number
  minesFields?: number[]
}

/** Games where a win is payoutMultiplier > 1 (Stake Originals / reference apps). */
const MULTI_WIN_GAMES = new Set([
  'keno',
  'plinko',
  'limbo',
  'wheel',
  'diamonds',
  'snakes',
  'flip',
  'rps',
  'rock-paper-scissors',
  'cases',
  'packs',
])

export function isMultiWinGame(game: string | undefined): boolean {
  return MULTI_WIN_GAMES.has(String(game || '').toLowerCase())
}

function optNum(o: Record<string, unknown>, key: string, def: number): number {
  const v = o[key]
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export function buildPlacementContext(game: string, opts: Record<string, unknown>): PlacementContext {
  const g = String(game || '').toLowerCase()
  if (g === 'dice') {
    const rollUnder = optNum(opts, 'rollUnder', 49.5)
    const rollOver = Boolean(opts.rollOver)
    const target = rollOver ? 100 - rollUnder : rollUnder
    return { diceTarget: target, diceCondition: rollOver ? 'above' : 'below' }
  }
  if (g === 'limbo') {
    return { limboTarget: Math.max(1.01, optNum(opts, 'targetMultiplier', 2)) }
  }
  if (g === 'mines') {
    const minesCount = Math.min(24, Math.max(1, optNum(opts, 'mines', 3)))
    const diamondsCount = Math.min(24, Math.max(1, optNum(opts, 'diamonds', 2)))
    const minesFields = Array.isArray(opts.minesFields)
      ? (opts.minesFields as number[]).filter((n) => Number.isFinite(n))
      : undefined
    return { minesCount, diamondsCount, minesFields }
  }
  return {}
}

function isMinesState(state?: OriginalsBetApiState): boolean {
  return (
    Array.isArray(state?.mines) ||
    state?.minesCount != null ||
    (Array.isArray(state?.rounds) && state.rounds.some((r) => 'field' in r))
  )
}

function isHiloState(state?: OriginalsBetApiState): boolean {
  return Boolean(state?.startCard) || (Array.isArray(state?.rounds) && state.rounds.some((r) => 'card' in r))
}

function minesRounds(state?: OriginalsBetApiState): MinesRoundState[] {
  if (!Array.isArray(state?.rounds)) return []
  return state.rounds.filter((r): r is MinesRoundState => 'field' in r && r.field != null)
}

function hiloRounds(state?: OriginalsBetApiState): HiloRoundState[] {
  if (!Array.isArray(state?.rounds)) return []
  return state.rounds.filter((r): r is HiloRoundState => 'card' in r && r.card != null)
}

export function formatHiloCardCode(card?: HiloCardState): string {
  if (!card?.rank) return ''
  const suit = String(card.suit ?? '').toUpperCase().slice(0, 1)
  return `${card.rank}${suit}`
}

export function buildHiloCardsChain(state?: OriginalsBetApiState): string | undefined {
  if (!state?.startCard?.rank) return undefined
  const cards = [formatHiloCardCode(state.startCard)]
  for (const round of hiloRounds(state)) {
    const code = formatHiloCardCode(round.card)
    if (code) cards.push(code)
  }
  return cards.length > 0 ? cards.join(' -> ') : undefined
}

function lastHiloCard(state?: OriginalsBetApiState): HiloCardState | undefined {
  const rounds = hiloRounds(state)
  if (rounds.length > 0) return rounds[rounds.length - 1].card
  return state?.startCard
}

export function extractDiceTarget(state?: OriginalsBetApiState, ctx?: PlacementContext): number | undefined {
  const v = state?.target ?? ctx?.diceTarget
  return v != null && Number.isFinite(Number(v)) ? Number(v) : undefined
}

export function extractDiceResult(state?: OriginalsBetApiState): number | undefined {
  const v = state?.result
  return v != null && Number.isFinite(Number(v)) ? Number(v) : undefined
}

export function extractLimboTarget(state?: OriginalsBetApiState, ctx?: PlacementContext): number | undefined {
  const v = state?.multiplierTarget ?? ctx?.limboTarget
  return v != null && Number.isFinite(Number(v)) ? Number(v) : undefined
}

export function extractLimboResult(state?: OriginalsBetApiState): number | undefined {
  const v = state?.result
  return v != null && Number.isFinite(Number(v)) ? Number(v) : undefined
}

export function extractMinesCount(state?: OriginalsBetApiState, ctx?: PlacementContext): number | undefined {
  const v = state?.minesCount ?? ctx?.minesCount
  return v != null && Number.isFinite(Number(v)) ? Number(v) : undefined
}

export function extractDiamondsCount(
  state?: OriginalsBetApiState,
  ctx?: PlacementContext
): number | undefined {
  const rounds = minesRounds(state)
  if (rounds.length > 0) return rounds.length
  if (ctx?.minesFields?.length) return ctx.minesFields.length
  if (ctx?.diamondsCount != null) return ctx.diamondsCount
  return undefined
}

export function extractMinesSelected(
  state?: OriginalsBetApiState,
  ctx?: PlacementContext
): number[] | undefined {
  const fromState = minesRounds(state)
    .map((r) => r.field)
    .filter((n): n is number => n != null && Number.isFinite(n))
  if (fromState.length > 0) return fromState
  if (ctx?.minesFields?.length) return ctx.minesFields
  return undefined
}

export function extractMinesLocations(state?: OriginalsBetApiState): number[] | undefined {
  if (!isMinesState(state) || !Array.isArray(state?.mines)) return undefined
  return state.mines.filter((n) => Number.isFinite(n))
}

export function extractHiloCards(state?: OriginalsBetApiState): string | undefined {
  if (!isHiloState(state)) return undefined
  return buildHiloCardsChain(state)
}

/** Win + payout/multi from API row — Keno uses payoutMultiplier > 1 like reference Originals apps. */
export function resolveOriginalsRoundUsd(
  betApi: OriginalsBetApiRow | null | undefined,
  amountPlaced: number,
  payoutRaw: number,
  currency: string,
  usdRates?: Record<string, number>,
  game?: string,
  placement?: PlacementContext
): {
  wageredUsd: number
  payoutUsd: number
  multi: number
  placedAmount: number
  payout: number
  win: boolean
  kenoPicks?: number[]
  kenoDrawn?: number[]
  kenoHits?: number
  diceTarget?: number
  diceResult?: number
  limboTarget?: number
  limboResult?: number
  minesCount?: number
  diamondsCount?: number
  minesSelected?: number[]
  minesLocations?: number[]
  hiloCards?: string
  hiloRank?: string
  hiloSuit?: string
} {
  const placedAmount = Number(betApi?.amount ?? amountPlaced)
  let payout = Number(betApi?.payout ?? payoutRaw)
  const apiMulti = Number(betApi?.payoutMultiplier)
  const g = String(game || betApi?.game || '').toLowerCase()

  let win = payout > placedAmount + 1e-12
  if (!win && isMultiWinGame(g) && Number.isFinite(apiMulti) && apiMulti > 1 + 1e-12) {
    win = true
    if (payout <= placedAmount + 1e-12 && placedAmount > 0) {
      payout = placedAmount * apiMulti
    }
  }

  const wageredUsd = currencyAmountToUsd(placedAmount, currency, usdRates)
  const payoutUsd = currencyAmountToUsd(payout, currency, usdRates)
  const multi =
    Number.isFinite(apiMulti) && apiMulti > 0
      ? apiMulti
      : win && wageredUsd > 0
        ? payoutUsd / wageredUsd
        : 0

  const state = betApi?.state
  const kenoPicks = Array.isArray(state?.selectedNumbers)
    ? state!.selectedNumbers!.filter((n) => Number.isFinite(n))
    : undefined
  const kenoDrawn = Array.isArray(state?.drawnNumbers)
    ? state!.drawnNumbers!.filter((n) => Number.isFinite(n))
    : undefined
  let kenoHits: number | undefined
  if (g === 'keno' && kenoPicks?.length && kenoDrawn?.length) {
    const drawnSet = new Set(kenoDrawn)
    kenoHits = kenoPicks.filter((n) => drawnSet.has(n)).length
  }

  const diceTarget = extractDiceTarget(state, placement)
  const diceResult = extractDiceResult(state)
  const limboTarget = extractLimboTarget(state, placement)
  const limboResult = extractLimboResult(state)
  const minesCount = extractMinesCount(state, placement)
  const diamondsCount = extractDiamondsCount(state, placement)
  const minesSelected = extractMinesSelected(state, placement)
  const minesLocations = extractMinesLocations(state)
  const hiloCards = extractHiloCards(state)
  const lastCard = lastHiloCard(state)

  return {
    wageredUsd,
    payoutUsd,
    multi,
    placedAmount,
    payout,
    win,
    kenoPicks,
    kenoDrawn,
    kenoHits,
    diceTarget,
    diceResult,
    limboTarget,
    limboResult,
    minesCount,
    diamondsCount,
    minesSelected,
    minesLocations,
    hiloCards,
    hiloRank: lastCard?.rank,
    hiloSuit: lastCard?.suit,
  }
}

export function resolveOnWinMode(
  opts: Record<string, unknown>,
  wbOnWin?: string | null
): string {
  return String(wbOnWin ?? opts.onWin ?? 'reset')
    .toLowerCase()
    .trim()
}

export function isB2bWinMode(
  opts: Record<string, unknown>,
  wb?: { onWin?: string; targetSelectionMode?: string; comboParts?: unknown[] }
): boolean {
  if (wb?.targetSelectionMode === 'combo' && (wb.comboParts?.length ?? 0) > 0) return true
  return resolveOnWinMode(opts, wb?.onWin) === 'b2b'
}
