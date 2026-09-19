/**
 * Stake Originals Keno
 * - UI / workbench: **1–40** (player-facing)
 * - GraphQL `kenoBet`: **0–39** (Stake validates max 39 — `NUMBERS i can't be above 39`)
 */

export const KENO_BOARD_MAX = 40
export const KENO_PICK_MAX = 10
export const KENO_BOARD_MIN = 1
export const KENO_API_MAX = 39

/** Normalize to display space 1–40 (dedupe, sort, max 10). */
export function normalizeKenoPicks(raw: unknown): number[] {
  const arr = Array.isArray(raw)
    ? raw.map((v) => Math.floor(Number(v))).filter((n) => Number.isFinite(n))
    : []
  if (arr.length === 0) return []

  // Lift API 0–39 → display when 0 is present (Antebot / kenoBet response).
  const mapped = arr.some((n) => n === 0) ? arr.map((n) => n + 1) : arr

  const seen = new Set<number>()
  const out: number[] = []
  for (const n of mapped) {
    if (n < KENO_BOARD_MIN || n > KENO_BOARD_MAX) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= KENO_PICK_MAX) break
  }
  return out.sort((a, b) => a - b)
}

/** Display 1–40 → API 0–39 for the kenoBet mutation. */
export function kenoPicksToApi(displayPicks: unknown): number[] {
  return normalizeKenoPicks(displayPicks)
    .map((n) => n - 1)
    .filter((n) => n >= 0 && n <= KENO_API_MAX)
}

/**
 * API / bet-state numbers → display 1–40.
 * Stake returns the same 0–39 space we send.
 */
export function kenoPicksFromApi(raw: unknown): number[] {
  const arr = Array.isArray(raw)
    ? raw.map((v) => Math.floor(Number(v))).filter((n) => Number.isFinite(n))
    : []
  if (arr.length === 0) return []
  const max = Math.max(...arr)
  const min = Math.min(...arr)
  // 0–39 API space (never includes 40; often includes 0)
  if (min >= 0 && max <= KENO_API_MAX) {
    return normalizeKenoPicks(arr.map((n) => n + 1))
  }
  return normalizeKenoPicks(arr)
}

export function kenoBoardPool(maxNumber = KENO_BOARD_MAX): number[] {
  const cap = Math.max(KENO_BOARD_MIN, Math.min(KENO_BOARD_MAX, Math.floor(maxNumber)))
  return Array.from({ length: cap }, (_, i) => i + 1)
}
