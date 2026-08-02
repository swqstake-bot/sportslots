/**
 * Stake-Währungen – Crypto & Fiat
 * Quelle: thirdPartyGameAvailableCurrencies (HAR) + typische Stake-Currencies
 * source = Kontowährung (wo das Guthaben liegt)
 * target = Anzeige-/Spielwährung
 */

/** Welche Währungen jeder Provider unterstützt (SSP-Pattern / Stake thirdPartyGame) */
export const PROVIDER_CURRENCIES = {
  hacksaw: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  /**
   * Truelab / Softswiss: nicht die volle stakeEngine-Liste — PKR u. a. provozieren oft
   * `softswiss_currency_not_supported` und danach GraphQL-Fallbacks mit `error.invalid_enum`.
   * Gleiches Muster wie hacksaw (kein PKR).
   */
  truelab: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  stakeEngine: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'pen', 'php', 'pln', 'pkr', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  pragmatic: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pkr', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  nolimit: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  gamesglobal: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  jaderabbit: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
}

/** Gemeinsame Währungen für gegebene Slots (Schnittmenge) */
export function getCurrenciesForSlots(slots) {
  if (!slots?.length) return null
  const sets = slots.map((s) => {
    const list = PROVIDER_CURRENCIES[s.providerId]
    return list ? new Set(list.map((c) => c.toLowerCase())) : null
  }).filter(Boolean)
  if (sets.length === 0) return null
  const first = sets[0]
  const common = [...first].filter((c) => sets.every((s) => s.has(c)))
  return common.length ? common : [...first]
}

/** Gefilterte Währungsliste für Anzeige (nur erlaubte) */
export function filterCurrenciesByProvider(currencies, slots) {
  const allowed = getCurrenciesForSlots(slots)
  if (!allowed) return currencies
  const set = new Set(allowed.map((c) => c.toLowerCase()))
  return currencies.filter((c) => set.has((c.value || c).toLowerCase()))
}

export const CURRENCY_GROUPS = {
  crypto: [
    { value: 'btc', label: 'BTC' },
    { value: 'eth', label: 'ETH' },
    { value: 'ltc', label: 'LTC' },
    { value: 'doge', label: 'DOGE' },
    { value: 'bch', label: 'BCH' },
    { value: 'shib', label: 'SHIB' },
    { value: 'usdt', label: 'USDT' },
    { value: 'usdc', label: 'USDC' },
    { value: 'xrp', label: 'XRP' },
    { value: 'trx', label: 'TRX' },
    { value: 'sol', label: 'SOL' },
    { value: 'matic', label: 'MATIC' },
    { value: 'ada', label: 'ADA' },
    { value: 'bnb', label: 'BNB' },
  ],
  fiat: [
    { value: 'eur', label: 'EUR' },
    { value: 'usd', label: 'USD' },
    { value: 'cad', label: 'CAD' },
    { value: 'aud', label: 'AUD' },
    { value: 'brl', label: 'BRL' },
    { value: 'mxn', label: 'MXN' },
    { value: 'ars', label: 'ARS' },
    { value: 'clp', label: 'CLP' },
    { value: 'cny', label: 'CNY' },
    { value: 'jpy', label: 'JPY' },
    { value: 'krw', label: 'KRW' },
    { value: 'inr', label: 'INR' },
    { value: 'idr', label: 'IDR' },
    { value: 'php', label: 'PHP' },
    { value: 'pkr', label: 'PKR' },
    { value: 'pln', label: 'PLN' },
    { value: 'ngn', label: 'NGN' },
    { value: 'dkk', label: 'DKK' },
    { value: 'pen', label: 'PEN' },
    { value: 'rub', label: 'RUB' },
    { value: 'try', label: 'TRY' },
    { value: 'vnd', label: 'VND' },
  ],
  /** Stake.eu GoldCoins — GC / SC. */
  goldCoins: [
    { value: 'gold', label: 'GC' },
    { value: 'sweeps', label: 'SC' },
  ],
}

export const ALL_CURRENCIES = [
  ...CURRENCY_GROUPS.crypto,
  ...CURRENCY_GROUPS.fiat,
  ...CURRENCY_GROUPS.goldCoins,
]

export const EU_CURRENCY_CODES = ['gold', 'sweeps']

export const EU_CURRENCIES = CURRENCY_GROUPS.goldCoins

export function isEuGoldCoinCode(code) {
  return EU_CURRENCY_CODES.includes(String(code || '').toLowerCase())
}

/**
 * Selectable currency options for settings / wallet UI.
 * - .eu → only GC/SC
 * - .com → crypto+fiat (no goldCoins)
 * - If `ownedCodes` given → only wallets the user actually has
 * @param {{
 *   site?: 'com'|'eu'|string,
 *   ownedCodes?: string[]|Record<string, unknown>|null,
 *   baseList?: Array<{value:string,label?:string}|string>|null,
 * }} [opts]
 * @returns {Array<{value:string,label:string}>}
 */
export function buildSelectableCurrencyOptions({
  site = 'com',
  ownedCodes = null,
  baseList = null,
} = {}) {
  const preferred = String(site || 'com').toLowerCase() === 'eu' ? 'eu' : 'com'
  let pool
  if (Array.isArray(baseList) && baseList.length) {
    pool = baseList.map((c) =>
      typeof c === 'string'
        ? { value: c.toLowerCase(), label: String(c).toUpperCase() }
        : { value: String(c.value || '').toLowerCase(), label: c.label || String(c.value || '').toUpperCase() }
    )
  } else {
    pool = preferred === 'eu' ? [...EU_CURRENCIES] : [...CURRENCY_GROUPS.crypto, ...CURRENCY_GROUPS.fiat]
  }

  if (preferred === 'eu') {
    pool = pool.filter((c) => isEuGoldCoinCode(c.value))
    // Ensure GC/SC labels even if baseList used uppercase codes
    pool = pool.map((c) => {
      const hit = EU_CURRENCIES.find((e) => e.value === c.value)
      return hit ? { ...c, label: hit.label } : c
    })
  } else {
    pool = pool.filter((c) => !isEuGoldCoinCode(c.value))
  }

  if (ownedCodes != null) {
    const owned = new Set(
      (Array.isArray(ownedCodes) ? ownedCodes : Object.keys(ownedCodes || {})).map((c) =>
        String(c || '').toLowerCase()
      )
    )
    pool = pool.filter((c) => owned.has(c.value))
  }

  // Deduplicate
  const seen = new Set()
  return pool.filter((c) => {
    if (!c.value || seen.has(c.value)) return false
    seen.add(c.value)
    return true
  })
}

/**
 * @param {Array<{value:string,label:string}>|null|undefined} options
 * @returns {{ crypto: Array<{value:string,label:string}>, fiat: Array<{value:string,label:string}>, goldCoins: Array<{value:string,label:string}> }}
 */
export function groupSelectableCurrencyOptions(options) {
  const list = Array.isArray(options) ? options : []
  const cryptoSet = new Set(CURRENCY_GROUPS.crypto.map((c) => c.value))
  const fiatSet = new Set(CURRENCY_GROUPS.fiat.map((c) => c.value))
  return {
    crypto: list.filter((c) => cryptoSet.has(c.value)),
    fiat: list.filter((c) => fiatSet.has(c.value)),
    goldCoins: list.filter((c) => isEuGoldCoinCode(c.value)),
  }
}

/** Pick a safe default when current currency is not in the selectable list.
 * @param {Array<{value:string,label?:string}>|null|undefined} options
 * @param {string} [current]
 * @param {string} [site]
 * @returns {string}
 */
export function pickDefaultCurrency(options, current, site = 'com') {
  const list = Array.isArray(options) ? options : []
  const cur = String(current || '').toLowerCase()
  if (cur && list.some((c) => c.value === cur)) return cur
  if (String(site || '').toLowerCase() === 'eu') {
    if (list.some((c) => c.value === 'sweeps')) return 'sweeps'
    if (list.some((c) => c.value === 'gold')) return 'gold'
  }
  if (list.some((c) => c.value === 'usdc')) return 'usdc'
  if (list.some((c) => c.value === 'btc')) return 'btc'
  return list[0]?.value || (String(site || '').toLowerCase() === 'eu' ? 'sweeps' : 'usdc')
}
