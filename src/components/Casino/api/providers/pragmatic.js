/**
 * Pragmatic Play – Provider für Sugar Rush & weitere Slots
 * API: gs2c/ge/v4/gameService (doSpin, doCollect, doInit)
 */
import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { isZeroDecimalCurrency } from '../../utils/currencyMeta'
import { normalizeProviderError } from './providerErrors'

const GAME_SERVICE_PATH_V4 = '/gs2c/ge/v4/gameService'
const GAME_SERVICE_PATH_V3 = '/gs2c/ge/v3/gameService'
const SSP_FALLBACK_V3_URL = 'http://277bdnt1n6.iumtibif.net/gs2c/ge/v3/gameService'
const SSP_FALLBACK_V4_URL = 'https://441f8864ac.ukffjfmmka.net/gs2c/ge/v4/gameService'

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

function pragmaticError(message, cause) {
  return normalizeProviderError('pragmatic', cause || new Error(message), message)
}

async function safeFetch(url, options = {}) {
  if (!url || typeof url !== 'string') {
    throw pragmaticError('Session ungültig. Bitte Session neu starten.')
  }
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
      throw pragmaticError('Proxy request failed', e)
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

  // playGame.do?key=... – ZWINGEND fetchen, um Token server-seitig zu aktivieren (ohne → doInit liefert "unlogged")
  let url = trimmed
  try {
    const res = await safeFetch(url, { method: 'GET' })
    if (res.ok && res.url) {
      const finalParams = parseUrlParams(res.url)
      if (finalParams.mgckey && finalParams.symbol) return res.url
    }
    const directParams = parseUrlParams(url)
    if (directParams.mgckey && directParams.symbol && directParams.host) return url
  } catch (e) {
    logApiCall({ type: 'pragmatic/resolve', endpoint: url, request: null, response: null, error: String(e), durationMs: null })
    const directParams = parseUrlParams(trimmed)
    if (directParams.mgckey && directParams.symbol && directParams.host) return trimmed
    throw pragmaticError('resolveGameUrl failed', e)
  }
  return null
}

function parsePragmaticResponse(text) {
  const params = new URLSearchParams(text?.startsWith('?') ? text : '?' + (text || ''))
  const getNum = (k) => parseFloat((params.get(k) || '0').replace(/,/g, ''))
  const w = getNum('w')
  const tw = getNum('tw')
  const tmb = getNum('tmb')
  const fs_total = params.get('fs_total') != null ? getNum('fs_total') : null
  return {
    na: params.get('na') || '',
    index: params.get('index') || '1',
    counter: params.get('counter') || '1',
    balance: getNum('balance'),
    balance_cash: getNum('balance_cash'),
    balance_bonus: params.has('balance_bonus') ? getNum('balance_bonus') : null,
    w: w || tw,
    tw,
    tmb,
    fs_total,
    ntp: getNum('ntp'),
    c: getNum('c'),
    rid: params.get('rid'),
    reel_set: params.get('reel_set') || null,
    noMoney: text?.includes('nomoney='),
    systemError: text?.includes('ext_code=SystemError'),
    fs: text?.includes('&fs=') || params.has('fs'),
    fs_opt: text?.includes('fs_opt=') || params.has('fs_opt'),
    mo: text?.includes('&mo=') || params.has('mo'),
    rs_c: text?.includes('&rs_c=') || params.has('rs_c'),
    bgid: params.get('bgid') || null,
    ch_v: params.get('ch_v') || '',
    unlogged: String(text || '').includes('unlogged'),
    raw: text,
  }
}

function nextPragmaticCursorValue(raw, step, fallback) {
  const n = parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return String(n + step)
}

function toV3ServiceUrl(url) {
  if (!url || typeof url !== 'string') return url
  return url.replace('/ge/v4/gameService', '/ge/v3/gameService')
}

function pickFsOption(rawText) {
  const txt = String(rawText || '')
  const m = txt.match(/(?:[?&]|^)fs_opt=([^&]+)/i)
  if (!m?.[1]) return '0'
  const opts = m[1]
    .split('~')
    .map((x) => x.trim())
    .filter(Boolean)
  return opts.includes('1') ? '1' : '0'
}

function parseBonusContext(rawText) {
  const txt = String(rawText || '')
  const out = {
    ask: null,
    trail: '',
    statusArr: [],
    winsMask: [],
  }
  const gMatch = txt.match(/g=\{([^]*?)\}(?:&|$)/)
  const gRaw = gMatch ? gMatch[1] : ''
  if (gRaw) {
    const askMatch = gRaw.match(/ask:"?(\d+)"?/i)
    if (askMatch) out.ask = parseInt(askMatch[1], 10)
    const trailMatch = gRaw.match(/trail:"([^"]+)"/i)
    if (trailMatch) out.trail = trailMatch[1]
    const winsMaskMatch = gRaw.match(/wins_mask:"([^"]+)"/i)
    if (winsMaskMatch) out.winsMask = winsMaskMatch[1].split(',').map((x) => x.trim()).filter(Boolean)
    const statusMatch = gRaw.match(/status:"([^"]+)"/i)
    if (statusMatch) {
      out.statusArr = statusMatch[1]
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n))
    }
  }
  if (out.statusArr.length === 0) {
    const p = new URLSearchParams(txt.startsWith('?') ? txt : `?${txt}`)
    const status = p.get('status')
    if (status) {
      out.statusArr = status
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n))
    }
  }
  return out
}

function parseTrailScore(trailToken) {
  const m = String(trailToken || '').match(/f(\d+)_m(\d+)/i)
  if (!m) return 0
  return parseInt(m[1], 10) * parseInt(m[2], 10)
}

function resolveBonusDecisionMode(session) {
  const fromSession = String(
    session?.bonusDecisionMode ||
    session?.bonusChoiceMode ||
    session?.strategy ||
    ''
  ).toLowerCase()
  if (fromSession === 'deal' || fromSession === 'stand') return fromSession
  try {
    const raw = String(window?.localStorage?.getItem('slotbot_pragmatic_bonus_mode') || '').toLowerCase()
    if (raw === 'deal' || raw === 'stand') return raw
  } catch (_) {
    // Ignore storage read issues.
  }
  return 'stand'
}

function pickBonusInd(parsed, currentSession, decisionMode = 'stand') {
  const raw = String(parsed?.raw || '')
  const context = parseBonusContext(raw)
  const chv = String(parsed?.ch_v || '')
  const seen = new Set(Array.isArray(currentSession?._bonusSeenChoices) ? currentSession._bonusSeenChoices : [])

  // SSP-nah: ask-basierte Entscheidungen bei Semikolon-Trails.
  if (chv.includes(';')) {
    if (context.ask === 3) return '1'
    if (context.ask === 2 && context.statusArr.length > 0) {
      const open = []
      for (let i = 0; i < context.statusArr.length; i += 1) {
        if (context.statusArr[i] === 0) open.push(i)
      }
      if (open.length > 0) return String(open[0])
      return '0'
    }
    if (context.ask === 1) {
      const trailParts = chv.split(';')
      let currentTrail = ''
      const statusTokens = []
      for (const part of trailParts) {
        if (part.startsWith('trail~')) currentTrail = part.replace('trail~', '')
        else if (part.startsWith('status~')) {
          statusTokens.push(...part.replace('status~', '').split(',').map((x) => x.trim()).filter(Boolean))
        }
      }
      const currentScore = parseTrailScore(currentTrail)
      const remaining = statusTokens.map(parseTrailScore).filter((n) => n > 0)
      const avg = remaining.length > 0 ? (remaining.reduce((a, b) => a + b, 0) / remaining.length) : 0
      return currentScore >= avg ? '0' : '1'
    }
    if (context.ask === 0) return decisionMode === 'deal' ? '0' : '1'
  }

  if (context.statusArr.length > 0) {
    const opts = context.statusArr.filter((v) => !seen.has(v))
    const choice = opts.length > 0 ? opts[0] : context.statusArr[0]
    return String(choice)
  }

  if (chv.includes(',') && !chv.includes(';')) {
    const vals = chv
      .split(',')
      .map((x) => parseFloat(x.trim()))
      .map((n) => (Number.isFinite(n) && n > 0 ? 0 : 1))
    if (vals.length > 0) {
      const opts = vals.filter((v) => !seen.has(v))
      const choice = opts.length > 0 ? opts[0] : vals[0]
      return String(choice)
    }
  }

  return '0'
}

// Fallback, falls doInit keine Bet-Levels liefert (bls/sc fehlt)
const PRAGMATIC_DEFAULT_BET_LEVELS = [10, 20, 50, 100, 200, 500, 1000, 2000]

/**
 * Parst Bet-Levels aus doInit-Response (währungsabhängig).
 * Formate:
 * - bls=min,max: c-Werte (Coin pro Linie). Wir konvertieren zu Beträgen = c × lines.
 *   Für VND/IDR/ARS überspringen wir bls – doInit liefert oft USD/EUR-Range.
 * - sc=0.2,0.5,1 (EUR): Werte × 100 = Minor (Cents)
 * - sc=500,1000 (IDR/VND): Werte = Beträge direkt
 *
 * Bet-Levels sind immer in Minor-Einheiten (bzw. Währung für Zero-Dec) für korrekte UI-Anzeige.
 * placeBet berechnet c = betAmount / lines.
 */
function parseBetLevels(doInitText, targetCurrency, symbol = '') {
  if (!doInitText || typeof doInitText !== 'string') return PRAGMATIC_DEFAULT_BET_LEVELS
  const curr = (targetCurrency || 'eur').toLowerCase()
  const isZeroDec = isZeroDecimalCurrency(curr)
  const params = new URLSearchParams(doInitText.startsWith('?') ? doInitText : `?${doInitText}`)
  const scRaw = params.get('sc')
  const lRaw = params.get('l')
  const blsRaw = params.get('bls')
  const lineMultipliers = []
  if (blsRaw) {
    for (const part of blsRaw.split(',')) {
      const n = Number(part)
      if (Number.isFinite(n) && n > 0) lineMultipliers.push(n)
    }
  } else if (lRaw) {
    const n = Number(lRaw)
    if (Number.isFinite(n) && n > 0) lineMultipliers.push(n)
  }
  if (lineMultipliers.length === 0) {
    const linesMatch = symbol?.match(/^vs(\d+)/i)
    lineMultipliers.push(linesMatch ? parseInt(linesMatch[1], 10) : 20)
  }

  if (!scRaw) return PRAGMATIC_DEFAULT_BET_LEVELS
  const scValues = scRaw
    .split(',')
    .map((x) => Number(String(x).trim().replace(',', '.')))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (scValues.length === 0) return PRAGMATIC_DEFAULT_BET_LEVELS

  const useMinorAsIs = !isZeroDec && scValues.every((v) => Number.isInteger(v) && v >= 1)
  const ladders = [1,2,3,4,5,6,7,8,9,10]
  const out = []
  for (const sc of scValues) {
    for (const mul of ladders) {
      for (const line of lineMultipliers) {
        const major = sc * mul * line
        const minor = isZeroDec
          ? Math.round(major)
          : (useMinorAsIs ? Math.round(major) : Math.round(major * 100))
        if (minor > 0 && Number.isFinite(minor)) out.push(minor)
      }
    }
  }
  const uniq = [...new Set(out)].sort((a, b) => a - b)
  return uniq.length > 0 ? uniq : PRAGMATIC_DEFAULT_BET_LEVELS
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    sourceCurrency?.toLowerCase() || 'usdc',
    targetCurrency?.toLowerCase() || 'eur'
  )
  if (!session?.config) throw pragmaticError('Keine Config von Stake erhalten.')

  const gameUrl = await resolveGameUrl(session.config)
  if (!gameUrl) throw pragmaticError('Game-URL konnte nicht aufgelöst werden.')

  const { mgckey, symbol, host } = parseUrlParams(gameUrl)
  if (!mgckey || !symbol || !host) {
    throw pragmaticError('mgckey, symbol oder host fehlt in der Game-URL.')
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
        throw pragmaticError(`Fetch failed: ${e.message}`, e)
    }
    return { res: doInitRes, text: await doInitRes.text() }
  }

  const t0 = Date.now()
  const doInitCandidates = [
    `https://${host}${GAME_SERVICE_PATH_V4}`,
    `https://${host}${GAME_SERVICE_PATH_V3}`,
    SSP_FALLBACK_V3_URL,
    SSP_FALLBACK_V4_URL,
  ]
  let gameServiceUrl = doInitCandidates[0]
  let doInitText
  let lastErr = null
  let lastStatus = null
  for (const candidate of doInitCandidates) {
    gameServiceUrl = candidate
    try {
      const result = await tryDoInit(candidate)
      doInitText = result.text
      lastStatus = result?.res?.status ?? null
      logApiCall({
        type: 'pragmatic/doInit',
        endpoint: candidate,
        request: Object.fromEntries(doInitBody),
        response: doInitText?.slice(0, 500),
        error: !result.res.ok ? `HTTP ${result.res.status}` : null,
        durationMs: Date.now() - t0,
      })
      if (result.res.ok && doInitText && doInitText !== 'unlogged') {
        lastErr = null
        break
      }
      lastErr = pragmaticError(
        doInitText === 'unlogged'
          ? 'Session ungültig. Bitte erneut verbinden.'
          : `DoInit HTTP ${result.res.status}`
      )
    } catch (e) {
      lastErr = e
      logApiCall({
        type: 'pragmatic/doInit',
        endpoint: candidate,
        request: Object.fromEntries(doInitBody),
        response: null,
        error: String(e),
        durationMs: Date.now() - t0,
      })
    }
  }
  if (!doInitText || doInitText === 'unlogged') {
    throw pragmaticError(
      lastStatus ? `DoInit fehlgeschlagen (HTTP ${lastStatus})` : 'DoInit fehlgeschlagen: Alle Pragmatic-Server nicht erreichbar.',
      lastErr || undefined
    )
  }
  if (doInitText?.includes('nomoney=')) throw pragmaticError('Nicht genügend Guthaben.')

  const betLevels = parseBetLevels(doInitText, targetCurrency, symbol)
  const parsed = parsePragmaticResponse(doInitText)
  // SSP-nah: doInit liefert die Cursor-Basis; erster doSpin = index+1 / counter+2
  const firstIndex = nextPragmaticCursorValue(parsed.index, 1, '2')
  const firstCounter = nextPragmaticCursorValue(parsed.counter, 2, '3')
  // Lines aus Symbol: vs20sugarrushx → 20, vs10bbboom → 10
  const linesMatch = symbol?.match(/^vs(\d+)/i)
  const lines = linesMatch ? parseInt(linesMatch[1], 10) : 20
  const isZeroDec = isZeroDecimalCurrency((targetCurrency || 'eur').toLowerCase())
  const bal = Number(parsed.balance) || 0
  const initialBalance = bal ? (isZeroDec ? Math.round(bal) : Math.round(bal * 100)) : null

  return {
    mgckey,
    symbol,
    host,
    gameServiceUrl,
    spinServiceUrl: toV3ServiceUrl(gameServiceUrl),
    index: firstIndex,
    counter: firstCounter,
    betLevels,
    lines,
    targetCurrency: (targetCurrency || 'eur').toLowerCase(),
    initialBalance,
  }
}

async function postGameService(session, body) {
  const url = session?.spinServiceUrl || session?.gameServiceUrl
  if (!url || typeof url !== 'string') {
    throw pragmaticError('Session ungültig. Bitte Session neu starten.')
  }
  const t0 = Date.now()
  const formBody = new URLSearchParams(body).toString()
  let res
  try {
    res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
    })
  } catch(e) {
    logApiCall({ type: 'pragmatic/request', endpoint: url, request: body, response: null, error: String(e), durationMs: Date.now() - t0 })
    throw pragmaticError('pragmatic request failed', e)
  }
  
  const text = await res.text()
  logApiCall({ type: 'pragmatic/request', endpoint: url, request: body, response: text?.slice(0, 300), error: !res.ok ? `HTTP ${res.status}` : null, durationMs: Date.now() - t0 })
  return text
}

export async function sendKeepAlive() {
  return { ok: true, data: null }
}

// Big Bass Boom: c = Gesamteinsatz/Linien (min 25)
const BIGBASS_SYMBOL = /bbboom/i

/**
 * Pragmatic: Gesamteinsatz = c × l (Coin-Wert × Linien).
 * c = betAmount / lines
 * Bet-Levels sind immer in Minor (bzw. Währung für Zero-Dec).
 */
export async function placeBet(session, betAmount, extraBet = false, autoplay = false) {
  const curr = (session.targetCurrency || 'eur').toLowerCase()
  const isZeroDec = isZeroDecimalCurrency(curr)

  const lines = session.lines || 20
  const betLevels = session.betLevels || []
  // Auf nächsten gültigen Bet-Level snappen
  const snapped = betLevels.length
    ? betLevels.reduce((prev, lv) => (Math.abs(lv - betAmount) < Math.abs(prev - betAmount) ? lv : prev))
    : betAmount
  const b = Number(snapped)

  // Pragmatic: Gesamteinsatz = c × l, wobei c als MAJOR-Coin pro Linie erwartet wird.
  // Intern arbeiten wir mit Minor-Betlevels -> vor doSpin sauber in major umrechnen.
  const minC = BIGBASS_SYMBOL.test(session.symbol || '') && curr === 'idr' ? 25 : 1
  const betMajor = isZeroDec ? b : b / 100
  const cRaw = lines > 0 ? (betMajor / lines) : betMajor
  const cVal = BIGBASS_SYMBOL.test(session.symbol || '') && curr === 'idr'
    ? Math.max(minC, Math.round(cRaw))
    : Math.max(0, Number(cRaw))
  const cSerialized = isZeroDec
    ? String(Math.round(cVal))
    : String(Number(cVal.toFixed(4))).replace(/\.?0+$/, '')
  const l = lines

  let currentSession = { ...session }
  const bonusDecisionMode = resolveBonusDecisionMode(currentSession)
  currentSession = { ...currentSession, bonusDecisionMode }
  let lastData = null
  let lastParsed = null
  let bonusFlowDetected = false

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

  const doAction = async (action, extra = {}) => {
    const body = {
      action,
      symbol: currentSession.symbol,
      index: currentSession.index,
      counter: currentSession.counter,
      repeat: '0',
      mgckey: currentSession.mgckey,
      ...extra,
    }
    const text = await postGameService(currentSession, body)
    lastData = text
    lastParsed = parsePragmaticResponse(text)
    const nextIdx = nextPragmaticCursorValue(lastParsed.index, 1, nextPragmaticCursorValue(currentSession.index, 1, '2'))
    const nextCnt = nextPragmaticCursorValue(lastParsed.counter, 2, nextPragmaticCursorValue(currentSession.counter, 2, '3'))
    currentSession = { ...currentSession, index: nextIdx, counter: nextCnt, na: lastParsed.na }
    return text
  }

  if (session.na === 'c') {
    await doCollect()
    while (lastParsed.na === 'c') {
      await doCollect()
    }
  }

  let firstSpinBalance = null
  let hadCascade = false
  let lastSpinBody = null

  const doSpin = async () => {
    const spinBody = {
      action: 'doSpin',
      symbol: currentSession.symbol,
      c: cSerialized,
      l: Number(l),
      bl: extraBet ? '1' : '0',
      index: currentSession.index,
      counter: currentSession.counter,
      repeat: '0',
      mgckey: currentSession.mgckey,
    }
    const spinText = await postGameService(currentSession, spinBody)
    return { spinBody, spinText, parsed: parsePragmaticResponse(spinText) }
  }

  let spinResult
  try {
    spinResult = await doSpin()
  } catch (e) {
    throw pragmaticError(`Pragmatic doSpin failed: ${String(e?.message || e)}`, e)
  }

  lastSpinBody = spinResult?.spinBody || null
  lastData = spinResult.spinText
  lastParsed = spinResult.parsed
  if (lastParsed.unlogged) {
    throw pragmaticError('Session ungültig. Bitte Session neu starten.')
  }
  firstSpinBalance = lastParsed.balance
  let nextIndex = nextPragmaticCursorValue(lastParsed.index, 1, nextPragmaticCursorValue(currentSession.index, 1, '2'))
  let nextCounter = nextPragmaticCursorValue(lastParsed.counter, 2, nextPragmaticCursorValue(currentSession.counter, 2, '3'))
  currentSession = { ...currentSession, index: nextIndex, counter: nextCounter, na: lastParsed.na }

  if (lastParsed.na === 'b' || lastParsed.fs || lastParsed.fs_opt || lastParsed.mo || lastParsed.rs_c || lastParsed.bgid) {
    bonusFlowDetected = true
  }

  // SSP-Flow: Wenn na=s und w>0, weitere doSpin-Schritte mit ++index/+=2 counter
  while (lastParsed.na === 's' && Number(lastParsed.w || 0) > 0) {
    const chained = await doSpin()
    lastSpinBody = chained?.spinBody || lastSpinBody
    lastData = chained.spinText
    lastParsed = chained.parsed
    nextIndex = nextPragmaticCursorValue(lastParsed.index, 1, nextPragmaticCursorValue(currentSession.index, 1, '2'))
    nextCounter = nextPragmaticCursorValue(lastParsed.counter, 2, nextPragmaticCursorValue(currentSession.counter, 2, '3'))
    currentSession = { ...currentSession, index: nextIndex, counter: nextCounter, na: lastParsed.na }
    if (lastParsed.na === 'b' || lastParsed.fs || lastParsed.fs_opt || lastParsed.mo || lastParsed.rs_c || lastParsed.bgid) {
      bonusFlowDetected = true
    }
    if (lastParsed.unlogged) {
      throw pragmaticError('Session ungültig. Bitte Session neu starten.')
    }
    if (lastParsed.noMoney || lastParsed.systemError || lastParsed.na === 'b') break
  }

  let settleGuard = 0
  while (settleGuard < 60) {
    settleGuard += 1
    if (lastParsed.unlogged) {
      throw pragmaticError('Session ungültig. Bitte Session neu starten.')
    }
    if (lastParsed.noMoney || lastParsed.systemError) break
    if (lastParsed.na === 'c') {
      hadCascade = true
      await doCollect()
      continue
    }
    if (lastParsed.na === 'cb') {
      bonusFlowDetected = true
      await doAction('doCollectBonus')
      continue
    }
    if (lastParsed.na === 'fso') {
      bonusFlowDetected = true
      const ind = pickFsOption(lastParsed.raw)
      await doAction('doFSOption', { ind })
      continue
    }
    if (lastParsed.na === 'b') {
      bonusFlowDetected = true
      const ind = pickBonusInd(lastParsed, currentSession, bonusDecisionMode)
      const seen = Array.isArray(currentSession._bonusSeenChoices) ? currentSession._bonusSeenChoices.slice(0, 24) : []
      const indNum = parseInt(String(ind), 10)
      if (Number.isFinite(indNum) && !seen.includes(indNum)) seen.push(indNum)
      currentSession = { ...currentSession, _bonusSeenChoices: seen }
      await doAction('doBonus', { ind })
      continue
    }
    break
  }

  if (settleGuard >= 60) {
    throw pragmaticError('Pragmatic settle-loop exceeded safety limit.')
  }

  if (lastParsed.noMoney) throw pragmaticError('Nicht genügend Guthaben.')
  if (lastParsed.systemError) throw pragmaticError('Systemfehler vom Spiel-Server.')

  // Gewinn: bei Cascade aus Balance-Delta (doCollect hat kein w), sonst aus w/tw
  const totalWin = hadCascade
    ? Math.max(0, (lastParsed.balance ?? 0) - (firstSpinBalance ?? 0))
    : (lastParsed.w ?? 0)

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

  if (bonusFlowDetected || lastParsed.fs || lastParsed.fs_opt || lastParsed.na === 'b') {
    responseForParser.freeRoundOffer = true
  }
  
  // LOGGING: Geparste Response loggen, um Fehler besser zu sehen
  logApiCall({ 
    type: 'pragmatic/bet', 
    endpoint: currentSession?.spinServiceUrl || currentSession?.gameServiceUrl || session.gameServiceUrl, 
    request: lastSpinBody || null, 
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
