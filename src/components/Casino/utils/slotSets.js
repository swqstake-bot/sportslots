/**
 * Slot-Sets (Hunt-Templates) – gespeicherte Slot-Auswahlen zum Schnellladen
 * Persistenz via localStorage
 */

const STORAGE_KEY = 'slotbot_slot_sets'
const FAVORITES_KEY = 'slotbot_slot_favorites'
const HAS_BONUS_KEY = 'slotbot_has_bonus_slugs'

export function loadSlotSets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const sets = raw ? JSON.parse(raw) : []
    // Migration: ensure 'slugs' property exists (from legacy 'slots')
    return sets.map(s => {
      // Create a shallow copy to avoid mutating the original object if it comes from a cache (though JSON.parse creates new objects)
      const newSet = { ...s }
      
      // If slugs is missing or not an array, try to migrate from slots
      if (!Array.isArray(newSet.slugs)) {
        if (Array.isArray(newSet.slots)) {
          newSet.slugs = [...newSet.slots]
        } else {
          newSet.slugs = []
        }
      }
      return newSet
    })
  } catch {
    return []
  }
}

export function saveSlotSet({ name, slots }) {
  const sets = loadSlotSets()
  const id = `set_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  sets.push({ id, name: (name || 'Unbenannt').trim(), slugs: [...(slots || [])], createdAt: Date.now() })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
  return id
}

export function deleteSlotSet(id) {
  const sets = loadSlotSets().filter((s) => s.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
}

export function loadSlotSet(id) {
  const sets = loadSlotSets()
  return sets.find((s) => s.id === id)
}

export function exportSlotSets() {
  const sets = loadSlotSets()
  return JSON.stringify(sets, null, 2)
}

export function importSlotSets(jsonStr, merge = true) {
  try {
    const imported = JSON.parse(jsonStr)
    if (!Array.isArray(imported)) return { ok: false, error: 'Ungültiges Format' }
    const sets = merge ? loadSlotSets() : []
    for (const s of imported) {
      // Support both 'slots' (legacy) and 'slugs'
      const slugs = Array.isArray(s.slugs) ? s.slugs : (Array.isArray(s.slots) ? s.slots : [])
      if (!s.name || slugs.length === 0 && !s.slots && !s.slugs) continue
      
      const id = `set_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      sets.push({ id, name: String(s.name).trim(), slugs, createdAt: s.createdAt || Date.now() })
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sets))
    return { ok: true, count: sets.length }
  } catch (e) {
    return { ok: false, error: e?.message || 'Import fehlgeschlagen' }
  }
}

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function toggleFavorite(slug) {
  const fav = loadFavorites()
  const idx = fav.indexOf(slug)
  if (idx >= 0) fav.splice(idx, 1)
  else fav.push(slug)
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(fav))
  return fav
}

/** Slots die „hat Bonus“ markiert sind – werden beim Hunt übersprungen (verhindert Session-Timeouts) */
export function loadHasBonusSlugs() {
  try {
    const raw = localStorage.getItem(HAS_BONUS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function toggleHasBonusSlug(slug) {
  const list = loadHasBonusSlugs()
  const idx = list.indexOf(slug)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(slug)
  localStorage.setItem(HAS_BONUS_KEY, JSON.stringify(list))
  return list
}

/** Entfernt einen Slot aus „hat Bonus“ (z.B. wenn im Rad gedreht und geöffnet) */
export function removeHasBonusSlug(slug) {
  const list = loadHasBonusSlugs()
  const idx = list.indexOf(slug)
  if (idx >= 0) {
    list.splice(idx, 1)
    localStorage.setItem(HAS_BONUS_KEY, JSON.stringify(list))
  }
  return list
}

export function clearHasBonusSlugs() {
  localStorage.removeItem(HAS_BONUS_KEY)
  return []
}
