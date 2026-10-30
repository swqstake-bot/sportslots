/**
 * Toucan Royale (Draknos / NGS).
 * Stake returns the encrypted bigplays launcher. That 307s to
 * https://ngs.gs.svuindex.com/launch, whose <script id="session"> holds
 * host, credit ladder and the play index. Spins are POST {host}/play.
 * The launch URL (gstoken in the query) is the Referer; it is never logged.
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function proxyRequest({ url, method = 'GET', headers = {}, body = null }) {
  if (!window.electronAPI?.proxyRequest) throw new Error('Electron API not available')
  const res = await window.electronAPI.proxyRequest({
    url,
    method,
    headers,
    body,
    followRedirects: false,
  })
  const raw = res?.data
  const text = typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw)
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text,
    headers: res.headers || {},
    finalUrl: res.finalUrl || url,
  }
}

function absorbCookies(jar, headers) {
  const raw = headers?.['set-cookie']
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : []
  for (const line of lines) {
    const nv = String(line).split(';')[0]
    const eq = nv.indexOf('=')
    if (eq > 0) jar.set(nv.slice(0, eq).trim(), nv.slice(eq + 1).trim())
  }
}

function cookieHeader(jar) {
  if (!jar.size) return undefined
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

async function followLaunch(startUrl) {
  const jar = new Map()
  let url = startUrl
  let referer = 'https://stake.com/'
  let res = null
  for (let hop = 0; hop < 6 && url; hop++) {
    res = await proxyRequest({
      url,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/json',
        Referer: referer,
        ...(cookieHeader(jar) ? { Cookie: cookieHeader(jar) } : {}),
      },
    })
    absorbCookies(jar, res.headers)
    const next = res.status >= 300 && res.status < 400 ? res.finalUrl : ''
    if (!next || next === url) return { url, res, jar, referer }
    referer = url
    url = next
  }
  return { url, res, jar, referer }
}

function readLaunchSession(html) {
  const match = String(html || '').match(/<script[^>]*id=["']session["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) return null
  const data = parseJson(match[1].trim())
  return data && typeof data === 'object' ? data : null
}

function numberList(value) {
  const list = Array.isArray(value) ? value : []
  return list.map(Number).filter((n) => n > 0)
}

/** Smallest multiplier is the base game. Larger sets are ante / feature buy. */
function regularCredits(creditValues) {
  const sets = (Array.isArray(creditValues) ? creditValues : [])
    .map((set) => ({
      multiplier: Number(set?.multiplier),
      options: numberList(set?.options),
    }))
    .filter((set) => set.multiplier > 0 && set.options.length)
    .sort((a, b) => a.multiplier - b.multiplier)
  return sets[0] || null
}

function pickCredit(majorStake, credit) {
  let index = 0
  let best = Infinity
  credit.options.forEach((value, i) => {
    const diff = Math.abs(value * credit.multiplier - majorStake)
    if (diff < best) {
      best = diff
      index = i
    }
  })
  return { value: credit.options[index], amount: credit.multiplier, index }
}

function toMinor(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

function errorText(data, status) {
  const message = data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '')
  return String(message || `HTTP ${status}`).slice(0, 180)
}

function redactPreview(text) {
  return String(text || '')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt>')
    .replace(/[A-Za-z0-9_-]{40,}/g, '<id>')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

function playFailure(res, data) {
  if (!res.ok) return errorText(data, res.status)
  if (data?.error) return errorText(data, res.status)
  if (data?.payload && (data.account || data.round || data.index != null)) return null
  if (data && typeof data === 'object') {
    const keys = Object.keys(data).slice(0, 12).join(',') || 'leer'
    const msg = errorText(data, res.status)
    const extra = msg && msg !== `HTTP ${res.status}` ? `: ${msg}` : ''
    console.error('[toucan-play]', res.status, keys, extra)
    return `HTTP ${res.status} ohne Spin (${keys}${extra})`
  }
  return `HTTP ${res.status} ohne JSON (${redactPreview(res.text) || 'leer'})`
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency, opts = {}) {
  const source = (sourceCurrency || 'usdc').toLowerCase()
  const target = (targetCurrency || 'usd').toLowerCase()
  const stakeSession = await startThirdPartySession(accessToken, slotSlug, source, target, opts)
  const configUrl = typeof stakeSession?.config === 'string' ? stakeSession.config : stakeSession?.config?.url
  if (!configUrl) throw new Error('Toucan Royale: Stake hat keine Launch-URL geliefert')

  const t0 = Date.now()
  const followed = await followLaunch(configUrl)
  const page = followed.res
  if (!page) throw new Error('Toucan Royale: Launch nicht erreichbar')
  if (!page.ok) throw new Error(`Toucan Royale Launch: HTTP ${page.status}`)

  const launchSession = readLaunchSession(page.text)
  const apiBase = String(launchSession?.host || '').replace(/\/+$/, '')
  const rgsSession = launchSession?.session ? String(launchSession.session) : ''
  if (!apiBase || !rgsSession) throw new Error('Toucan Royale: Launch ohne Session')

  const credit = regularCredits(launchSession.creditValues)
  if (!credit) throw new Error('Toucan Royale: keine Einsätze im Launch')

  const rawBetLevels = credit.options.map((value) => value * credit.multiplier)
  const betLevels = rawBetLevels.map((n) => Math.round(n * 100))
  const balance = Number(launchSession.account?.balance)
  const currencyCode = String(launchSession.account?.currency || target || 'usd').toUpperCase()

  logApiCall({
    type: 'toucanroyale/launch',
    endpoint: apiBase,
    request: { slotSlug, gameId: launchSession.client || null },
    response: { status: page.status, bets: betLevels.length, multiplier: credit.multiplier },
    error: null,
    durationMs: Date.now() - t0,
  })

  return {
    provider: 'toucanroyale',
    apiBase,
    launchUrl: followed.url,
    spinUrl: `${apiBase}/play`,
    rgsSession,
    gameId: launchSession.client ? String(launchSession.client) : null,
    currencyCode,
    apiUsesMajor: true,
    credit,
    rawBetLevels,
    betLevels,
    initialBalance: Number.isFinite(balance) ? toMinor(balance) : null,
    seq: Number(launchSession.index) || 0,
    trace: 0,
  }
}

export async function placeBet(session, betAmount, extraBet = false) {
  const requestedMinor = Number(getEffectiveBetAmount(betAmount, extraBet))
  const picked = pickCredit(requestedMinor / 100, session.credit)
  const t0 = Date.now()
  let index = Number(session.seq) || 0
  let trace = Number(session.trace) || 0
  let last = null

  for (let step = 0; step < 12; step++) {
    trace += 1
    const res = await proxyRequest({
      url: session.spinUrl,
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        Origin: session.apiBase,
        Referer: session.launchUrl,
        Authorization: `Bearer ${session.rgsSession}`,
        Trace: String(trace),
      },
      body: JSON.stringify({
        bet: { value: picked.value, amount: picked.amount, index: picked.index },
        payload: {},
        index,
      }),
    })
    const data = parseJson(res.text)
    const failure = playFailure(res, data)
    if (failure) {
      const message = failure
      logApiCall({
        type: 'toucanroyale/spin',
        endpoint: session.apiBase,
        request: { gameId: session.gameId, value: picked.value, amount: picked.amount },
        response: null,
        error: message,
        durationMs: Date.now() - t0,
      })
      throw new Error(`Toucan Royale spin: ${message}`)
    }
    last = data
    index = Number.isFinite(Number(data?.index)) ? Number(data.index) : index + 1
    const roundOpen = data?.roundEnd === false || data?.payload?.end === false
    if (!roundOpen) break
  }

  const winMinor = toMinor(last?.payload?.currentWin ?? last?.payload?.win ?? 0)
  const balanceMinor = Number.isFinite(Number(last?.account?.balance)) ? toMinor(last.account.balance) : null
  const currencyCode = String(last?.account?.currency || session.currencyCode || 'USD').toUpperCase()

  logApiCall({
    type: 'toucanroyale/spin',
    endpoint: session.apiBase,
    request: { gameId: session.gameId, value: picked.value, amount: picked.amount },
    response: { win: winMinor, balance: balanceMinor },
    error: null,
    durationMs: Date.now() - t0,
  })

  return {
    data: {
      statusCode: 0,
      accountBalance: { balance: balanceMinor, currencyCode },
      round: {
        status: 'complete',
        events: [{ awa: winMinor }],
        winAmountDisplay: winMinor,
      },
    },
    nextSeq: index,
    session: { ...session, seq: index, trace },
  }
}
