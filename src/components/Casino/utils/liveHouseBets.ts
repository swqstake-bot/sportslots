/**
 * Pure helpers for the "Live Bets" panel: normalise houseBets payloads, filter them
 * (bonus / high multiplier / high win) and compute live stats. No React, no I/O.
 */

export interface LiveBet {
  key: string
  /** House share id (iid) when present - what you paste into the Stake bet viewer. */
  shareId: string | null
  game: string
  multiplier: number | null
  amount: number | null
  payout: number | null
  currency: string
  betType: string | null
  isBonus: boolean
  at: number
}

export type LiveBetFilter = 'all' | 'bonuses' | 'high_multiplier' | 'high_win'

export interface LiveBetThresholds {
  /** Single bet multiplier (x) at or above which a bet counts as "high multiplier". */
  highMultiplier: number
  /** Payout in USD at or above which a bet counts as "high win". */
  highWinUsd: number
}

export const DEFAULT_LIVE_BET_THRESHOLDS: LiveBetThresholds = { highMultiplier: 100, highWinUsd: 300 }
export const LIVE_BETS_BUFFER_MAX = 500

/** Converts a major-unit amount in `currency` to USD, or null when no rate is known. */
export type UsdConverter = (amountMajor: number, currency: string) => number | null

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

/** Bonus bets: typename says so, or a payout without any stake (free spins / bonus buy credit). */
export function isBonusPayload(p: Record<string, unknown>): boolean {
  if (str(p.betType).toLowerCase().includes('bonus')) return true
  const amount = num(p.amount ?? p.amountMajor) ?? 0
  const payout = num(p.payout ?? p.payoutMajor) ?? 0
  const mult = num(p.payoutMultiplier) ?? 0
  const amountMult = num(p.amountMultiplier) ?? 0
  if (amount === 0 && (mult > 0 || payout > 0)) return true
  if (amountMult > 0 && amount === 0) return true
  return false
}

/** Normalise one houseBets payload (as emitted by subscribeToBetUpdates). Null = unusable. */
export function toLiveBet(payload: Record<string, unknown> | null | undefined, now = Date.now()): LiveBet | null {
  if (!payload || typeof payload !== 'object') return null
  const shareId = str(payload.shareIid ?? payload.iid) || null
  const key = shareId || str(payload.houseId) || str(payload.betId) || str(payload.id)
  if (!key) return null
  return {
    key,
    shareId,
    game: str(payload.gameName) || str(payload.gameSlug) || '-',
    multiplier: num(payload.payoutMultiplier),
    amount: num(payload.amountMajor ?? payload.amount),
    payout: num(payload.payoutMajor ?? payload.payout),
    currency: str(payload.currency).toLowerCase(),
    betType: str(payload.betType) || null,
    isBonus: isBonusPayload(payload),
    at: now,
  }
}

/** Prepend new bets (newest first), drop duplicates by key, cap the buffer. */
export function appendLiveBets(list: LiveBet[], incoming: LiveBet[], max = LIVE_BETS_BUFFER_MAX): LiveBet[] {
  if (incoming.length === 0) return list
  const seen = new Set<string>()
  const out: LiveBet[] = []
  // incoming arrives oldest -> newest; show newest first
  for (let i = incoming.length - 1; i >= 0; i--) {
    const b = incoming[i]
    if (seen.has(b.key)) continue
    seen.add(b.key)
    out.push(b)
  }
  for (const b of list) {
    if (out.length >= max) break
    if (seen.has(b.key)) continue
    seen.add(b.key)
    out.push(b)
  }
  return out.slice(0, max)
}

export function isHighMultiplier(b: LiveBet, th: LiveBetThresholds): boolean {
  return b.multiplier != null && b.multiplier >= Math.max(1, th.highMultiplier)
}

export function isHighWin(b: LiveBet, th: LiveBetThresholds, toUsd: UsdConverter): boolean {
  if (b.payout == null || b.payout <= 0) return false
  const usd = toUsd(b.payout, b.currency)
  return usd != null && usd >= Math.max(1, th.highWinUsd)
}

export function filterLiveBets(
  list: LiveBet[],
  filter: LiveBetFilter,
  th: LiveBetThresholds,
  toUsd: UsdConverter,
  game = 'all'
): LiveBet[] {
  return list.filter((b) => {
    if (game !== 'all' && b.game !== game) return false
    switch (filter) {
      case 'bonuses':
        return b.isBonus
      case 'high_multiplier':
        return isHighMultiplier(b, th)
      case 'high_win':
        return isHighWin(b, th, toUsd)
      default:
        return true
    }
  })
}

export interface LiveBetStats {
  total: number
  bonuses: number
  highMultiplier: number
  highWin: number
  best: { multiplier: number; game: string } | null
}

export function computeLiveStats(list: LiveBet[], th: LiveBetThresholds, toUsd: UsdConverter, game = 'all'): LiveBetStats {
  const stats: LiveBetStats = { total: 0, bonuses: 0, highMultiplier: 0, highWin: 0, best: null }
  for (const b of list) {
    if (game !== 'all' && b.game !== game) continue
    stats.total += 1
    if (b.isBonus) stats.bonuses += 1
    if (isHighMultiplier(b, th)) stats.highMultiplier += 1
    if (isHighWin(b, th, toUsd)) stats.highWin += 1
    if (b.multiplier != null && (stats.best == null || b.multiplier > stats.best.multiplier)) {
      stats.best = { multiplier: b.multiplier, game: b.game }
    }
  }
  return stats
}

export function listLiveGames(list: LiveBet[]): string[] {
  return [...new Set(list.map((b) => b.game).filter((g) => g && g !== '-'))].sort((a, b) => a.localeCompare(b))
}
