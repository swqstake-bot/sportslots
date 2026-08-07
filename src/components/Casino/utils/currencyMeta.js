/**
 * Central currency metadata used across Casino/Sports calculations.
 * Keep this file as the single source for currency class decisions.
 */

export const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']

export const FIAT_CURRENCIES = [
  'eur', 'usd', 'usdc', 'usdt', 'ars', 'brl', 'mxn', 'cad', 'aud', 'clp', 'jpy', 'krw', 'inr', 'idr', 'php',
  'pkr', 'pln', 'ngn', 'cny', 'rub', 'try', 'dkk', 'pen', 'cop',
]

/** Stake.eu GoldCoins — wallet codes + RGS aliases.
 * Wallet: gold/sweeps. RGS/providers: XGC/XSC (Stake Engine) and XSWP (Hacksaw/Pragmatic HAR). */
export const GOLD_COIN_CURRENCIES = ['gold', 'sweeps', 'xgc', 'xsc', 'xswp', 'gc', 'sc']

export const USD_LIKE_CURRENCIES = ['usd', 'usdc', 'usdt']

export function normalizeCurrencyCode(currencyCode) {
  return String(currencyCode || '').toLowerCase()
}

/** Map RGS aliases → wallet codes used in the UI (gold/sweeps). */
export function canonicalizeGoldCoinCode(currencyCode) {
  const c = normalizeCurrencyCode(currencyCode)
  if (c === 'xgc' || c === 'gold' || c === 'gc') return 'gold'
  if (c === 'xsc' || c === 'xswp' || c === 'sweeps' || c === 'sc') return 'sweeps'
  return c
}

export function isZeroDecimalCurrency(currencyCode) {
  return ZERO_DECIMAL_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

export function isFiatCurrency(currencyCode) {
  return FIAT_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

export function isGoldCoinCurrency(currencyCode) {
  return GOLD_COIN_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

export function isStableCurrency(currencyCode) {
  const c = normalizeCurrencyCode(currencyCode)
  return c === 'usdc' || c === 'usdt'
}

export function isUsdLikeCurrency(currencyCode) {
  return USD_LIKE_CURRENCIES.includes(normalizeCurrencyCode(currencyCode))
}

/** Challenge Hunter: USDC-Session mit USD-Ziel und houseBets in USDC trotzdem matchen. */
export function hunterBetCurrenciesMatch(a, b) {
  const x = normalizeCurrencyCode(a)
  const y = normalizeCurrencyCode(b)
  if (!x || !y) return true
  if (x === y) return true
  if (isUsdLikeCurrency(x) && isUsdLikeCurrency(y)) return true
  if (isGoldCoinCurrency(x) && isGoldCoinCurrency(y)) {
    return canonicalizeGoldCoinCode(x) === canonicalizeGoldCoinCode(y)
  }
  return false
}

export function getMinorFactor(currencyCode) {
  if (isZeroDecimalCurrency(currencyCode)) return 1
  if (isFiatCurrency(currencyCode) || isGoldCoinCurrency(currencyCode)) return 100
  return 1e8
}

export function getDisplayFractionDigits(currencyCode) {
  if (isZeroDecimalCurrency(currencyCode)) return 0
  if (isFiatCurrency(currencyCode) || isGoldCoinCurrency(currencyCode)) return 2
  return 8
}

export function getCurrencyLabel(currencyCode) {
  const c = canonicalizeGoldCoinCode(currencyCode)
  if (c === 'gold') return 'GC'
  if (c === 'sweeps') return 'SC'
  const raw = normalizeCurrencyCode(currencyCode)
  return raw ? raw.toUpperCase() : ''
}
