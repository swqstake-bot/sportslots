/**
 * AvatarUX (Tequity) on Stake.
 * The captured avatarux.har only has Stake balance queries, so the round flow
 * follows the same launch → authenticate → /game/play → collect → /game/complete
 * sequence the SSP AvatarUX provider uses.
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

const API_BASE = 'https://eu4.l0mpxqfj.xyz'
const CDN_ORIGIN = 'https://cdn-eu4.l0mpxqfj.xyz'

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function proxyRequest({ url, method = 'GET', headers = {}, body = null, followRedirects = true }) {
  if (!window.electronAPI?.proxyRequest) throw new Error('Electron API not available')
  const res = await window.electronAPI.proxyRequest({
    url,
    method,
    headers,
    body,
    followRedirects,
  })
  const raw = res?.data
  const text = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw)
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text,
    finalUrl: res.finalUrl || url,
  }
}

function apiBaseFromCdn(origin) {
  try {
    const u = new URL(origin)
    if (u.hostname.startsWith('cdn-')) return `${u.protocol}//${u.hostname.slice(4)}`
  } catch {
    /* ignore */
  }
  return ''
}

function absorbLaunchParams(source, bag) {
  const raw = String(source || '')
  if (!raw) return
  try {
    const u = new URL(raw)
    for (const key of ['key', 'game', 'wallet', 'operator']) {
      const value = u.searchParams.get(key)
      if (value) bag[key] = value
    }
    const server = u.searchParams.get('server')
    if (server && /^https?:\/\//i.test(server)) bag.apiBase = server.replace(/\/$/, '')
    if (u.hostname.startsWith('cdn')) bag.origin = u.origin
  } catch {
    /* not a URL */
  }
  const re = /(?:^|[?&#\s"'=])(key|game|wallet|operator)=([A-Za-z0-9_-]+)/g
  let match
  while ((match = re.exec(raw))) {
    if (!bag[match[1]]) bag[match[1]] = match[2]
  }
  if (!bag.apiBase) {
    const server = raw.match(/[?&]server=(https%3A%2F%2F[^&\s"']+|https?:\/\/[^&\s"']+)/i)
    if (server) {
      try {
        bag.apiBase = decodeURIComponent(server[1]).replace(/\/$/, '')
      } catch {
        /* ignore */
      }
    }
  }
}

async function resolveLaunchParams(configUrl) {
  const bag = {}
  absorbLaunchParams(configUrl, bag)
  let url = configUrl
  for (let hop = 0; hop < 6 && url; hop++) {
    if (bag.key && bag.game && bag.wallet && bag.apiBase) break
    const res = await proxyRequest({
      url,
      method: 'GET',
      followRedirects: false,
      headers: { Accept: 'text/html,application/json' },
    })
    absorbLaunchParams(res.finalUrl, bag)
    absorbLaunchParams(res.text, bag)
    const next = res.status >= 300 && res.status < 400 ? res.finalUrl : ''
    if (!next || next === url) break
    url = next
  }
  return bag
}

function jsonHeaders(token, origin = CDN_ORIGIN) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: origin,
    Referer: `${origin}/`,
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function availableBets(info) {
  const main = info?.bets?.main
  const list = Array.isArray(main?.available) ? main.available.map(Number).filter((n) => n > 0) : []
  return list
}

/** Hunter bet levels are minor units (cents). AvatarUX often lists major stakes. */
function toSessionBetLevels(rawLevels) {
  if (!rawLevels.length) return { betLevels: [], apiUsesMajor: true }
  const min = Math.min(...rawLevels)
  const max = Math.max(...rawLevels)
  const hasFraction = rawLevels.some((n) => !Number.isInteger(n))
  const apiUsesMajor = hasFraction || (max <= 50 && min < 10)
  const betLevels = apiUsesMajor ? rawLevels.map((n) => Math.round(n * 100)) : rawLevels.map((n) => Math.round(n))
  return { betLevels, apiUsesMajor }
}

function snapApiBet(requested, levels) {
  if (!levels.length) return requested
  let best = levels[0]
  for (const level of levels) {
    if (Math.abs(level - requested) < Math.abs(best - requested)) best = level
  }
  return best
}

function nextActions(data) {
  const next = data?.wager?.next
  return Array.isArray(next) ? next.map((item) => String(item)) : []
}

function readWin(data) {
  const direct = Number(data?.wager?.win)
  const total = Number(data?.wager?.state?.totalWin)
  if (Number.isFinite(total) && total > 0) return total
  if (Number.isFinite(direct) && direct > 0) return direct
  return 0
}

function toMinor(amount, apiUsesMajor) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  return apiUsesMajor ? Math.round(n * 100) : Math.round(n)
}

async function postJson(url, body, token, origin) {
  const res = await proxyRequest({
    url,
    method: 'POST',
    headers: jsonHeaders(token, origin),
    body: JSON.stringify(body),
  })
  const data = parseJson(res.text)
  return { res, data }
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency, opts = {}) {
  const source = (sourceCurrency || 'usdc').toLowerCase()
  const target = (targetCurrency || 'eur').toLowerCase()
  const stakeSession = await startThirdPartySession(accessToken, slotSlug, source, target, opts)
  const configUrl = typeof stakeSession?.config === 'string' ? stakeSession.config : stakeSession?.config?.url
  if (!configUrl) throw new Error('AvatarUX: Stake hat keine Launch-URL geliefert')

  const t0 = Date.now()
  let launch = {}
  try {
    launch = await resolveLaunchParams(configUrl)
  } catch {
    launch = {}
  }
  if ((!launch.key || !launch.game) && window.electronAPI?.resolveAvataruxLaunch) {
    const viaWindow = await window.electronAPI.resolveAvataruxLaunch(configUrl)
    if (viaWindow) launch = { ...launch, ...viaWindow }
  }
  if (!launch.key || !launch.game) {
    logApiCall({
      type: 'avatarux/launch',
      endpoint: configUrl,
      request: { slotSlug },
      response: { hasKey: !!launch.key, hasGame: !!launch.game, hasWallet: !!launch.wallet },
      error: 'key/game missing after redirects',
      durationMs: Date.now() - t0,
    })
    throw new Error('AvatarUX: Launch-URL enthält keinen key/game')
  }

  const apiBase = launch.apiBase || apiBaseFromCdn(launch.origin) || API_BASE
  const cdnOrigin = launch.origin || (apiBase ? `https://cdn-${apiBase.replace(/^https?:\/\//, '')}` : CDN_ORIGIN)
  const authBody = {
    wallet: launch.wallet || 'stake',
    operator: launch.operator || 'stake.com',
    key: launch.key,
    provider: 'avatarux',
    game: launch.game,
  }
  const auth = await postJson(`${apiBase}/authenticate`, authBody, null, cdnOrigin)
  logApiCall({
    type: 'avatarux/authenticate',
    endpoint: `${apiBase}/authenticate`,
    request: { operator: authBody.operator, provider: authBody.provider, game: authBody.game, wallet: authBody.wallet },
    response: {
      ok: auth.res.ok,
      hasToken: !!auth.data?.token,
      balance: auth.data?.balance ?? null,
      currency: auth.data?.currency ?? null,
    },
    error: !auth.res.ok ? `HTTP ${auth.res.status}` : auth.data?.error?.code || auth.data?.error?.message || null,
    durationMs: Date.now() - t0,
  })
  if (!auth.res.ok || !auth.data?.token) {
    const code = auth.data?.error?.code || auth.data?.error?.message || `HTTP ${auth.res.status}`
    throw new Error(`AvatarUX Authenticate: ${code}`)
  }

  const infoUrl = `${apiBase}/game/info?game=${encodeURIComponent(launch.game)}&provider=avatarux`
  const infoRes = await proxyRequest({
    url: infoUrl,
    method: 'GET',
    headers: jsonHeaders(auth.data.token, cdnOrigin),
  })
  const info = parseJson(infoRes.text)
  const rawLevels = availableBets(info)
  const { betLevels, apiUsesMajor } = toSessionBetLevels(rawLevels)
  const currencyCode = String(auth.data.currency || target || 'eur').toUpperCase()
  const balanceMajorOrApi = Number(auth.data.balance)

  return {
    provider: 'avatarux',
    game: launch.game,
    token: auth.data.token,
    apiBase,
    cdnOrigin,
    apiUsesMajor,
    rawBetLevels: rawLevels,
    betLevels,
    currencyCode,
    initialBalance: Number.isFinite(balanceMajorOrApi) ? toMinor(balanceMajorOrApi, apiUsesMajor) : null,
    seq: 1,
  }
}

export async function placeBet(session, betAmount, extraBet = false) {
  const requested = Number(getEffectiveBetAmount(betAmount, extraBet))
  const apiRequested = session?.apiUsesMajor ? requested / 100 : requested
  const apiBet = snapApiBet(apiRequested, session?.rawBetLevels || [])
  const game = session.game
  const token = session.token
  const apiBase = session.apiBase || API_BASE
  const cdnOrigin = session.cdnOrigin || CDN_ORIGIN
  const t0 = Date.now()

  let { res, data } = await postJson(
    `${apiBase}/game/play`,
    { action: 'main', bet: apiBet, complete: false, game, provider: 'avatarux' },
    token,
    cdnOrigin
  )
  if (!res.ok || data?.error) {
    const message = data?.error?.message || data?.error?.code || `HTTP ${res.status}`
    logApiCall({
      type: 'avatarux/spin',
      endpoint: `${apiBase}/game/play`,
      request: { game, bet: apiBet },
      response: null,
      error: message,
      durationMs: Date.now() - t0,
    })
    throw new Error(`AvatarUX spin: ${message}`)
  }

  for (let step = 0; step < 40; step++) {
    const next = nextActions(data)
    const roundId = data?.roundId
    const fs = next.find((action) => action === 'fs1' || action.startsWith('fs'))
    if (fs && roundId) {
      const played = await postJson(
        `${apiBase}/game/play`,
        { action: fs, complete: false, game, provider: 'avatarux', roundId },
        token,
        cdnOrigin
      )
      if (played.data) data = played.data
      continue
    }
    if (next.includes('collect') && roundId) {
      const collected = await postJson(
        `${apiBase}/game/play`,
        { game, provider: 'avatarux', action: 'collect', complete: false, asyncWin: false, bet: 0, roundId },
        token,
        cdnOrigin
      )
      if (collected.data) data = collected.data
      continue
    }
    break
  }

  const roundId = data?.roundId
  if (roundId) {
    await postJson(`${apiBase}/game/complete`, { game, provider: 'avatarux', roundId }, token, cdnOrigin).catch(() => {})
  }

  const apiUsesMajor = session?.apiUsesMajor !== false
  const winMinor = toMinor(readWin(data), apiUsesMajor)
  const balanceRaw = Number(data?.balance)
  const balanceMinor = Number.isFinite(balanceRaw) ? toMinor(balanceRaw, apiUsesMajor) : null
  const currencyCode = String(session.currencyCode || 'EUR').toUpperCase()

  logApiCall({
    type: 'avatarux/spin',
    endpoint: `${apiBase}/game/play`,
    request: { game, bet: apiBet },
    response: { win: winMinor, balance: balanceMinor, roundId: roundId || null },
    error: null,
    durationMs: Date.now() - t0,
  })

  const seq = (session.seq || 0) + 1
  return {
    data: {
      statusCode: 0,
      accountBalance: { balance: balanceMinor, currencyCode },
      round: {
        status: 'complete',
        roundId: roundId || null,
        events: [{ awa: winMinor }],
        winAmountDisplay: winMinor,
      },
      _avataruxRaw: data,
    },
    nextSeq: seq,
    session: { ...session, seq },
  }
}
