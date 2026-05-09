import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { getEffectiveBetAmount } from '../../constants/bet'
import { parseNlcSpin } from '../../utils/nlcSpinParser'
import { normalizeProviderError } from './providerErrors'

const NLC_FS_URL = 'https://casino.nolimitcity.com/EjsFrontWeb/fs'
const NLC_WS_URL = 'wss://casino.nolimitcity.com/EjsGameWeb/ws/game?data='
const NLC_WS_PROTOCOL = '@nolimitcity/game-communication@0.3.0'
const NLC_WS_CLIENT_VERSION = '1.1.182'
const NLC_WS_TIMEOUT_MS = 10_000
const NLC_WS_MAX_CONTINUES = 240
const DEFAULT_CHIP_AMOUNTS = [1000, 5000, 25000, 100000, 500000, 1000000]
const DEFAULT_CURRENCY_MULT = 1000
const EVO_CLIENT_VERSION = '6.20250423.223717.51350-8d183b2fff'
const DEFAULT_EVO_ORIGIN = 'https://babylonstkn.evo-games.com'
const HEX = '0123456789abcdef'

function nolimitError(message, cause) {
  return normalizeProviderError('nolimit', cause || new Error(message), message)
}

function safePreview(value, max = 220) {
  const s = String(value ?? '')
  return s.length <= max ? s : `${s.slice(0, max)}...`
}

function collectUrlsDeep(value, out = [], depth = 0) {
  if (depth > 8 || value == null) return out
  if (typeof value === 'string') {
    const v = value.trim()
    if (/^https?:\/\//i.test(v)) out.push(v)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsDeep(item, out, depth + 1)
    return out
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collectUrlsDeep(v, out, depth + 1)
  }
  return out
}

function resolveNoLimitConfigUrl(sessionConfig, slotSlug) {
  if (!sessionConfig) {
    throw new Error(`Keine Nolimit-Config von Stake erhalten (${slotSlug || 'unknown-slot'}).`)
  }
  if (typeof sessionConfig === 'string') {
    const raw = sessionConfig.trim()
    if (/^https?:\/\//i.test(raw)) return raw
    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw)
        const urls = collectUrlsDeep(obj)
        if (urls.length > 0) return urls[0]
      } catch {
        // ignore malformed JSON, handled by fallback below
      }
    }
  }
  if (typeof sessionConfig === 'object') {
    const urls = collectUrlsDeep(sessionConfig)
    if (urls.length > 0) return urls[0]
  }
  // Last fallback: sometimes Stake can return the config indirectly as plain text chunks.
  const flat = String(sessionConfig)
  const match = flat.match(/https?:\/\/[^\s"']+/i)
  if (match?.[0]) return match[0]
  throw new Error(`Keine gueltige Nolimit-Session-Config fuer ${slotSlug || 'unknown-slot'} gefunden.`)
}

async function safeProxyRequest(options) {
  if (!window.electronAPI?.proxyRequest) {
    throw new Error('Electron API not available')
  }
  const { method = 'POST', headers = {}, body, url } = options
  const reqHeaders = { ...headers }
  if (method === 'POST' && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json'
  }
  const res = await window.electronAPI.proxyRequest({ url, method, headers: reqHeaders, body })
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    text: async () => res.data,
    json: async () => JSON.parse(res.data),
    headers: res.headers || {},
    url: res.finalUrl || url,
  }
}

function parseJsonSafe(text) {
  if (!text || typeof text !== 'string') return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function decodeEntryParams(url) {
  try {
    const u = new URL(url)
    const p = u.searchParams.get('params')
    if (!p) return null
    const txt = atob(p)
    const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean)
    const map = {}
    for (const line of lines) {
      const idx = line.indexOf('=')
      if (idx <= 0) continue
      map[line.slice(0, idx)] = line.slice(idx + 1)
    }
    return map
  } catch {
    return null
  }
}

function parseJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') return null
  const parts = jwt.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (b64.length % 4)) % 4
    const txt = atob(`${b64}${'='.repeat(padLen)}`)
    return JSON.parse(txt)
  } catch {
    return null
  }
}

function normalizePlayMode(value) {
  if (value == null) return null
  const v = String(value).trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower === 'real_money') return 'realMoney'
  if (lower === 'fun_mode' || lower === 'demo' || lower === 'fun') return 'funMode'
  return v
}

function parseLoaderInfo(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const u = new URL(url)
    const extraRaw = u.searchParams.get('extra')
    let extra = {}
    if (extraRaw) {
      try {
        extra = JSON.parse(extraRaw)
      } catch {
        try {
          extra = JSON.parse(decodeURIComponent(extraRaw))
        } catch {
          extra = {}
        }
      }
    }
    return {
      loaderUrl: url,
      origin: `${u.protocol}//${u.host}`,
      token: u.searchParams.get('token') || null,
      operator: u.searchParams.get('operator') || null,
      game: u.searchParams.get('game') || null,
      language: u.searchParams.get('language') || null,
      currencyCode: u.searchParams.get('currencyCode') || null,
      extra,
    }
  } catch {
    return null
  }
}

function getHeaderValue(headers, key) {
  if (!headers || typeof headers !== 'object') return null
  const wanted = String(key || '').toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() !== wanted) continue
    if (Array.isArray(v)) return v[0] ?? null
    return v ?? null
  }
  return null
}

function parseCookieJarValue(cookieJar, name) {
  const wanted = String(name || '').trim().toLowerCase()
  if (!wanted || !Array.isArray(cookieJar)) return null
  for (const entry of cookieJar) {
    const token = String(entry || '')
    const idx = token.indexOf('=')
    if (idx <= 0) continue
    const k = token.slice(0, idx).trim().toLowerCase()
    if (k !== wanted) continue
    return token.slice(idx + 1).trim() || null
  }
  return null
}

function parseTableIdFromFragment(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null
  const hashIndex = urlStr.indexOf('#')
  if (hashIndex < 0) return null
  const fragment = urlStr.slice(hashIndex + 1)
  const params = new URLSearchParams(fragment)
  return params.get('table_id') || null
}

function resolveEvoOrigin(loaderInfo, cookieJar) {
  const cdnCookie = parseCookieJarValue(cookieJar, 'cdn')
  if (cdnCookie && /^[a-z0-9-]+$/i.test(cdnCookie)) {
    return `https://${cdnCookie}.evo-games.com`
  }
  const origin = String(loaderInfo?.origin || '')
  if (origin && origin.includes('evo-games.com')) return origin
  return DEFAULT_EVO_ORIGIN
}

function buildFingerprint() {
  try {
    return btoa(Math.random().toString(36).slice(2))
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

async function performEvoBootstrap({ tableId, cookieJar, evoOrigin }) {
  if (!tableId) return null
  const fingerprint = buildFingerprint()
  const baseHeaders = {
    Accept: '*/*',
    ...buildCookieHeader(cookieJar),
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'x-fingerprint': fingerprint,
    priority: 'u=1, i',
    Referer: `${evoOrigin}/setup`,
  }

  let configData = null
  let setupData = null
  try {
    const configUrl = `${evoOrigin}/config?table_id=${encodeURIComponent(tableId)}&client_version=${encodeURIComponent(EVO_CLIENT_VERSION)}`
    const cfgRes = await safeProxyRequest({
      url: configUrl,
      method: 'GET',
      headers: baseHeaders,
    })
    const cfgText = await cfgRes.text()
    configData = parseJsonSafe(cfgText) || {}
  } catch {
    configData = null
  }

  try {
    const setupUrl = `${evoOrigin}/setup?device=desktop&wrapped=true&client_version=${encodeURIComponent(EVO_CLIENT_VERSION)}`
    const setupRes = await safeProxyRequest({
      url: setupUrl,
      method: 'GET',
      headers: baseHeaders,
    })
    const setupText = await setupRes.text()
    setupData = parseJsonSafe(setupText) || {}
  } catch {
    setupData = null
  }

  if (!configData && !setupData) return null
  return {
    tokenString: findByKeys(setupData, ['key']),
    clientString: findByKeys(setupData, ['casino_id', 'casinoId']),
    language: findByKeys(setupData, ['lang', 'language']),
    currencyCode: findByKeys(setupData, ['currencyCode', 'currency']),
    gameName: findByKeys(configData, ['game', 'math_id', 'mathId']),
    tableName: findByKeys(configData, ['tableName', 'table_name', 'name']),
    evoToken: findByKeys(configData, ['wrapper_token', 'wrapperToken']),
    licenseePlayerId: findByKeys(setupData, ['player_id', 'playerId']),
    externalPlayerId: findByKeys(setupData, ['user_id', 'userId']),
  }
}

async function resolveBestEvoBootstrap({ tableId, cookieJar, loaderInfo }) {
  const origins = [
    resolveEvoOrigin(loaderInfo, cookieJar),
    String(loaderInfo?.origin || ''),
    DEFAULT_EVO_ORIGIN,
  ]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)

  let best = null
  for (const origin of origins) {
    const boot = await performEvoBootstrap({ tableId, cookieJar, evoOrigin: origin })
    if (!boot) continue
    best = { ...(best || {}), ...boot }
    const hasCore = !!(best.tokenString && best.clientString && best.evoToken)
    if (hasCore) break
  }
  return best
}

function addSetCookies(headers, cookieJar) {
  if (!headers) return
  const setCookie = headers['set-cookie'] || headers['Set-Cookie']
  if (!setCookie) return
  const list = Array.isArray(setCookie) ? setCookie : [setCookie]
  for (const c of list) {
    const token = String(c).split(';')[0].trim()
    if (token) cookieJar.push(token)
  }
}

function buildCookieHeader(cookieJar) {
  return cookieJar.length ? { Cookie: [...new Set(cookieJar)].join('; ') } : {}
}

function uniqNumbers(arr) {
  return [...new Set((arr || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0))]
}

function parseChipAmounts(value) {
  if (!value) return []
  if (Array.isArray(value)) return uniqNumbers(value)
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? [Math.round(value)] : []
  if (typeof value !== 'string') return []
  return uniqNumbers(
    value
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  )
}

function findByKeys(obj, keys, depth = 0) {
  if (!obj || depth > 6) return null
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findByKeys(item, keys, depth + 1)
      if (found != null) return found
    }
    return null
  }
  if (typeof obj !== 'object') return null
  const lowerMap = Object.keys(obj).reduce((acc, k) => {
    acc[k.toLowerCase()] = obj[k]
    return acc
  }, {})
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()]
    if (v != null) return v
  }
  for (const v of Object.values(obj)) {
    const found = findByKeys(v, keys, depth + 1)
    if (found != null) return found
  }
  return null
}

function toMinorFromChip(chipAmount, currencyMult) {
  return Math.max(1, Math.round((Number(chipAmount) * 100) / Number(currencyMult || DEFAULT_CURRENCY_MULT)))
}

function toChipFromMinor(minorAmount, currencyMult) {
  return Math.max(1, Math.round((Number(minorAmount) / 100) * Number(currencyMult || DEFAULT_CURRENCY_MULT)))
}

function randomMessagePrefix() {
  return `${Math.random().toString(36).slice(2, 12)}-`
}

function stringToByteArray(value) {
  const encoded = encodeURIComponent(String(value || '')).split('')
  const out = []
  for (let i = 0; i < encoded.length; i += 1) {
    if (encoded[i] === '%') {
      out.push((HEX.indexOf(encoded[i + 1].toLowerCase()) << 4) | HEX.indexOf(encoded[i + 2].toLowerCase()))
      i += 2
    } else {
      out.push(encoded[i].charCodeAt(0))
    }
  }
  return out
}

function rc4Transform(keyBytes, dataBytes) {
  let i = 0
  let j = 0
  let swap = 0
  const s = []
  const out = []
  for (i = 0; i < 256; i += 1) s[i] = i
  for (i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i] + keyBytes[i % keyBytes.length]) % 256
    swap = s[i]
    s[i] = s[j]
    s[j] = swap
  }
  let x = 0
  let y = 0
  for (let n = 0; n < dataBytes.length; n += 1) {
    x = (x + 1) % 256
    y = (y + s[x]) % 256
    swap = s[x]
    s[x] = s[y]
    s[y] = swap
    out.push(dataBytes[n] ^ s[(s[x] + s[y]) % 256])
  }
  return out
}

function bytesToHex(bytes) {
  const out = []
  for (const b of bytes) {
    out.push(HEX.charAt((b >> 4) & 0xf))
    out.push(HEX.charAt(b & 0xf))
  }
  return out.join('')
}

function hexToBytes(value) {
  if (typeof value !== 'string') return []
  const out = []
  const chars = value.split('')
  for (let i = 0; i < chars.length; i += 2) {
    out.push((HEX.indexOf(chars[i]) << 4) | HEX.indexOf(chars[i + 1]))
  }
  return out
}

function encryptNolimitMessage(payload, sessionSecret) {
  try {
    if (!sessionSecret) return null
    const text = JSON.stringify(payload)
    return bytesToHex(rc4Transform(stringToByteArray(sessionSecret), stringToByteArray(text)))
  } catch {
    return null
  }
}

function bytesToDecodedString(bytes) {
  let pct = ''
  for (const b of bytes) {
    pct += `%${HEX.charAt((b >> 4) & 0xf)}${HEX.charAt(b & 0xf)}`
  }
  return decodeURIComponent(pct)
}

function lzwDecode(value) {
  if (!String(value || '').startsWith('lzw:')) return value
  const dict = {}
  const data = String(value).slice(4)
  let currChar = data.substr(0, 1)
  let oldPhrase = currChar
  const out = [currChar]
  let code = 256
  for (let i = 1; i < data.length; i += 1) {
    const currCode = data.charCodeAt(i)
    const phrase = currCode < 256 ? data.substr(i, 1) : (dict[currCode] ? dict[currCode] : (oldPhrase + currChar))
    out.push(phrase)
    currChar = phrase.substr(0, 1)
    dict[code] = oldPhrase + currChar
    code += 1
    oldPhrase = phrase
  }
  return out.join('')
}

function decryptNolimitMessage(rawMessage, sessionSecret) {
  try {
    if (!sessionSecret) return null
    const raw = String(rawMessage ?? '')
    if (raw.startsWith('lzw:')) {
      const decoded = lzwDecode(raw)
      try {
        return JSON.parse(decoded)
      } catch {
        return decoded
      }
    }
    const plain = bytesToDecodedString(rc4Transform(stringToByteArray(sessionSecret), hexToBytes(raw)))
    return JSON.parse(plain)
  } catch {
    return null
  }
}

function resolveNolimitWsUrl(wsSessionData) {
  const raw = String(wsSessionData || '').trim()
  if (!raw) return null
  if (/^wss?:\/\//i.test(raw)) return raw
  if (raw.includes('?data=')) return raw
  return `${NLC_WS_URL}${raw}`
}

function createNolimitWsState(sessionSecret) {
  return {
    socket: null,
    callbacks: new Map(),
    nextRequestId: 0,
    messagePrefix: randomMessagePrefix(),
    sessionSecret: String(sessionSecret || ''),
  }
}

async function connectNolimitWs(wsState, wsSessionData) {
  const url = resolveNolimitWsUrl(wsSessionData)
  if (!url) throw new Error('Nolimit WS URL fehlt.')
  if (wsState?.socket && wsState.socket.readyState === WebSocket.OPEN) return
  if (wsState?.socket && wsState.socket.readyState === WebSocket.CONNECTING) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Nolimit WS connect timeout.')), NLC_WS_TIMEOUT_MS)
      wsState.socket.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      wsState.socket.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('Nolimit WS connect failed.'))
      }, { once: true })
    })
    return
  }
  if (wsState?.socket) {
    try { wsState.socket.close() } catch {}
  }
  wsState.nextRequestId = 0
  wsState.callbacks.clear()
  wsState.messagePrefix = randomMessagePrefix()

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    wsState.socket = ws
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      reject(new Error('Nolimit WS open timeout.'))
    }, NLC_WS_TIMEOUT_MS)

    ws.onopen = () => {
      clearTimeout(timeout)
      resolve()
    }
    ws.onmessage = (event) => {
      const decoded = decryptNolimitMessage(event?.data, wsState.sessionSecret)
      const decodedId = String(decoded?.id || '')
      const reqId = decodedId.includes('-') ? decodedId.split('-').pop() : decodedId
      const cb = wsState.callbacks.get(String(reqId || '0'))
      if (cb) {
        cb(decoded)
        wsState.callbacks.delete(String(reqId || '0'))
      }
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Nolimit WS Fehler.'))
    }
    ws.onclose = () => {
      wsState.socket = null
    }
  })
}

function isNolimitWsOpen(wsState) {
  return !!(wsState?.socket && wsState.socket.readyState === WebSocket.OPEN)
}

async function sendNolimitWsRequest(wsState, sessionSecret, payload, timeoutMs = NLC_WS_TIMEOUT_MS) {
  if (!isNolimitWsOpen(wsState)) {
    throw new Error('Nolimit WS ist nicht verbunden.')
  }
  const requestId = String(wsState.nextRequestId++)
  const message = { ...payload, id: `${wsState.messagePrefix}${requestId}` }
  const encrypted = encryptNolimitMessage(message, sessionSecret)
  if (!encrypted) throw new Error('Nolimit WS Nachricht konnte nicht verschluesselt werden.')
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      wsState.callbacks.delete(requestId)
      reject(new Error('Nolimit WS request timeout.'))
    }, timeoutMs)

    wsState.callbacks.set(requestId, (response) => {
      clearTimeout(timeout)
      resolve(response)
    })

    try {
      wsState.socket.send(encrypted)
    } catch (err) {
      clearTimeout(timeout)
      wsState.callbacks.delete(requestId)
      reject(err)
    }
  })
}

function pickNolimitPayload(message) {
  if (!message || typeof message !== 'object') return null
  const contentData = message?.content?.data
  if (contentData && typeof contentData === 'object') return contentData
  if (message?.data && typeof message.data === 'object' && !Array.isArray(message.data)) return message.data
  return message
}

function shouldContinueNolimitSpin(parsed, payload) {
  if (!parsed) return false
  const mode = String(parsed?.mode || 'NORMAL').toUpperCase()
  const fsLeft = Number(parsed?.freespinsLeft || 0)
  const possibleActions = payload?.possibleActions || payload?.actions || payload?.availableActions
  if (Array.isArray(possibleActions) && possibleActions.length > 0) return true
  if (fsLeft > 0) return true
  return mode !== 'NORMAL'
}

function toProviderSpinResponse(rawPayload, session, winAmount, parsedData, status = 'complete') {
  return {
    statusCode: 0,
    accountBalance: { balance: null, currencyCode: (session.currencyCode || 'EUR').toUpperCase() },
    round: {
      status,
      roundId: findByKeys(rawPayload, ['roundId', 'round_id', 'round']) || null,
      events: [{ awa: Number(winAmount || 0) }],
      winAmountDisplay: Number(winAmount || 0),
      freespinsLeft: Number(parsedData?.freespinsLeft || 0),
      mode: parsedData?.mode || 'NORMAL',
      isBonus: !!parsedData?.isBonus,
    },
    _nolimitRaw: rawPayload,
  }
}

async function ensureNolimitWsReady(session) {
  const s = session?._internal
  if (!s) throw new Error('Nolimit Session ungueltig.')
  if (!s.wsState) s.wsState = createNolimitWsState(s.wsSessionData || s.extPlayerKey || s.tokenString)
  await connectNolimitWs(s.wsState, s.wsSessionData || s.extPlayerKey || s.tokenString)
  if (s.wsInitialized) return
  const initResponse = await sendNolimitWsRequest(s.wsState, s.wsSessionData || s.extPlayerKey || s.tokenString, {
    type: 'init',
    content: { type: 'init' },
    protocol: NLC_WS_PROTOCOL,
    id: 'messageId',
    gameClientVersion: NLC_WS_CLIENT_VERSION,
    data: {},
  })
  if (!initResponse) throw new Error('Nolimit WS init ohne Antwort.')
  s.wsInitialized = true
}

async function placeBetViaWs(session, chipAmount) {
  const s = session._internal
  await ensureNolimitWsReady(session)

  let currentResponse = await sendNolimitWsRequest(s.wsState, s.wsSessionData || s.extPlayerKey || s.tokenString, {
    type: 'normal',
    content: {
      type: 'normalBet',
      bet: String(chipAmount),
      playerInteraction: { actionSpin: true },
      data: { balanceId: 'combined' },
    },
    protocol: NLC_WS_PROTOCOL,
    id: 'messageId',
    data: { extPlayerKey: s.extPlayerKey },
  })
  let rawPayload = pickNolimitPayload(currentResponse)
  let parsed = parseNlcSpin(rawPayload || currentResponse)
  let winAmount = Number(parsed?.win || 0)
  let loops = 0

  while (shouldContinueNolimitSpin(parsed, rawPayload) && loops < NLC_WS_MAX_CONTINUES) {
    loops += 1
    currentResponse = await sendNolimitWsRequest(s.wsState, s.wsSessionData || s.extPlayerKey || s.tokenString, {
      type: 'normal',
      content: {
        type: 'continueBet',
        bet: '0.00',
        data: { balanceId: 'combined' },
      },
      protocol: NLC_WS_PROTOCOL,
      id: 'messageId',
      data: { extPlayerKey: s.extPlayerKey },
    })
    rawPayload = pickNolimitPayload(currentResponse)
    parsed = parseNlcSpin(rawPayload || currentResponse)
    winAmount = Number(parsed?.win || winAmount || 0)
  }

  if (loops >= NLC_WS_MAX_CONTINUES) {
    throw new Error(`Nolimit continue limit erreicht (${NLC_WS_MAX_CONTINUES}).`)
  }

  return {
    data: toProviderSpinResponse(rawPayload || currentResponse, session, winAmount, parsed, 'complete'),
    nextSeq: (session.seq || 0) + 1,
    session: { ...session, seq: (session.seq || 0) + 1, lastPlayAt: Date.now() },
    meta: { continueCount: loops, transport: 'ws' },
  }
}

function snapToNearest(amount, levels) {
  if (!levels?.length) return amount
  let best = levels[0]
  for (const level of levels) {
    if (Math.abs(level - amount) < Math.abs(best - amount)) best = level
  }
  return best
}

function extractError(data, fallbackText, status) {
  const msg =
    findByKeys(data, ['errorMessage', 'errormessage', 'error', 'message', 'reason']) ||
    (typeof fallbackText === 'string' ? fallbackText.trim() : '') ||
    `HTTP ${status}`
  return String(msg).slice(0, 500)
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const t0 = Date.now()
  let stage = 'start-third-party-session'
  let configUrl = ''
  const cookieJar = []
  try {
    const session = await startThirdPartySession(
      accessToken,
      slotSlug,
      (sourceCurrency || 'usdc').toLowerCase(),
      (targetCurrency || 'eur').toLowerCase()
    )
    stage = 'resolve-config-url'
    configUrl = resolveNoLimitConfigUrl(session?.config, slotSlug)

    stage = 'fetch-config'
    const firstRes = await safeProxyRequest({
      url: configUrl,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36',
      },
    })
    addSetCookies(firstRes.headers, cookieJar)

    const finalUrl = firstRes.url || configUrl
    const redirectLocation = String(getHeaderValue(firstRes.headers, 'location') || '')
    const loaderInfo = parseLoaderInfo(finalUrl) || {}
    const entryParams = decodeEntryParams(configUrl) || {}
    const entryJwt = parseJwtPayload(entryParams.jwsh) || {}
    const tableId =
      parseTableIdFromFragment(redirectLocation) ||
      parseTableIdFromFragment(finalUrl) ||
      loaderInfo?.extra?.table_id ||
      loaderInfo?.extra?.tableId ||
      entryJwt.tid ||
      entryParams.table_id ||
      null
    if (!tableId) throw new Error('Nolimit table_id fehlt.')

    stage = 'resolve-bootstrap-inputs'
    const evoOrigin = resolveEvoOrigin(loaderInfo, cookieJar)
    stage = 'evo-bootstrap'
    const evoBootstrap = await resolveBestEvoBootstrap({ tableId, cookieJar, loaderInfo })

    let tokenString = evoBootstrap?.tokenString || loaderInfo.token || entryJwt.sid || null
    let tokenSource = evoBootstrap?.tokenString ? 'evo.setup.key' : loaderInfo.token ? 'loader' : entryJwt.sid ? 'jwt.sid' : 'none'
    if (!tokenString) {
      try {
        tokenString = new URL(configUrl).searchParams.get('JSESSIONID')
        if (tokenString) tokenSource = 'entry.jsessionid'
      } catch {
        tokenString = null
      }
    }
    if (!tokenString) {
      throw new Error('Nolimit tokenString fehlt.')
    }

    const gameName = evoBootstrap?.gameName || loaderInfo.game || entryJwt.mid || entryParams.game || slotSlug.replace(/^nolimit-/, '')
    const language = String(evoBootstrap?.language || loaderInfo.language || entryParams.language || 'fr').slice(0, 2) || 'fr'
    const clientString = evoBootstrap?.clientString || loaderInfo.operator || entryParams.casino_id || entryJwt.cid || 'BABYLONSTK000002'
    const currencyCode = String(evoBootstrap?.currencyCode || entryJwt.cur || targetCurrency || loaderInfo.currencyCode || loaderInfo?.extra?.currency || 'eur').toUpperCase()
    const normalizedPlayMode = normalizePlayMode(loaderInfo?.extra?.playMode || entryParams.play_mode)
    const licenseePlayerId = evoBootstrap?.licenseePlayerId || loaderInfo?.extra?.licenseePlayerId || entryJwt.pid || tokenString.slice(0, 16)
    const externalPlayerId = evoBootstrap?.externalPlayerId || loaderInfo?.extra?.externalPlayerId || loaderInfo?.extra?.external_player_id || entryJwt.epid || null
    const tableName = evoBootstrap?.tableName || loaderInfo?.extra?.table_name || entryJwt.mid || gameName

    const jsonData = {
      ...(loaderInfo.extra || {}),
      currency: currencyCode,
      evo_token: evoBootstrap?.evoToken || loaderInfo?.extra?.evo_token || loaderInfo?.extra?.evoToken || entryParams.jwsh || null,
      table_id: tableId,
      table_name: tableName,
    }
    if (!jsonData.licenseePlayerId) jsonData.licenseePlayerId = licenseePlayerId
    if (!jsonData.externalPlayerId && externalPlayerId) jsonData.externalPlayerId = externalPlayerId
    if (!jsonData.playMode && normalizedPlayMode) jsonData.playMode = normalizedPlayMode
    if (jsonData.screenName == null) jsonData.screenName = ''
    if (jsonData.skipInitBalance == null) jsonData.skipInitBalance = 'true'
    if (!jsonData.playMode) jsonData.playMode = 'realMoney'
    if (!jsonData.evo_token) throw new Error('Nolimit evo_token fehlt.')

    const gameCodeString = `${gameName}@desktop`
    const origin = loaderInfo.origin || 'https://casino.nolimitcdn.com'
    const referer = loaderInfo.loaderUrl || `${origin}/loader/evo.html`
    stage = 'open-game'
    const openLangCandidates = [...new Set([language, 'fr', 'en', 'de'].filter(Boolean))]
    const entrySessionId = (() => {
      try {
        return new URL(configUrl).searchParams.get('JSESSIONID')
      } catch {
        return null
      }
    })()
    const openTokenCandidates = [...new Set([tokenString, loaderInfo.token, entryJwt.sid, entrySessionId].filter(Boolean))]
    const openClientCandidates = [...new Set([clientString, loaderInfo.operator, entryParams.casino_id, entryJwt.cid].filter(Boolean))]

    let openData = null
    let openText = ''
    let openOk = false
    let lastOpenErr = 'Unknown open_game error'
    let openAttempts = 0
    const maxOpenAttempts = 12
    for (const tokenCandidate of openTokenCandidates) {
      for (const clientCandidate of openClientCandidates) {
        for (const langCandidate of openLangCandidates) {
          if (openAttempts >= maxOpenAttempts) break
          openAttempts += 1
          const openPayload = new URLSearchParams({
            action: 'open_game',
            clientString: String(clientCandidate),
            language: String(langCandidate),
            gameCodeString,
            jsonData: JSON.stringify(jsonData),
            tokenString: String(tokenCandidate),
          }).toString()

          const openRes = await safeProxyRequest({
            url: NLC_FS_URL,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Accept: 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
              'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
              Origin: origin,
              Referer: referer,
              ...buildCookieHeader(cookieJar),
            },
            body: openPayload,
          })
          addSetCookies(openRes.headers, cookieJar)

          openText = await openRes.text()
          openData = parseJsonSafe(openText) || {}
          if (openRes.ok) {
            tokenString = String(tokenCandidate)
            openOk = true
            break
          }
          lastOpenErr = extractError(openData, openText, openRes.status)
        }
        if (openOk) break
        if (openAttempts >= maxOpenAttempts) break
      }
      if (openOk) break
      if (openAttempts >= maxOpenAttempts) break
    }
    if (!openOk) {
      throw new Error(`Nolimit open_game fehlgeschlagen: ${lastOpenErr}`)
    }

    const wsSessionData = String(findByKeys(openData, ['session', 'sessionKey']) || tokenString)
    const extPlayerKey = String(findByKeys(openData, ['extPlayerKey', 'key']) || wsSessionData)
    const currencyMultRaw = Number(findByKeys(openData, ['currencyMult', 'currencymult', 'currency_multiplier']))
    const currencyMult = Number.isFinite(currencyMultRaw) && currencyMultRaw > 0 ? currencyMultRaw : DEFAULT_CURRENCY_MULT

    const chipAmounts =
      parseChipAmounts(findByKeys(openData, ['chipAmounts', 'chipamounts', 'betLevels'])) ||
      []
    const betLevelsRaw = chipAmounts.length ? chipAmounts : DEFAULT_CHIP_AMOUNTS
    const betLevels = uniqNumbers(betLevelsRaw.map((v) => toMinorFromChip(v, currencyMult))).sort((a, b) => a - b)

    logApiCall({
      type: 'nolimit/init',
      endpoint: NLC_FS_URL,
      request: {
        slotSlug,
        gameCodeString,
        currencyCode,
        tableId,
        tokenSource,
      },
      response: {
        ok: true,
        wsSession: !!wsSessionData,
        extPlayerKey: !!extPlayerKey,
        currencyMult,
        betLevelsCount: betLevels.length,
        stage,
        openAttempts,
      },
      error: null,
      durationMs: Date.now() - t0,
    })

    return {
      sessionId: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      extPlayerKey,
      tableId,
      currencyCode,
      currencyMult,
      betLevels,
      betLevelsRaw,
      seq: 0,
      _internal: {
        cookieJar,
        tokenString,
        clientString,
        language,
        gameCodeString,
        tableId,
        extPlayerKey,
        wsSessionData,
        wsState: createNolimitWsState(wsSessionData || extPlayerKey || tokenString),
        wsInitialized: false,
        origin,
        referer,
      },
    }
  } catch (e) {
    logApiCall({
      type: 'nolimit/init',
      endpoint: NLC_FS_URL,
      request: { configUrl, slotSlug, stage },
      response: null,
      error: safePreview(e?.message || String(e)),
      durationMs: Date.now() - t0,
    })
    throw nolimitError(`NoLimit init failed at ${stage}: ${e?.message || e || 'unknown error'}`, e)
  }
}

export async function placeBet(session, betAmount, extraBet, _autoplay = false) {
  const t0 = Date.now()
  const s = session?._internal
  if (!s) throw nolimitError('Nolimit Session ungueltig.')

  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  let chipAmount = toChipFromMinor(effectiveBet, session.currencyMult || DEFAULT_CURRENCY_MULT)
  if (Array.isArray(session.betLevelsRaw) && session.betLevelsRaw.length > 0) {
    chipAmount = snapToNearest(chipAmount, session.betLevelsRaw)
  }

  try {
    const wsResult = await placeBetViaWs(session, chipAmount)
    const parsed = parseNlcSpin(wsResult?.data?._nolimitRaw)
    logApiCall({
      type: 'nolimit/spin',
      endpoint: NLC_WS_URL,
      request: { chipAmount, extraBet: !!extraBet, transport: 'ws' },
      response: { ok: true, winAmount: Number(parsed?.win || 0), continueCount: wsResult?.meta?.continueCount || 0 },
      error: null,
      durationMs: Date.now() - t0,
    })
    return wsResult
  } catch (wsError) {
    const wsMessage = wsError?.message || String(wsError)
    logApiCall({
      type: 'nolimit/spin',
      endpoint: NLC_WS_URL,
      request: { chipAmount, extraBet: !!extraBet, transport: 'ws' },
      response: null,
      error: wsMessage,
      durationMs: Date.now() - t0,
    })
    throw nolimitError(`Nolimit WS Spin fehlgeschlagen: ${safePreview(wsMessage, 260)}`, wsError)
  }
}

export async function sendKeepAlive(session) {
  const wsState = session?._internal?.wsState
  return { ok: true, connected: isNolimitWsOpen(wsState) }
}

export async function sendContinue(session) {
  const s = session?._internal
  if (!s) return { ok: true }
  await ensureNolimitWsReady(session)
  const response = await sendNolimitWsRequest(s.wsState, s.wsSessionData || s.extPlayerKey || s.tokenString, {
    type: 'normal',
    content: {
      type: 'continueBet',
      bet: '0.00',
      data: { balanceId: 'combined' },
    },
    protocol: NLC_WS_PROTOCOL,
    id: 'messageId',
    data: { extPlayerKey: s.extPlayerKey },
  })
  const payload = pickNolimitPayload(response) || response
  const parsed = parseNlcSpin(payload)
  return {
    ok: true,
    data: toProviderSpinResponse(
      payload,
      session,
      Number(parsed?.win || 0),
      parsed,
      shouldContinueNolimitSpin(parsed, payload) ? 'started' : 'complete'
    ),
    session: { ...session, seq: (session.seq || 0) + 1, lastPlayAt: Date.now() },
  }
}
