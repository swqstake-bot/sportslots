import {
  getMinorFactor,
  isUsdLikeCurrency,
  normalizeCurrencyCode,
} from './currencyMeta'

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeMinorAmount(amountMinor, currencyCode) {
  const currency = normalizeCurrencyCode(currencyCode)
  const minor = Math.round(toFiniteNumber(amountMinor, 0))
  const factor = getMinorFactor(currency)
  const amountMajor = factor > 0 ? minor / factor : 0
  return {
    currencyCode: currency,
    unit: 'minor',
    amountMinor: minor,
    amountMajor,
  }
}

export function normalizeMajorAmount(amountMajor, currencyCode) {
  const currency = normalizeCurrencyCode(currencyCode)
  const major = toFiniteNumber(amountMajor, 0)
  const factor = getMinorFactor(currency)
  const amountMinor = Math.round(major * factor)
  return {
    currencyCode: currency,
    unit: 'major',
    amountMajor: major,
    amountMinor,
  }
}

export function normalizeMonetaryAmount(value, currencyCode, unit = 'minor') {
  return unit === 'major'
    ? normalizeMajorAmount(value, currencyCode)
    : normalizeMinorAmount(value, currencyCode)
}

export function convertMinorToUsdCents(amountMinor, currencyCode, currencyRates = {}) {
  const base = normalizeMinorAmount(amountMinor, currencyCode)
  if (!Number.isFinite(base.amountMajor)) {
    return { usdCents: null, fxStatus: 'invalid-amount', fxRateSource: null, fxRate: null, ...base }
  }

  if (isUsdLikeCurrency(base.currencyCode)) {
    return { usdCents: Math.round(base.amountMajor * 100), fxStatus: 'ok', fxRateSource: 'usd-like', fxRate: 1, ...base }
  }

  const rate = Number(currencyRates?.[base.currencyCode])
  if (!Number.isFinite(rate) || rate <= 0) {
    return { usdCents: null, fxStatus: 'missing-rate', fxRateSource: 'rates', fxRate: null, ...base }
  }

  return {
    usdCents: Math.round(base.amountMajor * rate * 100),
    fxStatus: 'ok',
    fxRateSource: 'rates',
    fxRate: rate,
    ...base,
  }
}

export function inferHouseBetAmountUnit(rawAmount) {
  const raw = Number(rawAmount)
  if (!Number.isFinite(raw) || raw <= 0) return 'major'
  // GraphQL houseBets often sends integer tokens for minor amounts.
  if (Number.isInteger(raw)) return 'minor'
  return 'major'
}

export function normalizeHouseBetAmount(rawAmount, currencyCode) {
  const unit = inferHouseBetAmountUnit(rawAmount)
  return normalizeMonetaryAmount(rawAmount, currencyCode, unit)
}

export function netMinor(winMinor, betMinor) {
  return Math.round(toFiniteNumber(winMinor, 0) - toFiniteNumber(betMinor, 0))
}

