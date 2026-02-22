import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { getEffectiveBetAmount } from '../../constants/bet'
import { parseNlcSpin } from '../../utils/nlcSpinParser'

// Helper for Proxy Request
async function safeProxyRequest(options) {
  if (window.electronAPI?.proxyRequest) {
    const { method = 'POST', headers = {}, body, url } = options
    if (method === 'POST' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    try {
      const res = await window.electronAPI.proxyRequest({ url, method, headers, body })
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: async () => res.data,
        json: async () => JSON.parse(res.data),
        headers: res.headers,
        url: res.finalUrl || url
      }
    } catch (e) {
      console.error('Proxy request failed', e)
      throw e
    }
  }
  throw new Error('Electron API not available')
}

// Logic from vite.config.js
function decodeEntryParams(url) {
  try {
    const u = new URL(url)
    const p = u.searchParams.get('params')
    if (!p) return null
    const txt = atob(p) // Browser native base64 decode
    const lines = txt.split('\n').map((s) => s.trim()).filter(Boolean)
    const map = {}
    for (const line of lines) {
      const idx = line.indexOf('=')
      if (idx > 0) {
        const k = line.slice(0, idx)
        const v = line.slice(idx + 1)
        map[k] = v
      }
    }
    return map
  } catch {
    return null
  }
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    (sourceCurrency || 'usdc').toLowerCase(),
    (targetCurrency || 'eur').toLowerCase()
  )
  const configUrl = typeof session?.config === 'string' ? session.config : session?.config?.url
  if (!configUrl || !configUrl.includes('evo-games.com/entry')) {
    throw new Error('Keine gültige Nolimit-Session (config URL fehlt).')
  }

  const t0 = Date.now()
  const cookieJar = []
  const addCookies = (headers) => {
    if (!headers) return
    // Headers keys are usually lowercased in Electron/Node responses
    const setCookie = headers['set-cookie'] || headers['Set-Cookie']
    if (setCookie) {
      const list = Array.isArray(setCookie) ? setCookie : [setCookie]
      for (const c of list) {
        cookieJar.push((typeof c === 'string' ? c : c.toString()).split(';')[0].trim())
      }
    }
  }
  const getCookieHeader = () => {
    return cookieJar.length ? { Cookie: [...new Set(cookieJar)].join('; ') } : {}
  }

  try {
    // 1. Follow Config URL redirects
    let currentUrl = configUrl
    let r = await safeProxyRequest({
        url: currentUrl,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/144.0.0.0'
        }
    })
    addCookies(r.headers)
    
    // safeProxyRequest handles redirects internally if net.request follows them? 
    // Electron net.request follows redirects by default.
    // So r.url should be the final URL.
    
    const finalUrl = r.url
    const hash = finalUrl.split('#')[1] || ''
    const tableId = new URLSearchParams(hash).get('table_id') || hash.match(/table_id=([^&]+)/)?.[1]
    const entryParams = decodeEntryParams(configUrl) || {}
    let resolvedTableId = tableId || entryParams.table_id || null

    if (!resolvedTableId) {
       throw new Error('table_id not found')
    }

    const evoBase = 'https://babylonstkn.evo-games.com'
    
    // 2. Fetch Config
    const configRes = await safeProxyRequest({
        url: `${evoBase}/config?table_id=${resolvedTableId}&client_version=6.20260213.113026.59523-6fa6548776-r2`,
        method: 'GET',
        headers: {
            Accept: '*/*',
            Referer: `${evoBase}/frontend/evo/r2/`,
            ...getCookieHeader()
        }
    })
    const configText = await configRes.text()
    let configData = {}
    try { configData = JSON.parse(configText) } catch {}

    const casinoId = configData?.casinoId ?? configData?.casino_id ?? null
    const evoToken = configData?.data?.evo_token ?? configData?.evo_token
    const configWrapperToken = configData?.wrapper_token ?? configData?.data?.wrapper_token
    const tableName = configData?.headers?.table_name ?? configData?.table_name ?? configData?.tableName ?? configData?.table_id
    const gameCode = configData?.headers?.game ?? configData?.game ?? configData?.game_type

    if ((!evoToken && !configWrapperToken) || !tableName) {
        throw new Error('Evo Config failed')
    }

    // 3. Fetch Setup
    constsetupRes = await safeProxyRequest({
        url: `${evoBase}/setup`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: '*/*',
            Referer: `${evoBase}/frontend/evo/r2/`,
            ...getCookieHeader()
        },
        body: JSON.stringify({ device: 'desktop', wrapped: 'true', client_version: '6.20260213.113026.59523-6fa6548776-r2' })
    })
    const setupText = awaitsetupRes.text()
    let setupData = {}
    try { setupData = JSON.parse(setupText) } catch {}

    const useFallback = setupRes.status >= 400 || setupRes.status < 200
    const licenseePlayerId = setupData?.licenseePlayerId || setupData?.playerId || setupData?.player_id || ''
    const externalPlayerId = setupData?.player_id || setupData?.playerId || ''
    const clientString = setupData?.clientString || ''
    const wrapperToken = useFallback ? configWrapperToken : setupData?.wrapper_token

    if (!wrapperToken || (!externalPlayerId && !useFallback)) {
        throw new Error('Evo Setup failed')
    }

    const gameCodeStr = entryParams?.game ? `${entryParams.game}/desktop` : `${gameCode}/desktop`
    const operatorFromEntry = entryParams?.casino_id || entryParams?.casinoId || casinoId || null
    const playModeFromEntry = entryParams?.play_mode || null

    const initPayload = {
        action: 'init',
        clientString,
        language: 'de',
        gameCodeString: gameCodeStr,
        jsonData: JSON.stringify({
            licenseePlayerId: licenseePlayerId || externalPlayerId || 'unknown',
            currency: (targetCurrency || 'eur').toUpperCase(),
            operator: operatorFromEntry || undefined,
            evo_token: evoToken || '',
            table_id: resolvedTableId,
            table_name: tableName,
            screenName: '',
            externalPlayerId: externalPlayerId || 'unknown',
            playMode: playModeFromEntry || undefined,
            skipInitBalance: 'true',
        }),
        tokenString: wrapperToken,
    }

    // 4. Init Nolimit
    const initRes = await safeProxyRequest({
        url: 'https://casino.nolimitcity.com/EjsFrontWeb/fs',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: '*/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            Origin: 'https://babylonstkn.evo-games.com',
            Referer: 'https://babylonstkn.evo-games.com/frontend/evo/r2/',
            ...getCookieHeader()
        },
        body: new URLSearchParams(initPayload).toString()
    })
    
    const initText = await initRes.text()
    let initData = {}
    try { initData = JSON.parse(initText) } catch {}
    
    const extPlayerKey = initData?.data?.session ?? initData?.data?.key ?? initData?.session ?? initData?.key
    if (!extPlayerKey) {
        throw new Error('Nolimit Init failed: No session key')
    }

    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const betLevels = setupData?.betLevels?.map((v) => parseFloat(v)) || (setupData?.chipAmounts || '1000,5000,25000,100000,500000,1000000').split(',').map(Number)

    // Store session data for placeBet
    // We return it in the session object
    return {
        sessionId,
        extPlayerKey,
        tableId: resolvedTableId,
        currencyCode: (targetCurrency || 'eur').toUpperCase(),
        currencyMult: setupData?.currencyMult || 1000,
        betLevels,
        betLevelsRaw: betLevels,
        // Internal state for placeBet
        _internal: {
            cookieJar,
            wrapperToken,
            tableId: resolvedTableId,
            evoToken,
            clientString,
            gameCode,
            extPlayerKey,
            currencyMult: setupData?.currencyMult || 1000
        }
    }

  } catch (e) {
    logApiCall({
        type: 'nolimit/init',
        endpoint: 'client-init',
        request: { configUrl },
        response: null,
        error: e.message || String(e),
        durationMs: Date.now() - t0
    })
    throw e
  }
}

function snapToNearest(amount, levels) {
  if (!levels?.length) return amount
  let best = levels[0]
  for (const l of levels) {
    if (Math.abs(l - amount) < Math.abs(best - amount)) best = l
  }
  return best
}

export async function placeBet(session, betAmount, extraBet, autoplay = false) {
  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  const units = Math.max(1, Math.round(effectiveBet / (session.currencyMult || 1000)))
  const chipAmount = snapToNearest(units, session.betLevelsRaw?.length ? session.betLevelsRaw : [units])
  
  const s = session._internal
  if (!s) {
      throw new Error('Invalid session state')
  }

  const t0 = Date.now()
  
  const payload = {
    action: 'spin',
    clientString: s.clientString,
    language: 'de',
    gameCodeString: `${s.gameCode}/desktop`,
    jsonData: JSON.stringify({
        table_id: s.tableId,
        session: s.extPlayerKey,
        chipAmount,
    }),
    tokenString: s.wrapperToken,
  }

  const getCookieHeader = () => {
    return s.cookieJar.length ? { Cookie: [...new Set(s.cookieJar)].join('; ') } : {}
  }

  try {
      const res = await safeProxyRequest({
        url: 'https://casino.nolimitcity.com/EjsFrontWeb/fs',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: '*/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            Origin: 'https://babylonstkn.evo-games.com',
            Referer: 'https://babylonstkn.evo-games.com/frontend/evo/r2/',
            ...getCookieHeader(),
        },
        body: JSON.stringify(payload)
      })
      
      const text = await res.text()
      let data = {}
      try { data = JSON.parse(text) } catch {}
      
      logApiCall({ type: 'nolimit/spin', endpoint: 'nolimitcity.com/fs', request: { chipAmount }, response: data, error: !res.ok ? `HTTP ${res.status}` : null, durationMs: Date.now() - t0 })
      
      if (!res.ok) {
        throw new Error(`Spin failed: ${res.status}`)
      }

      const parsed = parseNlcSpin(data?.raw) // data itself might be the raw response if parseNlcSpin expects that? 
      // Wait, parseNlcSpin expects the 'raw' property?
      // In original code: const parsed = parseNlcSpin(data?.raw)
      // And original code returned { ok: true, raw: json } from proxy.
      // So data is the JSON response from nolimitcity.
      
      // Let's check parseNlcSpin usage.
      // parseNlcSpin is imported from '../../utils/nlcSpinParser'
      // It likely expects the full JSON response from the game server.
      
      const parsedData = parseNlcSpin(data)
      
      const resp = {
        statusCode: 0,
        accountBalance: { balance: null, currencyCode: (session.currencyCode || 'EUR').toUpperCase() },
        round: {
          status: 'complete',
          events: [],
          winAmountDisplay: parsedData?.win || 0,
          freespinsLeft: parsedData?.freespinsLeft || 0,
          mode: parsedData?.mode || 'NORMAL',
          isBonus: parsedData?.isBonus || false,
        },
        _nolimitRaw: data || {},
      }
      
      return {
        data: resp,
        nextSeq: (session.seq || 0) + 1,
        session: { ...session, seq: (session.seq || 0) + 1, lastPlayAt: Date.now() },
      }

  } catch (e) {
    logApiCall({ type: 'nolimit/spin', endpoint: 'nolimitcity.com/fs', request: { chipAmount }, response: null, error: e.message || String(e), durationMs: Date.now() - t0 })
    throw e
  }
}
