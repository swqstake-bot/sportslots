/**
 * Stake GraphQL `houseBets.bet.amount` / `payout` — Einheit ist nicht einheitlich dokumentiert:
 * - Fiat: oft Integer = Minor (Cent), z. B. 10 = $0,10
 * - Fiat: oft Float = Major, z. B. 0,06 = $0,06
 * Die alte Heuristik „raw < 500 → toMinor(raw)“ behandelte 10 als $10 Major → 1000 Cent — falsch,
 * bricht Einsatz-Matching (Bet-IDs) und wirkt wie „alles überschrieben“.
 */
import { normalizeHouseBetAmount } from './monetaryContract'

/**
 * @param {number|string} rawAmount — wie von GraphQL
 * @param {string} currency
 * @returns {number} Major units (wie toUnits(betAmount) aus dem Spin)
 */
export function stakeHouseBetAmountToMajor(rawAmount, currency) {
  const normalized = normalizeHouseBetAmount(rawAmount, currency)
  return Number.isFinite(normalized.amountMajor) ? normalized.amountMajor : 0
}
