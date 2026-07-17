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
  const { method = 'POST', headers = {}, body, url, followRedirects, freshConnection } = options
  const reqHeaders = { ...headers }
  if (method === 'POST' && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json'
  }
  const proxyOpts = { url, method, headers: reqHeaders, body }
  if (followRedirects === false) proxyOpts.followRedirects = false
  if (freshConnection) proxyOpts.freshConnection = true
  const res = await window.electronAPI.proxyRequest(proxyOpts)
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

function decodeEntryParams(url) {
  try {
    const u = new URL(url)
    const p = u.searchParams.get('params')
    if (!p) return null
    let b64 = decodeURIComponent(p).replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - (b64.length % 4)) % 4
    b64 += '='.repeat(pad)
    const txt = atob(b64)
    const lines = txt.split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean)
    const map = {}
    for (const line of lines) {
      const idx = line.indexOf('=')
      if (idx <= 0) continue
      map[line.slice(0, idx)] = line.slice(idx + 1)
    }
    for (const key of ['EVOSESSIONID', 'JSESSIONID', 'jwsh', 'table_id', 'cdn', 'lang', 'locale']) {
      if (map[key]) continue
      const m = txt.match(new RegExp(`${key}=([^\\s\\n\\r]+)`))
      if (m?.[1]) map[key] = m[1]
    }
    return map
  } catch {
    return null
  }
}

function extractSessionIdFromText(text) {
  const raw = String(text || '')
  if (!raw) return null
  for (const key of ['EVOSESSIONID', 'JSESSIONID']) {
    const m = raw.match(new RegExp(`${key}=([A-Za-z0-9._-]+)`))
    if (m?.[1]) return m[1]
  }
  return null
}

function extractSessionIdFromConfigUrl(configUrl) {
  const direct = extractSessionIdFromText(configUrl)
  if (direct) return direct
  const entryParams = decodeEntryParams(configUrl) || {}
  const entryJwt = parseJwtPayload(entryParams.jwsh) || {}
  return (
    entryParams.EVOSESSIONID ||
    entryParams.JSESSIONID ||
    entryJwt.sid ||
    entryJwt.sessionId ||
    null
  )
}

function parseJwtPayload(jwt) {
  if (!jwt || typeof jwt !== 'string') return null
  const parts = jwt.split('.')
  if (parts.length < 2) return null
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - (b64.length % 4)) % 4
    b64 += '='.repeat(pad)
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

function resolveRedirectUrl(location, baseUrl) {
  const loc = String(location || '').trim()
  if (!loc) return ''
  try {
    return loc.startsWith('http') ? loc : new URL(loc, baseUrl).href
  } catch {
    return loc
  }
}

function parseTableIdFromUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null
  const fromFragment = parseTableIdFromFragment(urlStr)
  if (fromFragment) return fromFragment
  const hashMatch = urlStr.match(/[#&?]table_id=([^&#]+)/i)
  if (hashMatch?.[1]) {
    try {
      return decodeURIComponent(hashMatch[1])
    } catch {
      return hashMatch[1]
    }
  }
  try {
    return new URL(urlStr).searchParams.get('table_id')
  } catch {
    return null
  }
}

function resolveNolimitTableId({ configUrl, redirectLocation, finalUrl, responseBody }) {
  const entryParams = decodeEntryParams(configUrl) || {}
  const entryJwt = parseJwtPayload(entryParams.jwsh) || {}
  const candidates = [
    redirectLocation,
    finalUrl,
    configUrl,
    String(responseBody || ''),
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    const resolved = candidate.startsWith('http') ? candidate : resolveRedirectUrl(candidate, configUrl)
    const fromUrl = parseTableIdFromUrl(resolved || candidate)
    if (fromUrl) return fromUrl
  }

  return (
    entryParams.table_id ||
    entryParams.tableId ||
    entryJwt.tid ||
    entryJwt.table_id ||
    entryJwt.tableId ||
    null
  )
}

/** SSP performGetRequestFresh: one GET, no redirects, fresh connection. */
async function performGetRequestFresh(url) {
  return safeProxyRequest({
    url,
    method: 'GET',
    followRedirects: false,
    freshConnection: true,
    headers: {
      Accept: '*/*',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  })
}

/** All Set-Cookie header values (Node sends an array; never use getHeaderValue — it keeps only [0]). */
function readSetCookieRaw(headers) {
  if (!headers || typeof headers !== 'object') return []
  const raw = headers['set-cookie'] ?? headers['Set-Cookie']
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((v) => String(v))
  return [String(raw)]
}

/** Parse Set-Cookie like SSP (array or comma-separated string). */
function parseSetCookiesSsp(headers) {
  const entries = []
  const pushCookie = (chunk) => {
    const token = String(chunk || '').trim().split(';')[0]
    const eq = token.indexOf('=')
    if (eq <= 0) return
    entries.push({ name: token.slice(0, eq).trim(), value: token.slice(eq + 1).trim() })
  }
  for (const line of readSetCookieRaw(headers)) {
    if (!line.includes(',')) {
      pushCookie(line)
      continue
    }
    for (const part of line.split(/,(?=\s*[A-Za-z_][A-Za-z0-9_-]*=)/)) {
      pushCookie(part)
    }
  }
  return entries
}

function findCookieValue(cookies, name) {
  const wanted = String(name || '').trim().toLowerCase()
  return cookies.find((c) => String(c.name || '').toLowerCase() === wanted)?.value || null
}

function extractCookieValueFromHeaders(headers, cookieName) {
  const wanted = String(cookieName || '').trim()
  const headRe = new RegExp(`^${wanted}=([^;]+)$`, 'i')
  for (const line of readSetCookieRaw(headers)) {
    const head = String(line).trim().split(';')[0].trim()
    const m = head.match(headRe)
    const value = m?.[1]?.trim().replace(/^"|"$/g, '') || ''
    if (value) return value
  }
  return null
}


function resolveEvoCookieString({ headers, configUrl, requireSetCookie = false }) {
  const parsed = parseSetCookiesSsp(headers)
  const hasSetCookie = readSetCookieRaw(headers).length > 0
  let evoSessionId =
    extractCookieValueFromHeaders(headers, 'EVOSESSIONID') ||
    findCookieValue(parsed, 'EVOSESSIONID') ||
    null
  if (!evoSessionId && !requireSetCookie) {
    evoSessionId = extractSessionIdFromConfigUrl(configUrl)
  }
  if (!evoSessionId) return null

  const entryParams = decodeEntryParams(configUrl) || {}
  const entryJwt = parseJwtPayload(entryParams.jwsh) || {}
  const cdn =
    findCookieValue(parsed, 'cdn') ||
    entryParams.cdn ||
    entryJwt.cdn ||
    (() => {
      try {
        return new URL(configUrl).hostname.split('.')[0] || 'babylonstkn'
      } catch {
        return 'babylonstkn'
      }
    })()
  const lang = findCookieValue(parsed, 'lang') || entryParams.lang || entryJwt.lang || 'fr'
  const locale = findCookieValue(parsed, 'locale') || entryParams.locale || entryJwt.locale || 'en'

  return [
    `EVOSESSIONID=${evoSessionId}`,
    `cdn=${cdn}`,
    `lang=${lang}`,
    `locale=${locale}`,
  ].join('; ')
}

function parseTableIdFromFragment(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null
  const hashIndex = urlStr.indexOf('#')
  if (hashIndex < 0) return null
  const fragment = urlStr.slice(hashIndex + 1)
  const params = new URLSearchParams(fragment)
  return params.get('table_id') || null
}

function buildFingerprint() {
  try {
    return btoa(Math.random().toString(36).slice(2))
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

function buildEvoBootstrapHeaders(cookieStr, evoOrigin = DEFAULT_EVO_ORIGIN, fingerprint = null) {
  const fp = fingerprint || buildFingerprint()
  return {
    Accept: '*/*',
    Cookie: cookieStr,
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'x-fingerprint': fp,
    priority: 'u=1, i',
    Referer: `${evoOrigin}/frontend/evo/r2/`,
  }
}

function addSetCookies(headers, cookieJar) {
  if (!headers) return
  for (const line of readSetCookieRaw(headers)) {
    const token = String(line).split(';')[0].trim()
    if (token) cookieJar.push(token)
  }
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

function resolveOpenGameWsCredentials(openData) {
  const payload =
    openData?.data && typeof openData.data === 'object' && !Array.isArray(openData.data)
      ? openData.data
      : openData
  const wsKey = String(payload?.key || findByKeys(openData, ['key']) || '').trim()
  const extPlayerKey = String(payload?.extPlayerKey || findByKeys(openData, ['extPlayerKey']) || '').trim()
  if (!wsKey) {
    throw new Error('Nolimit open_game: data.key fehlt (WS-Session).')
  }
  return {
    wsSessionData: wsKey,
    extPlayerKey: extPlayerKey || wsKey,
  }
}

function randomMessagePrefix() {
  return `${Math.random().toString(36).slice(2, 12)}-`
}

function resolveWsCallbackId(decodedId) {
  const id = String(decodedId || '')
  if (!id) return '0'
  if (!id.includes('-')) return id
  return id.split('-')[1] || id.split('-').pop() || '0'
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
    wsState.sessionSecret = String(wsState.sessionSecret || wsSessionData || '')
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      fn(value)
    }
    const timeout = setTimeout(() => {
      try { ws.close() } catch {}
      finish(reject, new Error('Nolimit WS open timeout.'))
    }, NLC_WS_TIMEOUT_MS)

    ws.onopen = () => {
      finish(resolve)
    }
    ws.onmessage = (event) => {
      const raw = String(event?.data ?? '')
      let decoded = decryptNolimitMessage(raw, wsState.sessionSecret)
      if (!decoded) {
        try {
          decoded = JSON.parse(raw)
        } catch {
          decoded = null
        }
      }
      if (!decoded) {
        const cb0 = wsState.callbacks.get('0')
        if (cb0) {
          cb0(null)
          wsState.callbacks.delete('0')
        }
        return
      }
      const reqId = resolveWsCallbackId(decoded?.id)
      const cb = wsState.callbacks.get(String(reqId || '0'))
      if (cb) {
        cb(decoded)
        wsState.callbacks.delete(String(reqId || '0'))
      }
    }
    ws.onerror = () => {
      finish(reject, new Error('Nolimit WS Fehler.'))
    }
    ws.onclose = (event) => {
      wsState.socket = null
      if (settled) return
      const code = event?.code ?? '?'
      const reason = String(event?.reason || '').trim()
      const detail = reason ? `${code}: ${reason}` : String(code)
      finish(reject, new Error(`Nolimit WS geschlossen (${detail}).`))
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
  const nextMode = String(parsed?.nextMode || parsed?.mode || 'NORMAL').toUpperCase()
  if (nextMode && nextMode !== 'NORMAL') return true
  const fsLeft = Number(parsed?.freespinsLeft || 0)
  const possibleActions = payload?.possibleActions || payload?.actions || payload?.availableActions
  if (Array.isArray(possibleActions) && possibleActions.length > 0) return true
  if (fsLeft > 0) return true
  return false
}

function shouldGamble(parsed, gambleSettings, chipAmount) {
  if (!gambleSettings?.enableNolimitGamble) return false
  const nextMode = String(parsed?.nextMode || '').toUpperCase()
  if (nextMode !== 'EXTRA_SPIN') return false

  const accumulatedRoundWin = Number(parsed?.accumulatedRoundWin || 0)
  const extraSpinCost = Number(parsed?.extraSpinCost || 0)
  const mode = String(parsed?.mode || '').toUpperCase()
  const isFreeSpinMode = mode === 'FREESPIN' || mode === 'FREESPIN_RESPIN'

  if (isFreeSpinMode && !gambleSettings.allowGambleInFreeSpins) return false
  if (!isFreeSpinMode && gambleSettings.allowGambleInBaseGame === false) return false

  if (gambleSettings.maxMultiToGamble != null && chipAmount != null && chipAmount > 0) {
    const multi = accumulatedRoundWin / chipAmount
    if (multi > gambleSettings.maxMultiToGamble) return false
  }
  if (gambleSettings.maxWinToGamble != null && accumulatedRoundWin > gambleSettings.maxWinToGamble) return false
  if (gambleSettings.stopAtWin != null && accumulatedRoundWin >= gambleSettings.stopAtWin) return false
  if (gambleSettings.stopAtMulti != null && chipAmount != null && chipAmount > 0) {
    const multi = accumulatedRoundWin / chipAmount
    if (multi >= gambleSettings.stopAtMulti) return false
  }
  if (gambleSettings.maxRiskPerExtraSpin != null && extraSpinCost > gambleSettings.maxRiskPerExtraSpin) return false
  return true
}

async function sendInitialNolimitBet(wsState, sessionSecret, extPlayerKey, chipAmount, featureName) {
  const payload = featureName
    ? {
        type: 'featureBet',
        content: {
          type: 'featureBet',
          bet: String(chipAmount),
          featureName,
          playerInteraction: { featureName },
          data: { balanceId: 'combined' },
        },
        protocol: NLC_WS_PROTOCOL,
        id: 'messageId',
        data: { extPlayerKey },
      }
    : {
        type: 'normal',
        content: {
          type: 'normalBet',
          bet: String(chipAmount),
          playerInteraction: { actionSpin: true },
          data: { balanceId: 'combined' },
        },
        protocol: NLC_WS_PROTOCOL,
        id: 'messageId',
        data: { extPlayerKey },
      }
  return sendNolimitWsRequest(wsState, sessionSecret, payload)
}

async function continueNolimitBet(wsState, sessionSecret, extPlayerKey) {
  return sendNolimitWsRequest(wsState, sessionSecret, {
    type: 'normal',
    content: {
      type: 'zeroBet',
      bet: '0.00',
      data: { balanceId: 'combined' },
    },
    protocol: NLC_WS_PROTOCOL,
    id: 'messageId',
    data: { extPlayerKey },
  })
}

async function acceptExtraSpin(wsState, sessionSecret, extPlayerKey) {
  return sendNolimitWsRequest(wsState, sessionSecret, {
    type: 'normal',
    content: {
      type: 'zeroBet',
      bet: '0.00',
      playerInteraction: { playExtraSpin: 'true' },
      data: { balanceId: 'combined' },
    },
    protocol: NLC_WS_PROTOCOL,
    id: `${randomMessagePrefix()}${Date.now()}`,
    data: { extPlayerKey },
  })
}

function isFreespinTriggered(parsed) {
  return parsed?.freespinTriggeredThisSpin === true || parsed?.nextMode === 'FREESPIN'
}

async function handleSpin(session, chipAmount, options = {}) {
  const s = session._internal
  await ensureNolimitWsReady(session)

  const stopOnBonus = !!(options.stopOnBonus ?? options.skipContinueOnBonus)
  const featureName = options.featureName || options.bonusGame || null
  const gambleSettings = options.nolimitGambleSettings || null
  const sessionSecret = s.wsSessionData || s.extPlayerKey || s.tokenString

  let currentResponse = await sendInitialNolimitBet(s.wsState, sessionSecret, s.extPlayerKey, chipAmount, featureName)
  let rawPayload = pickNolimitPayload(currentResponse)
  let parsed = parseNlcSpin(rawPayload || currentResponse)

  const freespinTriggered = isFreespinTriggered(parsed)
  let payout = Number(parsed?.accumulatedRoundWin || parsed?.win || 0)
  let gambled = false
  let loops = 0
  let sawFreeSpin = freespinTriggered

  if (freespinTriggered && stopOnBonus) {
    return { rawPayload, parsed, payout, gambled, bonusName: 'FREE_GAME', loops }
  }

  while (parsed?.nextMode && parsed.nextMode !== 'NORMAL' && loops < NLC_WS_MAX_CONTINUES) {
    loops += 1
    if (parsed.nextMode === 'EXTRA_SPIN') {
      if (shouldGamble(parsed, gambleSettings, chipAmount)) {
        currentResponse = await acceptExtraSpin(s.wsState, sessionSecret, s.extPlayerKey)
        rawPayload = pickNolimitPayload(currentResponse)
        parsed = parseNlcSpin(rawPayload || currentResponse)
        payout = Number(parsed?.accumulatedRoundWin || payout)
        gambled = true
        if (parsed?.nextMode === 'FREESPIN') {
          sawFreeSpin = true
          if (stopOnBonus) {
            return { rawPayload, parsed, payout, gambled, bonusName: 'FREE_GAME', loops }
          }
        }
      } else {
        currentResponse = await continueNolimitBet(s.wsState, sessionSecret, s.extPlayerKey)
        rawPayload = pickNolimitPayload(currentResponse)
        parsed = parseNlcSpin(rawPayload || currentResponse)
        payout = Number(parsed?.accumulatedRoundWin || payout)
        break
      }
    } else {
      currentResponse = await continueNolimitBet(s.wsState, sessionSecret, s.extPlayerKey)
      rawPayload = pickNolimitPayload(currentResponse)
      parsed = parseNlcSpin(rawPayload || currentResponse)
      payout = Number(parsed?.accumulatedRoundWin || payout)
      if (parsed?.nextMode === 'FREESPIN') {
        sawFreeSpin = true
        if (stopOnBonus) {
          return { rawPayload, parsed, payout, gambled, bonusName: 'FREE_GAME', loops }
        }
      }
    }
  }

  if (loops >= NLC_WS_MAX_CONTINUES) {
    throw new Error(`Nolimit continue limit erreicht (${NLC_WS_MAX_CONTINUES}).`)
  }

  return {
    rawPayload,
    parsed,
    payout,
    gambled,
    bonusName: sawFreeSpin ? 'FREE_GAME' : null,
    loops,
  }
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
      mode: parsedData?.nextMode || parsedData?.mode || 'NORMAL',
      nextMode: parsedData?.nextMode || null,
      accumulatedRoundWin: Number(parsedData?.accumulatedRoundWin || winAmount || 0),
      freespinTriggeredThisSpin: !!parsedData?.freespinTriggeredThisSpin,
      isBonus: !!parsedData?.isBonus,
    },
    _nolimitRaw: rawPayload,
  }
}

async function ensureNolimitWsReady(session) {
  const s = session?._internal
  if (!s) throw new Error('Nolimit Session ungueltig.')
  const wsSecret = s.wsSessionData || s.extPlayerKey || s.tokenString
  if (!s.wsState) s.wsState = createNolimitWsState(wsSecret)
  else s.wsState.sessionSecret = String(wsSecret || s.wsState.sessionSecret || '')
  await connectNolimitWs(s.wsState, wsSecret)
  if (s.wsInitialized) return
  const initResponse = await sendNolimitWsRequest(s.wsState, wsSecret, {
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

async function placeBetViaWs(session, chipAmount, options = {}) {
  const spinResult = await handleSpin(session, chipAmount, options)
  const { rawPayload, parsed, payout, gambled, bonusName, loops } = spinResult
  const status = shouldContinueNolimitSpin(parsed, rawPayload) ? 'started' : 'complete'

  return {
    data: toProviderSpinResponse(rawPayload, session, payout, parsed, status),
    nextSeq: (session.seq || 0) + 1,
    session: { ...session, seq: (session.seq || 0) + 1, lastPlayAt: Date.now() },
    meta: { continueCount: loops, transport: 'ws', gambled, bonusName },
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

function isProbablyBinaryText(text) {
  if (!text || typeof text !== 'string') return false
  let weird = 0
  for (let i = 0; i < Math.min(text.length, 240); i++) {
    const c = text.charCodeAt(i)
    if (c < 9 || (c > 13 && c < 32)) weird++
  }
  return weird > 12
}

function extractError(data, fallbackText, status) {
  let fb = typeof fallbackText === 'string' ? fallbackText.trim() : ''
  if (isProbablyBinaryText(fb)) fb = `HTTP ${status} (compressed/binary response)`
  const msg =
    findByKeys(data, ['errorMessage', 'errormessage', 'error', 'message', 'reason']) ||
    fb ||
    `HTTP ${status}`
  return String(msg).slice(0, 500)
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const t0 = Date.now()
  let stage = 'start-third-party-session'
  let configUrl = ''
  let cookieJar = []
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
    let tableId = null
    let cookieStr = null
    let evoOrigin = DEFAULT_EVO_ORIGIN
    let evoFingerprint = buildFingerprint()

    const evoEntry = await window.electronAPI?.nolimitEvoEntry?.(configUrl)
    if (evoEntry?.ok && evoEntry.cookieString) {
      tableId =
        evoEntry.tableId ||
        resolveNolimitTableId({
          configUrl,
          redirectLocation: evoEntry.location || '',
          finalUrl: evoEntry.location || configUrl,
        })
      cookieStr = evoEntry.cookieString
      evoOrigin = evoEntry.evoOrigin || DEFAULT_EVO_ORIGIN
      evoFingerprint = evoEntry.fingerprint || evoFingerprint
    } else {
      const redirectRes = await performGetRequestFresh(configUrl)
      const redirectLocation = resolveRedirectUrl(
        getHeaderValue(redirectRes.headers, 'location') || redirectRes.url || '',
        configUrl
      )
      if (!redirectLocation) {
        throw new Error(`Nolimit redirect location fehlt (status=${redirectRes.status}).`)
      }
      const responseBody = await redirectRes.text().catch(() => '')
      tableId = resolveNolimitTableId({
        configUrl,
        redirectLocation,
        finalUrl: redirectRes.url || redirectLocation,
        responseBody,
      })
      cookieStr = resolveEvoCookieString({ headers: redirectRes.headers, configUrl, requireSetCookie: true })
      if (!cookieStr) {
        throw new Error(
          evoEntry?.error ||
            `Nolimit EVOSESSIONID fehlt — status=${redirectRes.status}, main=${evoEntry?.status ?? 'n/a'}`
        )
      }
    }

    if (!tableId) throw new Error('Nolimit table_id fehlt.')
    if (!cookieStr) throw new Error(evoEntry?.error || 'Nolimit EVOSESSIONID fehlt.')
    cookieJar = cookieStr.split('; ').filter(Boolean)

    stage = 'evo-config'
    const evoHeaders = buildEvoBootstrapHeaders(cookieStr, evoOrigin, evoFingerprint)
    const evoConfigUrl = `${evoOrigin}/config?table_id=${encodeURIComponent(tableId)}&client_version=${encodeURIComponent(EVO_CLIENT_VERSION)}`
    const configRes = await safeProxyRequest({
      url: evoConfigUrl,
      method: 'GET',
      headers: evoHeaders,
    })
    const configText = await configRes.text()
    const configData = parseJsonSafe(configText)
    if (!configRes.ok || !configData) {
      throw new Error(extractError(configData, configText, configRes.status))
    }

    const tableName = configData.tableName
    const evoToken = configData.wrapper_token
    const mathId = configData.math_id
    if (!tableName || !evoToken || !mathId) {
      throw new Error('Nolimit /config Antwort unvollstaendig (tableName, wrapper_token, math_id).')
    }

    stage = 'evo-setup'
    const evoSetupUrl = `${evoOrigin}/setup?device=desktop&wrapped=true&client_version=${encodeURIComponent(EVO_CLIENT_VERSION)}`
    const setupRes = await safeProxyRequest({
      url: evoSetupUrl,
      method: 'GET',
      headers: evoHeaders,
    })
    const setupText = await setupRes.text()
    const setupData = parseJsonSafe(setupText)
    if (!setupRes.ok || !setupData) {
      throw new Error(extractError(setupData, setupText, setupRes.status))
    }

    const licenseePlayerId = setupData.user_id
    const externalPlayerId = setupData.player_id
    const clientString = setupData.casino_id
    const tokenString = setupData.bare_session_id
    const currencyCode = String(setupData.currencyCode || targetCurrency || 'eur').toUpperCase()
    if (!licenseePlayerId || !externalPlayerId || !clientString || !tokenString) {
      throw new Error('Nolimit /setup Antwort unvollstaendig (user_id, player_id, casino_id, bare_session_id).')
    }

    const gameCodeString = `${mathId}@desktop`
    const jsonData = {
      licenseePlayerId,
      currency: currencyCode,
      evo_token: evoToken,
      table_id: tableId,
      table_name: tableName,
      screenName: '',
      externalPlayerId,
      playMode: 'realMoney',
      skipInitBalance: 'true',
    }

    stage = 'open-game'
    const openPayload = new URLSearchParams({
      action: 'open_game',
      clientString: String(clientString),
      language: 'fr',
      gameCodeString,
      jsonData: JSON.stringify(jsonData),
      tokenString: String(tokenString),
    }).toString()

    const openRes = await safeProxyRequest({
      url: NLC_FS_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
      },
      body: openPayload,
    })
    const openText = await openRes.text()
    const openData = parseJsonSafe(openText) || {}
    if (!openRes.ok) {
      throw new Error(extractError(openData, openText, openRes.status))
    }
    addSetCookies(openRes.headers, cookieJar)

    const { wsSessionData, extPlayerKey } = resolveOpenGameWsCredentials(openData)
    const tokenSource = 'open_game.data.key'
    const currencyMultRaw = Number(findByKeys(openData, ['currencyMult', 'currencymult', 'currency_multiplier']))
    const currencyMult = Number.isFinite(currencyMultRaw) && currencyMultRaw > 0 ? currencyMultRaw : DEFAULT_CURRENCY_MULT

    const wsState = createNolimitWsState(wsSessionData)
    let initBetLevelsRaw = []
    let bonusGames = []
    let initSymbol = null
    let wsInitialized = false
    stage = 'ws-init'
    try {
      await connectNolimitWs(wsState, wsSessionData)
      await new Promise((r) => setTimeout(r, 500))
      const initResponse = await sendNolimitWsRequest(wsState, wsSessionData, {
        type: 'init',
        content: { type: 'init' },
        protocol: NLC_WS_PROTOCOL,
        id: 'messageId',
        gameClientVersion: NLC_WS_CLIENT_VERSION,
        data: {},
      })
      if (!initResponse) throw new Error('Nolimit WS init ohne Antwort.')
      wsInitialized = true
      const initPayload = pickNolimitPayload(initResponse) || initResponse
      initSymbol = initPayload?.symbol || findByKeys(initPayload, ['symbol']) || null
      const combined = initPayload?.betLevels?.combined
      if (Array.isArray(combined) && combined.length > 0) {
        initBetLevelsRaw = combined.map((v) => parseFloat(v)).filter((v) => Number.isFinite(v) && v > 0)
      }
      const buyGames = initPayload?.featureBuyTimesBetValue?.bonusGames
      if (Array.isArray(buyGames)) {
        bonusGames = buyGames.map((g) => ({
          id: g?.name,
          label: `${g?.name || 'bonus'} (x${g?.price ?? '?'})`,
        }))
      }
    } catch (initErr) {
      throw new Error(`Nolimit WS init fehlgeschlagen: ${initErr?.message || initErr}`)
    }

    if (!wsInitialized || initBetLevelsRaw.length === 0) {
      throw new Error('Nolimit WS init lieferte keine betLevels — Session unvollstaendig.')
    }

    const chipAmounts = initBetLevelsRaw
    const betLevelsRaw = chipAmounts
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
        wsKeyLen: wsSessionData?.length || 0,
        extPlayerKey: !!extPlayerKey,
        extPlayerKeyLen: extPlayerKey?.length || 0,
        currencyMult,
        betLevelsCount: betLevels.length,
        bonusGamesCount: bonusGames.length,
        initSymbol,
        stage,
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
      bonusGames,
      symbol: initSymbol,
      seq: 0,
      _internal: {
        cookieJar,
        tokenString,
        clientString,
        language: 'fr',
        gameCodeString,
        tableId,
        extPlayerKey,
        wsSessionData,
        wsState,
        wsInitialized,
        origin: evoOrigin,
        referer: `${evoOrigin}/frontend/evo/r2/`,
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

export async function placeBet(session, betAmount, extraBet, _autoplay = false, options = {}) {
  const t0 = Date.now()
  const s = session?._internal
  if (!s) throw nolimitError('Nolimit Session ungueltig.')

  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  let chipAmount = toChipFromMinor(effectiveBet, session.currencyMult || DEFAULT_CURRENCY_MULT)
  if (Array.isArray(session.betLevelsRaw) && session.betLevelsRaw.length > 0) {
    chipAmount = snapToNearest(chipAmount, session.betLevelsRaw)
  }

  const placeBetOptions = { ...options }

  try {
    const wsResult = await placeBetViaWs(session, chipAmount, placeBetOptions)
    const parsed = parseNlcSpin(wsResult?.data?._nolimitRaw)
    logApiCall({
      type: 'nolimit/spin',
      endpoint: NLC_WS_URL,
      request: { chipAmount, extraBet: !!extraBet, transport: 'ws', stopOnBonus: !!(options.stopOnBonus ?? options.skipContinueOnBonus) },
      response: {
        ok: true,
        winAmount: Number(parsed?.accumulatedRoundWin || parsed?.win || 0),
        continueCount: wsResult?.meta?.continueCount || 0,
        gambled: !!wsResult?.meta?.gambled,
        bonusName: wsResult?.meta?.bonusName || null,
      },
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
  const response = await continueNolimitBet(s.wsState, s.wsSessionData || s.extPlayerKey || s.tokenString, s.extPlayerKey)
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

export { handleSpin }
