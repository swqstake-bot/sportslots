/**
 * Stake-Währungen – Crypto & Fiat
 * Quelle: thirdPartyGameAvailableCurrencies (HAR) + typische Stake-Currencies
 * source = Kontowährung (wo das Guthaben liegt)
 * target = Anzeige-/Spielwährung
 */

/** Welche Währungen jeder Provider unterstützt (SSP-Pattern / Stake thirdPartyGame) */
export const PROVIDER_CURRENCIES = {
  hacksaw: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  stakeEngine: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'pen', 'php', 'pln', 'pkr', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  pragmatic: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
  nolimit: ['eur', 'usd', 'ars', 'cad', 'clp', 'cny', 'dkk', 'idr', 'inr', 'jpy', 'krw', 'mxn', 'ngn', 'pen', 'php', 'pln', 'rub', 'try', 'vnd', 'usdc', 'usdt', 'btc', 'eth', 'ltc', 'bch', 'doge', 'shib', 'sol', 'xrp', 'trx', 'matic', 'ada', 'bnb'],
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
}

export const ALL_CURRENCIES = [...CURRENCY_GROUPS.crypto, ...CURRENCY_GROUPS.fiat]
