/**
 * Stake Engine – Slots von Stake eigener Engine
 * z.B. blackcoffeestudios-big-lunker-bass-clusters
 * Verwendet startThirdPartySession + RGS wallet/play, wallet/end-round
 * Beträge: 6 Dezimalstellen (1.000.000 = 1 Einheit)
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']
// Fiat-Währungen haben meist 2 Dezimalstellen, Crypto meist 8
const FIAT_CURRENCIES = ['eur', 'usd', 'brl', 'cad', 'cny', 'inr', 'mxn', 'php', 'pln', 'rub', 'try', 'ngn', 'ars', 'cop', 'pen', 'clp']
const STAKEENGINE_MIN_DELAY_MS = 50

function parseConfigFromUrl(config) {
  try {
    const url = typeof config === 'string' ? config : config?.url
    // 1000 Lakes Studios nutzt oft die gleiche Engine/URL-Struktur, daher Prüfung erweitern
    if (!url || (!url.includes('stake-engine') && !url.includes('1000lakes'))) return null
    const u = new URL(url)
    const sessionID = u.searchParams.get('sessionID')
    const rgsUrl = u.searchParams.get('rgs_url')
    if (!sessionID || !rgsUrl) return null
    return { sessionID, rgsUrl: rgsUrl.replace(/\/$/, '') }
  } catch {
    return null
  }
}

/** Betrag in Stake Engine Format: 1.000.000 = 1 Einheit */
function toStakeEngineAmount(betAmount, targetCurrency) {
  const curr = (targetCurrency || 'eur').toLowerCase()
  const isZeroDec = ZERO_DECIMAL_CURRENCIES.includes(curr)
  const isFiat = FIAT_CURRENCIES.includes(curr)
  
  let units
  if (isZeroDec) {
    units = Number(betAmount)
  } else if (isFiat) {
    units = Number(betAmount) / 100
  } else {
    // Crypto: Input ist in Satoshis (1e8), wir brauchen Major Units
    units = Number(betAmount) / 1e8
  }
  
  return Math.round(units * 1_000_000)
}

function buildRgsUrl(rgsBase, path) {
  let base = (rgsBase || '').replace(/\/$/, '')
  if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = `https://${base}`
  }
  return `${base}${path.startsWith('/') ? path : '/' + path}`
}

async function rgsPost(rgsUrl, body) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  
  if (window.electronAPI?.proxyRequest) {
    try {
      const res = await window.electronAPI.proxyRequest({
        url: rgsUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyStr
      })
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        statusText: res.statusText,
        json: async () => JSON.parse(res.data),
        text: async () => res.data
      }
    } catch (e) {
      console.error('Stake Engine Proxy Error:', e)
      throw e
    }
  }

  if (import.meta.env.DEV) {
    return fetch('/api/rgs-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: rgsUrl, body: bodyStr }),
    })
  }
  return fetch(rgsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  })
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const session = await startThirdPartySession(
    accessToken,
    slotSlug,
    sourceCurrency?.toLowerCase() || 'usdc',
    targetCurrency?.toLowerCase() || 'eur'
  )
  const config = typeof session?.config === 'string' ? session.config : session?.config?.url
  const parsed = parseConfigFromUrl(config)
  if (!parsed?.sessionID || !parsed?.rgsUrl) {
    throw new Error('Keine gültige Stake-Engine-Session. Ist das ein Stake-Engine-Slot?')
  }

  const authUrl = buildRgsUrl(parsed.rgsUrl, '/wallet/authenticate')
  const authRes = await rgsPost(authUrl, { sessionID: parsed.sessionID })
  let authData
  try {
    authData = await authRes.json()
  } catch (e) {
    const text = await authRes.text()
    throw new Error(`Stake Engine Auth fehlgeschlagen: ${text || authRes.status}`)
  }

  if (!authRes.ok) {
    const err = authData?.error || authData?.message || authRes.status
    throw new Error(`Stake Engine: ${err}`)
  }

  logApiCall({ type: 'stakeEngine/authenticate', endpoint: authUrl, request: { sessionID: parsed.sessionID }, response: { config: authData?.config, balance: authData?.balance }, error: null, durationMs: null })

  const configData = authData?.config || {}
  const betLevelsRaw = configData?.betLevels?.map((v) => Number(v)).filter((b) => b > 0) ?? []
  const betLevels = betLevelsRaw.map((v) => {
    const units = v / 1_000_000
    const curr = (targetCurrency || 'eur').toLowerCase()
    
    if (ZERO_DECIMAL_CURRENCIES.includes(curr)) {
      return Math.round(units)
    } else if (FIAT_CURRENCIES.includes(curr)) {
      return Math.round(units * 100)
    } else {
      // Crypto: Major -> Satoshis (1e8)
      return Math.round(units * 1e8)
    }
  })

  const stepBet = configData?.stepBet ?? 100_000
  const minBet = configData?.minBet ?? 100_000
  const maxBet = configData?.maxBet ?? 1_000_000_000

  const authBalance = authData?.balance
  const authBalanceRaw = authBalance?.amount != null ? Number(authBalance.amount) : null
  const authCurrency = (authBalance?.currency || targetCurrency || 'eur').toLowerCase()
  const authBalanceUnits = authBalanceRaw != null ? authBalanceRaw / 1_000_000 : null
  const initialBalance = authBalanceUnits != null
    ? (ZERO_DECIMAL_CURRENCIES.includes(authCurrency) ? Math.round(authBalanceUnits) : Math.round(authBalanceUnits * 100))
    : null

  return {
    sessionID: parsed.sessionID,
    rgsUrl: parsed.rgsUrl,
    betLevels: betLevels.filter((b) => b > 0),
    betLevelsRaw,
    currencyCode: authData?.balance?.currency || (targetCurrency || 'eur').toUpperCase(),
    stepBet,
    minBet,
    maxBet,
    initialBalance,
  }
}

function snapToStep(value, step) {
  if (!step || step <= 0) return value
  return Math.round(value / step) * step
}

function snapToNearestBetLevel(amount, betLevels) {
  if (!betLevels?.length) return amount
  let best = betLevels[0]
  for (const level of betLevels) {
    if (Math.abs(level - amount) < Math.abs(best - amount)) best = level
  }
  return best
}

export async function placeBet(session, betAmount, extraBet, autoplay = false) {
  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  let amount = toStakeEngineAmount(effectiveBet, session?.currencyCode || 'eur')

  const stepBet = session?.stepBet ?? 100_000
  const minBet = session?.minBet ?? 100_000
  const maxBet = session?.maxBet ?? 1_000_000_000
  const betLevelsRaw = session?.betLevelsRaw

  if (betLevelsRaw?.length) {
    // Striktes Snapping auf exakte API-Werte
    amount = snapToNearestBetLevel(amount, betLevelsRaw)
  } else {
    // Fallback: Step/Min/Max (weniger sicher bei ERR_VAL)
    amount = snapToStep(Math.max(minBet, Math.min(maxBet, amount)), stepBet)
  }

  // Sicherheitscheck: 1000 Lakes Studios scheint sehr strikt zu sein.
  // Wenn der berechnete Betrag nicht exakt in betLevelsRaw ist, nehmen wir den nächsten.
  if (betLevelsRaw?.length && !betLevelsRaw.includes(amount)) {
    amount = snapToNearestBetLevel(amount, betLevelsRaw)
  }

  const currency = (session?.currencyCode || 'EUR').toUpperCase()

  const lastPlayAt = session?.lastPlayAt || 0
  const waitMs = STAKEENGINE_MIN_DELAY_MS - (Date.now() - lastPlayAt)
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs))
  }

  const endUrl = buildRgsUrl(session.rgsUrl, '/wallet/end-round')
  const playUrl = buildRgsUrl(session.rgsUrl, '/wallet/play')
  const playBody = { sessionID: session.sessionID, amount, mode: 'base', currency }
  const t0 = Date.now()
  let playRes = await rgsPost(playUrl, playBody)

  let playData
  try {
    playData = await playRes.json()
  } catch (e) {
    const text = await playRes.text()
    logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: null, error: text || String(e), durationMs: Date.now() - t0 })
    throw new Error(`Stake Engine Play fehlgeschlagen: ${text || playRes.status}`)
  }

  if (!playRes.ok) {
    const err = playData?.error || playRes.status
    const msg = playData?.message || ''
    if (err === 'ERR_IS' || String(err).includes('ERR_IS')) {
      const ex = new Error('Session abgelaufen. Bitte Session neu starten.')
      ex.sessionClosed = true
      throw ex
    }
    if ((err === 'ERR_VAL' || String(err).includes('ERR_VAL')) && String(msg).includes('active bet')) {
      const endRes = await rgsPost(endUrl, { sessionID: session.sessionID })
      await endRes.json().catch(() => ({}))
      playRes = await rgsPost(playUrl, playBody)
      try {
        playData = await playRes.json()
      } catch (e) {
        const text = await playRes.text()
        logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: null, error: text || String(e), durationMs: Date.now() - t0 })
        throw new Error(`Stake Engine Play fehlgeschlagen: ${text || playRes.status}`)
      }
    }
  }

  if (!playRes.ok) {
    logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: playData, error: playData?.error || playRes.status, durationMs: Date.now() - t0 })
    const err = playData?.error || playRes.status
    if (err === 'ERR_IS' || String(err).includes('ERR_IS')) {
      const ex = new Error('Session abgelaufen. Bitte Session neu starten.')
      ex.sessionClosed = true
      throw ex
    }
    if (err === 'ERR_VAL' || String(err).includes('ERR_VAL')) {
      throw new Error(`Ungültiger Einsatz (ERR_VAL). Bitte Einsatz prüfen.`)
    }
    throw new Error(`Stake Engine: ${err}`)
  }

  const round = playData?.round || {}
  const roundStatus = round?.status || ''
  let winAmount = Number(
    round?.winAmount ?? round?.win ?? round?.outcome?.win ?? round?.result?.winAmount ?? 0
  )
  const balanceObj = playData?.balance || {}
  const balanceRaw = balanceObj?.amount != null ? Number(balanceObj.amount) : null
  const respCurrency = (balanceObj?.currency || session?.currencyCode || 'EUR').toLowerCase()
  const balanceUnits = balanceRaw != null ? balanceRaw / 1_000_000 : null
  const balanceMinor = balanceUnits != null
    ? (ZERO_DECIMAL_CURRENCIES.includes(respCurrency) ? Math.round(balanceUnits) : Math.round(balanceUnits * 100))
    : null

  const winInUnits = winAmount / 1_000_000
  const winDisplay = ZERO_DECIMAL_CURRENCIES.includes(respCurrency)
    ? Math.round(winInUnits)
    : Math.round(winInUnits * 100)

  // parseBetResponse liest awa vom letzten Event – stellen wir sicher, dass der Gewinn drin steht
  const baseEvents = round?.events?.length ? round.events : []
  const eventsWithWin = [...baseEvents, { awa: winDisplay }]

  const data = {
    statusCode: 0,
    accountBalance: { balance: balanceMinor, currencyCode: respCurrency.toUpperCase() },
    round: {
      ...round,
      status: round?.status || 'complete',
      events: eventsWithWin,
      winAmountDisplay: winDisplay, // Explizit für parseBetResponse (Gleiche Einheiten wie balance)
    },
    _stakeEngine: { raw: playData, balance: balanceObj, currency: respCurrency.toUpperCase() },
  }
  return {
    data,
    nextSeq: (session.seq || 0) + 1,
    session: {
      ...session,
      seq: (session.seq || 0) + 1,
      lastPlayAt: Date.now(),
    },
  }
}
