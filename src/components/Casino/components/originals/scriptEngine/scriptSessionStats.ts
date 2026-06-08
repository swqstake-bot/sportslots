/** Live-Statistik aus Script-/Profil-Sessions (runProfile → onStats). */

export type ScriptSessionStats = {
  bets: number
  profit: number
  wins: number
  losses: number
  totalWagered: number
  maxMulti: number
  maxB2bMulti: number
  /** Größter Einzel-Payout ($). */
  maxWinUsd: number
  /** Größter Gewinn einer Runde ($). */
  maxRoundProfitUsd: number
  maxBetUsd: number
  longestB2bStreak: number
  longestWinStreak: number
  currentB2bStreak: number
  sessionElapsedMs: number
  betsPerSec: number
  b2bSecuredUsd: number
}

export function emptyScriptSessionStats(): ScriptSessionStats {
  return {
    bets: 0,
    profit: 0,
    wins: 0,
    losses: 0,
    totalWagered: 0,
    maxMulti: 0,
    maxB2bMulti: 0,
    maxWinUsd: 0,
    maxRoundProfitUsd: 0,
    maxBetUsd: 0,
    longestB2bStreak: 0,
    longestWinStreak: 0,
    currentB2bStreak: 0,
    sessionElapsedMs: 0,
    betsPerSec: 0,
    b2bSecuredUsd: 0,
  }
}

export function formatScriptSessionDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}
