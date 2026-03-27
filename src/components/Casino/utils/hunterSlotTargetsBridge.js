/** Sync AutoChallengeHunter + Telegram Live → SlotControl: Ziel-Multiplikatoren pro Slot-Slug. */

const listeners = new Set()
let snapshot = {}

let hunterMap = {}
let telegramMap = {}

function mergeMaps(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const out = {}
  for (const k of keys) {
    const arr = [...(a[k] || []), ...(b[k] || [])]
    out[k] = [...new Set(arr)]
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((x, y) => x - y)
  }
  return out
}

function recompute() {
  snapshot = mergeMaps(hunterMap, telegramMap)
  listeners.forEach((l) => l())
}

export function subscribeHunterSlotTargets(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getHunterSlotTargetsSnapshot() {
  return snapshot
}

/**
 * Nur Auto-Hunter (aktive Läufe). Leeren wenn Hunt stoppt – Telegram-Ziele bleiben erhalten.
 * @param {Record<string, number[]>} map slug → Ziel-Multis
 */
export function setHunterSlotTargets(map) {
  hunterMap = map && typeof map === 'object' ? { ...map } : {}
  recompute()
}

/**
 * Telegram Live / Challenge-Text: Ziel-Multis pro Slug (merged mit Hunter).
 * @param {Record<string, number[]>} map slug → Ziel-Multis
 */
export function setTelegramSlotTargets(map) {
  telegramMap = map && typeof map === 'object' ? { ...map } : {}
  recompute()
}

/** Nur Telegram-Ziele löschen (z. B. Lauschen beenden). */
export function clearTelegramSlotTargets() {
  telegramMap = {}
  recompute()
}
