import { inflate, inflateRaw } from 'pako'

const sessions = new Map()

function base64ToBytes(str) {
  if (!str || typeof str !== 'string') return null
  const s = str.replace(/[\r\n\s]+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  const padded = pad === 2 ? `${s}==` : pad === 3 ? `${s}=` : s
  try {
    const bin = atob(padded)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
    return arr
  } catch {
    return null
  }
}

function decodeThunderRouteToken(token) {
  if (!token || typeof token !== 'string') return null
  if (!token.startsWith('eN')) return null
  const bytes = base64ToBytes(token)
  if (!bytes) return null
  try {
    let txt = null
    try {
      txt = inflate(bytes, { to: 'string' })
    } catch {
      txt = inflateRaw(bytes, { to: 'string' })
    }
    if (!txt || typeof txt !== 'string') return null
    let obj = null
    try {
      obj = JSON.parse(txt)
    } catch {
      return null
    }
    const result = { gamesessionid: null, gameid: null, playerid: null, playersessionid: null, gameinstanceid: null }
    const walk = (v) => {
      if (!v || typeof v !== 'object') return
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string') {
          const key = k.toLowerCase()
          if (!result.gamesessionid && key === 'gamesessionid') result.gamesessionid = val
          if (!result.gameid && key === 'gameid') result.gameid = val
          if (!result.playerid && key === 'playerid') result.playerid = val
          if (!result.playersessionid && key === 'playersessionid') result.playersessionid = val
          if (!result.gameinstanceid && key === 'gameinstanceid') result.gameinstanceid = val
        } else if (val && typeof val === 'object') {
          walk(val)
        }
      }
    }
    walk(obj)
    if (!result.gamesessionid && !result.gameid && !result.playerid && !result.playersessionid && !result.gameinstanceid) {
      return null
    }
    return result
  } catch {
    return null
  }
}

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
        url: res.finalUrl || url
      }
    } catch (e) {
      console.error('Proxy request failed', e)
      throw e
    }
  }
  // Fallback (should not happen in Electron unless dev)
  return fetch('/api/rgs-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  })
}

function ensureBridge() {
  if (typeof window === 'undefined') return null
  if (window.slotbotBridge && typeof window.slotbotBridge === 'object') return window.slotbotBridge
  const bridge = {
    async requestWebviewSession(options) {
      const providerId = options?.providerId
      if (providerId !== 'thunderkick') {
        throw new Error('Webview-Provider nicht unterstützt')
      }
      const id = `${providerId}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const targetCurrency = (options?.targetCurrency || 'eur').toUpperCase()
      const sessionInfo = {
        id,
        providerId,
        slug: options?.slug || null,
        configUrl: options?.configUrl || null,
        sourceCurrency: options?.sourceCurrency || null,
        targetCurrency,
        token: options?.token || null,
        gameId: options?.gameId || null,
        host: options?.host || null,
        base: options?.base || null,
        gamesessionid: options?.gamesessionid || null,
        playerid: options?.playerid || null,
        playersessionid: options?.playersessionid || null,
        gameinstanceid: options?.gameinstanceid || null,
      }
      if (sessionInfo.token) {
        const decoded = decodeThunderRouteToken(sessionInfo.token)
        if (decoded) {
          if (!sessionInfo.gameId && decoded.gameid) sessionInfo.gameId = decoded.gameid
          if (!sessionInfo.gamesessionid && decoded.gamesessionid) sessionInfo.gamesessionid = decoded.gamesessionid
          if (!sessionInfo.playerid && decoded.playerid) sessionInfo.playerid = decoded.playerid
          if (!sessionInfo.playersessionid && decoded.playersessionid) sessionInfo.playersessionid = decoded.playersessionid
          if (!sessionInfo.gameinstanceid && decoded.gameinstanceid) sessionInfo.gameinstanceid = decoded.gameinstanceid
        }
      }
      sessions.set(id, sessionInfo)
      return {
        sessionId: id,
        betLevels: Array.isArray(options?.betLevels) ? options.betLevels : [],
        currencyCode: targetCurrency,
        initialBalance: null,
      }
    },
    async requestWebviewSpin(options) {
      const providerId = options?.providerId
      if (providerId !== 'thunderkick') {
        throw new Error('Webview-Provider nicht unterstützt')
      }
      const sessionId = options?.sessionId
      const s = sessionId ? sessions.get(sessionId) : null
      if (!s) {
        throw new Error('Webview-Session nicht gefunden')
      }
      const amount = Number(options?.betAmount || 0)
      const currencyCode = (options?.currencyCode || s.targetCurrency || 'EUR').toUpperCase()
      let base = s.base
      if (!base) {
        if (s.host) {
          const host = s.host.replace(/\/+$/, '')
          base = `https://${host}`
        } else if (s.configUrl) {
          try {
            const u = new URL(s.configUrl)
            base = `${u.protocol}//${u.hostname}`
          } catch {
            base = null
          }
        }
      }
      if (!base) {
        return { winAmount: 0, balance: null, roundId: null, raw: null }
      }
      const gameId = s.gameId || s.gameid || null
      const gamesessionid = s.gamesessionid || s.token || null
      const playersessionid = s.playersessionid || gamesessionid
      const playerid = s.playerid || null
      const gameinstanceid = s.gameinstanceid || (gameId ? `${gameId}-${Math.floor(Date.now() / 1000)}` : null)
      const urid = `${Date.now()}-${Math.random()}-${Math.random()}`
      const url = `${base.replace(/\/+$/, '')}/monolith?urid=${encodeURIComponent(urid)}`
      const requestId = Date.now()
      const payload = {
        requestid: requestId,
        classname: 'tk.ServerRequest',
        operatorid: '1218',
        servicerequests: [
          {
            accountid: currencyCode,
            accounttype: 'REAL',
            clientversion: '1.17.10',
            currencyiso: currencyCode,
            clienttype: 3,
            freeroundid: null,
            distributionchannel: 'WEB',
            gameid: gameId,
            gamesessionid,
            operatorid: '1218',
            playerid,
            playersessionid,
            serviceid: 'gameservice',
            requesttype: 'gs.newgameround',
            classname: 'tk.gs.rq.NewGameRoundRequest',
            symbolsbeforeactionfinal: [],
            symbolsbeforeactioninitial: [],
            gamerequests: [
              {
                classname: 'tk.g.slots.s1.rq.S1Request',
                requesttype: 'spin',
                data: {
                  bet: {
                    value: {
                      amount,
                      currencyiso: currencyCode,
                      classname: 'tk.d.finance.Money',
                    },
                    id: 'ante',
                    classname: 'tk.d.finance.Bet',
                  },
                },
              },
            ],
            gameinstanceid,
            regulator: 'DOTCOM',
          },
        ],
      }
      
      let text = null
      try {
        const res = await safeProxyRequest({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        text = await res.text()
      } catch {
        return { winAmount: 0, balance: null, roundId: null, raw: text }
      }
      return { winAmount: 0, balance: null, roundId: null, raw: text }
    },
  }
  window.slotbotBridge = bridge
  return bridge
}

export function initSlotbotBridge() {
  ensureBridge()
}
