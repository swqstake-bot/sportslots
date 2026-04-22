/**
 * Hacksaw Gaming – Generischer Provider für alle Hacksaw-Slots
 * Verwendet Stake startThirdPartySession + Hacksaw RGS API
 */
import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { parseBetResponse } from '../../utils/parseBetResponse'
import { HACKSAW_API_BASE, HACKSAW_USER_AGENT, sendHacksawKeepAlive, sendHacksawContinue, safeFetch } from './hacksawShared'

/** Vergleich von bonusFeatureWon (CamelCase, snake_case, Leerzeichen). */
function normalizeHacksawBonusFeatureKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Bekannte interne/Marketing-Namen für den 5-Scatter-Bonus (Le-Serie & Co.).
 * Keys = Fragment im Stake-Slug (nach "hacksaw-"), Werte = typische bonusFeatureWon-Strings.
 */
const HACKSAW_5_SCATTER_NAMED_RAW = {
  'le-pharaoh': ['RainbowoverthePyramids'],
  'le-bandit': ['TreasureattheEndoftheRainbow'],
  'le-zeus': ['ZeZeusMightSuperstar', 'ZeusMightSuperstar'],
  'le-viking': ['JourneytoValhallaFreeSpins'],
  'le-king': ['VivaLeBandit'],
  'six-six-six': ['WhattheHell'],
  sixsixsix: ['WhattheHell'],
  'get-the-cheese': ['LifesSoGouda', 'LifeSoGouda'],
  'dorks-of-the-deep': ['HiddenTreasures'],
  invictus: ['DominusMaximus'],
  dropem: ['WildDropSpinsBonus'],
  'drop-em': ['WildDropSpinsBonus'],
  'booze-bash': ['HellsHappyHour'],
  spinman: ['ReelHeroes'],
  'the-luxe': ['VelvetNights'],
  'keep-em': ['KeepYourCannyCloser'],
  keepem: ['KeepYourCannyCloser'],
  'aiko-and-the-wind-spirit': ['MidnightMagic'],
  'reign-of-rome': ['FightforGlory', 'FightForGlory'],
  'the-count': ['CountonBlood', 'CountOnBlood'],
  // Le Digger (Stake: hacksaw-le-digger): 5-Scatter / Epic nach Gamble
  'le-digger': ['GoldDigger', 'Gold Digger'],
}

const HACKSAW_5_SCATTER_NAMED = Object.fromEntries(
  Object.entries(HACKSAW_5_SCATTER_NAMED_RAW).map(([frag, names]) => [
    frag,
    new Set(names.map((n) => normalizeHacksawBonusFeatureKey(n))),
  ])
)

/** @returns {5|null} */
function getHacksawNamedFiveScatterLevel(bonusFeatureIdRaw, slotSlugRaw) {
  const key = normalizeHacksawBonusFeatureKey(bonusFeatureIdRaw)
  if (!key) return null
  const slug = String(slotSlugRaw || '').toLowerCase()
  for (const [frag, idSet] of Object.entries(HACKSAW_5_SCATTER_NAMED)) {
    if (!slug.includes(frag)) continue
    if (idSet.has(key)) return 5
  }
  return null
}

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

export async function sendContinue(session, roundId, prevResponse, slotSlug, gambleOnBonus, continueOptions = {}) {
  return sendHacksawContinue(HACKSAW_API_BASE, session, roundId, prevResponse, slotSlug, gambleOnBonus, continueOptions)
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
    const slug = (options?.slotSlug || '').toLowerCase()
    bets[0].buyBonus = (slug.includes('six-six-six') || slug.includes('sixsixsix')) ? 'mod_blue' : 'mod_bonus'
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

  // 2. Spezialfall: "General error" (statusCode 1) KANN bedeuten: "Bonus/Pick wartet" (Round needs continue)
  if (data?.statusCode === 1) {
    const roundIdsToTry = [data?.round?.roundId, session.openRoundId].filter(Boolean)
    if (roundIdsToTry.length === 0) roundIdsToTry.push(undefined)
    const continueOpts = { skipContinueIfBonusMinScatter: options?.skipContinueIfBonusMinScatter }

    for (const rid of roundIdsToTry) {
      try {
        const prevResp = data?.round?.roundId === rid ? data : undefined
        const continueData = await sendContinue({ ...session, seq: session.seq }, rid, prevResp, options?.slotSlug, options?.gambleOnBonus, continueOpts)

        if (continueData?.statusCode === 0 && continueData?.round) {
          let cSeq = session.seq + 1
          let cData = continueData
          while (cData?.round?.roundId && (cData?.round?.status === 'wfwpc' || (cData?.round?.status === 'started' && cData?.round?.possibleActions?.length > 0))) {
            cData = await sendContinue({ ...session, seq: cSeq }, cData.round.roundId, cData, options?.slotSlug, options?.gambleOnBonus, continueOpts)
            cSeq += 1
          }
          return { data: cData, nextSeq: cSeq }
        }
      } catch (e) {
        // try next roundId
      }
    }
  }

  // Fallback statusCode 1: versuche win_presentation_complete
  if (data?.statusCode === 1 && !data?.round?.roundId) {
    const continueOpts = { skipContinueIfBonusMinScatter: options?.skipContinueIfBonusMinScatter }
    try {
      const continueReq = { seq: session.seq, sessionUuid: session.sessionUuid, continueInstructions: { action: 'win_presentation_complete' } }
      const cres = await safeFetch(`${HACKSAW_API_BASE}/bet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(continueReq) })
      const cdata = await cres.json().catch(() => ({}))
      logApiCall({ type: 'hacksaw/continue', endpoint: `${HACKSAW_API_BASE}/bet`, request: continueReq, response: cdata, error: cdata?.statusCode !== 0 ? cdata?.statusMessage : null, durationMs: 0 })
      if (cdata?.statusCode === 0 && cdata?.round) {
        let cSeq = session.seq + 1
        let cData = cdata
        while (cData?.round?.roundId && (cData?.round?.status === 'wfwpc' || (cData?.round?.status === 'started' && cData?.round?.possibleActions?.length > 0))) {
          cData = await sendContinue({ ...session, seq: cSeq }, cData.round.roundId, cData, options?.slotSlug, options?.gambleOnBonus, continueOpts)
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

  // Alle anderen Fehler (Insufficient Funds, Invalid seq, Session timeout, etc.): sofort stoppen
  if (data?.statusCode !== 0 && data?.statusCode !== undefined) {
    const err = new Error(data?.statusMessage || `Bet fehlgeschlagen (Status ${data?.statusCode})`)
    if (data?.statusCode === 20) err.sessionClosed = true
    throw err
  }

  const parsed = parseBetResponse(data, betAmount)
  let currentSeq = session.seq + 1

  const skipContinue = shouldSkipBonus(parsed, options)

  if (skipContinue) {
    return { data, baseData: data, nextSeq: currentSeq }
  }

  // Continue bei wfwpc ODER started+pick (Le Pharaoh/Le Bandit: links/rechts wählen)
  // Nach dem Loop: aktuelle Response (currentData) enthält den finalen Gewinn (3er-Bonus, Gamble, etc.)
  const needsContinue = (r) => r?.round?.roundId && (r?.round?.status === 'wfwpc' || (r?.round?.status === 'started' && r?.round?.possibleActions?.length > 0))
  if (needsContinue(data)) {
    const initialBonusScatter = parsed?.scatterCount ?? null
    const continueOpts = { skipContinueIfBonusMinScatter: options?.skipContinueIfBonusMinScatter }
    let currentData = data
    while (needsContinue(currentData)) {
      const continueResult = await sendContinue(
        { ...session, seq: currentSeq },
        currentData.round.roundId,
        currentData,
        options?.slotSlug,
        options?.gambleOnBonus,
        continueOpts
      )
      currentData = continueResult
      currentSeq += 1
      const parsedAfter = parseBetResponse(currentData, betAmount)
      if (parsedAfter?.isBonus && shouldSkipBonus(parsedAfter, options)) {
        const stoppedScatter = getImpliedScatterLevel(parsedAfter, options?.slotSlug)
        return { data: currentData, baseData: currentData, nextSeq: currentSeq, initialBonusScatter: stoppedScatter ?? initialBonusScatter }
      }
    }
    return { data: currentData, nextSeq: currentSeq, initialBonusScatter }
  }

  return { data, nextSeq: currentSeq }
}

export function getImpliedScatterLevel(parsed, slotSlug = '') {
  const bonusId = (parsed?.bonusFeatureId || '').toLowerCase()
  const slug = (slotSlug || '').toLowerCase()
  if (slug.includes('le-cowboy')) {
    const M = { fs: 3, fs_1: 3, fs_2: 4, fs_3: 5, pistols: 5, pistols_at_dawn: 5, fs_pistols: 5, epic: 5, fs_epic: 5 }
    return M[bonusId] ?? null
  }
  if (slug.includes('octo-attack')) {
    const M = { fs: 3, fs_1: 3, fs_2: 4 }
    return M[bonusId] ?? null
  }
  if (slug.includes('six-six-six') || slug.includes('sixsixsix')) {
    // Six Six Six: 3/4-Scatter + Gamble → What the Hell (5-Scatter/Hidden Epic)
    const M = { fs: 3, fs_1: 3, fs_2: 4, fs_3: 5, fs_5: 5, epic: 5, fs_epic: 5, what_the_hell: 5, whatthehell: 5 }
    return M[bonusId] ?? null
  }
  if (slug.includes('hand-of-anubis') || slug.includes('handofanubis')) {
    // Hand of Anubis: 3 Scatter = underworld, 4 Scatter = judgment (Judgment Bonus)
    const M = { fs: 3, fs_1: 3, fs_2: 4, underworld: 3, judgment: 4 }
    return M[bonusId] ?? null
  }
  if (slug.includes('epic-bullets') || slug.includes('epicbullets')) {
    // Epic Bullets and Bounty: 5-Scatter / Gamble-Ergebnis oft bonusFeatureWon: fs_epic
    const M = {
      fs: 3,
      fs_1: 3,
      fs_2: 4,
      fs_3: 5,
      fs_5: 5,
      epic: 5,
      fs_epic: 5,
    }
    if (M[bonusId] != null) return M[bonusId]
    if (bonusId.includes('make her day') || bonusId.includes('go ahead')) return 5
    if (bonusId.includes('gold digger') || bonusId.replace(/\s+/g, '').includes('golddigger')) return 5
    return null
  }
  if (slug.includes('le-digger')) {
    const M = {
      fs: 3,
      fs_1: 3,
      fs_2: 4,
      fs_3: 5,
      fs_5: 5,
      epic: 5,
      fs_epic: 5,
    }
    if (M[bonusId] != null) return M[bonusId]
    if (bonusId.includes('make her day') || bonusId.includes('go ahead')) return 5
    if (bonusId.includes('gold digger') || bonusId.replace(/\s+/g, '').includes('golddigger')) return 5
    return null
  }
  const named5 = getHacksawNamedFiveScatterLevel(parsed?.bonusFeatureId, slug)
  if (named5 != null) return named5
  const M = {
    fs: 3,
    fs_1: 3,
    fs_2: 4,
    fs_3: 5,
    fs_5: 5,
    fs_epic: 5,
  }
  return M[bonusId] ?? null
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

  const namedFive = getHacksawNamedFiveScatterLevel(parsed?.bonusFeatureId, slotSlug)
  if (namedFive != null) {
    specialLevel = namedFive
  } else if (slotSlug.includes('octo-attack')) {
    const OCTO_MAPPING = {
      'fs': 3,   // Normal Bonus (auch bei 6 Scattern lt. User)
      'fs_1': 3, // Fallback
      'fs_2': 4, // Super Bonus
    }
    if (OCTO_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = OCTO_MAPPING[bonusId]
    }
  } else if (slotSlug.includes('six-six-six') || slotSlug.includes('sixsixsix')) {
    // Six Six Six: 3/4-Scatter + Gamble → What the Hell (5-Scatter/Hidden Epic)
    const SIX_SIX_SIX_MAPPING = {
      'fs': 3, 'fs_1': 3, 'fs_2': 4, 'fs_3': 5, 'fs_5': 5,
      'epic': 5, 'fs_epic': 5, 'what_the_hell': 5, 'whatthehell': 5,
    }
    if (SIX_SIX_SIX_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = SIX_SIX_SIX_MAPPING[bonusId]
    }
  } else if (slotSlug.includes('le-cowboy')) {
    // Le Cowboy: Trail (3), High Noon Saloon (4), Pistols at Dawn (5/Epic)
    const LE_COWBOY_MAPPING = {
      'fs': 3,
      'fs_1': 3,   // Trail of Trickery
      'fs_2': 4,   // High Noon Saloon
      'fs_3': 5,   // Pistols at Dawn (5-Scatter / Hidden Epic)
      'pistols': 5,
      'pistols_at_dawn': 5,
      'fs_pistols': 5,
      'epic': 5,
      'fs_epic': 5,
    }
    if (LE_COWBOY_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = LE_COWBOY_MAPPING[bonusId]
    }
  } else if (slotSlug.includes('hand-of-anubis') || slotSlug.includes('handofanubis')) {
    // Hand of Anubis: 3 Scatter = underworld, 4 Scatter = judgment (Judgment Bonus)
    const HAND_OF_ANUBIS_MAPPING = {
      'fs': 3, 'fs_1': 3, 'fs_2': 4,
      'underworld': 3,  // 3-Scatter Bonus
      'judgment': 4,    // 4-Scatter Judgment Bonus
    }
    if (HAND_OF_ANUBIS_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = HAND_OF_ANUBIS_MAPPING[bonusId]
    }
  } else if (slotSlug.includes('epic-bullets') || slotSlug.includes('epicbullets')) {
    const EPIC_BULLETS_MAPPING = {
      fs: 3,
      fs_1: 3,
      fs_2: 4,
      fs_3: 5,
      fs_5: 5,
      epic: 5,
      fs_epic: 5,
    }
    if (EPIC_BULLETS_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = EPIC_BULLETS_MAPPING[bonusId]
    }
    if (
      specialLevel == null &&
      (bonusId.includes('make her day') ||
        bonusId.includes('go ahead') ||
        bonusId.includes('gold digger') ||
        bonusId.replace(/\s+/g, '').includes('golddigger'))
    ) {
      specialLevel = 5
    }
  } else {
    // Global/Legacy Mappings (falls nötig) — fs_epic: viele Hacksaw-Slots nutzen das für 5-Scatter-/Epic-Bonus
    const GLOBAL_MAPPING = {
      fs: 3,
      fs_1: 3,
      fs_2: 4,
      fs_3: 5,
      fs_5: 5,
      fs_epic: 5,
    }
    if (GLOBAL_MAPPING.hasOwnProperty(bonusId)) {
      specialLevel = GLOBAL_MAPPING[bonusId]
    }
    if (
      specialLevel == null &&
      (bonusId.includes('make her day') ||
        bonusId.includes('go ahead') ||
        bonusId.includes('gold digger') ||
        bonusId.replace(/\s+/g, '').includes('golddigger'))
    ) {
      specialLevel = 5
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
