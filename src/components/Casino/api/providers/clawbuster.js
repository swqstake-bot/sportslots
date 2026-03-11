/**
 * Claw Buster – z.B. 3 Claws of Leprechaun Gold Hold and Win
 * Ablauf: Stake config = gsplauncher-URL → Redirect zu clawbuster-cdn → secret extrahieren
 *         → init (api.clawbuster.com/v1/gameflow/init) → Play-Token
 *         → play (api.clawbuster.com/v1/gameflow/play) mit {req, token}
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

const CLAWBUSTER_INIT = 'https://api.clawbuster.com/v1/gameflow/init'
const CLAWBUSTER_PLAY = 'https://api.clawbuster.com/v1/gameflow/play'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN_KEYS = ['token', 'session_token', 'play_token', 'sessionToken', 'session_id', 'game_token']
const SKIP_KEYS = new Set(['round', 'step', 'round_id', 'step_id']) // Round/Step-IDs sind keine Session-Tokens

function findTokenInObject(obj, depth = 0) {
  if (!obj || depth > 5) return null
  if (typeof obj !== 'object') return null
  for (const k of TOKEN_KEYS) {
    const v = obj[k]
    if (typeof v === 'string' && UUID_RE.test(v)) return v
  }
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k)) continue
    const found = findTokenInObject(v, depth + 1)
    if (found) return found
  }
  return null
}

function parseConfig(config, targetCurrency) {
  if (!config) return null
  let token = null
  let playUrl = null
  let baseUrl = null

  if (typeof config === 'string') {
    if (config.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(config)
        token = obj?.token ?? obj?.sessionId ?? obj?.session
        playUrl = obj?.playUrl ?? obj?.play_url ?? obj?.rgsUrl ?? obj?.rgs_url
        const u = obj?.url ?? obj?.configUrl
        if (u && typeof u === 'string') baseUrl = u
      } catch {
        return null
      }
    } else {
      try {
        const u = new URL(config)
        token = u.searchParams.get('token') || u.searchParams.get('session') || u.searchParams.get('sessionId')
        baseUrl = config
      } catch {
        return null
      }
    }
  } else if (typeof config === 'object') {
    token = config?.token ?? config?.sessionId ?? config?.session
    playUrl = config?.playUrl ?? config?.play_url ?? config?.rgsUrl ?? config?.rgs_url
    baseUrl = config?.url ?? config?.configUrl
  }

  if (!token) return null
  if (!playUrl && baseUrl) {
    try {
      const u = new URL(baseUrl)
      const origin = u.origin || `${u.protocol}//${u.host}`
      playUrl = `${origin.replace(/\/$/, '')}/play`
    } catch {
      return null
    }
  }
  if (!playUrl) return null

  return {
    token,
    playUrl,
    currency: (targetCurrency || 'eur').toUpperCase(),
  }
}

async function postJson(url, body, extraHeaders = {}) {
  const bodyStr = JSON.stringify(body)
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (window.electronAPI?.proxyRequest) {
    try {
      const res = await window.electronAPI.proxyRequest({
        url,
        method: 'POST',
        headers,
        body: bodyStr,
      })
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        json: async () => JSON.parse(res.data),
        text: async () => res.data,
      }
    } catch (e) {
      console.error('[clawbuster] proxy error', e)
      throw e
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyStr,
  })
  const text = await res.text()
  return {
    ok: res.ok,
    status: res.status,
    json: async () => (text ? JSON.parse(text) : null),
    text: async () => text,
  }
}

async function resolveViaGsplauncher(configUrl, targetCurrency) {
  if (!window.electronAPI?.extractClawbusterSecret) {
    console.warn('[clawbuster] extractClawbusterSecret nicht verfügbar (Electron-Preload?)')
    return null
  }
  const secret = await window.electronAPI.extractClawbusterSecret(configUrl)
  if (!secret) {
    console.warn('[clawbuster] extractClawbusterSecret lieferte null (Redirect zu clawbuster-cdn fehlgeschlagen?)')
    return null
  }

  const userTrackId = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const initBody = { user_track_id: userTrackId, token: secret }
  const initRes = await postJson(CLAWBUSTER_INIT, initBody, { token: secret })
  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => '')
    console.warn('[clawbuster] Init fehlgeschlagen:', initRes.status, errText)
    return null
  }
  const initData = await initRes.json().catch(() => null)
  let playToken = (
    initData?.token ??
    initData?.session_token ??
    initData?.play_token ??
    initData?.sessionToken ??
    initData?.state?.token ??
    initData?.state?.session_token ??
    initData?.state?.play_token ??
    initData?.config?.token ??
    initData?.config?.session_token ??
    initData?.config?.play_token ??
    initData?.custom_params?.token ??
    initData?.custom_params?.game_config?.token ??
    findTokenInObject(initData)
  )
  if (!playToken) {
    playToken = secret
    console.log('[clawbuster] Kein Play-Token in Init-Response, nutze secret als Fallback')
  }
  if (!playToken) {
    console.warn('[clawbuster] Init lieferte keinen Play-Token:', initData)
    return null
  }
  const initConfig = initData?.config || {}
  const betLimits = Array.isArray(initConfig?.bet_limits)
    ? initConfig.bet_limits.map((v) => Number(v)).filter((v) => v > 0)
    : null
  const defaultBet = initConfig?.default_bet != null ? Number(initConfig.default_bet) : null
  const currencyAttrs = initData?.currency_attributes || {}

  return {
    token: playToken,
    playUrl: CLAWBUSTER_PLAY,
    currency: (targetCurrency || 'eur').toUpperCase(),
    betLimits,
    defaultBet,
    currencyAttrs,
  }
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    sourceCurrency?.toLowerCase() || 'usdc',
    targetCurrency?.toLowerCase() || 'eur'
  )
  const config = session?.config
  console.log('[clawbuster] startThirdPartySession response:', { config, sessionKeys: session ? Object.keys(session) : null })

  let parsed = parseConfig(config, targetCurrency)
  if (!parsed?.token || !parsed?.playUrl) {
    if (typeof config === 'string' && (config.includes('gsplauncher') || config.includes('clawbuster'))) {
      console.log('[clawbuster] Versuche resolveViaGsplauncher…')
      parsed = await resolveViaGsplauncher(config, targetCurrency)
      if (parsed) console.log('[clawbuster] resolveViaGsplauncher OK')
      else console.warn('[clawbuster] resolveViaGsplauncher lieferte null')
    }
  }
  if (!parsed?.token || !parsed?.playUrl) {
    console.warn('[clawbuster] Config konnte nicht geparst werden:', { config, parsed, configType: typeof config })
    throw new Error('Claw Buster: Keine gültige Session (token/playUrl fehlt in config).')
  }

  const betLevels = Array.isArray(parsed?.betLimits) && parsed.betLimits.length > 0
    ? parsed.betLimits
    : Array.isArray(session?.betLevels)
      ? session.betLevels.map((v) => Number(v)).filter((v) => v > 0)
      : [100000, 200000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000]

  logApiCall({
    type: 'clawbuster/init',
    endpoint: parsed.playUrl,
    request: { slotSlug },
    response: { ok: true, token: !!parsed.token },
    error: null,
    durationMs: null,
  })

  return {
    token: parsed.token,
    playUrl: parsed.playUrl,
    currencyCode: parsed.currency,
    betLevels,
    seq: 0,
  }
}

function snapToBetLevel(amount, betLevels) {
  if (!betLevels?.length) return amount
  let best = betLevels[0]
  for (const lv of betLevels) {
    if (Math.abs(lv - amount) < Math.abs(best - amount)) best = lv
  }
  return best
}

export async function placeBet(session, betAmount, extraBet = false) {
  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  let betForApi = Math.round(Number(effectiveBet))
  if (session.betLevels?.length) {
    betForApi = snapToBetLevel(betForApi, session.betLevels)
  }

  // Einfaches Format: {bet, bet_type} – FINISH_ROUND verursacht "Basic round not played"
  const body = {
    req: {
      bet: betForApi,
      bet_type: 'bet',
    },
    token: session.token,
  }

  const t0 = Date.now()
  const res = await postJson(session.playUrl, body)
  let data
  try {
    data = await res.json()
  } catch (e) {
    const text = await res.text()
    logApiCall({ type: 'clawbuster/bet', endpoint: session.playUrl, request: body, response: null, error: text || String(e), durationMs: Date.now() - t0 })
    throw new Error(`Claw Buster: ${text || res.status}`)
  }

  logApiCall({
    type: 'clawbuster/bet',
    endpoint: session.playUrl,
    request: body,
    response: { balance: data?.balance, win_amount: data?.resp?.win_amount },
    error: !res.ok ? `HTTP ${res.status}` : null,
    durationMs: Date.now() - t0,
  })

  if (!res.ok) {
    const err = data?.error || data?.message || `HTTP ${res.status}`
    throw new Error(`Claw Buster: ${err}`)
  }

  const winAmount = Number(data?.resp?.win_amount ?? 0)
  const balance = data?.balance != null ? Number(data.balance) : null

  const result = {
    statusCode: 0,
    accountBalance: { balance, currencyCode: (session.currencyCode || 'EUR').toUpperCase() },
    round: {
      status: 'complete',
      roundId: data?.round ?? null,
      events: [{ awa: winAmount }],
      winAmountDisplay: winAmount,
    },
  }

  return {
    data: result,
    nextSeq: (session.seq || 0) + 1,
    session: { ...session, seq: (session.seq || 0) + 1 },
  }
}

export async function sendKeepAlive() {
  return { ok: true }
}

export async function sendContinue() {
  return { ok: true }
}
