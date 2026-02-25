/**
 * Hacksaw Gaming – Generischer Provider für alle Hacksaw-Slots
 * Verwendet Stake startThirdPartySession + Hacksaw RGS API
 */
import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { parseBetResponse } from '../../utils/parseBetResponse'
import { HACKSAW_API_BASE, HACKSAW_USER_AGENT, sendHacksawKeepAlive, sendHacksawContinue, safeFetch } from './hacksawShared'

function parseConfigFromUrl(configUrl) {
  try {
    const url = new URL(configUrl)
    const params = url.searchParams
    return {
      token: params.get('token'),
      gameId: params.get('gameId') || params.get('gameid'),
      gameVersion: params.get('gameVersion') || params.get('version') || '1.22.0',
      currency: params.get('currency') || 'EUR',
      language: params.get('language') || params.get('languageCode') || 'de-de',
      channel: params.get('channel') || '2',
      mode: params.get('mode') || '1',
      branding: params.get('branding') || 'default',
    }
  } catch {
    return null
  }
}

/**
 * @param {string} accessToken
 * @param {string} slotSlug - z.B. hacksaw-le-bandit
 * @param {string} sourceCurrency
 * @param {string} targetCurrency
 */
export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    sourceCurrency?.toLowerCase() || 'usdc',
    targetCurrency?.toLowerCase() || 'eur'
  )
  const cfg = parseConfigFromConfig(session?.config, targetCurrency)
  if (!cfg?.token) throw new Error('Token konnte nicht aus Session extrahiert werden.')

  const authReq = {
    seq: 1,
    partner: 'stake',
    gameId: parseInt(cfg.gameId, 10) || 1309,
    gameVersion: cfg.gameVersion,
    currency: (targetCurrency || 'eur').toUpperCase(),
    languageCode: cfg.language || 'de-de',
    mode: parseInt(cfg.mode, 10) || 1,
    branding: cfg.branding || 'default',
    channel: parseInt(cfg.channel, 10) || 2,
    userAgent: HACKSAW_USER_AGENT,
    token: cfg.token,
  }
  let authData
  let lastAuthError
  
  // Retry loop for authenticate (max 3 attempts) to handle missing sessionUuid or temporary errors
  for (let i = 0; i < 3; i++) {
    const tAuth = Date.now()
    try {
      const authRes = await safeFetch(`${HACKSAW_API_BASE}/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authReq),
      })

      try {
        authData = await authRes.json()
      } catch (e) {
        const errText = await authRes.text()
        lastAuthError = `Authenticate JSON Error: ${errText || String(e)}`
        logApiCall({ type: 'hacksaw/authenticate', endpoint: `${HACKSAW_API_BASE}/authenticate`, request: authReq, response: null, error: lastAuthError, durationMs: Date.now() - tAuth })
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      const apiError = (authData?.statusCode && authData.statusCode !== 0) ? `API Error ${authData.statusCode} (${authData.statusMessage})` : null
      logApiCall({ type: 'hacksaw/authenticate', endpoint: `${HACKSAW_API_BASE}/authenticate`, request: authReq, response: authData, error: !authRes.ok ? `HTTP ${authRes.status}` : apiError, durationMs: Date.now() - tAuth })

      if (!authRes.ok) {
        lastAuthError = `Authenticate HTTP Error: ${authRes.status}`
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      if (authData?.statusCode && authData.statusCode !== 0) {
        lastAuthError = `Authenticate API Error: ${authData.statusCode} (${authData.statusMessage || 'Unknown'})`
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      const uuid = authData?.sessionUuid ?? authData?.session?.uuid
      if (!uuid) {
        lastAuthError = `Keine sessionUuid in Authenticate-Response (Try ${i+1})`
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      // Success
      lastAuthError = null
      break
    } catch (netErr) {
      lastAuthError = `Authenticate Network Error: ${netErr.message}`
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  if (lastAuthError) {
    throw new Error(lastAuthError)
  }

  const sessionUuid = authData?.sessionUuid ?? authData?.session?.uuid

  const packageName = slotSlug.includes('-') ? slotSlug.split('-').slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : slotSlug
  const launchReq = {
    channel: 'mobile',
    gameId: authReq.gameId,
    loadTime: 1.0,
    mode: authReq.mode,
    packageName: `${packageName}@${cfg.gameVersion}`,
    resolution: '1920x1080',
    sessionUuid,
    token: cfg.token,
    userAgent: HACKSAW_USER_AGENT,
    version: cfg.gameVersion,
    partner: 'stake',
    playerId: 'slotbot',
  }
  const tLaunch = Date.now()
  const launchRes = await safeFetch(`${HACKSAW_API_BASE}/gameLaunch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(launchReq),
  })

  let launchData = null
  try {
    launchData = launchRes.ok ? await launchRes.json() : { _raw: await launchRes.text() }
  } catch (e) {
    launchData = { _error: String(e) }
  }
  logApiCall({ type: 'hacksaw/gameLaunch', endpoint: `${HACKSAW_API_BASE}/gameLaunch`, request: launchReq, response: launchData, error: !launchRes.ok ? `HTTP ${launchRes.status}` : null, durationMs: Date.now() - tLaunch })

  if (!launchRes.ok) {
    throw new Error(`GameLaunch fehlgeschlagen: ${launchRes.status}`)
  }

  const keepAliveInterval = parseInt(authData?.keepAliveInterval || '300', 10) || 300
  // API betLevels sind bereits in Minor Units (1100 = 11,00 ARS), NICHT * 100
  const betLevels = authData?.betLevels?.map((v) => Math.round(Number(v))) ?? []
  // Offene Runde aus gameLaunch (bei Session-Resume mit aktivem Bonus)
  const openRoundId = launchData?.round?.roundId ?? launchData?.roundId ?? launchData?.openRound?.roundId ?? authData?.round?.roundId ?? authData?.roundId ?? null
  return { token: cfg.token, sessionUuid, seq: 2, keepAliveInterval, betLevels, openRoundId: openRoundId || undefined }
}

function parseConfigFromConfig(config, targetCurrency = 'eur') {
  const url = typeof config === 'string' ? config : config?.url
  if (!url) return null
  const parsed = parseConfigFromUrl(url)
  if (parsed && !parsed.currency) {
    parsed.currency = (targetCurrency || 'eur').toUpperCase()
  }
  return parsed
}

export async function sendKeepAlive(session) {
  return sendHacksawKeepAlive(HACKSAW_API_BASE, session, { treat404AsOk: true })
}

export async function sendContinue(session, roundId, prevResponse, slotSlug, gambleOnBonus) {
  return sendHacksawContinue(HACKSAW_API_BASE, session, roundId, prevResponse, slotSlug, gambleOnBonus)
}

/**
 * @param {object} session
 * @param {number} betAmount - in Minor (Cent, Satoshi, etc.)
 * @param {boolean} extraBet
 * @param {boolean} autoplay
 * @param {{ skipContinueIfBonusMinScatter?: number }} [options] - Bonus nicht durchspielen wenn scatterCount >= X
 */
export async function placeBet(session, betAmount, extraBet = false, autoplay = false, options = {}) {
  const bets = [{ betAmount: String(betAmount) }]
  if (extraBet) {
    bets[0].buyBonus = 'mod_bonus'
  }

  const req = {
    seq: session.seq,
    sessionUuid: session.sessionUuid,
    bets,
    offerId: null,
    promotionId: null,
    autoplay,
  }
  const t0 = Date.now()
  const res = await safeFetch(`${HACKSAW_API_BASE}/bet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  let data
  try {
    data = await res.json()
  } catch (e) {
    const errText = await res.text()
    logApiCall({ type: 'hacksaw/bet', endpoint: `${HACKSAW_API_BASE}/bet`, request: req, response: null, error: errText || String(e), durationMs: Date.now() - t0 })
    throw new Error(`Bet fehlgeschlagen: ${errText || res.status}`)
  }

  logApiCall({ type: 'hacksaw/bet', endpoint: `${HACKSAW_API_BASE}/bet`, request: req, response: data, error: !res.ok ? `HTTP ${res.status}` : data?.statusCode !== 0 ? data?.statusMessage : null, durationMs: Date.now() - t0 })

  if (!res.ok) {
    throw new Error(`Bet fehlgeschlagen: ${res.status}`)
  }
  // 1. Session abgelaufen Check
  if (data?.statusCode === 20) {
    const err = new Error('Session abgelaufen. Bitte Session neu starten.')
    err.sessionClosed = true
    throw err
  }

  // 2. Spezialfall: "General error" (statusCode 1) KANN bedeuten: "Bonus/Gamble wartet" (Round status 'started')
  // Wir prüfen, ob eine offene Runde existiert, die wir fortsetzen müssen.
  if (data?.statusCode === 1) {
    // Versuche Fortsetzung mit bekannter RoundID oder generisch
    const roundIdsToTry = [session.openRoundId].filter(Boolean)
    if (roundIdsToTry.length === 0) roundIdsToTry.push(undefined)

    for (const rid of roundIdsToTry) {
      try {
        const continueData = await sendContinue({ ...session, seq: session.seq }, rid, undefined, options?.slotSlug, options?.gambleOnBonus)
        
        if (continueData?.statusCode === 0 && continueData?.round) {
          let cSeq = session.seq + 1
          let cData = continueData
          
          while (cData?.round?.status === 'wfwpc' && cData?.round?.roundId) {
            cData = await sendContinue({ ...session, seq: cSeq }, cData.round.roundId, cData, options?.slotSlug, options?.gambleOnBonus)
            cSeq += 1
          }
          // Wenn die Runde immer noch "started" ist (z.B. Gamble-Entscheidung noch offen?), dann ist es ein Loop.
          // Aber meistens liefert continueData dann den nächsten Schritt.
          // Wir geben das Ergebnis zurück, damit die UI weitermacht.
          return { data: cData, nextSeq: cSeq }
        }
      } catch (e) {
        // ...
      }
    }
    // Wenn alles fehlschlägt, weiter im Code (Fallback Logik unten)
  }

  // Fallback für statusCode 1 (wenn obiger Block nichts gefunden hat)
  if (data?.statusCode === 1 && !data?.round?.roundId) {
    // ... alter Code ...
    try {
      const continueReq = { seq: session.seq, sessionUuid: session.sessionUuid, continueInstructions: { action: 'win_presentation_complete' } }
      const cres = await safeFetch(`${HACKSAW_API_BASE}/bet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(continueReq) })
      const cdata = await cres.json().catch(() => ({}))
      logApiCall({ type: 'hacksaw/continue', endpoint: `${HACKSAW_API_BASE}/bet`, request: continueReq, response: cdata, error: cdata?.statusCode !== 0 ? cdata?.statusMessage : null, durationMs: 0 })
      if (cdata?.statusCode === 0 && cdata?.round) {
        let cSeq = session.seq + 1
        let cData = cdata
        while (cData?.round?.status === 'wfwpc' && cData?.round?.roundId) {
          cData = await sendContinue({ ...session, seq: cSeq }, cData.round.roundId, cData, options?.slotSlug, options?.gambleOnBonus)
          cSeq += 1
        }
        return { data: cData, nextSeq: cSeq }
      }
    } catch (e) {
      logApiCall({ type: 'hacksaw/continue', endpoint: `${HACKSAW_API_BASE}/bet`, request: { continueOnly: true }, response: null, error: e?.message, durationMs: 0 })
    }
    if (extraBet) {
      const reqNoExtra = { ...req, bets: [{ betAmount: String(betAmount) }] }
      const t1 = Date.now()
      const res2 = await safeFetch(`${HACKSAW_API_BASE}/bet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqNoExtra) })
      const data2 = await res2.json().catch(() => ({}))
      logApiCall({ type: 'hacksaw/bet', endpoint: `${HACKSAW_API_BASE}/bet`, request: reqNoExtra, response: data2, error: data2?.statusCode !== 0 ? data2?.statusMessage : null, durationMs: Date.now() - t1 })
      if (data2?.statusCode === 0 && data2?.round?.roundId) {
        data = data2
      }
    }
  }

  const parsed = parseBetResponse(data, betAmount)
  let currentSeq = session.seq + 1

  const skipContinue = shouldSkipBonus(parsed, options)

  if (skipContinue) {
    return { data, baseData: data, nextSeq: currentSeq }
  }

  if (data?.round?.status === 'wfwpc' && data?.round?.roundId) {
    let currentData = data
    while (currentData?.round?.status === 'wfwpc' && currentData?.round?.roundId) {
      const continueResult = await sendContinue(
        { ...session, seq: currentSeq },
        currentData.round.roundId,
        currentData,
        options?.slotSlug,
        options?.gambleOnBonus
      )
      currentData = continueResult
      currentSeq += 1
    }
  }

  return { data, nextSeq: currentSeq }
}

/**
 * Entscheidungslogik, ob ein Bonus "geskippt" (gestoppt) oder weitergespielt werden soll.
 * - Skippen = Stoppen (für Bonus Hunt, damit der User den Bonus selbst öffnen kann).
 * - Weiterlaufen = Automatisch abspielen (für normale Spins oder zu kleine Boni).
 */
export function shouldSkipBonus(parsed, options) {
  const minScatter = options?.skipContinueIfBonusMinScatter
  const bonusId = (parsed.bonusFeatureId || '').toLowerCase()
  const slotSlug = (options?.slotSlug || '').toLowerCase()
  
  let specialLevel = null

  // Octo Attack Specifics
  if (slotSlug.includes('octo-attack')) {
    const OCTO_MAPPING = {
      'fs': 3,   // Normal Bonus (auch bei 6 Scattern lt. User)
      'fs_1': 3, // Fallback
      'fs_2': 4, // Super Bonus
    }
    if (OCTO_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = OCTO_MAPPING[bonusId]
    }
  } else {
    // Global/Legacy Mappings (falls nötig)
    const GLOBAL_MAPPING = {
      'fs': 3,   // Normal Bonus für andere Slots
      'fs_1': 3,
      'fs_2': 4,
    }
    if (GLOBAL_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = GLOBAL_MAPPING[bonusId]
    }
  }

  if (specialLevel != null) {
    // Wenn kein Filter (minScatter == null), stoppen wir immer (Level >= 0).
    // Wenn Filter da (z.B. 4), stoppen wir nur, wenn impliedLevel (4) >= Filter (4).
    if (minScatter == null) return true
    return specialLevel >= minScatter
  }
  
  // Generische Scatter-Logik (für Standard-Boni, wo Scatter-Count aus Response korrekt ist)
  const skipForScatterCount = minScatter != null && minScatter >= 1 &&
    (parsed.shouldStopOnBonus ?? parsed.isBonus) &&
    (parsed.scatterCount != null && parsed.scatterCount >= minScatter)

  // Genereller Stop bei Bonus (wenn KEIN minScatter Filter aktiv ist)
  // WICHTIG: Wenn minScatter gesetzt ist (z.B. 4), wird skipOnBonus ignoriert!
  // Das sorgt dafür, dass 3-Scatter-Boni automatisch weiterlaufen (nicht gestoppt werden).
  const skipOnBonus = options?.skipContinueOnBonus && (parsed.shouldStopOnBonus ?? parsed.isBonus)
  
  return skipForScatterCount || (skipOnBonus && minScatter == null)
}
