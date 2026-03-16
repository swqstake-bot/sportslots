/**
 * Stop-Bedingungen für Originals-Session (Start läuft bis Stop oder Bedingung).
 */

import type { OriginalsSettingsState } from './OriginalsSettings'
import type { OriginalsBetEntry } from './OriginalsBetHistory'

export interface SessionStats {
  bets: number
  profit: number
  winStreak: number
  lossStreak: number
}

export function sessionStatsFromBets(entries: OriginalsBetEntry[]): SessionStats {
  let profit = 0
  let winStreak = 0
  let lossStreak = 0
  for (const b of entries) {
    profit += (b.payout ?? 0) - b.amount
    if (b.win) {
      winStreak++
      lossStreak = 0
    } else {
      lossStreak++
      winStreak = 0
    }
  }
  return { bets: entries.length, profit, winStreak, lossStreak }
}

/** Gibt true zurück, wenn die Session gestoppt werden soll. */
export function shouldStopSession(entries: OriginalsBetEntry[], s: Partial<OriginalsSettingsState>): boolean {
  if (entries.length === 0) return false
  const stats = sessionStatsFromBets(entries)

  if ((s.stopAfterBets ?? 0) > 0 && stats.bets >= (s.stopAfterBets ?? 0)) return true
  const stopProfit = parseFloat(String((s.stopOnProfit ?? '') || '0'))
  if (stopProfit > 0 && stats.profit >= stopProfit) return true
  const stopLoss = parseFloat(String((s.stopOnLoss ?? '') || '0'))
  if (stopLoss > 0 && stats.profit <= -stopLoss) return true
  if ((s.stopOnWinStreak ?? 0) > 0 && stats.winStreak >= (s.stopOnWinStreak ?? 0)) return true
  if ((s.stopOnLossStreak ?? 0) > 0 && stats.lossStreak >= (s.stopOnLossStreak ?? 0)) return true

  const typ = s.stopConditionType ?? ''
  const val = Number(s.stopConditionValue ?? '') || 0
  if (typ === 'b2b' && stats.lossStreak >= 2) return true
  if (typ === 'xReds' && val > 0 && stats.lossStreak >= val) return true
  if (typ === 'winStreak' && val > 0 && stats.winStreak >= val) return true
  if (typ === 'lossStreak' && val > 0 && stats.lossStreak >= val) return true
  if (typ === 'xBets' && val > 0 && stats.bets >= val) return true
  if (typ === 'profitAmount' && val > 0 && stats.profit >= val) return true
  if (typ === 'lossAmount' && val > 0 && stats.profit <= -val) return true

  return false
}
