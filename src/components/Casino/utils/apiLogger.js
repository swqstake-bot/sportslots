/**
 * API-Logger für Debugging – speichert alle Request/Response in localStorage.
 * Kann exportiert werden für Analyse.
 * Bonus-Logs: Responses mit Bonus separat speichern für spätere Kontrolle.
 */

const LOG_KEY = 'slotbot_api_logs'
const BONUS_LOG_KEY = 'slotbot_bonus_logs'
const SAVE_BONUS_FLAG_KEY = 'slotbot_save_bonus_logs'
const MAX_ENTRIES = 30
const MAX_BONUS_ENTRIES = 100

function getLogs() {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLogs(logs) {
  try {
    const trimmed = logs.slice(-MAX_ENTRIES)
    localStorage.setItem(LOG_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.warn('slotbot: could not save logs', e)
  }
}

export function logApiCall({ type, endpoint, request, response, error, durationMs, level = 'info' }) {
  const entry = {
    ts: new Date().toISOString(),
    level: error ? 'error' : level,
    type,
    endpoint,
    request: sanitizeForLog(request),
    response: response != null ? sanitizeForLog(response) : null,
    error: error || null,
    durationMs: durationMs ?? null,
  }
  const logs = getLogs()
  logs.push(entry)
  saveLogs(logs)

  // Zusätzlich in DevTools Console ausgeben
  const logFn = error ? console.error : console.log
  const prefix = `[${type}]`
  if (error) {
    logFn(prefix, error, { request: entry.request, response: entry.response, durationMs })
  } else {
    logFn(prefix, { request: entry.request, response: entry.response, durationMs })
  }
}

function sanitizeForLog(obj) {
  if (obj == null) return null
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch {
    return { _logError: 'Could not serialize', _preview: String(obj).slice(0, 200) }
  }
}

export function getApiLogs() {
  return getLogs()
}

export function clearLogs() {
  localStorage.setItem(LOG_KEY, '[]')
}

export function exportLogsAsJson() {
  return JSON.stringify(getLogs(), null, 2)
}

export function exportLogsAsFile() {
  const blob = new Blob([exportLogsAsJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `slotbot-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Bonus-Logs: jede Response mit Bonus speichern (für Kontrolle unterschiedlicher Bonus-Typen)
function getBonusLogs() {
  try {
    const raw = localStorage.getItem(BONUS_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveBonusLogsInternal(logs) {
  try {
    const trimmed = logs.slice(-MAX_BONUS_ENTRIES)
    localStorage.setItem(BONUS_LOG_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.warn('slotbot: could not save bonus logs', e)
  }
}

export function isSaveBonusLogsEnabled() {
  return localStorage.getItem(SAVE_BONUS_FLAG_KEY) === '1'
}

export function setSaveBonusLogsEnabled(enabled) {
  try {
    localStorage.setItem(SAVE_BONUS_FLAG_KEY, enabled ? '1' : '0')
  } catch (_) {}
}

export function saveBonusLog({ slotSlug, slotName, betAmount, effectiveBet, request, response, parsed }) {
  if (!isSaveBonusLogsEnabled()) return
  const entry = {
    ts: new Date().toISOString(),
    slotSlug,
    slotName,
    betAmount,
    effectiveBet,
    request: sanitizeForLog(request),
    response: response != null ? sanitizeForLog(response) : null,
    parsed: parsed != null ? sanitizeForLog(parsed) : null,
  }
  const logs = getBonusLogs()
  logs.push(entry)
  saveBonusLogsInternal(logs)
}

export function getBonusLogsExport() {
  return getBonusLogs()
}

export function clearBonusLogs() {
  try {
    localStorage.setItem(BONUS_LOG_KEY, '[]')
  } catch (_) {}
}

export function exportBonusLogsAsFile() {
  const blob = new Blob([JSON.stringify(getBonusLogs(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `slotbot-bonus-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`
  a.click()
  URL.revokeObjectURL(url)
}
