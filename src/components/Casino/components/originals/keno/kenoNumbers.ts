/** Stake Originals Keno: pick 1–10 numbers from a 1–40 board. */

export const KENO_BOARD_MAX = 40
export const KENO_PICK_MAX = 10
export const KENO_BOARD_MIN = 1

/**
 * Normalize Keno picks for the Stake GraphQL API.
 * - Dedupes, sorts, clamps to 1–40, max 10
 * - If a 0-based Antebot-style set (contains 0, no 40) is detected, maps n → n+1
 */
export function normalizeKenoPicks(raw: unknown): number[] {
  const arr = Array.isArray(raw)
    ? raw.map((v) => Math.floor(Number(v))).filter((n) => Number.isFinite(n))
    : []
  if (arr.length === 0) return []

  const hasZero = arr.some((n) => n === 0)
  const hasForty = arr.some((n) => n === 40)
  // Antebot UI stores 0–39 while displaying 1–40. Migrate when we see 0 and no 40.
  const mapped = hasZero && !hasForty ? arr.map((n) => n + 1) : arr

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

export function kenoBoardPool(maxNumber = KENO_BOARD_MAX): number[] {
  const cap = Math.max(KENO_BOARD_MIN, Math.min(KENO_BOARD_MAX, Math.floor(maxNumber)))
  return Array.from({ length: cap }, (_, i) => i + 1)
}
