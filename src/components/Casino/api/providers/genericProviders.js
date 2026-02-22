import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { getEffectiveBetAmount } from '../../constants/bet'

export function parseConfig(urlStr, targetCurrency) {
  const fallbackCurrency = (targetCurrency || 'EUR').toUpperCase()
  if (typeof urlStr === 'string' && urlStr.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(urlStr)
      let token = null
      let gameId = null
      let lastUrl = null
      let gamesessionid = null
      let playerid = null
      let playersessionid = null
      let gameinstanceid = null
      const walk = (value) => {
        if (!value || typeof value !== 'object') return
        for (const [k, v] of Object.entries(value)) {
          if (typeof v === 'string') {
            const lowerKey = k.toLowerCase()
            const lowerVal = v.toLowerCase()
            if (!token && (lowerKey.includes('token') || lowerKey.includes('session'))) token = v
            if (!gameId && (lowerKey === 'gameid' || lowerKey === 'game' || lowerKey === 'symbol')) gameId = v
            if (!gamesessionid && lowerKey === 'gamesessionid') gamesessionid = v
            if (!playerid && lowerKey === 'playerid') playerid = v
            if (!playersessionid && lowerKey === 'playersessionid') playersessionid = v
            if (!gameinstanceid && lowerKey === 'gameinstanceid') gameinstanceid = v
            if (lowerVal.startsWith('http')) lastUrl = v
          } else if (typeof v === 'object') {
            walk(v)
          }
        }
      }
      walk(obj)
      if (lastUrl) {
        try {
          const u = new URL(lastUrl)
          const host = u.hostname || u.host?.replace(/:\d+$/, '')
          const base = `${u.protocol}//${host}`
          return {
            token,
            gameId,
            host,
            base,
            currency: fallbackCurrency,
            raw: lastUrl,
            gamesessionid,
            playerid,
            playersessionid,
            gameinstanceid,
          }
        } catch {
          return {
            token,
            gameId,
            host: null,
            base: null,
            currency: fallbackCurrency,
            raw: lastUrl,
            gamesessionid,
            playerid,
            playersessionid,
            gameinstanceid,
          }
        }
      }
      return {
        token,
        gameId,
        host: null,
        base: null,
        currency: fallbackCurrency,
        raw: urlStr,
        gamesessionid,
        playerid,
        playersessionid,
        gameinstanceid,
      }
    } catch {
      return {
        token: null,
        gameId: null,
        host: null,
        base: null,
        currency: fallbackCurrency,
        raw: urlStr,
        gamesessionid: null,
        playerid: null,
        playersessionid: null,
        gameinstanceid: null,
      }
    }
  }
  try {
    const url = typeof urlStr === 'string' ? new URL(urlStr) : urlStr
    const token =
      url.searchParams.get('token') ||
      url.searchParams.get('authToken') ||
      url.searchParams.get('key') ||
      url.searchParams.get('session') ||
      url.searchParams.get('sessionId') ||
      url.searchParams.get('route')
    const gameId =
      url.searchParams.get('gameId') ||
      url.searchParams.get('symbol') ||
      url.searchParams.get('gid') ||
      url.searchParams.get('game') ||
      url.searchParams.get('gameid')
    const host = url.hostname || url.host?.replace(/:\d+$/, '')
    const base = `${url.protocol}//${host}`
    const currency = (targetCurrency || 'eur').toUpperCase()
    const gamesessionid = url.searchParams.get('gamesessionid')
    const playerid = url.searchParams.get('playerid')
    const playersessionid = url.searchParams.get('playersessionid')
    const gameinstanceid = url.searchParams.get('gameinstanceid')
    return { token, gameId, host, base, currency, raw: urlStr, gamesessionid, playerid, playersessionid, gameinstanceid }
  } catch {
    return {
      token: null,
      gameId: null,
      host: null,
      base: null,
      currency: fallbackCurrency,
      raw: urlStr,
      gamesessionid: null,
      playerid: null,
      playersessionid: null,
      gameinstanceid: null,
    }
  }
}

async function commonStart(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    (sourceCurrency || 'usdc').toLowerCase(),
    (targetCurrency || 'eur').toLowerCase()
  )
  const cfgUrl = typeof session?.config === 'string' ? session.config : session?.config?.url
  const cfg = parseConfig(cfgUrl, targetCurrency)
  return {
    provider: 'generic',
    seq: 1,
    token: cfg.token,
    gameId: cfg.gameId,
    host: cfg.host,
    base: cfg.base,
    configUrl: cfg.raw,
    currencyCode: cfg.currency,
    betLevels: Array.isArray(session?.betLevels) ? session.betLevels.map((v) => Number(v)).filter((v) => v > 0) : [],
    initialBalance: null,
  }
}

async function postViaProxy(upstreamUrl, body) {
  const payloadBody = typeof body === 'string' ? body : JSON.stringify(body)
  
  if (window.electronAPI?.proxyRequest) {
    try {
      const res = await window.electronAPI.proxyRequest({
        url: upstreamUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadBody
      })
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: async () => res.data,
        json: async () => JSON.parse(res.data)
      }
    } catch (e) {
      console.error('Generic Provider Proxy Error:', e)
      throw e
    }
  }

  const res = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadBody,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { ok: res.ok, status: res.status, text: async () => text, json: async () => json }
}

function wrapResponse(winAmount, currencyCode, roundId) {
  const w = Number(winAmount || 0)
  const cc = (currencyCode || 'EUR').toUpperCase()
  return {
    statusCode: 0,
    accountBalance: { balance: null, currencyCode: cc },
    round: {
      status: 'complete',
      roundId: roundId || null,
      events: [{ awa: w }],
      winAmountDisplay: w,
    },
  }
}

function makeAdapter(path) {
  return {
    async startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
      const s = await commonStart(accessToken, slotSlug, sourceCurrency, targetCurrency)
      logApiCall({ type: `provider/${path}/init`, endpoint: s.configUrl || s.base, request: { slotSlug }, response: { host: s.host, token: !!s.token, gameId: s.gameId }, error: null, durationMs: null })
      return s
    },
    async placeBet(session, betAmount, extraBet = false) {
      const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
      const upstreamUrl = session.base ? `${session.base}/${path}` : session.configUrl || ''
      const body = {}
      if (session.token != null) body.token = session.token
      if (session.gameId != null) body.gameId = session.gameId
      body.bet = Number(effectiveBet)
      const t0 = Date.now()
      const res = await postViaProxy(upstreamUrl, body)
      const json = await res.json().catch(() => null)
      const text = await res.text().catch(() => null)
      
      logApiCall({
        type: `provider/${path}/bet`,
        endpoint: upstreamUrl,
        request: body,
        response: json ? { ok: res.ok, preview: JSON.stringify(json).slice(0, 120) } : text?.slice(0, 120),
        error: !res.ok ? `HTTP ${res.status}` : null,
        durationMs: Date.now() - t0,
      })
      const data = wrapResponse(json?.win ?? 0, session.currencyCode, json?.roundId)
      const nextSeq = (session.seq || 0) + 1
      return { data, nextSeq, session: { ...session, seq: nextSeq } }
    },
    async sendKeepAlive() { return { ok: true } },
    async sendContinue() { return { ok: true } },
  }
}

export const relax = makeAdapter('play')
export const blueprint = makeAdapter('spin')
export const endorphina = makeAdapter('spin')
export const thunderkick = makeAdapter('spin')
export const netent = makeAdapter('spin')
export const gameart = makeAdapter('play')
export const push = makeAdapter('play')
export const btg = makeAdapter('spin')
export const oak = makeAdapter('play')
export const redtiger = makeAdapter('spin')
export const playngo = makeAdapter('spin')
export const octoplay = makeAdapter('spin')
export const peterandsons = makeAdapter('spin')
export const shady = makeAdapter('spin')
export const shuffle = makeAdapter('spin')
export const titan = makeAdapter('spin')
export const twist = makeAdapter('spin')
export const popiplay = makeAdapter('spin')
export const helio = makeAdapter('spin')
export const samurai = makeAdapter('spin')
