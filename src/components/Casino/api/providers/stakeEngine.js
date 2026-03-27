/**
 * Stake Engine – Slots von Stake eigener Engine
 * z.B. blackcoffeestudios-big-lunker-bass-clusters
 * Verwendet startThirdPartySession + RGS wallet/play, wallet/end-round
 *
 * Abgleich offizielles RGS (npm `stake-engine` / @stakeengine/ts-client README):
 * - Doku: https://stake-engine.com/docs/rgs
 * - Authenticate ≈ POST …/wallet/authenticate { sessionID }
 * - Play      ≈ POST …/wallet/play     { sessionID, amount, mode, currency }
 * - EndRound  ≈ POST …/wallet/end-round { sessionID }
 * - `amount` in API-Rohwerten; README nennt das „API_MULTIPLIER“ / Bet-Level-Werte.
 *   Hier: STAKE_ENGINE_API_MULTIPLIER = 1e6 (eine Währungseinheit).
 *
 * Abweichung zum Browser-SDK: Wir nutzen keine RGSClient({ url }) aus dem Spiel-iframe,
 * sondern Session aus Stake `startThirdPartySession` + direkte RGS-URLs aus der Config-URL.
 *
 * Gewinn NICHT aus Wallet-Delta ableiten: Ein Konto hat eine gemeinsame Bilanz; bei mehreren
 * parallelen Slots ändern andere Läufe den Saldo zwischen zwei Spins — dann ist
 * (balanceNachher − balanceVorher + bet) für einen einzelnen Spin nicht mehr definiert.
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'

/** RGS: ganzzahliger Betrag; 1.000.000 = 1,0 Währungseinheit (vgl. stake-engine API_MULTIPLIER). */
export const STAKE_ENGINE_API_MULTIPLIER = 1_000_000

/**
 * RGS `payoutMultiplier`: oft Hundertstel (3900 = 39x, 1150 = 11.5x), teils Ganzzahl (39 = 39x).
 * Vorher immer /100 → 39 wurde zu 0.39x.
 */
export function resolveStakeEnginePayoutMultiplier(payoutMult) {
  const p = Number(payoutMult)
  if (!Number.isFinite(p) || p <= 0) return 0
  // Heuristik:
  // - Häufig ist payoutMultiplier "hundertstel" (z.B. 3900 => 39x, 1150 => 11.5x)
  // - Manchmal kommt er aber bereits als echte Multi zurück (z.B. 178.6 => 178.6x)
  // - Teils auch als "echte" Ganzzahl (z.B. 839 => 839x)
  //
  // Wir unterscheiden deshalb:
  // 1) Float-Werte (mit Dezimalstellen) behandeln wir als bereits echte Multi.
  // 2) Sehr große Integer-Werte nehmen wir als hundertstel (>=1000 => /100).
  // 3) Integer-Werte <1000 behandeln wir als echte Multi (keine /100).
  const isFloat = !Number.isInteger(p)
  if (p >= 100 && isFloat) return p
  if (p >= 1000) return p / 100
  return p
}

/**
 * Effektiver Spin-Multiplikator für Hunter/Autospin.
 * RGS `payoutMultiplier` ist oft Hundertstel (3900 → 39×), manchmal aber auch
 * Ganzzahl für den echten Multi (839 → 839×). Nur API zu parsen macht aus 839 fälschlich 8,39×.
 * `parseBetResponse` liefert win/bet in denselben Einheiten — das ist die zuverlässige Grundlage.
 */
export function effectiveSpinMultiplierFromParsed(payoutMultRaw, parsed) {
  const raw = Number(payoutMultRaw ?? 0)
  let fromApi = 0
  if (raw > 0) fromApi = resolveStakeEnginePayoutMultiplier(raw)
  const fromParsed =
    parsed?.multiplier != null && Number.isFinite(parsed.multiplier) && parsed.multiplier > 0
      ? parsed.multiplier
      : 0
  const bet = Number(parsed?.betAmount) || 0
  const win = Number(parsed?.winAmount ?? 0)
  let implied = 0
  if (bet > 0 && win >= 0) {
    const m = win / bet
    if (Number.isFinite(m) && m >= 0) implied = m
  }
  return Math.max(fromApi, fromParsed, implied)
}

function winRawFromPayoutMultiplier(amountApi, payoutMult) {
  if (payoutMult <= 0 || amountApi <= 0) return 0
  const mult = resolveStakeEnginePayoutMultiplier(payoutMult)
  return Math.round(amountApi * mult)
}

/**
 * Colorful Play / viele RGS: Integer 100–999 ist oft Hundertstel der Multi (113 = 1,13×), nicht 113×.
 * Ohne Abgleich würde resolveStakeEnginePayoutMultiplier(113) → 113× ergeben.
 * Wenn `round.payout` (Roh) passt, nutzen wir die 1,13×-Variante.
 */
function winRawFromPayoutMultiplierDisambiguated(
  amountApi,
  payoutMult,
  payoutFieldRaw,
  hasAuthoritativePayout
) {
  const p = Number(payoutMult)
  if (!Number.isFinite(p) || p <= 0 || amountApi <= 0) return 0
  const primaryMult = resolveStakeEnginePayoutMultiplier(p)
  let win = Math.round(amountApi * primaryMult)

  if (!hasAuthoritativePayout || !Number.isFinite(payoutFieldRaw)) {
    return win
  }

  if (Number.isInteger(p) && p >= 100 && p < 1000) {
    const altMult = p / 100
    const winAlt = Math.round(amountApi * altMult)
    const errP = Math.abs(win - payoutFieldRaw)
    const errA = Math.abs(winAlt - payoutFieldRaw)
    const tol = Math.max(payoutFieldRaw, amountApi, 1) * 0.03
    if (errA < errP && errA <= tol) {
      return winAlt
    }
  }
  return win
}

const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']
// Fiat-Währungen haben meist 2 Dezimalstellen, Crypto meist 8
const FIAT_CURRENCIES = ['eur', 'usd', 'brl', 'cad', 'cny', 'inr', 'mxn', 'php', 'pln', 'pkr', 'rub', 'try', 'ngn', 'ars', 'cop', 'pen', 'clp']
const STAKEENGINE_MIN_DELAY_MS = 50

function parseConfigFromUrl(config) {
  try {
    const url = typeof config === 'string' ? config : config?.url
    // 1000 Lakes Studios nutzt oft die gleiche Engine/URL-Struktur
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

/** Betrag in Stake Engine Format: STAKE_ENGINE_API_MULTIPLIER = 1 Einheit */
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
  
  return Math.round(units * STAKE_ENGINE_API_MULTIPLIER)
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
    const units = v / STAKE_ENGINE_API_MULTIPLIER
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
  const authBalanceUnits = authBalanceRaw != null ? authBalanceRaw / STAKE_ENGINE_API_MULTIPLIER : null
  const initialBalance = authBalanceUnits != null
    ? ZERO_DECIMAL_CURRENCIES.includes(authCurrency)
      ? Math.round(authBalanceUnits)
      : Math.round(authBalanceUnits * 100)
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
    slotSlug: slotSlug || '',
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

/** Letztes positives awa in round.events (Minor wie UI, oft zuverlässiger als round.payout bei Colorful Play). */
function lastWinMinorFromRoundEvents(round) {
  const evs = round?.events
  if (!Array.isArray(evs) || evs.length === 0) return null
  for (let i = evs.length - 1; i >= 0; i--) {
    const awa = evs[i]?.awa
    if (awa == null) continue
    const n = Number(awa)
    if (!Number.isFinite(n) || n <= 0) continue
    return Math.round(n)
  }
  return null
}

export async function placeBet(session, betAmount, extraBet, autoplay = false, options = {}) {
  const slotSlug = (session?.slotSlug || options?.slotSlug || '').toLowerCase()
  const useAnte = extraBet && slotSlug.startsWith('paperclip-')
  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet, slotSlug || undefined)
  const amountForApi = useAnte ? betAmount : effectiveBet
  let amount = toStakeEngineAmount(amountForApi, session?.currencyCode || 'eur')

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
  const mode = useAnte ? 'ANTE' : 'base'
  const playBody = { sessionID: session.sessionID, amount, mode, currency }
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
    if (err === 'ERR_IPB' || String(err).includes('ERR_IPB')) {
      const ex = new Error(`Stake Engine: ${err}`)
      ex.insufficientBalance = true
      throw ex
    }
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
    if (err === 'ERR_IPB' || String(err).includes('ERR_IPB')) {
      const ex = new Error(`Stake Engine: ${err}`)
      ex.insufficientBalance = true
      throw ex
    }
    if (err === 'ERR_VAL' || String(err).includes('ERR_VAL')) {
      throw new Error(`Ungültiger Einsatz (ERR_VAL). Bitte Einsatz prüfen.`)
    }
    throw new Error(`Stake Engine: ${err}`)
  }

  const round = playData?.round || {}
  const roundStatus = round?.status || ''
  // Viele Stake-Engine-/RGS-Antworten (u. a. Colorful Play, Black Coffee) liefern den Nettogewinn
  // explizit als `round.payout` in derselben Rohskala wie `round.amount` — das ist zuverlässiger als
  // nur winAmount / payoutMultiplier-Heuristik (besonders wenn winAmount fehlt oder abweicht).
  const payoutFieldRaw =
    round?.payout != null && round?.payout !== '' ? Number(round.payout) : NaN
  const hasAuthoritativePayout = Number.isFinite(payoutFieldRaw) && payoutFieldRaw >= 0

  let winAmount = Number(
    round?.winAmount ?? round?.win ?? round?.outcome?.win ?? round?.result?.winAmount ?? 0
  )
  // Stake Engine RGS: payoutMultiplier (Hundertstel oder Ganzzahl) → Win in API-Roh
  const payoutMult = Number(round?.payoutMultiplier ?? round?.payout_multiplier ?? 0)
  const fromPayoutMult =
    payoutMult > 0 && amount > 0
      ? winRawFromPayoutMultiplierDisambiguated(amount, payoutMult, payoutFieldRaw, hasAuthoritativePayout)
      : 0

  // Zuerst Multiplikator × Einsatz (entspricht meist der Stake-UI). `round.payout` kann bei Colorful Play
  // / Shamrock u. a. höher liegen (Akkumulation, Feature-Summe) oder von der angezeigten Multi abweichen.
  if (fromPayoutMult > 0 && payoutMult > 0) {
    winAmount = fromPayoutMult
  } else if (hasAuthoritativePayout) {
    winAmount = payoutFieldRaw
  } else if (winAmount === 0 && fromPayoutMult > 0) {
    winAmount = fromPayoutMult
  } else if (fromPayoutMult > 0 && winAmount > 0) {
    // Falls RGS sowohl winAmount als auch payoutMultiplier liefert: payoutMultiplier bevorzugen,
    // da einige Slots (z.B. Maze Quest) winAmount in anderem Format liefern können.
    const winInUnitsFromRaw = winAmount / STAKE_ENGINE_API_MULTIPLIER
    const curr = (playData?.balance?.currency || session?.currencyCode || 'eur').toLowerCase()
    const isFiat = FIAT_CURRENCIES.includes(curr)
    const wouldBeZero = isFiat && winInUnitsFromRaw < 0.001
    if (wouldBeZero) winAmount = fromPayoutMult
  }
  const balanceObj = playData?.balance || {}
  const balanceRaw = balanceObj?.amount != null ? Number(balanceObj.amount) : null
  const respCurrency = (balanceObj?.currency || session?.currencyCode || 'EUR').toLowerCase()
  const balanceUnits = balanceRaw != null ? balanceRaw / STAKE_ENGINE_API_MULTIPLIER : null
  const balanceMinor = balanceUnits != null
    ? ZERO_DECIMAL_CURRENCIES.includes(respCurrency)
      ? Math.round(balanceUnits)
      : Math.round(balanceUnits * 100)
    : null

  const winInUnits = winAmount / STAKE_ENGINE_API_MULTIPLIER
  let winDisplay
  if (ZERO_DECIMAL_CURRENCIES.includes(respCurrency)) {
    winDisplay = Math.round(winInUnits)
    // VND: RGS liefert teils 1 Einheit = 100 VND (14→1400), teils bereits in VND (z.B. payoutMult-Pfad)
    // Heuristik: winInUnits >= 1000 = bereits VND; sonst RGS-Format (×100)
    if (respCurrency === 'vnd' && winDisplay > 0 && winDisplay < 1000) {
      winDisplay = winDisplay * 100
    }
  } else {
    // Wie EUR/INR: Major → Minor (Paisa/Cent); RGS-Roh ist bereits über STAKE_ENGINE_API_MULTIPLIER.
    // Früher: extra ×100 für PKR — führte bei Valkyrie u. a. zu 100× zu hohen Won (USD).
    winDisplay = Math.round(winInUnits * 100)
  }

  const colorfulOrBc =
    slotSlug.startsWith('colorfulplay-') ||
    slotSlug.startsWith('blackcoffeestudios-') ||
    slotSlug.startsWith('paperclip-') ||
    slotSlug.startsWith('uppercut-')
  const awaMinor = lastWinMinorFromRoundEvents(round)
  const betMinor = Number(betAmount) || 0
  if (colorfulOrBc && awaMinor != null && awaMinor > 0 && betMinor > 0 && awaMinor <= betMinor * 500000) {
    const diffRel = Math.abs(awaMinor - winDisplay) / Math.max(awaMinor, winDisplay, 1)
    if (diffRel > 0.02) {
      winDisplay = awaMinor
    }
  }

  // parseBetResponse liest awa vom letzten Event – stellen wir sicher, dass der Gewinn drin steht
  const baseEvents = round?.events?.length ? round.events : []
  const eventsWithWin = [...baseEvents, { awa: winDisplay }]

  const data = {
    statusCode: 0,
    accountBalance: { balance: balanceMinor, currencyCode: respCurrency.toUpperCase() },
    round: {
      ...round,
      status: round?.status || 'complete',
      roundId: round?.roundId ?? round?.betID ?? round?.betId ?? round?.id,
      events: eventsWithWin,
      winAmountDisplay: winDisplay, // Explizit für parseBetResponse (Gleiche Einheiten wie balance)
    },
    _stakeEngine: {
      raw: playData,
      balance: balanceObj,
      currency: respCurrency.toUpperCase(),
      /** Minor units (wie balance) — parseBetResponse nutzt das zuerst, damit Bonus-/Event-Logik nichts überschreibt */
      winMinor: winDisplay,
      /** Debug: gleiche Skala wie wallet/play `amount` (API-Roh) */
      betAmountApiRaw: amount,
      payoutApiRaw: hasAuthoritativePayout ? payoutFieldRaw : null,
      payoutFromMultiplierApiRaw: fromPayoutMult > 0 ? fromPayoutMult : null,
      /** Effektiver Multi (API-Roh: Win-Roh / Bet-Roh), nach Hundertstel-Disambiguierung */
      payoutMultiplierEffective:
        fromPayoutMult > 0 && amount > 0 ? fromPayoutMult / amount : null,
      eventWinMinorLastAwa: awaMinor,
    },
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
