/**
 * Playnetic (Hub88) – z.B. Farmageddon
 * gsplauncher → games.hub88-2-playnetic.com/{game}/gs/g/*
 * Init: GET .../o?oid&gid&cc&token → iid, bets
 * Bet:  GET .../sb?iid&bet (nur bei Einsatzwechsel) dann GET .../np?iid[&auxFeature=PowerBet]
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

const PLAYNETIC_OID = 'Stake.com'
const MAJOR_TO_MINOR = 100
const DEFAULT_LOBBY_URL = 'https://stake.com/casino/home'

function createSsWid() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 20)
}

function formatBetMajor(major) {
  const n = Number(major)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)))
}

function buildGameReferer(launch, currencyCode) {
  const root = `${String(launch.apiBase || '').replace(/\/$/, '')}/${String(launch.gamePath || '').replace(/^\//, '')}`
  const qs = new URLSearchParams({
    oid: launch.oid || PLAYNETIC_OID,
    token: launch.token,
    'lobby.url': launch.lobbyUrl || DEFAULT_LOBBY_URL,
    cc: (currencyCode || launch.cc || 'USD').toUpperCase(),
  })
  return `${root}/?${qs.toString()}`
}

function apiRoot(session) {
  const base = String(session?.apiBase || '').replace(/\/$/, '')
  const path = String(session?.gamePath || '').replace(/^\//, '').replace(/\/$/, '')
  return path ? `${base}/${path}` : base
}

function majorToMinor(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * MAJOR_TO_MINOR) : 0
}

function minorToMajor(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n / MAJOR_TO_MINOR : 0
}

function snapBetMajor(amountMinor, betLevelsMinor) {
  if (!betLevelsMinor?.length) return minorToMajor(amountMinor)
  let best = betLevelsMinor[0]
  for (const lv of betLevelsMinor) {
    if (Math.abs(lv - amountMinor) < Math.abs(best - amountMinor)) best = lv
  }
  return minorToMajor(best)
}

function parseDirectConfig(config, targetCurrency) {
  if (!config || typeof config !== 'string') return null
  if (!config.includes('playnetic.com') && !config.includes('/gs/g/o')) return null
  try {
    const u = new URL(config)
    const parts = u.pathname.split('/').filter(Boolean)
    const gsIdx = parts.indexOf('gs')
    const gamePath = gsIdx > 0 ? parts.slice(0, gsIdx).join('/') : parts[0] || ''
    const token = u.searchParams.get('token')
    const gid = u.searchParams.get('gid')
    if (!token || !gid || !gamePath) return null
    return {
      apiBase: `${u.protocol}//${u.host}`,
      gamePath,
      oid: u.searchParams.get('oid') || PLAYNETIC_OID,
      gid,
      cc: (u.searchParams.get('cc') || targetCurrency || 'EUR').toUpperCase(),
      token,
    }
  } catch {
    return null
  }
}

async function resolveViaGsplauncher(configUrl, targetCurrency) {
  if (!window.electronAPI?.resolvePlayneticLaunch) {
    console.warn('[playnetic] resolvePlayneticLaunch nicht verfügbar')
    return null
  }
  const resolved = await window.electronAPI.resolvePlayneticLaunch(configUrl)
  if (!resolved?.token || !resolved?.gid || !resolved?.gamePath) {
    console.warn('[playnetic] Launcher-Auflösung fehlgeschlagen:', resolved)
    return null
  }
  return {
    apiBase: resolved.apiBase,
    gamePath: resolved.gamePath,
    oid: resolved.oid || PLAYNETIC_OID,
    gid: resolved.gid,
    cc: (resolved.cc || targetCurrency || 'EUR').toUpperCase(),
    token: resolved.token,
  }
}

function buildPlayneticHeaders(session) {
  const origin = String(session?.apiBase || '').replace(/\/$/, '') || 'https://games.hub88-2-playnetic.com'
  const referer = session?.gameReferer || buildGameReferer(session, session?.currencyCode)
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: origin,
    Referer: referer,
    'ss-wid': session?.ssWid || createSsWid(),
    'ss-sid': String(session?.ssSid ?? 0),
  }
}

async function requestViaProxy(url, session) {
  const headers = buildPlayneticHeaders(session)
  if (window.electronAPI?.proxyRequest) {
    const res = await window.electronAPI.proxyRequest({
      url,
      method: 'GET',
      headers,
    })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => res.data,
      json: async () => JSON.parse(res.data),
    }
  }
  const res = await fetch(url, {
    method: 'GET',
    headers,
  })
  const txt = await res.text()
  return {
    ok: res.ok,
    status: res.status,
    text: async () => txt,
    json: async () => (txt ? JSON.parse(txt) : null),
  }
}

function buildOpenUrl(launch) {
  const root = `${launch.apiBase.replace(/\/$/, '')}/${launch.gamePath.replace(/^\//, '')}`
  const qs = new URLSearchParams({
    oid: launch.oid || PLAYNETIC_OID,
    gid: launch.gid,
    cc: launch.cc,
    token: launch.token,
  })
  return `${root}/gs/g/o?${qs.toString()}`
}

function pickFinalState(spinData) {
  const states = Array.isArray(spinData?.states) ? spinData.states : []
  if (!states.length) return null
  const roundEnd = [...states].reverse().find((s) =>
    Array.isArray(s?.mode) && s.mode.some((m) => String(m).includes('ROUND_END') || String(m).includes('STEP_END'))
  )
  return roundEnd || states[states.length - 1]
}

function getMaxStateSn(spinData) {
  const states = Array.isArray(spinData?.states) ? spinData.states : []
  let max = 0
  for (const s of states) {
    const sn = Number(s?.sn)
    if (Number.isFinite(sn) && sn > max) max = sn
  }
  return max
}

function parseIllegalSidExpected(payload) {
  const text = typeof payload === 'string' ? payload : payload?.error
  const m = /Illegal SID \[(\d+),\s*(\d+)\]/.exec(String(text || ''))
  return m ? Number(m[1]) : null
}

function buildBetResponse(finalState, session, seq, slotSlug, stateSn = null) {
  const currencyCode = String(finalState?.currency || session?.currencyCode || 'EUR').toUpperCase()
  const balanceMinor = majorToMinor(finalState?.balance)
  const lineWins = Array.isArray(finalState?.wins)
    ? finalState.wins.reduce((sum, v) => sum + (Number(v) || 0), 0)
    : 0
  const betMajor = Number(finalState?.gbet ?? finalState?.bet ?? 0)
  const cashMajor = Number(finalState?.cash ?? 0)
  const winFromCash = Number.isFinite(cashMajor) && Number.isFinite(betMajor)
    ? Math.max(0, betMajor + cashMajor)
    : 0
  const winMajor = lineWins > 0 ? lineWins : winFromCash
  const totalWinMinor = Math.max(0, majorToMinor(winMajor))
  return {
    data: {
      statusCode: 0,
      accountBalance: {
        balance: Number.isFinite(balanceMinor) ? balanceMinor : null,
        currencyCode,
      },
      round: {
        status: 'complete',
        // `n` ist kein eindeutiger Spin-Key (oft konstant) — seq+sn verhindert History-Dedup-Kollisionen.
        roundId: `pn-${seq}-${stateSn ?? finalState?.sn ?? finalState?.n ?? 0}`,
        events: [{ awa: totalWinMinor }],
        winAmountDisplay: totalWinMinor,
      },
      _playneticRaw: finalState || null,
    },
    nextSeq: seq,
    session: {
      ...session,
      seq,
      slotSlug: slotSlug || session?.slotSlug,
    },
  }
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    (sourceCurrency || 'usdc').toLowerCase(),
    (targetCurrency || 'eur').toLowerCase()
  )
  const configUrl = typeof session?.config === 'string' ? session.config : session?.config?.url
  let launch = parseDirectConfig(configUrl, targetCurrency)
  if (!launch?.token && typeof configUrl === 'string' && configUrl.includes('gsplauncher')) {
    launch = await resolveViaGsplauncher(configUrl, targetCurrency)
  }
  if (!launch?.token || !launch?.gid) {
    logApiCall({
      type: 'playnetic/init-resolve',
      endpoint: 'launcher',
      request: { slotSlug, hasConfigUrl: Boolean(configUrl) },
      response: null,
      error: 'Launcher konnte nicht auf Playnetic-Session aufgelöst werden',
      durationMs: null,
    })
    throw new Error('Playnetic: Keine gültige Session (token/gid fehlt).')
  }

  const currencyCode = String(launch.cc || targetCurrency || 'USD').toUpperCase()
  const sessionCtx = {
    apiBase: launch.apiBase,
    gamePath: launch.gamePath,
    oid: launch.oid || PLAYNETIC_OID,
    token: launch.token,
    gid: launch.gid,
    currencyCode,
    lobbyUrl: DEFAULT_LOBBY_URL,
    ssWid: createSsWid(),
    ssSid: 0,
    gameReferer: buildGameReferer(launch, currencyCode),
  }

  const openUrl = buildOpenUrl(launch)
  const t0 = Date.now()
  const initRes = await requestViaProxy(openUrl, sessionCtx)
  const initText = await initRes.text()
  let initData = null
  try {
    initData = initText ? JSON.parse(initText) : null
  } catch {
    initData = null
  }
  logApiCall({
    type: 'playnetic/init',
    endpoint: openUrl,
    request: { slotSlug, gid: launch.gid },
    response: initData
      ? {
          iid: initData.iid || null,
          betCount: Array.isArray(initData.bets) ? initData.bets.length : 0,
          balance: initData.balance ?? null,
          powerBetAllowed: initData?.regs?.flags?.powerBetAllowed ?? null,
        }
      : initText?.slice(0, 180),
    error: initRes.ok ? null : `HTTP ${initRes.status}`,
    durationMs: Date.now() - t0,
  })
  if (!initRes.ok || !initData?.iid) {
    throw new Error(`Playnetic init failed: HTTP ${initRes.status}`)
  }

  const betLevels = Array.isArray(initData.bets)
    ? initData.bets.map((v) => majorToMinor(v)).filter((v) => v > 0)
    : []

  return {
    provider: 'playnetic',
    seq: 1,
    slotSlug,
    apiBase: launch.apiBase,
    gamePath: launch.gamePath,
    gid: launch.gid,
    oid: launch.oid || PLAYNETIC_OID,
    token: launch.token,
    iid: initData.iid,
    currencyCode: String(initData.currency || currencyCode).toUpperCase(),
    betLevels,
    powerBetAllowed: initData?.regs?.flags?.powerBetAllowed === true,
    initialBalance: Number.isFinite(Number(initData.balance)) ? majorToMinor(initData.balance) : null,
    gameReferer: sessionCtx.gameReferer,
    lobbyUrl: sessionCtx.lobbyUrl,
    ssWid: sessionCtx.ssWid,
    ssSid: sessionCtx.ssSid,
  }
}

async function executeSpinRound(activeSession, { betParam, effectiveMinor, extraBet, skipSetBet = false }) {
  const root = apiRoot(activeSession)
  const iid = activeSession?.iid
  let sbUrl = null
  if (!skipSetBet) {
    sbUrl = `${root}/gs/g/sb?${new URLSearchParams({ iid, bet: betParam }).toString()}`
    const sbRes = await requestViaProxy(sbUrl, activeSession)
    const sbText = await sbRes.text().catch(() => '')
    let sbData = null
    try {
      sbData = sbText ? JSON.parse(sbText) : null
    } catch {
      sbData = null
    }
    if (!sbRes.ok || !sbData) {
      return {
        ok: false,
        phase: 'sb',
        endpoint: sbUrl,
        responseText: sbText,
        status: sbRes.status,
        npData: null,
        finalState: null,
      }
    }
  }

  const npParams = new URLSearchParams({ iid })
  if (extraBet && activeSession?.powerBetAllowed !== false) {
    npParams.set('auxFeature', 'PowerBet')
  }
  const npUrl = `${root}/gs/g/np?${npParams.toString()}`
  const npRes = await requestViaProxy(npUrl, activeSession)
  const npText = await npRes.text()
  let npData = null
  try {
    npData = npText ? JSON.parse(npText) : null
  } catch {
    npData = null
  }
  if (!npRes.ok || !npData) {
    return {
      ok: false,
      phase: 'np',
      endpoint: npUrl,
      responseText: npText,
      status: npRes.status,
      npData: null,
      finalState: null,
      auxFeature: npParams.get('auxFeature'),
    }
  }

  const finalState = pickFinalState(npData)
  const stateCount = Array.isArray(npData?.states) ? npData.states.length : 0
  const apiError = npData?.error && npData?.status != null ? String(npData.error) : null
  return {
    ok: Boolean(finalState) && stateCount > 0 && !apiError,
    phase: 'np',
    endpoint: npUrl,
    responseText: npText,
    status: npRes.status,
    npData,
    finalState,
    stateCount,
    apiError,
    auxFeature: npParams.get('auxFeature'),
    ssSid: activeSession?.ssSid ?? 0,
    skippedSetBet: skipSetBet,
  }
}

export async function placeBet(session, betAmount, extraBet = false, _unused, opts = {}) {
  const slotSlug = session?.slotSlug || null
  const baseMinor = Number(betAmount) || 0
  const effectiveMinor = Number(getEffectiveBetAmount(betAmount, extraBet, slotSlug)) || 0
  const fastPath = opts?.fastPath === true
  // sb setzt die Basiswette; PowerBet-Aufschlag nur via auxFeature beim Spin (HAR)
  const betMajor = snapBetMajor(baseMinor, session?.betLevels)
  const iid = session?.iid
  if (!apiRoot(session) || !iid) throw new Error('Playnetic: session unvollständig (iid/apiBase fehlt)')

  const t0 = Date.now()
  const betParam = formatBetMajor(betMajor)
  let activeSession = session
  let spinResult = null
  // Browser: sb nur bei Einsatzwechsel; Autospin gleiche Wette → nur np (~1 RTT schneller).
  let skipSetBet = activeSession?.lastBetParam != null && activeSession.lastBetParam === betParam

  for (let attempt = 0; attempt < 3; attempt++) {
    spinResult = await executeSpinRound(activeSession, { betParam, effectiveMinor, extraBet, skipSetBet })
    if (spinResult.ok) break

    if (skipSetBet && attempt === 0) {
      skipSetBet = false
      continue
    }

    const sidHint = parseIllegalSidExpected(spinResult.apiError || spinResult.responseText)
    if (sidHint != null && attempt < 2) {
      activeSession = { ...activeSession, ssSid: sidHint }
      continue
    }
    break
  }

  if (!spinResult?.ok) {
    if (spinResult?.phase === 'sb') {
      logApiCall({
        type: 'playnetic/sb',
        endpoint: spinResult.endpoint,
        request: { betMajor: betParam, effectiveMinor, extraBet, ssSid: activeSession?.ssSid ?? 0 },
        response: spinResult.responseText?.slice(0, 180),
        error: `HTTP ${spinResult.status}`,
        durationMs: Date.now() - t0,
      })
      throw new Error(`Playnetic set-bet failed: HTTP ${spinResult.status}`)
    }

    const errDetail = spinResult?.apiError || spinResult?.responseText?.slice(0, 200) || 'leere states-Response'
    logApiCall({
      type: 'playnetic/spin',
      endpoint: spinResult?.endpoint,
      request: {
        betMajor: betParam,
        effectiveMinor,
        extraBet,
        auxFeature: spinResult?.auxFeature ?? null,
        ssSid: spinResult?.ssSid ?? 0,
      },
      response: spinResult?.responseText?.slice(0, 400),
      error: errDetail,
      durationMs: Date.now() - t0,
    })
    throw new Error(`Playnetic spin failed: ${errDetail}`)
  }

  const finalState = spinResult.finalState
  const nextSeq = (activeSession?.seq || 0) + 1
  const nextSession = {
    ...activeSession,
    seq: nextSeq,
    ssSid: getMaxStateSn(spinResult.npData) + 1,
    lastBetParam: betParam,
    slotSlug: slotSlug || activeSession?.slotSlug,
  }

  if (!fastPath) {
    logApiCall({
      type: 'playnetic/spin',
      endpoint: spinResult.endpoint,
      request: {
        betMajor: betParam,
        effectiveMinor,
        extraBet,
        skipSetBet: spinResult.skippedSetBet === true,
        auxFeature: spinResult.auxFeature ?? null,
        ssSid: spinResult.ssSid,
        nextSsSid: nextSession.ssSid,
      },
      response: {
        balance: finalState?.balance ?? null,
        cash: finalState?.cash ?? null,
        stateCount: spinResult.stateCount,
        maxSn: getMaxStateSn(spinResult.npData),
      },
      error: null,
      durationMs: Date.now() - t0,
    })
  }

  return buildBetResponse(finalState, nextSession, nextSeq, slotSlug, getMaxStateSn(spinResult.npData))
}

export async function sendKeepAlive() {
  return { ok: true }
}

export async function sendContinue() {
  return { ok: true }
}
