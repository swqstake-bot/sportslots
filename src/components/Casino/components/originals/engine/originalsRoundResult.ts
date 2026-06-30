function currencyAmountToUsd(amount: number, currency: string, usdRates?: Record<string, number>): number {
  if (!usdRates || amount <= 0) return amount
  const rate = usdRates[currency.toLowerCase()]
  if (rate == null || rate <= 0) return amount
  return Math.round(amount * rate * 1e8) / 1e8
}

export type OriginalsBetApiRow = {
  id?: string
  betApiId?: string
  amount?: number
  payout?: number
  payoutMultiplier?: number
  game?: string
  state?: {
    drawnNumbers?: number[]
    selectedNumbers?: number[]
  }
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

/** Win + payout/multi from API row — Keno uses payoutMultiplier > 1 like reference Originals apps. */
export function resolveOriginalsRoundUsd(
  betApi: OriginalsBetApiRow | null | undefined,
  amountPlaced: number,
  payoutRaw: number,
  currency: string,
  usdRates?: Record<string, number>,
  game?: string
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

  return { wageredUsd, payoutUsd, multi, placedAmount, payout, win, kenoPicks, kenoDrawn, kenoHits }
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
