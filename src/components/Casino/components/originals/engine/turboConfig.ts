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
 * Dice probe clean rate (~8 bets/s). Challenge Hunter / Slots still target this
 * via casinoAccountPace (125ms). Originals turbo may push higher (see below).
 */
export const STAKE_ACCOUNT_SOFT_BETS_PER_SEC = 8
export const STAKE_ACCOUNT_PACE_INTERVAL_MS = Math.round(1000 / STAKE_ACCOUNT_SOFT_BETS_PER_SEC)

/** Soft clean probe rate used in settings copy (Dice). */
export const STAKE_SOFT_MAX_BETS_PER_SEC = STAKE_ACCOUNT_SOFT_BETS_PER_SEC

/**
 * Originals turbo default — ~11.1 bets/s (90ms).
 * More aggressive than Hunter/Slots 125ms; some 429 risk above ~10/s.
 */
export const STAKE_TURBO_DEFAULT_INTERVAL_MS = 90

/** @deprecated Prefer STAKE_TURBO_DEFAULT_INTERVAL_MS */
export const TURBO_GLOBAL_DEFAULT_INTERVAL_MS = STAKE_TURBO_DEFAULT_INTERVAL_MS

export const DEFAULT_TURBO_FIRE_INTERVAL_MS = STAKE_TURBO_DEFAULT_INTERVAL_MS
/** Probe: 4 in-flight at ~8/s spawn was clean; 2 workers more fragile at same target. */
export const DEFAULT_TURBO_MAX_IN_FLIGHT = 4

/**
 * Hard floor for Originals turbo: 70ms (~14/s).
 * Users can go below the 90ms default, but not back to the old 55ms/~18/s zone.
 */
export const MIN_TURBO_FIRE_INTERVAL_MS = 70
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
