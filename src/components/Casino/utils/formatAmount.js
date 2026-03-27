/**
 * Formatiert Beträge für die Anzeige.
 * value = Minor Units (Cent, Satoshi, etc.)
 * Fiat: /100, Crypto: unverändert
 */

/** 2-Dezimal-Fiat (Kopeken/Cent); mit Stake PROVIDER_CURRENCIES / stakeEngine FIAT abgleichen */
export const FIAT_CURRENCIES = [
  'eur', 'usd', 'usdc', 'usdt', 'ars', 'brl', 'mxn', 'cad', 'aud', 'clp', 'jpy', 'krw', 'inr', 'idr', 'php',
  'pkr', 'pln', 'ngn', 'cny', 'rub', 'try', 'dkk', 'pen', 'cop',
]
// Ohne Dezimalstellen – Wert = Betrag direkt (1000 = 1000 IDR)
export const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']

export function isFiat(currencyCode) {
  return FIAT_CURRENCIES.includes((currencyCode || '').toLowerCase())
}

export function isStable(currencyCode) {
  const c = (currencyCode || '').toLowerCase()
  return c === 'usdc' || c === 'usdt'
}

/**
 * @param {number} value - Betrag (Minor für 2-Dez-Währungen, direkt für IDR/JPY/KRW)
 * @param {string} currencyCode
 * @returns {string} z.B. "11,00" oder "1.000"
 */
export function formatAmount(value, currencyCode) {
  if (value == null || isNaN(value)) return '–'
  const n = Number(value)
  const curr = (currencyCode || '').toLowerCase()
  const divideBy100 = isFiat(curr) && !ZERO_DECIMAL_CURRENCIES.includes(curr)
  const displayValue = divideBy100 ? n / 100 : n
  return displayValue.toLocaleString('de-DE', {
    minimumFractionDigits: divideBy100 ? 2 : 0,
    maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.includes(curr) ? 0 : (divideBy100 ? 2 : 8),
  })
}

/**
 * Formatiert Betrag mit Währungssymbol für Einsatz-Dropdown
 * @param {number} value - Betrag (Minor oder provider-spezifisch)
 * @param {string} currencyCode
 * @param {{ displayDivisor?: number }} opts - displayDivisor: z.B. 10000 für Claw Buster (100000 = $10)
 */
export function formatBetLabel(value, currencyCode, opts = {}) {
  const divisor = opts?.displayDivisor
  const formatted = divisor
    ? (Number(value) / divisor).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : formatAmount(value, currencyCode)
  const cc = (currencyCode || '').toUpperCase()
  if (!cc) return String(value)
  if (cc === 'EUR') return `${formatted} €`
  if (['USD', 'USDC', 'USDT'].includes(cc)) return `$${formatted}`
  return `${formatted} ${cc}`
}

/**
 * Converts minor units (Satoshis/Cents) to major units (BTC/USD)
 * @param {number|string} amount - Minor units
 * @param {string} currency - Currency code
 * @returns {number} Major units
 */
export function toUnits(amount, currency) {
  const c = (currency || '').toLowerCase()
  if (ZERO_DECIMAL_CURRENCIES.includes(c)) return Number(amount)
  if (isFiat(c)) return Number(amount) / 100
  // Crypto: Stake uses 8 decimals (Satoshis) for internal calculation mostly
  return Number(amount) / 1e8
}

/**
 * Converts major units (BTC/USD) to minor units (Satoshis/Cents)
 * @param {number|string} units - Major units
 * @param {string} currency - Currency code
 * @returns {number} Minor units
 */
export function toMinor(units, currency) {
  const c = (currency || '').toLowerCase()
  if (ZERO_DECIMAL_CURRENCIES.includes(c)) return Math.round(Number(units))
  if (isFiat(c)) return Math.round(Number(units) * 100)
  // Crypto: Convert to Satoshis
  return Math.round(Number(units) * 1e8)
}

/** minBetUsd etc. – USD in Dollar (Major Units), flexible Dezimalstellen */
export function formatChallengeAmount(value, currencyCode) {
  if (value == null || isNaN(value)) return '–'
  const n = Number(value)
  const curr = (currencyCode || 'usd').toLowerCase()
  const maxDec = ZERO_DECIMAL_CURRENCIES.includes(curr) ? 0 : (['btc', 'eth', 'ltc', 'doge'].includes(curr) ? 8 : 4)
  const minDec = n >= 1 || n === 0 ? 2 : (n >= 0.01 ? 2 : 4)
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: Math.min(minDec, maxDec),
    maximumFractionDigits: maxDec,
  })
}

export function formatChallengeAmountWithSymbol(value, currencyCode) {
  const formatted = formatChallengeAmount(value, currencyCode)
  const cc = (currencyCode || 'usd').toUpperCase()
  if (cc === 'EUR') return `${formatted} €`
  if (['USD', 'USDC', 'USDT'].includes(cc)) return `$${formatted}`
  return `${formatted} ${cc}`
}
