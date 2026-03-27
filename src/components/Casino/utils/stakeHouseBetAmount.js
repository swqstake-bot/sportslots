/**
 * Stake GraphQL `houseBets.bet.amount` / `payout` — Einheit ist nicht einheitlich dokumentiert:
 * - Fiat: oft Integer = Minor (Cent), z. B. 10 = $0,10
 * - Fiat: oft Float = Major, z. B. 0,06 = $0,06
 * Die alte Heuristik „raw < 500 → toMinor(raw)“ behandelte 10 als $10 Major → 1000 Cent — falsch,
 * bricht Einsatz-Matching (Bet-IDs) und wirkt wie „alles überschrieben“.
 */
import { isFiat, toUnits, toMinor, ZERO_DECIMAL_CURRENCIES } from './formatAmount'

/**
 * @param {number|string} rawAmount — wie von GraphQL
 * @param {string} currency
 * @returns {number} Major units (wie toUnits(betAmount) aus dem Spin)
 */
export function stakeHouseBetAmountToMajor(rawAmount, currency) {
  const curr = (currency || '').toLowerCase()
  const raw = Number(rawAmount)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  const zd = ZERO_DECIMAL_CURRENCIES.includes(curr)
  const fi = isFiat(curr)

  if (fi && !zd) {
    const str = String(rawAmount).trim()
    const looksLikeIntegerToken = /^\d+$/.test(str)
    if (looksLikeIntegerToken && raw > 0 && raw < 1_000_000) {
      return toUnits(raw, curr)
    }
  }

  const amountAsMinor = raw < 500 ? toMinor(raw, curr) : raw
  return toUnits(amountAsMinor, curr)
}
