/**
 * Slot-Sets (Hunt-Templates) – gespeicherte Slot-Auswahlen zum Schnellladen
 * Persistenz via localStorage
 */

import { CASINO_STORAGE_KEYS, readStorageJson, writeStorageJson } from './storageRegistry'

const STORAGE_KEY = CASINO_STORAGE_KEYS.slotSets
const FAVORITES_KEY = CASINO_STORAGE_KEYS.slotFavorites
const HAS_BONUS_KEY = CASINO_STORAGE_KEYS.hasBonusSlugs

// Six Six Six: falsche Duplikate (richtige kommt dynamisch)
const SIX_SIX_SIX_SLUGS = ['hacksaw-six-six-six', 'hacksaw-sixsixsix']

export function loadSlotSets() {
  try {
    const sets = readStorageJson(STORAGE_KEY, [])
    let changed = false
    // Migration: ensure 'slugs' property exists (from legacy 'slots')
    const result = sets.map(s => {
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
      // Migration: Six Six Six Duplikate entfernen
      const before = newSet.slugs.length
      newSet.slugs = newSet.slugs.filter((slug) => !SIX_SIX_SIX_SLUGS.includes(slug))
      if (newSet.slugs.length !== before) changed = true
      return newSet
    })
    if (changed) {
      writeStorageJson(STORAGE_KEY, result)
    }
    return result
  } catch {
    return []
  }
}

export function saveSlotSet({ name, slots }) {
  const sets = loadSlotSets()
  const id = `set_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  sets.push({ id, name: (name || 'Unbenannt').trim(), slugs: [...(slots || [])], createdAt: Date.now() })
  writeStorageJson(STORAGE_KEY, sets)
  return id
}

export function deleteSlotSet(id) {
  const sets = loadSlotSets().filter((s) => s.id !== id)
  writeStorageJson(STORAGE_KEY, sets)
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
    writeStorageJson(STORAGE_KEY, sets)
    return { ok: true, count: sets.length }
  } catch (e) {
    return { ok: false, error: e?.message || 'Import fehlgeschlagen' }
  }
}

export function loadFavorites() {
  try {
    const list = readStorageJson(FAVORITES_KEY, [])
    // Migration: Six Six Six Duplikate entfernen
    const filtered = list.filter((slug) => !SIX_SIX_SIX_SLUGS.includes(slug))
    if (filtered.length !== list.length) {
      writeStorageJson(FAVORITES_KEY, filtered)
    }
    return filtered
  } catch {
    return []
  }
}

export function toggleFavorite(slug) {
  const fav = loadFavorites()
  const idx = fav.indexOf(slug)
  if (idx >= 0) fav.splice(idx, 1)
  else fav.push(slug)
  writeStorageJson(FAVORITES_KEY, fav)
  return fav
}

/** Slots die „hat Bonus“ markiert sind – werden beim Hunt übersprungen (verhindert Session-Timeouts) */
export function loadHasBonusSlugs() {
  try {
    const list = readStorageJson(HAS_BONUS_KEY, [])
    const filtered = list.filter((slug) => !SIX_SIX_SIX_SLUGS.includes(slug))
    if (filtered.length !== list.length) {
      writeStorageJson(HAS_BONUS_KEY, filtered)
    }
    return filtered
  } catch {
    return []
  }
}

export function toggleHasBonusSlug(slug) {
  const list = loadHasBonusSlugs()
  const idx = list.indexOf(slug)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(slug)
  writeStorageJson(HAS_BONUS_KEY, list)
  return list
}

/** Entfernt einen Slot aus „hat Bonus“ (z.B. wenn im Rad gedreht und geöffnet) */
export function removeHasBonusSlug(slug) {
  const list = loadHasBonusSlugs()
  const idx = list.indexOf(slug)
  if (idx >= 0) {
    list.splice(idx, 1)
    writeStorageJson(HAS_BONUS_KEY, list)
  }
  return list
}

export function clearHasBonusSlugs() {
  localStorage.removeItem(HAS_BONUS_KEY)
  return []
}
