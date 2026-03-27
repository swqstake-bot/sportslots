import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { getEffectiveBetAmount } from '../../constants/bet'
import { parseNlcSpin } from '../../utils/nlcSpinParser'

const NLC_FS_URL = 'https://casino.nolimitcity.com/EjsFrontWeb/fs'
const DEFAULT_CHIP_AMOUNTS = [1000, 5000, 25000, 100000, 500000, 1000000]
const DEFAULT_CURRENCY_MULT = 1000

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
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    (sourceCurrency || 'usdc').toLowerCase(),
    (targetCurrency || 'eur').toLowerCase()
  )
  const configUrl = typeof session?.config === 'string' ? session.config : session?.config?.url
  if (!configUrl || !configUrl.includes('evo-games.com/entry')) {
    throw new Error('Keine gueltige Nolimit-Session (config URL fehlt).')
  }

  const cookieJar = []
  try {
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
    const loaderInfo = parseLoaderInfo(finalUrl) || {}
    const entryParams = decodeEntryParams(configUrl) || {}
    const entryJwt = parseJwtPayload(entryParams.jwsh) || {}

    let tokenString = loaderInfo.token || entryJwt.sid || null
    let tokenSource = loaderInfo.token ? 'loader' : entryJwt.sid ? 'jwt.sid' : 'none'
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

    const tableId =
      loaderInfo?.extra?.table_id ||
      loaderInfo?.extra?.tableId ||
      entryJwt.tid ||
      entryParams.table_id ||
      null
    if (!tableId) throw new Error('Nolimit table_id fehlt.')

    const gameName = loaderInfo.game || entryJwt.mid || entryParams.game || slotSlug.replace(/^nolimit-/, '')
    const language = loaderInfo.language || entryParams.language || 'de'
    const clientString = loaderInfo.operator || entryParams.casino_id || entryJwt.cid || 'BABYLONSTK000002'
    const currencyCode = String(entryJwt.cur || targetCurrency || loaderInfo.currencyCode || loaderInfo?.extra?.currency || 'eur').toUpperCase()
    const normalizedPlayMode = normalizePlayMode(loaderInfo?.extra?.playMode || entryParams.play_mode)
    const licenseePlayerId = loaderInfo?.extra?.licenseePlayerId || entryJwt.pid || tokenString.slice(0, 16)
    const externalPlayerId = loaderInfo?.extra?.externalPlayerId || loaderInfo?.extra?.external_player_id || entryJwt.epid || null
    const tableName = loaderInfo?.extra?.table_name || entryJwt.mid || gameName

    const jsonData = {
      ...(loaderInfo.extra || {}),
      currency: currencyCode,
      evo_token: loaderInfo?.extra?.evo_token || loaderInfo?.extra?.evoToken || entryParams.jwsh || null,
      table_id: tableId,
      table_name: tableName,
    }
    if (!jsonData.licenseePlayerId) jsonData.licenseePlayerId = licenseePlayerId
    if (!jsonData.externalPlayerId && externalPlayerId) jsonData.externalPlayerId = externalPlayerId
    if (!jsonData.playMode && normalizedPlayMode) jsonData.playMode = normalizedPlayMode
    if (jsonData.screenName == null) jsonData.screenName = ''
    if (jsonData.skipInitBalance == null) jsonData.skipInitBalance = 'true'
    if (!jsonData.evo_token) throw new Error('Nolimit evo_token fehlt.')

    const gameCodeString = `${gameName}@desktop`
    const origin = loaderInfo.origin || 'https://casino.nolimitcdn.com'
    const referer = loaderInfo.loaderUrl || `${origin}/loader/evo.html`

    const openPayload = new URLSearchParams({
      action: 'open_game',
      clientString,
      language,
      gameCodeString,
      jsonData: JSON.stringify(jsonData),
      tokenString,
    }).toString()

    const openRes = await safeProxyRequest({
      url: NLC_FS_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        Origin: origin,
        Referer: referer,
        ...buildCookieHeader(cookieJar),
      },
      body: openPayload,
    })
    addSetCookies(openRes.headers, cookieJar)

    const openText = await openRes.text()
    const openData = parseJsonSafe(openText) || {}
    if (!openRes.ok) {
      throw new Error(`Nolimit open_game fehlgeschlagen: ${extractError(openData, openText, openRes.status)}`)
    }

    const extPlayerKey = String(
      findByKeys(openData, ['session', 'sessionKey', 'key', 'extPlayerKey']) || tokenString
    )
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
      request: { slotSlug, gameCodeString, currencyCode, tableId, tokenSource },
      response: { ok: true, extPlayerKey: !!extPlayerKey, currencyMult, betLevelsCount: betLevels.length },
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
        origin,
        referer,
      },
    }
  } catch (e) {
    logApiCall({
      type: 'nolimit/init',
      endpoint: NLC_FS_URL,
      request: { configUrl, slotSlug },
      response: null,
      error: e?.message || String(e),
      durationMs: Date.now() - t0,
    })
    throw e
  }
}

export async function placeBet(session, betAmount, extraBet, _autoplay = false) {
  const t0 = Date.now()
  const s = session?._internal
  if (!s) throw new Error('Nolimit Session ungueltig.')

  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  let chipAmount = toChipFromMinor(effectiveBet, session.currencyMult || DEFAULT_CURRENCY_MULT)
  if (Array.isArray(session.betLevelsRaw) && session.betLevelsRaw.length > 0) {
    chipAmount = snapToNearest(chipAmount, session.betLevelsRaw)
  }

  const spinJson = {
    table_id: s.tableId,
    session: s.extPlayerKey,
    chipAmount,
  }

  const actionCandidates = ['spin', 'play', 'bet']
  let lastError = 'Unbekannter Fehler'

  for (const action of actionCandidates) {
    const payload = new URLSearchParams({
      action,
      clientString: s.clientString,
      language: s.language || 'de',
      gameCodeString: s.gameCodeString,
      jsonData: JSON.stringify(spinJson),
      tokenString: s.tokenString,
    }).toString()

    try {
      const res = await safeProxyRequest({
        url: NLC_FS_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
          Origin: s.origin || 'https://casino.nolimitcdn.com',
          Referer: s.referer || 'https://casino.nolimitcdn.com/loader/evo.html',
          ...buildCookieHeader(s.cookieJar || []),
        },
        body: payload,
      })

      const text = await res.text()
      const data = parseJsonSafe(text) || {}
      const err = extractError(data, text, res.status)

      if (!res.ok) {
        lastError = err
        logApiCall({
          type: 'nolimit/spin',
          endpoint: NLC_FS_URL,
          request: { action, chipAmount },
          response: data,
          error: err,
          durationMs: Date.now() - t0,
        })
        continue
      }

      const parsedData = parseNlcSpin(data?.data && typeof data.data === 'object' ? data.data : data)
      const winAmount = Number(parsedData?.win ?? 0)

      logApiCall({
        type: 'nolimit/spin',
        endpoint: NLC_FS_URL,
        request: { action, chipAmount },
        response: { ok: true, winAmount },
        error: null,
        durationMs: Date.now() - t0,
      })

      return {
        data: {
          statusCode: 0,
          accountBalance: { balance: null, currencyCode: (session.currencyCode || 'EUR').toUpperCase() },
          round: {
            status: 'complete',
            roundId: findByKeys(data, ['roundId', 'round_id', 'round']) || null,
            events: [{ awa: winAmount }],
            winAmountDisplay: winAmount,
            freespinsLeft: Number(parsedData?.freespinsLeft || 0),
            mode: parsedData?.mode || 'NORMAL',
            isBonus: !!parsedData?.isBonus,
          },
          _nolimitRaw: data,
        },
        nextSeq: (session.seq || 0) + 1,
        session: { ...session, seq: (session.seq || 0) + 1, lastPlayAt: Date.now() },
      }
    } catch (e) {
      lastError = e?.message || String(e)
      logApiCall({
        type: 'nolimit/spin',
        endpoint: NLC_FS_URL,
        request: { action, chipAmount },
        response: null,
        error: lastError,
        durationMs: Date.now() - t0,
      })
    }
  }

  throw new Error(`Nolimit Spin fehlgeschlagen: ${lastError}`)
}

export async function sendKeepAlive() {
  return { ok: true }
}

export async function sendContinue() {
  return { ok: true }
}
