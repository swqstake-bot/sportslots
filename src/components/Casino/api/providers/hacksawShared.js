/**
 * Gemeinsame Hacksaw-Logik für hacksaw.js und leBandit.js
 */
import { logApiCall } from '../../utils/apiLogger'

/** Basis-URL der Hacksaw Play API */
export const HACKSAW_API_BASE = import.meta.env.DEV
  ? '/api/hacksaw/play'
  : 'https://d1oa92ndvzdrfz.cloudfront.net/api/play'

/** User-Agent für Hacksaw-Requests */
export const HACKSAW_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0'

export async function safeFetch(url, options = {}) {
  if (window.electronAPI?.proxyRequest) {
    const { method = 'GET', headers = {}, body } = options
    if (method === 'POST' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    try {
      const res = await window.electronAPI.proxyRequest({ url, method, headers, body })
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: async () => res.data,
        json: async () => JSON.parse(res.data),
        url: res.finalUrl || url
      }
    } catch (e) {
      console.error('Proxy request failed', e)
      throw e
    }
  }
  return fetch(url, options)
}

/**
 * Session Keep-Alive – verhindert Session-Timeout.
 * @param {string} apiBase - HACKSAW_API_BASE
 * @param {{ token: string, sessionUuid: string, seq: number }} session
 * @param {{ treat404AsOk?: boolean }} [opts] - Bei 404 (Endpoint fehlt) trotzdem ok zurückgeben
 */
export async function sendHacksawKeepAlive(apiBase, session, opts = {}) {
  const req = { seq: session.seq, sessionUuid: session.sessionUuid }
  const t0 = Date.now()
  try {
    const res = await safeFetch(`${apiBase}/sessionKeepAlive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    const data = res.ok ? await res.json() : null
    const treat404AsOk = opts.treat404AsOk !== false
    const is404 = res.status === 404
    const errMsg = (treat404AsOk && is404) ? null : (!res.ok ? `HTTP ${res.status}` : (data?.statusCode !== 0 ? data?.statusMessage : null))
    logApiCall({ type: 'hacksaw/sessionKeepAlive', endpoint: `${apiBase}/sessionKeepAlive`, request: req, response: data ?? { _status: res.status }, error: errMsg, durationMs: Date.now() - t0 })
    return { ok: (treat404AsOk && is404) || (res.ok && data?.statusCode === 0), data }
  } catch (e) {
    logApiCall({ type: 'hacksaw/sessionKeepAlive', endpoint: `${apiBase}/sessionKeepAlive`, request: req, response: null, error: String(e), durationMs: Date.now() - t0 })
    return { ok: false, data: null }
  }
}

/**
 * Prüft, ob die Response eine Spieler-Entscheidung erwartet (Donut Division etc.).
 * @param {object} round
 * @param {string} [slotSlug]
 * @param {boolean} [gambleOnBonus] - Soll gegambelt werden? (true=gamble, false=collect)
 * @returns {object|null} continueInstructions oder null
 */
function getRequiredContinueAction(round, slotSlug = '', gambleOnBonus = false) {
  if (!round?.events?.length) return null
  const events = round.events
  const hasFeatureExit = events.some((e) => String(e?.etn || '').toLowerCase() === 'feature_exit')
  if (hasFeatureExit) return null

  // Bonus-Choice: feature_enter → Aktion gemäß bonusFeatureWon
  const featureEnter = events.find((e) => String(e?.etn || '').toLowerCase() === 'feature_enter')
  if (featureEnter?.c?.bonusFeatureWon) {
    const won = String(featureEnter.c.bonusFeatureWon || '').toLowerCase()
    
    // Bullets and Bounty: 3-Scatter Bonus (fs) hat Gamble-Option.
    // Wenn gambleOnBonus=true -> "gamble"
    // Wenn gambleOnBonus=false -> "play" (Collect)
    if (slotSlug.includes('bullets-and-bounty') && won === 'fs') {
      return { action: gambleOnBonus ? 'gamble' : 'play' }
    }

    // Donut Division: fs_warehouse/fs_wild → immer warehouse
    if (won === 'fs_warehouse' || won === 'fs_wild') return { action: 'warehouse' }
    // Octo Attack: fs_1 = 3-Scatter-Bonus, fs_2 = Super-Freispiele
    if (won === 'fs_1' || won === 'fs_2') return { action: won }
  }

  // Kein Wild-Pick: Wir wählen immer warehouse, im Warehouse-Bonus gibt es keine links/rechts-Wahl.
  // Events mit "wild" sind nur Grid-Win-Daten, kein Spieler-Input.
  return null
}

/**
 * Continue – win_presentation_complete oder Bonus-Choice (Donut Division: warehouse, Octo Attack: fs_1/fs_2).
 * @param {string} apiBase - HACKSAW_API_BASE
 * @param {{ token: string, sessionUuid: string, seq: number }} session
 * @param {string} roundId
 * @param {object} [prevResponse] - vorherige Response, um required action zu ermitteln
 * @param {string} [slotSlug] - Slug des Slots (für spezifische Entscheidungen)
 * @param {boolean} [gambleOnBonus] - Soll gegambelt werden?
 */
export async function sendHacksawContinue(apiBase, session, roundId, prevResponse, slotSlug, gambleOnBonus) {
  const instructions = prevResponse?.round ? getRequiredContinueAction(prevResponse.round, slotSlug, gambleOnBonus) : null
  const continueInstructions = instructions ?? { action: 'win_presentation_complete' }
  const req = {
    seq: session.seq,
    sessionUuid: session.sessionUuid,
    roundId,
    continueInstructions,
  }
  const t0 = Date.now()
  const res = await safeFetch(`${apiBase}/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  let data
  try {
    data = await res.json()
  } catch (e) {
    const errText = await res.text()
    logApiCall({ type: 'hacksaw/continue', endpoint: `${apiBase}/bet`, request: req, response: null, error: errText || String(e), durationMs: Date.now() - t0 })
    throw new Error(`Continue fehlgeschlagen: ${errText || res.status}`)
  }

  logApiCall({ type: 'hacksaw/continue', endpoint: `${apiBase}/bet`, request: req, response: data, error: !res.ok ? `HTTP ${res.status}` : data?.statusCode !== 0 ? data?.statusMessage : null, durationMs: Date.now() - t0 })

  if (!res.ok) {
    throw new Error(`Continue fehlgeschlagen: ${res.status}`)
  }
  if (data?.statusCode === 20) {
    const err = new Error('Session abgelaufen. Bitte Session neu starten.')
    err.sessionClosed = true
    throw err
  }

  return data
}
