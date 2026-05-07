const PROVIDER_FAVORITES_KEY = 'slotbot_provider_favorites_v1'
const SLOT_VIEW_PRESET_KEY = 'slotbot_slot_view_preset_v1'

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
