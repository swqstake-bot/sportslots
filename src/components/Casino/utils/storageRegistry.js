/**
 * Zentraler Registry für persistente Keys im Casino-Bereich.
 * Ziel: einheitliche Migrationen und weniger verstreute String-Literale.
 */
export const CASINO_STORAGE_KEYS = {
  theme: 'slotbot_theme',
  sessionHistoryCleared: 'slotbot_bet_history_cleared_this_session',
  slotSets: 'slotbot_slot_sets',
  slotFavorites: 'slotbot_slot_favorites',
  hasBonusSlugs: 'slotbot_has_bonus_slugs',
  discoveredSlots: 'slotbot_discovered_slots',
  stakeSlotsCache: 'slotbot_stake_slots_cache',
  stakeOriginalsCache: 'stake_originals_cache',
  debugHouseBets: 'slotbot_debug_housebets',
}

export const CASINO_DB_REGISTRY = {
  betHistory: {
    name: 'SlotbotBetHistory',
    version: 2,
    store: 'bets',
  },
}

export function readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function writeStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

