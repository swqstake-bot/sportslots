import { getOriginalsGame } from '../registry/originalsRegistry'

/** Games safe for parallel fire-and-forget (single-shot API per bet). */
const TURBO_BLOCKED = new Set([
  'hilo',
  'blackjack',
  'dragon-tower',
  'bars',
  'chicken',
  'pump',
  'mines',
])

export function isTurboCompatibleGame(slug: string): boolean {
  const g = getOriginalsGame(slug)
  if (!g?.apiReady) return false
  if (TURBO_BLOCKED.has(slug.toLowerCase())) return false
  return g.supportsAsync
}

/**
 * Account-wide Stake soft budget from Dev bet-speed probe (Dice 4 workers):
 * stable ~8 bets/s; from ~10/s upward → 429s. Interval floor = 1000/8.
 */
export const STAKE_ACCOUNT_SOFT_BETS_PER_SEC = 8
export const STAKE_ACCOUNT_PACE_INTERVAL_MS = Math.round(1000 / STAKE_ACCOUNT_SOFT_BETS_PER_SEC)

/** @deprecated Prefer STAKE_TURBO_DEFAULT_INTERVAL_MS / STAKE_ACCOUNT_PACE_INTERVAL_MS */
export const TURBO_GLOBAL_DEFAULT_INTERVAL_MS = STAKE_ACCOUNT_PACE_INTERVAL_MS

/** Recommended async fire interval for Stake / Stake.us / Shuffle (~8/s). */
export const STAKE_TURBO_DEFAULT_INTERVAL_MS = STAKE_ACCOUNT_PACE_INTERVAL_MS

/** Soft account cap used in settings copy (Dev probe). */
export const STAKE_SOFT_MAX_BETS_PER_SEC = STAKE_ACCOUNT_SOFT_BETS_PER_SEC

export const DEFAULT_TURBO_FIRE_INTERVAL_MS = STAKE_TURBO_DEFAULT_INTERVAL_MS
/** Probe: 4 in-flight at ~8/s spawn was clean; 2 workers more fragile at same target. */
export const DEFAULT_TURBO_MAX_IN_FLIGHT = 4

/**
 * Hard floor: do not spawn faster than ~8/s (was 55ms/~18/s — instant 429 risk).
 * Saved settings below this are clamped on load via normalizeTurboSettings.
 */
export const MIN_TURBO_FIRE_INTERVAL_MS = STAKE_ACCOUNT_PACE_INTERVAL_MS
export const MAX_TURBO_FIRE_INTERVAL_MS = 500
export const MAX_TURBO_MAX_IN_FLIGHT = 8

/** Pause after repeated rate limits (seconds → ms). */
export const TURBO_RATE_LIMIT_COOLDOWN_MS = 15_000

/** Extra ms added to fire interval per 429 response. */
export const TURBO_RATE_LIMIT_INTERVAL_BUMP_MS = 25

export function turboSpawnRatePerSec(fireIntervalMs: number): number {
  if (fireIntervalMs <= 0) return Number.POSITIVE_INFINITY
  return 1000 / fireIntervalMs
}

export function normalizeTurboSettings(raw: {
  fireIntervalMs?: number
  maxInFlight?: number
}): { fireIntervalMs: number; maxInFlight: number } {
  let fireIntervalMs = raw.fireIntervalMs ?? DEFAULT_TURBO_FIRE_INTERVAL_MS
  if (fireIntervalMs <= 0) fireIntervalMs = DEFAULT_TURBO_FIRE_INTERVAL_MS
  fireIntervalMs = Math.max(
    MIN_TURBO_FIRE_INTERVAL_MS,
    Math.min(MAX_TURBO_FIRE_INTERVAL_MS, Math.round(fireIntervalMs))
  )
  const maxInFlight = Math.max(
    1,
    Math.min(MAX_TURBO_MAX_IN_FLIGHT, Math.round(raw.maxInFlight ?? DEFAULT_TURBO_MAX_IN_FLIGHT))
  )
  return { fireIntervalMs, maxInFlight }
}

export function isRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate-limit') ||
    msg.includes('too many request') ||
    msg.includes('slow down')
  )
}
