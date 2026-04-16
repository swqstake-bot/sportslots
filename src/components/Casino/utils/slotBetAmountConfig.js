/**
 * Zuletzt gewählter Einsatz (minor units, wie betLevels) pro Slot-Slug.
 * localStorage — gleiches Muster wie slotCurrencyConfig.
 */

const STORAGE_KEY = 'slotbot_slot_last_bet_amounts'

/**
 * @param {string} slotSlug
 * @returns {number | null}
 */
export function getSlotBetAmount(slotSlug) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    const n = Number(obj?.[slotSlug])
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * @param {string} slotSlug
 * @param {number} amountMinor
 */
export function setSlotBetAmount(slotSlug, amountMinor) {
  if (!slotSlug) return
  const n = Number(amountMinor)
  if (!Number.isFinite(n) || n <= 0) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    obj[slotSlug] = n
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // ignore
  }
}

/**
 * @param {number[]} levels
 * @param {number | null} target
 * @returns {number | null}
 */
export function pickClosestBetLevel(levels, target) {
  if (!Array.isArray(levels) || levels.length === 0) return null
  if (target == null || !Number.isFinite(target) || target <= 0) return null
  if (levels.includes(target)) return target
  return levels.reduce((best, l) => (Math.abs(l - target) < Math.abs(best - target) ? l : best), levels[0])
}
