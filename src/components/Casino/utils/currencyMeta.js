/**
 * Central currency metadata used across Casino/Sports calculations.
 * Keep this file as the single source for currency class decisions.
 */

export const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']

export const FIAT_CURRENCIES = [
  'eur', 'usd', 'usdc', 'usdt', 'ars', 'brl', 'mxn', 'cad', 'aud', 'clp', 'jpy', 'krw', 'inr', 'idr', 'php',
  'pkr', 'pln', 'ngn', 'cny', 'rub', 'try', 'dkk', 'pen', 'cop',
]

export const USD_LIKE_CURRENCIES = ['usd', 'usdc', 'usdt']

export function normalizeCurrencyCode(currencyCode) {
  return String(currencyCode || '').toLowerCase()
}

export function isZeroDecimalCurrency(currencyCode) {
  return ZERO_DECIMAL_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

export function isFiatCurrency(currencyCode) {
  return FIAT_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

export function isStableCurrency(currencyCode) {
  const c = normalizeCurrencyCode(currencyCode)
  return c === 'usdc' || c === 'usdt'
}

export function isUsdLikeCurrency(currencyCode) {
  return USD_LIKE_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

export function getMinorFactor(currencyCode) {
  if (isZeroDecimalCurrency(currencyCode)) return 1
  if (isFiatCurrency(currencyCode)) return 100
  return 1e8
}

export function getDisplayFractionDigits(currencyCode) {
  if (isZeroDecimalCurrency(currencyCode)) return 0
  if (isFiatCurrency(currencyCode)) return 2
  return 8
}
