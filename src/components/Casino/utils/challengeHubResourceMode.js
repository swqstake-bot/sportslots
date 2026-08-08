/**
 * Challenge Hub "Resource mode": minimal UI (P/L, bet speed, top multis).
 * Module flag so spin loops can skip feed publish without waiting on React.
 */

const STORAGE_KEY = 'slotbot_challenge_hub_resource_mode_v1'

let resourceMode = false
try {
  resourceMode = localStorage.getItem(STORAGE_KEY) === '1'
} catch {
  resourceMode = false
}

const listeners = new Set()

export function isChallengeHubResourceMode() {
  return resourceMode
}

export function setChallengeHubResourceMode(next) {
  const on = Boolean(next)
  if (on === resourceMode) return resourceMode
  resourceMode = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
  for (const fn of listeners) {
    try {
      fn(resourceMode)
    } catch {
      // ignore
    }
  }
  return resourceMode
}

export function toggleChallengeHubResourceMode() {
  return setChallengeHubResourceMode(!resourceMode)
}

/** @param {(on: boolean) => void} fn */
export function subscribeChallengeHubResourceMode(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}
