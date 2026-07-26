const PROVIDER_FAVORITES_KEY = 'slotbot_provider_favorites_v1'
const SLOT_VIEW_PRESET_KEY = 'slotbot_slot_view_preset_v1'
const RECENT_SLOTS_KEY = 'slotbot_recent_slots_v1'
const RECENT_SLOTS_EVENT = 'slotbot-recent-slots'
const RECENT_SLOTS_MAX = 12

export function loadProviderFavorites() {
  try {
    const raw = localStorage.getItem(PROVIDER_FAVORITES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => String(x || '')).filter(Boolean)
  } catch {
    return []
  }
}

export function saveProviderFavorites(ids) {
  try {
    localStorage.setItem(PROVIDER_FAVORITES_KEY, JSON.stringify((ids || []).map((x) => String(x || '')).filter(Boolean)))
  } catch {
  }
}

export function loadSlotViewPreset() {
  try {
    const raw = localStorage.getItem(SLOT_VIEW_PRESET_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      search: String(parsed?.search || ''),
      providerFilter: String(parsed?.providerFilter || ''),
      onlyFavoriteProviders: Boolean(parsed?.onlyFavoriteProviders),
    }
  } catch {
    return { search: '', providerFilter: '', onlyFavoriteProviders: false }
  }
}

export function saveSlotViewPreset(preset) {
  try {
    localStorage.setItem(
      SLOT_VIEW_PRESET_KEY,
      JSON.stringify({
        search: String(preset?.search || ''),
        providerFilter: String(preset?.providerFilter || ''),
        onlyFavoriteProviders: Boolean(preset?.onlyFavoriteProviders),
      })
    )
  } catch {
  }
}

/** MRU list of recently selected/started slot slugs. */
export function loadRecentSlots() {
  try {
    const raw = localStorage.getItem(RECENT_SLOTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => String(x || '')).filter(Boolean).slice(0, RECENT_SLOTS_MAX)
  } catch {
    return []
  }
}

/**
 * Push slug to front of recent list. Returns the updated list.
 * @param {string} slug
 * @returns {string[]}
 */
export function pushRecentSlot(slug) {
  const id = String(slug || '').trim()
  if (!id) return loadRecentSlots()
  const next = [id, ...loadRecentSlots().filter((s) => s !== id)].slice(0, RECENT_SLOTS_MAX)
  try {
    localStorage.setItem(RECENT_SLOTS_KEY, JSON.stringify(next))
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent(RECENT_SLOTS_EVENT))
  } catch {
  }
  return next
}

/** Push several slugs (Start all). Most recent last in input = first in MRU order after. */
export function pushRecentSlots(slugs) {
  const list = Array.isArray(slugs) ? slugs : []
  let next = loadRecentSlots()
  for (const slug of list) {
    const id = String(slug || '').trim()
    if (!id) continue
    next = [id, ...next.filter((s) => s !== id)].slice(0, RECENT_SLOTS_MAX)
  }
  try {
    localStorage.setItem(RECENT_SLOTS_KEY, JSON.stringify(next))
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent(RECENT_SLOTS_EVENT))
  } catch {
  }
  return next
}

export function subscribeRecentSlots(onChange) {
  const handler = () => {
    try {
      onChange?.(loadRecentSlots())
    } catch {
    }
  }
  window.addEventListener(RECENT_SLOTS_EVENT, handler)
  return () => window.removeEventListener(RECENT_SLOTS_EVENT, handler)
}
