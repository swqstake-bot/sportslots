/**
 * Lightweight account-wide spacing for Challenge Hunter / Telegram / Slots placeBets.
 * Dev probe (Dice 4 workers): stable ~8 bets/s; above that → 429s.
 * Originals turbo uses its own (looser) fire interval — see turboConfig.ts.
 * Spacing starts (not round-trips) so a single RTT-bound run stays near max speed,
 * while N parallel hunter slots cannot each do ~7/s unchecked.
 */

/** ~8 bets/s Hunter/Slots budget (1000/125). Keep stricter than Originals turbo. */
export const CASINO_ACCOUNT_PACE_INTERVAL_MS = 125

let nextAllowedAt = 0

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Wait until the next account-wide placeBet slot, then reserve it.
 * @param {number} [intervalMs]
 */
export async function waitCasinoAccountPace(intervalMs = CASINO_ACCOUNT_PACE_INTERVAL_MS) {
  const gap = Number(intervalMs)
  const step = Number.isFinite(gap) && gap > 0 ? gap : CASINO_ACCOUNT_PACE_INTERVAL_MS
  const now = Date.now()
  const wait = Math.max(0, nextAllowedAt - now)
  nextAllowedAt = Math.max(now, nextAllowedAt) + step
  if (wait > 0) await sleep(wait)
}
