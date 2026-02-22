/**
 * Pragmatic Play – Provider für Sugar Rush & weitere Slots
 * API: gs2c/ge/v4/gameService (doSpin, doCollect, doInit)
 */
import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'

const GAME_SERVICE_PATH_V4 = '/gs2c/ge/v4/gameService'
const GAME_SERVICE_PATH_V3 = '/gs2c/ge/v3/gameService'

function parseUrlParams(urlStr) {
  try {
    const url = typeof urlStr === 'string' ? new URL(urlStr) : urlStr
    const q = url.searchParams
    let mgckey = q.get('mgckey')
    let symbol = q.get('symbol')

    // playGame.do?key=token%3Dxxx%60%7C%60symbol%3Dvs20sugarrushx... (Stake-Neuformat)
    if (!mgckey && !symbol && q.has('key')) {
      const keyRaw = decodeURIComponent(q.get('key') || '')
      for (const part of keyRaw.split(/[|`]+/)) {
        const eq = part.indexOf('=')
        if (eq < 0) continue
        const k = part.slice(0, eq).trim()
        const v = part.slice(eq + 1).trim()
        if (k === 'token') mgckey = v
        if (k === 'symbol') symbol = v
      }
      if (symbol && mgckey) {
        mgckey = `AUTHTOKEN@${mgckey}~stylename@rare_stake`
      }
    }

    return {
      mgckey,
      symbol,
      host: url.hostname || url.host?.replace(/:\d+$/, ''),
    }
  } catch {
    return {}
  }
}

const PRAGMATIC_PROXY_FETCH = null
const PRAGMATIC_PROXY_POST = null
const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']

async function safeFetch(url, options = {}) {
  if (window.electronAPI?.proxyRequest) {
    const { method = 'GET', headers = {}, body } = options
    if (method === 'POST' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
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
 * Holt die finale Game-URL aus der Config.
 * - Wenn config bereits mgckey+symbol enthält: direkt nutzen.
 * - playGame.do?key=...: GET via Proxy (CORS), folgt Redirects.
 */
async function resolveGameUrl(config) {
  if (typeof config !== 'string') return null
  const trimmed = config.trim()
  if (!trimmed) return null

  // html5Game.do mit mgckey/symbol als Query-Parameter → direkt nutzen
  const params = parseUrlParams(trimmed)
  if (params.mgckey && params.symbol && params.host && !trimmed.includes('playGame.do')) {
    return trimmed
  }

  // playGame.do?key=... – IMMER zuerst fetchen (Session aktivieren, ggf. Redirect mit echtem mgckey)
  let url = trimmed
  
  try {
    const res = await safeFetch(url, { method: 'GET' })
    if (res.ok && res.url) {
      const finalParams = parseUrlParams(res.url)
      if (finalParams.mgckey && finalParams.symbol) return res.url
    }
    
    // Fallback: versuche key-Parameter aus playGame.do direkt zu parsen, falls Redirect nicht klappte
    const directParams = parseUrlParams(url)
    if (directParams.mgckey && directParams.symbol && directParams.host) {
       return url
    }
  } catch (e) {
    logApiCall({ type: 'pragmatic/resolve', endpoint: url, request: null, response: null, error: String(e), durationMs: null })
    throw e
  }
  return null
}

function parsePragmaticResponse(text) {
  const params = new URLSearchParams(text?.startsWith('?') ? text : '?' + (text || ''))
  const getNum = (k) => parseFloat((params.get(k) || '0').replace(/,/g, ''))
  const w = getNum('w')
  const tw = getNum('tw')
  return {
    na: params.get('na') || '',
    index: params.get('index') || '1',
    counter: params.get('counter') || '1',
    balance: getNum('balance'),
    balance_cash: getNum('balance_cash'),
    w: w || tw,
    ntp: getNum('ntp'),
    c: getNum('c'),
    rid: params.get('rid'),
    noMoney: text?.includes('nomoney='),
    systemError: text?.includes('ext_code=SystemError'),
    fs: text?.includes('&fs=') || params.has('fs'),
    fs_opt: text?.includes('fs_opt=') || params.has('fs_opt'),
    raw: text,
  }
}

// Fallback, falls doInit keine Bet-Levels liefert (bls/sc fehlt)
// Sugar Rush 1000 IDR: Min 500
const PRAGMATIC_DEFAULT_BET_LEVELS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]
// Big Bass Boom IDR: 1 Münze/Linie × 25 = 250 … 10 Münzen × 280.000 = 28 Mio
const PRAGMATIC_DEFAULT_BET_LEVELS_BIGBASS = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2800000, 28000000]

/**
 * Parst Bet-Levels aus doInit-Response (währungsabhängig).
 * Formate: bls=min,max | sc=0.2,0.5,1,... (EUR) oder sc=500,1000,... (IDR)
 */
function parseBetLevels(doInitText, targetCurrency, symbol = '') {
  if (!doInitText || typeof doInitText !== 'string') return PRAGMATIC_DEFAULT_BET_LEVELS
  const isZeroDec = ZERO_DECIMAL_CURRENCIES.includes((targetCurrency || 'eur').toLowerCase())

  // bls=min,max (Pragmatic-Standard)
  const blsMatch = doInitText.match(/[?&]bls=(\d+),(\d+)/)
  if (blsMatch) {
    const low = parseInt(blsMatch[1], 10)
    const high = parseInt(blsMatch[2], 10)
    if (low < high) {
      const steps = Math.min(12, high - low)
      const inc = Math.max(1, Math.floor((high - low) / steps))
      const levels = []
      for (let v = low; v <= high; v += inc) levels.push(v)
      if (levels[levels.length - 1] !== high) levels.push(high)
      return levels
    }
  }

  // sc=… – bei IDR/JPY: Werte = Beträge; bei EUR: Werte * 100 = Minor
  const scMatch = doInitText.match(/[?&]sc=([\d.,]+)/)
  if (scMatch) {
    const vals = scMatch[1].split(',').map((s) => parseFloat(s.trim().replace(',', '.')))
    if (vals.length > 0) {
      let levels = vals
        .map((v) => Math.round(isZeroDec ? v : v * 100))
        .filter((n) => n > 0)
        .sort((a, b) => a - b)
      levels = [...new Set(levels)]
      // IDR: wenn geparste Levels zu hoch, symbol-spezifischen Fallback nutzen
      if (levels.length > 0) {
        const min = levels[0]
        if (isZeroDec && min > 250) {
          return /bbboom/i.test(symbol) ? PRAGMATIC_DEFAULT_BET_LEVELS_BIGBASS : PRAGMATIC_DEFAULT_BET_LEVELS
        }
        return levels
      }
    }
  }

  return /bbboom/i.test(symbol) ? PRAGMATIC_DEFAULT_BET_LEVELS_BIGBASS : PRAGMATIC_DEFAULT_BET_LEVELS
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    sourceCurrency?.toLowerCase() || 'usdc',
    targetCurrency?.toLowerCase() || 'eur'
  )
  if (!session?.config) throw new Error('Keine Config von Stake erhalten.')

  const gameUrl = await resolveGameUrl(session.config)
  if (!gameUrl) throw new Error('Game-URL konnte nicht aufgelöst werden.')

  const { mgckey, symbol, host } = parseUrlParams(gameUrl)
  if (!mgckey || !symbol || !host) {
    throw new Error('mgckey, symbol oder host fehlt in der Game-URL.')
  }

  const doInitBody = new URLSearchParams({
    action: 'doInit',
    symbol,
    cver: '293728',
    index: '1',
    counter: '1',
    repeat: '0',
    mgckey,
  })

  async function tryDoInit(gameServiceUrl) {
    let doInitRes
    try {
        doInitRes = await safeFetch(gameServiceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: doInitBody.toString(),
        })
    } catch (e) {
        throw new Error(`Fetch failed: ${e.message}`)
    }
    return { res: doInitRes, text: await doInitRes.text() }
  }

  const t0 = Date.now()
  let gameServiceUrl = `https://${host}${GAME_SERVICE_PATH_V4}`
  let doInitText
  try {
    let result = await tryDoInit(gameServiceUrl)
    doInitText = result.text
    logApiCall({ type: 'pragmatic/doInit', endpoint: gameServiceUrl, request: Object.fromEntries(doInitBody), response: doInitText?.slice(0, 500), error: !result.res.ok ? `HTTP ${result.res.status}` : null, durationMs: Date.now() - t0 })
    // Bei 400: v3 probieren (Big Bass etc. – ssp nutzt v3 zuerst)
    if (!result.res.ok && result.res.status === 400) {
      gameServiceUrl = `https://${host}${GAME_SERVICE_PATH_V3}`
      result = await tryDoInit(gameServiceUrl)
      doInitText = result.text
      logApiCall({ type: 'pragmatic/doInit', endpoint: gameServiceUrl, request: Object.fromEntries(doInitBody), response: doInitText?.slice(0, 500), error: !result.res.ok ? `HTTP ${result.res.status}` : null, durationMs: Date.now() - t0 })
    }
    if (!result.res.ok) throw new Error(`DoInit HTTP ${result.res.status}`)
  } catch (e) {
    if (e.message?.startsWith('DoInit HTTP')) throw e
    logApiCall({ type: 'pragmatic/doInit', endpoint: gameServiceUrl, request: Object.fromEntries(doInitBody), response: null, error: String(e), durationMs: Date.now() - t0 })
    throw new Error(`DoInit fehlgeschlagen: ${e.message}`)
  }
  if (doInitText === 'unlogged') throw new Error('Session ungültig. Bitte erneut verbinden.')
  if (doInitText?.includes('nomoney=')) throw new Error('Nicht genügend Guthaben.')

  const betLevels = parseBetLevels(doInitText, targetCurrency, symbol)
  const parsed = parsePragmaticResponse(doInitText)
  // Erster doSpin braucht index=2, counter=3 (Pragmatic-Konvention)
  const firstIndex = '2'
  const firstCounter = '3'
  // Lines aus Symbol: vs20sugarrushx → 20, vs10bbboom → 10
  const linesMatch = symbol?.match(/^vs(\d+)/i)
  const lines = linesMatch ? parseInt(linesMatch[1], 10) : 20

  return {
    mgckey,
    symbol,
    host,
    gameServiceUrl,
    index: firstIndex,
    counter: firstCounter,
    betLevels,
    lines,
    targetCurrency: (targetCurrency || 'eur').toLowerCase(),
  }
}

async function postGameService(session, body) {
  const t0 = Date.now()
  const formBody = new URLSearchParams(body).toString()
  let res
  try {
    res = await safeFetch(session.gameServiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
    })
  } catch(e) {
    logApiCall({ type: 'pragmatic/request', endpoint: session.gameServiceUrl, request: body, response: null, error: String(e), durationMs: Date.now() - t0 })
    throw e
  }
  
  const text = await res.text()
  logApiCall({ type: 'pragmatic/request', endpoint: session.gameServiceUrl, request: body, response: text?.slice(0, 300), error: !res.ok ? `HTTP ${res.status}` : null, durationMs: Date.now() - t0 })
  return text
}

export async function sendKeepAlive() {
  return { ok: true, data: null }
}

// IDR Sugar Rush etc.: c = Gesamteinsatz/20 (500 IDR → c=25)
const IDR_C_MULTIPLIER = 20
// Big Bass Boom: Einsatz pro Linie × Münzwert, c = Gesamteinsatz/Linien (250 IDR / 10 → c=25)
const BIGBASS_SYMBOL = /bbboom/i

/**
 * c = Einsatz in Pragmatic-Einheiten.
 * Big Bass: Gesamteinsatz = Linien × (Münzen/Linie × Münzwert), c = Gesamteinsatz/Linien (min 25)
 * Sugar Rush: c = Gesamteinsatz/20
 */
export async function placeBet(session, betAmount, extraBet = false, autoplay = false) {
  if (session.na === 'b') {
    throw new Error('Bonus aktiv – bitte im Spielfenster manuell weiterspielen.')
  }
  const curr = (session.targetCurrency || 'eur').toLowerCase()
  const b = Number(betAmount)
  const lines = session.lines || 20
  let c
  if (curr === 'idr') {
    if (BIGBASS_SYMBOL.test(session.symbol || '')) {
      c = Math.round(b / lines) // 250/10=25, 1000/10=100
    } else {
      c = Math.round(b / IDR_C_MULTIPLIER)
    }
  } else if (ZERO_DECIMAL_CURRENCIES.includes(curr)) {
    c = Math.round(b)
  } else {
    c = Math.round(b / 100)
  }
  const minC = BIGBASS_SYMBOL.test(session.symbol || '') && curr === 'idr' ? 25 : 1
  const cVal = Math.max(minC, c)
  const l = lines

  let currentSession = { ...session }
  let lastData = null
  let lastParsed = null

  const doCollect = async () => {
    const body = {
      action: 'doCollect',
      symbol: currentSession.symbol,
      index: currentSession.index,
      counter: currentSession.counter,
      repeat: '0',
      mgckey: currentSession.mgckey,
    }
    const text = await postGameService(currentSession, body)
    lastData = text
    lastParsed = parsePragmaticResponse(text)
    const nextIdx = String(parseInt(lastParsed.index, 10) + 1)
    const nextCnt = String(parseInt(lastParsed.counter, 10) + 2)
    currentSession = { ...currentSession, index: nextIdx, counter: nextCnt, na: lastParsed.na }
  }

  if (session.na === 'c') {
    await doCollect()
    while (lastParsed.na === 'c') {
      await doCollect()
    }
  }

  let firstSpinBalance = null
  let hadCascade = false

  const spinBody = {
    action: 'doSpin',
    symbol: currentSession.symbol,
    c: String(cVal),
    l: String(l),
    sInfo: 't',
    index: currentSession.index,
    counter: currentSession.counter,
    repeat: '0',
    mgckey: currentSession.mgckey,
  }
  const spinText = await postGameService(currentSession, spinBody)
  lastData = spinText
  lastParsed = parsePragmaticResponse(spinText)
  firstSpinBalance = lastParsed.balance
  // Nächster Request: index+1, counter+2 (Pragmatic-Konvention)
  const nextIndex = String(parseInt(lastParsed.index, 10) + 1)
  const nextCounter = String(parseInt(lastParsed.counter, 10) + 2)
  currentSession = { ...currentSession, index: nextIndex, counter: nextCounter, na: lastParsed.na }

  while (lastParsed.na === 'c') {
    hadCascade = true
    await doCollect()
  }

  if (lastParsed.noMoney) throw new Error('Nicht genügend Guthaben.')
  if (lastParsed.systemError) throw new Error('Systemfehler vom Spiel-Server.')

  // Gewinn: bei Cascade aus Balance-Delta (doCollect hat kein w), sonst aus w/tw
  const totalWin = hadCascade
    ? Math.max(0, (lastParsed.balance ?? 0) - (firstSpinBalance ?? 0))
    : (lastParsed.w ?? 0)

  const isZeroDec = ZERO_DECIMAL_CURRENCIES.includes(curr)
  const currencyCode = (session.targetCurrency || 'eur').toUpperCase()
  const bal = Number(lastParsed.balance) || 0
  const win = Number(totalWin) || 0
  const balanceForParser = isZeroDec ? Math.round(bal) : Math.round(bal * 100)
  const winForParser = isZeroDec ? Math.round(win) : Math.round(win * 100)

  const responseForParser = {
    statusCode: 0,
    accountBalance: { balance: balanceForParser, currencyCode },
    round: { roundId: lastParsed.rid, status: 'ok', events: [{ awa: winForParser }] },
    _pragmatic: { raw: lastData, ...lastParsed },
  }

  if (lastParsed.fs || lastParsed.fs_opt || lastParsed.na === 'b') {
    responseForParser.freeRoundOffer = true
  }
  
  // LOGGING: Geparste Response loggen, um Fehler besser zu sehen
  logApiCall({ 
    type: 'pragmatic/bet', 
    endpoint: session.gameServiceUrl, 
    request: spinBody, 
    response: { ...lastParsed, raw: undefined, _rawPreview: (lastParsed.raw || '').slice(0, 50) }, 
    error: null, 
    durationMs: null 
  })

  const updatedSession = { ...currentSession, na: lastParsed.na }
  return {
    data: responseForParser,
    nextSeq: 0,
    session: updatedSession,
  }
}
