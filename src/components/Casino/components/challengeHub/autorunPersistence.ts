import { normalizeAutorunConfig, type AutorunConfig } from './autorunTypes'

const STORAGE_KEY = 'slotbot_autorun_config_v1'

export function loadAutorunConfigFromStorage(): AutorunConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeAutorunConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveAutorunConfigToStorage(config: AutorunConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // ignore quota / private mode
  }
}

export { STORAGE_KEY as AUTORUN_STORAGE_KEY }
