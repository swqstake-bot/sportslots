/**
 * Bet sizing for Autorun (same rounding / bet-level logic as Challenge Hunter).
 */
import { isFiat, toMinor, toUnits, ZERO_DECIMAL_CURRENCIES } from '../../utils/formatAmount'

export function pickSmallestBetLevelForMinUsd(
  betLevels: number[],
  tCurr: string,
  rate: number,
  minBetUsd: number
): number | null {
  if (!Array.isArray(betLevels) || betLevels.length === 0) return null
  const sorted = [...betLevels].sort((a, b) => a - b)
  let best: number | null = null
  let bestUsd = Infinity
  for (const lvl of sorted) {
    const usd = toUnits(lvl, tCurr) * rate
    if (usd + 1e-9 >= minBetUsd) {
      if (usd < bestUsd - 1e-9) {
        bestUsd = usd
        best = lvl
      }
    }
  }
  return best
}

export function computeBetFromMinBetAndSession(
  session: { betLevels?: number[] } | null,
  tCurr: string,
  rate: number,
  minBetUsd: number
): { betAmount: number; usdAt: number } {
  let targetBetUnits = minBetUsd / rate
  if (ZERO_DECIMAL_CURRENCIES.includes(tCurr)) {
    targetBetUnits = Math.ceil(targetBetUnits)
  } else if (isFiat(tCurr)) {
    targetBetUnits = Math.ceil(targetBetUnits * 100) / 100
  } else {
    targetBetUnits = Math.ceil(targetBetUnits * 1e8) / 1e8
  }
  let betAmount = toMinor(targetBetUnits, tCurr)
  const betLevels = Array.isArray(session?.betLevels) ? session.betLevels.slice().sort((a, b) => a - b) : []
  if (betLevels.length) {
    const bestLevel = pickSmallestBetLevelForMinUsd(betLevels, tCurr, rate, minBetUsd)
    if (bestLevel != null) {
      betAmount = bestLevel
    } else {
      const nextLevel = betLevels.find((lvl) => lvl >= betAmount)
      if (nextLevel != null) betAmount = nextLevel
    }
  }
  const usdAt = toUnits(betAmount, tCurr) * rate
  return { betAmount, usdAt }
}
