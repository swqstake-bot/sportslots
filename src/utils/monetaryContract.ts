export type MonetaryUnit = 'major' | 'minor'
export type FxStatus = 'ok' | 'missing-rate' | 'invalid-amount'

const ZERO_DECIMAL = new Set(['idr', 'jpy', 'krw', 'vnd'])
const FIAT = new Set([
  'eur', 'usd', 'usdc', 'usdt', 'ars', 'brl', 'mxn', 'cad', 'aud', 'clp', 'jpy', 'krw', 'inr', 'idr', 'php',
  'pkr', 'pln', 'ngn', 'cny', 'rub', 'try', 'dkk', 'pen', 'cop',
])
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
  fxRate: number | null
}

export function normalizeCurrencyCode(currencyCode: unknown): string {
  return String(currencyCode || '').trim().toLowerCase()
}

export function getMinorFactor(currencyCode: unknown): number {
  const c = normalizeCurrencyCode(currencyCode)
  if (ZERO_DECIMAL.has(c)) return 1
  if (FIAT.has(c)) return 100
  return 1e8
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
    return { ...base, usdAmount: null, usdCents: null, fxStatus: 'invalid-amount', fxSource: null, fxRate: null }
  }
  if (USD_LIKE.has(base.currencyCode)) {
    const usd = base.amountMajor
    return { ...base, usdAmount: usd, usdCents: Math.round(usd * 100), fxStatus: 'ok', fxSource: 'usd-like', fxRate: 1 }
  }
  const rate = Number(rates?.[base.currencyCode])
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ...base, usdAmount: null, usdCents: null, fxStatus: 'missing-rate', fxSource: 'rates', fxRate: null }
  }
  const usd = base.amountMajor * rate
  return { ...base, usdAmount: usd, usdCents: Math.round(usd * 100), fxStatus: 'ok', fxSource: 'rates', fxRate: rate }
}

