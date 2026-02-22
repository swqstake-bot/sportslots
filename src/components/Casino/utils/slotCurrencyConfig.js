/**
 * Currency-/Slot-Konfiguration – gespeicherte Währung pro Slot.
 * localStorage-basiert.
 */

const STORAGE_KEY = 'slotbot_slot_currencies'

/**
 * @param {string} slotSlug
 * @returns {{ source?: string, target?: string } | null}
 */
export function getSlotCurrency(slotSlug) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    return obj?.[slotSlug] ?? null
  } catch {
    return null
  }
}

/**
 * @param {string} slotSlug
 * @param {{ source?: string, target?: string }} config
 */
export function setSlotCurrency(slotSlug, config) {
  if (!slotSlug) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    obj[slotSlug] = { ...(obj[slotSlug] || {}), ...config }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // ignore
  }
}
