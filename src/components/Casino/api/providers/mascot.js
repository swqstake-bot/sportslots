import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

// Mascot stake unit differs from our fiat-minor unit (cent):
// HAR shows `bet: 1000` corresponds to ~$0.20 => 1 cent = 50 mascot bet units.
const MASCOT_BET_SCALE = 50

function resolveMascotBase(configUrlRaw) {
  try {
    const u = new URL(String(configUrlRaw || ''))
    const sid = String(u.searchParams.get('sessionId') || '').trim()
    const baseHost = String(u.searchParams.get('baseHost') || '').trim()
    if (sid && baseHost) return `https://${sid}.${baseHost}`
    return null
  } catch {
    return null
  }
}

function resolveMascotEndpointFromServerUrl(serverUrlRaw) {
  try {
    const u = new URL(String(serverUrlRaw || ''))
    const base = `${u.protocol}//${u.host}`
    const endpoint = `${base}/mascotGaming/spin.php`
    return { base, endpoint }
  } catch {
    return null
  }
}

async function resolveMascotEndpointFromLauncher(configUrlRaw) {
  const configUrl = String(configUrlRaw || '').trim()
  if (!configUrl) return null
  if (!window.electronAPI?.proxyRequest) return null
  try {
    const res = await window.electronAPI.proxyRequest({
      url: configUrl,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Origin: 'https://stake.com',
        Referer: 'https://stake.com/',
      },
    })
    const finalUrl = String(res?.finalUrl || '')
    const directFromFinal = resolveMascotBase(finalUrl)
    if (directFromFinal) {
      return {
        base: directFromFinal,
        endpoint: `${directFromFinal}/mascotGaming/spin.php`,
      }
    }
    const text = String(res?.data || '')
    const openHostHit = text.match(/https:\/\/open\.mascot\.host\/[^\s"'<>]+/i)
    if (openHostHit?.[0]) {
      const fromOpenHost = resolveMascotBase(openHostHit[0])
      if (fromOpenHost) {
        return {
          base: fromOpenHost,
          endpoint: `${fromOpenHost}/mascotGaming/spin.php`,
        }
      }
    }
    const m = text.match(/window\.serverUrl\s*=\s*['"]([^'"]+)['"]/i)
    if (m?.[1]) {
      return resolveMascotEndpointFromServerUrl(m[1])
    }
    if (finalUrl) {
      const byFinalOrigin = resolveMascotEndpointFromServerUrl(finalUrl)
      if (byFinalOrigin?.base?.includes('.mascot.games')) return byFinalOrigin
    }
    return null
  } catch {
    return null
  }
}

async function postViaProxy(url, body, originBase) {
  const payloadBody = JSON.stringify(body || {})
  if (window.electronAPI?.proxyRequest) {
    const res = await window.electronAPI.proxyRequest({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: originBase,
        Referer: `${originBase}/`,
      },
      body: payloadBody,
    })
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => res.data,
      json: async () => JSON.parse(res.data),
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: originBase,
      Referer: `${originBase}/`,
    },
    body: payloadBody,
  })
  const txt = await res.text()
  return {
    ok: res.ok,
    status: res.status,
    text: async () => txt,
    json: async () => JSON.parse(txt),
  }
}

function buildBetResponse(data, session, seq) {
  const currencyCode = String(data?.currency || session?.currencyCode || 'USD').toUpperCase()
  const balance = Number(data?.balance)
  const totalWin = Number(data?.totalWin ?? data?.win ?? 0)
  return {
    data: {
      statusCode: 0,
      accountBalance: {
        balance: Number.isFinite(balance) ? balance : null,
        currencyCode,
      },
      round: {
        status: 'complete',
        roundId: `${Date.now()}-${seq}`,
        events: [{ awa: Number.isFinite(totalWin) ? totalWin : 0 }],
        winAmountDisplay: Number.isFinite(totalWin) ? totalWin : 0,
      },
      _mascotRaw: data || null,
    },
    nextSeq: seq,
    session: {
      ...session,
      seq,
    },
  }
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    (sourceCurrency || 'usdc').toLowerCase(),
    (targetCurrency || 'usd').toLowerCase()
  )
  const configUrl = typeof session?.config === 'string' ? session.config : session?.config?.url
  let base = resolveMascotBase(configUrl)
  let endpoint = base ? `${base}/mascotGaming/spin.php` : null
  if (!base || !endpoint) {
    const resolved = await resolveMascotEndpointFromLauncher(configUrl)
    if (resolved?.base && resolved?.endpoint) {
      base = resolved.base
      endpoint = resolved.endpoint
    }
  }
  if (!base || !endpoint) {
    logApiCall({
      type: 'mascot/init-resolve',
      endpoint: 'launcher',
      request: { slotSlug, hasConfigUrl: Boolean(configUrl) },
      response: null,
      error: 'launcher URL konnte nicht auf mascot endpoint aufgelöst werden',
      durationMs: null,
    })
    throw new Error('Mascot init failed: launcher URL konnte nicht aufgelöst werden')
  }
  const t0 = Date.now()
  const initRes = await postViaProxy(endpoint, { action: 'init' }, base)
  const initText = await initRes.text()
  let initData = null
  try {
    initData = initText ? JSON.parse(initText) : null
  } catch {
    initData = null
  }
  logApiCall({
    type: 'mascot/init',
    endpoint,
    request: { action: 'init', slotSlug, sourceCurrency, targetCurrency },
    response: initData
      ? {
          currency: initData.currency || null,
          balance: initData.balance ?? null,
          nextAction: initData.nextAction || null,
          betCount: Array.isArray(initData.bets) ? initData.bets.length : 0,
        }
      : initText?.slice(0, 140),
    error: initRes.ok ? null : `HTTP ${initRes.status}`,
    durationMs: Date.now() - t0,
  })
  if (!initRes.ok || !initData) {
    logApiCall({
      type: 'mascot/init',
      endpoint,
      request: { action: 'init', slotSlug },
      response: initText?.slice(0, 300),
      error: `HTTP ${initRes.status}`,
      durationMs: Date.now() - t0,
    })
    throw new Error(`Mascot init failed: HTTP ${initRes.status}`)
  }
  const betLevels = Array.isArray(initData.bets)
    ? initData.bets
        .map((v) => Math.round(Number(v) / MASCOT_BET_SCALE))
        .filter((v) => Number.isFinite(v) && v > 0)
    : []
  return {
    provider: 'mascot',
    seq: 1,
    slotSlug,
    base,
    endpoint,
    currencyCode: String(initData.currency || targetCurrency || 'USD').toUpperCase(),
    betLevels,
    betScale: MASCOT_BET_SCALE,
    initialBalance: Number.isFinite(Number(initData.balance)) ? Number(initData.balance) : null,
  }
}

export async function placeBet(session, betAmount, extraBet = false) {
  const effectiveBet = Number(getEffectiveBetAmount(betAmount, extraBet)) || 0
  const betScale = Number(session?.betScale) > 0 ? Number(session.betScale) : MASCOT_BET_SCALE
  const apiBet = Math.max(1, Math.round(effectiveBet * betScale))
  const endpoint = session?.endpoint || `${session?.base || ''}/mascotGaming/spin.php`
  const base = session?.base
  if (!endpoint || !base) throw new Error('Mascot: session endpoint fehlt')

  const t0 = Date.now()
  const spinRes = await postViaProxy(endpoint, { action: 'spin', bet: apiBet }, base)
  const spinText = await spinRes.text()
  let spinData = null
  try {
    spinData = spinText ? JSON.parse(spinText) : null
  } catch {
    spinData = null
  }
  if (!spinRes.ok || !spinData) {
    logApiCall({
      type: 'mascot/spin',
      endpoint,
      request: { action: 'spin', bet: apiBet, uiBetMinor: effectiveBet, betScale },
      response: spinText?.slice(0, 180),
      error: `HTTP ${spinRes.status}`,
      durationMs: Date.now() - t0,
    })
    throw new Error(`Mascot spin failed: HTTP ${spinRes.status}`)
  }

  let current = spinData
  let guard = 0
  while (String(current?.nextAction || '').toLowerCase() === 'drop' && guard < 30) {
    guard += 1
    const dropRes = await postViaProxy(endpoint, { action: 'drop', bet: apiBet }, base)
    const dropText = await dropRes.text()
    let dropData = null
    try {
      dropData = dropText ? JSON.parse(dropText) : null
    } catch {
      dropData = null
    }
    if (!dropRes.ok || !dropData) break
    current = dropData
  }

  logApiCall({
    type: 'mascot/spin',
    endpoint,
    request: { action: 'spin', bet: apiBet, uiBetMinor: effectiveBet, betScale },
    response: {
      win: Number(current?.win ?? 0) || 0,
      totalWin: Number(current?.totalWin ?? 0) || 0,
      balance: Number(current?.balance ?? 0) || 0,
      nextAction: current?.nextAction || null,
      dropSteps: guard,
    },
    error: null,
    durationMs: Date.now() - t0,
  })

  return buildBetResponse(current, session, (session?.seq || 0) + 1)
}

export async function sendKeepAlive() {
  return { ok: true }
}

export async function sendContinue() {
  return { ok: true }
}
