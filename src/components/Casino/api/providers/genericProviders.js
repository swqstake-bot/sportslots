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

async function postViaProxy(upstreamUrl, body, extraHeaders = {}) {
  const payloadBody = typeof body === 'string' ? body : JSON.stringify(body)
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }

  if (window.electronAPI?.proxyRequest) {
    try {
      const res = await window.electronAPI.proxyRequest({
        url: upstreamUrl,
        method: 'POST',
        headers,
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
    headers,
    body: payloadBody,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { ok: res.ok, status: res.status, text: async () => text, json: async () => json }
}

function decodeJwtPayloadLoose(jwt) {
  try {
    const parts = String(jwt || '').split('.')
    if (parts.length < 2) return null
    let seg = parts[1]
    const pad = seg.length % 4
    if (pad) seg += '='.repeat(4 - pad)
    seg = seg.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(seg))
  } catch {
    return null
  }
}

/** Minor-Units (App) → Truelab HAR „stakes[].amount“ in Major (z. B. USD 0.10). */
function truelabStakeAmountMajor(minorUnits, currencyCode) {
  const currency = (currencyCode || 'eur').toLowerCase()
  const n = Number(minorUnits)
  if (!Number.isFinite(n) || n <= 0) return 0.01
  const isZeroDec = ['idr', 'jpy', 'krw', 'vnd'].includes(currency)
  const isFiat = [
    'eur', 'usd', 'brl', 'cad', 'cny', 'inr', 'mxn', 'php', 'pln', 'rub', 'try', 'ngn', 'ars', 'cop', 'pen', 'clp',
    'pkr', 'dkk', 'sek', 'nok', 'hkd', 'sgd', 'nzd', 'chf', 'aud',
  ].includes(currency)
  if (isZeroDec) return Math.max(1, Math.round(n))
  if (isFiat) return Math.max(0.01, Math.round(n) / 100)
  return Math.max(1e-8, n / 1e8)
}

function truelabExtractWinAndRoundId(json) {
  if (!json || typeof json !== 'object') return { win: 0, roundId: null }
  const roundId = json.roundId || json.round_id || json.id || null
  let win = Number(json.winCash ?? json.win ?? json.payout ?? json.totalWin ?? json.winAmount ?? 0)
  const gs = json.bet?.responseGS || json.responseGS
  if ((!Number.isFinite(win) || win <= 0) && gs) {
    win = Number(gs.winCash ?? gs.win ?? gs.totalWin ?? 0)
  }
  const nested = json.bet?.bet
  if ((!Number.isFinite(win) || win <= 0) && nested) {
    win = Number(nested.winCash ?? nested.win ?? 0)
  }
  return { win: Number.isFinite(win) ? win : 0, roundId }
}

function hasGenericBonusSignal(json) {
  if (!json || typeof json !== 'object') return false
  const queue = [json]
  const seen = new Set()
  let scanned = 0
  while (queue.length > 0 && scanned < 120) {
    const cur = queue.shift()
    if (!cur || typeof cur !== 'object') continue
    if (seen.has(cur)) continue
    seen.add(cur)
    scanned += 1
    for (const [kRaw, v] of Object.entries(cur)) {
      const k = String(kRaw || '').toLowerCase()
      if (v && typeof v === 'object') queue.push(v)
      if (typeof v === 'string') {
        const s = v.toLowerCase()
        if (
          (k.includes('feature') || k.includes('bonus') || k.includes('event') || k.includes('state')) &&
          (s.includes('bonus') || s.includes('freespin') || s.includes('free_spin') || s === 'fs')
        ) {
          return true
        }
        continue
      }
      const n = Number(v)
      if (
        Number.isFinite(n) &&
        n > 0 &&
        (k.includes('freespin') ||
          k.includes('free_spin') ||
          k.includes('bonusspins') ||
          k.includes('bonus_spins') ||
          k.includes('scatter'))
      ) {
        return true
      }
      if (
        v === true &&
        (k.includes('bonus') ||
          k.includes('freespin') ||
          k.includes('free_spin') ||
          k.includes('featuretrigger') ||
          k.includes('feature_trigger'))
      ) {
        return true
      }
    }
  }
  return false
}

function wrapResponse(winAmount, currencyCode, roundId, options = {}) {
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
    ...(options?.freeRoundOffer ? { freeRoundOffer: true } : {}),
    ...(options?.raw != null ? { _genericRaw: options.raw } : {}),
  }
}

function buildBetValueCandidates(effectiveBet, currencyCode) {
  const currency = (currencyCode || 'eur').toLowerCase()
  const isZeroDec = ['idr', 'jpy', 'krw', 'vnd'].includes(currency)
  const isFiat = ['eur', 'usd', 'brl', 'cad', 'cny', 'inr', 'mxn', 'php', 'pln', 'rub', 'try', 'ngn', 'ars', 'cop', 'pen', 'clp'].includes(currency)

  const betMinor = Number(effectiveBet)
  let betMajor
  if (isZeroDec) betMajor = betMinor
  else if (isFiat) betMajor = betMinor / 100
  else betMajor = betMinor / 1e8

  const uniq = []
  const push = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return
    if (!uniq.some((x) => Math.abs(x - n) < 1e-12)) uniq.push(n)
  }

  // Prefer major units first; many providers expect this.
  push(betMajor)
  // Fallback: some providers expect minor units.
  push(Math.round(betMinor))
  // Some providers accept decimal strings but reject integer-only variants.
  if (!Number.isInteger(betMajor)) push(Number(betMajor.toFixed(8)))
  return uniq
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
      const betValues = buildBetValueCandidates(effectiveBet, session.currencyCode)
      let lastStatus = null
      let lastResponsePreview = null
      for (const betValue of betValues) {
        const req = { ...body, bet: betValue }
        const t0 = Date.now()
        const res = await postViaProxy(upstreamUrl, req)
        const json = await res.json().catch(() => null)
        const text = await res.text().catch(() => null)
        const error = !res.ok ? `HTTP ${res.status}` : null
        logApiCall({
          type: `provider/${path}/bet`,
          endpoint: upstreamUrl,
          request: req,
          response: json ? { ok: res.ok, preview: JSON.stringify(json).slice(0, 120) } : text?.slice(0, 120),
          error,
          durationMs: Date.now() - t0,
        })
        if (res.ok) {
          const data = wrapResponse(json?.win ?? 0, session.currencyCode, json?.roundId, {
            freeRoundOffer: hasGenericBonusSignal(json),
            raw: json,
          })
          const nextSeq = (session.seq || 0) + 1
          return { data, nextSeq, session: { ...session, seq: nextSeq } }
        }
        lastStatus = res.status
        lastResponsePreview = json ? JSON.stringify(json).slice(0, 200) : text?.slice(0, 200)
      }
      throw new Error(`Generic provider spin failed: HTTP ${lastStatus || 400}${lastResponsePreview ? ` (${lastResponsePreview})` : ''}`)
    },
    async sendKeepAlive() { return { ok: true } },
    async sendContinue() { return { ok: true } },
  }
}

export const genericUniversal = {
  async startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
    const s = await commonStart(accessToken, slotSlug, sourceCurrency, targetCurrency)
    logApiCall({
      type: 'provider/generic-universal/init',
      endpoint: s.configUrl || s.base,
      request: { slotSlug, sourceCurrency, targetCurrency },
      response: { host: s.host, token: !!s.token, gameId: s.gameId },
      error: null,
      durationMs: null,
    })
    return s
  },
  async placeBet(session, betAmount, extraBet = false) {
    const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
    const betValues = buildBetValueCandidates(effectiveBet, session.currencyCode)

    const endpointCandidates = ['spin', 'play', 'bet', 'wager']
    const payloadKeyCandidates = ['bet', 'amount', 'stake', 'wager', 'betAmount']

    let lastError = 'No successful generic endpoint'
    for (const endpoint of endpointCandidates) {
      const upstreamUrl = session.base ? `${session.base}/${endpoint}` : session.configUrl || ''
      for (const key of payloadKeyCandidates) {
        for (const betValue of betValues) {
          const body = { [key]: betValue }
          if (session.token != null) body.token = session.token
          if (session.gameId != null) body.gameId = session.gameId
          const t0 = Date.now()
          try {
            const res = await postViaProxy(upstreamUrl, body)
            const json = await res.json().catch(() => null)
            const text = await res.text().catch(() => null)
            if (!res.ok) {
              lastError = `HTTP ${res.status}`
              logApiCall({
                type: 'provider/generic-universal/bet',
                endpoint: upstreamUrl,
                request: body,
                response: json ? { ok: false, preview: JSON.stringify(json).slice(0, 120) } : text?.slice(0, 120),
                error: lastError,
                durationMs: Date.now() - t0,
              })
              continue
            }
            const winFromJson =
              Number(json?.win ?? json?.winAmount ?? json?.payout ?? json?.amountWon ?? 0) ||
              Number(json?.data?.win ?? json?.data?.winAmount ?? json?.data?.payout ?? 0)
            const roundId = json?.roundId || json?.data?.roundId || null
            logApiCall({
              type: 'provider/generic-universal/bet',
              endpoint: upstreamUrl,
              request: body,
              response: { ok: true, winAmount: Number.isFinite(winFromJson) ? winFromJson : 0, roundId },
              error: null,
              durationMs: Date.now() - t0,
            })
            const data = wrapResponse(Number.isFinite(winFromJson) ? winFromJson : 0, session.currencyCode, roundId, {
              freeRoundOffer: hasGenericBonusSignal(json),
              raw: json,
            })
            const nextSeq = (session.seq || 0) + 1
            return { data, nextSeq, session: { ...session, seq: nextSeq } }
          } catch (e) {
            lastError = e?.message || String(e)
            logApiCall({
              type: 'provider/generic-universal/bet',
              endpoint: upstreamUrl,
              request: body,
              response: null,
              error: lastError,
              durationMs: Date.now() - t0,
            })
          }
        }
      }
    }

    throw new Error(`Generic provider spin failed: ${lastError}`)
  },
  async sendKeepAlive() { return { ok: true } },
  async sendContinue() { return { ok: true } },
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
export const bgaming = makeAdapter('spin')
export const gamomat = makeAdapter('spin')
export const justslots = makeAdapter('spin')
export const massive = makeAdapter('spin')
export const onetouch = makeAdapter('spin')

/**
 * Truelab (Softswiss launcher): Spins über play.launcher-gg.com/.../round/open|close, nicht POST …/spin.
 * Die RGS-Basis steht im JWT aus startThirdPartySession unter „rgs“ (gleiches Muster wie Browser-HAR).
 */
export const truelab = {
  async startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
    const s = await commonStart(accessToken, slotSlug, sourceCurrency, targetCurrency)
    const payload = decodeJwtPayloadLoose(s.token)
    const rgsRaw = payload?.rgs
    const apiBase =
      rgsRaw && String(rgsRaw).startsWith('http') ? String(rgsRaw).replace(/\/+$/, '') : null
    if (!apiBase) {
      logApiCall({
        type: 'provider/truelab/init',
        endpoint: s.configUrl || '',
        request: { slotSlug },
        response: { host: s.host, hasToken: !!s.token },
        error: 'JWT ohne rgs',
        durationMs: null,
      })
      throw new Error('Truelab: Session-JWT enthält keine RGS-URL (rgs).')
    }
    try {
      const u = new URL(apiBase)
      s.host = u.hostname
    } catch {
      /* ignore */
    }
    const auth = s.token ? { Authorization: `Bearer ${s.token}` } : {}
    const actUrl = `${apiBase}/session/activate`
    try {
      const res = await postViaProxy(
        actUrl,
        {
          lang: 'en',
          analytics: { deviceType: 'desktop', deviceOrientation: 'landscape' },
        },
        auth
      )
      const preview = (await res.text().catch(() => '')).slice(0, 200)
      logApiCall({
        type: 'provider/truelab/activate',
        endpoint: actUrl,
        request: { lang: 'en' },
        response: res.ok ? { ok: true, preview } : { preview },
        error: res.ok ? null : `HTTP ${res.status}`,
        durationMs: null,
      })
    } catch (e) {
      logApiCall({
        type: 'provider/truelab/activate',
        endpoint: actUrl,
        request: {},
        response: null,
        error: e?.message || String(e),
        durationMs: null,
      })
    }
    const out = {
      ...s,
      truelabApiBase: apiBase,
    }
    logApiCall({
      type: 'provider/truelab/init',
      endpoint: out.configUrl || apiBase,
      request: { slotSlug, sourceCurrency, targetCurrency },
      response: { host: out.host, truelabApiBase: apiBase, token: !!s.token },
      error: null,
      durationMs: null,
    })
    return out
  },
  async placeBet(session, betAmount, extraBet = false) {
    const apiBase = session.truelabApiBase
    if (!apiBase || typeof apiBase !== 'string') {
      throw new Error('Truelab placeBet: fehlende truelabApiBase (Session neu starten).')
    }
    const auth = session.token ? { Authorization: `Bearer ${session.token}` } : {}
    const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
    const amountMajor = truelabStakeAmountMajor(effectiveBet, session.currencyCode)
    const openUrl = `${apiBase}/round/open`
    const analytics = JSON.stringify({ s: 1, qs: 0, as: 0, pr: 1, rc: 0, tlv: '3.13.0' })
    const openBody = {
      stakes: [{ name: 'default', amount: amountMajor }],
      analytics,
      betIndex: 0,
    }
    const t0 = Date.now()
    const res = await postViaProxy(openUrl, openBody, auth)
    const rawText = await res.text().catch(() => '')
    let json = null
    try {
      json = rawText ? JSON.parse(rawText) : null
    } catch {
      json = null
    }
    const err = !res.ok ? `HTTP ${res.status}` : null
    logApiCall({
      type: 'provider/truelab/bet',
      endpoint: openUrl,
      request: openBody,
      response: json
        ? { ok: res.ok, preview: JSON.stringify(json).slice(0, 200) }
        : rawText?.slice(0, 200),
      error: err,
      durationMs: Date.now() - t0,
    })
    if (!res.ok) {
      const ej = json && typeof json === 'object' ? json : null
      const code = ej?.code
      const msgLc = String(ej?.message || rawText || '').toLowerCase()
      const truelabNoFunds =
        code === 10 ||
        code === '10' ||
        (msgLc.includes('balance') &&
          (msgLc.includes('less than bet') ||
            msgLc.includes('insufficient') ||
            msgLc.includes('unable to create bet')))
      if (truelabNoFunds) {
        const err = new Error(
          `Insufficient balance (Truelab code ${code ?? 10}): ${ej?.message || 'Balance is less than bet size.'}`
        )
        err.insufficientBalance = true
        throw err
      }
      throw new Error(
        `Generic provider spin failed: HTTP ${res.status}${rawText ? ` (${rawText.slice(0, 120)})` : ''}`
      )
    }
    if (json && json.status === false && (json.code === 10 || json.code === '10')) {
      const err = new Error(
        `Insufficient balance (Truelab code ${json.code}): ${json.message || 'Balance is less than bet size.'}`
      )
      err.insufficientBalance = true
      throw err
    }
    const { win, roundId } = truelabExtractWinAndRoundId(json)
    if (roundId) {
      const closeUrl = `${apiBase}/round/close`
      const t1 = Date.now()
      const cr = await postViaProxy(closeUrl, { roundId }, auth)
      const ctr = await cr.text().catch(() => '')
      logApiCall({
        type: 'provider/truelab/close',
        endpoint: closeUrl,
        request: { roundId },
        response: ctr.slice(0, 120),
        error: cr.ok ? null : `HTTP ${cr.status}`,
        durationMs: Date.now() - t1,
      })
    }
    const data = wrapResponse(win, session.currencyCode, roundId, {
      freeRoundOffer: hasGenericBonusSignal(json),
      raw: json,
    })
    const nextSeq = (session.seq || 0) + 1
    return { data, nextSeq, session: { ...session, seq: nextSeq } }
  },
  async sendKeepAlive() {
    return { ok: true }
  },
  async sendContinue() {
    return { ok: true }
  },
}

export const slotmill = makeAdapter('spin')
export const petersons = makeAdapter('spin')
export const gamesglobal = makeAdapter('spin')
export const jaderabbit = makeAdapter('spin')
