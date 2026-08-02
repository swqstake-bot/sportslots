export type MonetaryUnit = 'major' | 'minor'
export type FxStatus = 'ok' | 'missing-rate' | 'invalid-amount'

const ZERO_DECIMAL = new Set(['idr', 'jpy', 'krw', 'vnd'])
const FIAT = new Set([
  'eur', 'usd', 'usdc', 'usdt', 'ars', 'brl', 'mxn', 'cad', 'aud', 'clp', 'jpy', 'krw', 'inr', 'idr', 'php',
  'pkr', 'pln', 'ngn', 'cny', 'rub', 'try', 'dkk', 'pen', 'cop',
])
/** Stake.eu GoldCoins — 2-decimal minor units, no USD FX. */
const GOLD_COINS = new Set(['gold', 'sweeps'])
const USD_LIKE = new Set(['usd', 'usdc', 'usdt'])

export interface MonetaryAmount {
  currencyCode: string
  unit: MonetaryUnit
  amountMajor: number
  amountMinor: number
}

export interface UsdConversion extends MonetaryAmount {
  usdAmount: number | null
  usdCents: number | null
  fxStatus: FxStatus
  fxSource: 'usd-like' | 'rates' | null
  fxRateSource: 'usd-like' | 'rates' | null
  fxRate: number | null
}

export function normalizeCurrencyCode(currencyCode: unknown): string {
  return String(currencyCode || '').trim().toLowerCase()
}

export function getMinorFactor(currencyCode: unknown): number {
  const c = normalizeCurrencyCode(currencyCode)
  if (ZERO_DECIMAL.has(c)) return 1
  if (FIAT.has(c) || GOLD_COINS.has(c)) return 100
  return 1e8
}

export function isGoldCoinCurrency(currencyCode: unknown): boolean {
  return GOLD_COINS.has(normalizeCurrencyCode(currencyCode))
}

export function isUsdLikeCurrency(currencyCode: unknown): boolean {
  return USD_LIKE.has(normalizeCurrencyCode(currencyCode))
}

export function normalizeAmount(value: unknown, currencyCode: unknown, unit: MonetaryUnit): MonetaryAmount {
  const currency = normalizeCurrencyCode(currencyCode)
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : 0
  const factor = getMinorFactor(currency)
  const amountMajor = unit === 'major' ? safe : safe / factor
  const amountMinor = unit === 'minor' ? Math.round(safe) : Math.round(safe * factor)
  return {
    currencyCode: currency,
    unit,
    amountMajor,
    amountMinor,
  }
}

export function convertToUsd(value: unknown, currencyCode: unknown, unit: MonetaryUnit, rates: Record<string, number> = {}): UsdConversion {
  const base = normalizeAmount(value, currencyCode, unit)
  if (!Number.isFinite(base.amountMajor)) {
    return {
      ...base,
      usdAmount: null,
      usdCents: null,
      fxStatus: 'invalid-amount',
      fxSource: null,
      fxRateSource: null,
      fxRate: null,
    }
  }
  if (USD_LIKE.has(base.currencyCode)) {
    const usd = base.amountMajor
    return {
      ...base,
      usdAmount: usd,
      usdCents: Math.round(usd * 100),
      fxStatus: 'ok',
      fxSource: 'usd-like',
      fxRateSource: 'usd-like',
      fxRate: 1,
    }
  }
  if (GOLD_COINS.has(base.currencyCode)) {
    // Stake.eu: SC ≈ $1; GC play-money — use 1:1 for stats/display (no FX feed).
    const usd = base.amountMajor
    return {
      ...base,
      usdAmount: usd,
      usdCents: Math.round(usd * 100),
      fxStatus: 'ok',
      fxSource: 'usd-like',
      fxRateSource: 'usd-like',
      fxRate: 1,
    }
  }
  const rate = Number(rates?.[base.currencyCode])
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      ...base,
      usdAmount: null,
      usdCents: null,
      fxStatus: 'missing-rate',
      fxSource: 'rates',
      fxRateSource: 'rates',
      fxRate: null,
    }
  }
  const usd = base.amountMajor * rate
  return {
    ...base,
    usdAmount: usd,
    usdCents: Math.round(usd * 100),
    fxStatus: 'ok',
    fxSource: 'rates',
    fxRateSource: 'rates',
    fxRate: rate,
  }
}

export function inferHouseBetAmountUnit(rawAmount: unknown): MonetaryUnit {
  const raw = Number(rawAmount)
  if (!Number.isFinite(raw) || raw <= 0) return 'major'
  return Number.isInteger(raw) ? 'minor' : 'major'
}

export function normalizeHouseBetAmount(rawAmount: unknown, currencyCode: unknown): MonetaryAmount {
  return normalizeAmount(rawAmount, currencyCode, inferHouseBetAmountUnit(rawAmount))
}

export function netMinor(winMinor: unknown, betMinor: unknown): number {
  const win = Number(winMinor)
  const bet = Number(betMinor)
  const safeWin = Number.isFinite(win) ? win : 0
  const safeBet = Number.isFinite(bet) ? bet : 0
  return Math.round(safeWin - safeBet)
}

