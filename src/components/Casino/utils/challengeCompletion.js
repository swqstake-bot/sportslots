/**
 * Challenges Completion-Tracking – abgeschlossene Challenges speichern & laden.
 * localStorage-basiert (analog SSP challengesHistory.json).
 */
const STORAGE_KEY = 'slotbot_challenges_completed'
const HUNTER_STATE_KEY = 'slotbot_hunter_state'

/**
 * @param {string} challengeId
 * @returns {boolean}
 */
export function isChallengeCompleted(challengeId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const ids = JSON.parse(raw)
    return Array.isArray(ids) && ids.includes(challengeId)
  } catch {
    return false
  }
}

/**
 * @param {string} challengeId
 */
export function markChallengeCompleted(challengeId) {
  if (!challengeId) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const ids = raw ? JSON.parse(raw) : []
    if (!Array.isArray(ids)) return
    if (!ids.includes(challengeId)) {
      ids.push(challengeId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    }
  } catch {
    // ignore
  }
}

/**
 * @returns {Set<string>}
 */
export function getCompletedChallengeIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const ids = JSON.parse(raw)
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

/**
 * Sync mit API-Daten: Challenges, die laut API completedAt haben, als erledigt markieren.
 * @param {Array<{ id: string, completedAt?: string }>} challenges
 */
export function syncFromApiChallenges(challenges) {
  if (!challenges?.length) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const ids = new Set(raw ? JSON.parse(raw) : [])
    let changed = false
    for (const c of challenges) {
      if (c.id && c.completedAt) {
        if (!ids.has(c.id)) {
          ids.add(c.id)
          changed = true
        }
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
    }
  } catch {
    // ignore
  }
}

/**
 * Alle gespeicherten Completions löschen.
 */
export function clearCompletedChallenges() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function getHunterState() {
  try {
    const raw = localStorage.getItem(HUNTER_STATE_KEY)
    if (!raw) return { processedIds: [], dismissedIds: [] }
    const parsed = JSON.parse(raw)
    const processedIds = Array.isArray(parsed?.processedIds) ? parsed.processedIds.filter(Boolean) : []
    const dismissedIds = Array.isArray(parsed?.dismissedIds) ? parsed.dismissedIds.filter(Boolean) : []
    return { processedIds, dismissedIds }
  } catch {
    return { processedIds: [], dismissedIds: [] }
  }
}

export function saveHunterState(processedIds, dismissedIds) {
  try {
    const processed = [...new Set(Array.isArray(processedIds) ? processedIds.filter(Boolean) : [])]
    const dismissed = [...new Set(Array.isArray(dismissedIds) ? dismissedIds.filter(Boolean) : [])]
    localStorage.setItem(HUNTER_STATE_KEY, JSON.stringify({ processedIds: processed, dismissedIds: dismissed }))
  } catch {
    // ignore
  }
}

export function clearHunterState() {
  try {
    localStorage.removeItem(HUNTER_STATE_KEY)
  } catch {
    // ignore
  }
}
