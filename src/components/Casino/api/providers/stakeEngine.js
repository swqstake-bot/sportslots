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
import {
  isFiatCurrency,
  isGoldCoinCurrency,
  isZeroDecimalCurrency,
  canonicalizeStakeEngineRgsCurrency,
} from '../../utils/currencyMeta'
import { normalizeProviderError } from './providerErrors'

/** EU GoldCoins wallet (gold/sweeps) — never true for .com crypto/fiat sessions. */
function isEuGoldCoinWallet(sourceCurrency, targetCurrency) {
  return isGoldCoinCurrency(sourceCurrency) || isGoldCoinCurrency(targetCurrency)
}

/** Currency used for cent/crypto amount math (may differ from RGS play `currency`, e.g. XEC→sweeps on .eu). */
function sessionAmountMathCurrency(session) {
  return (
    session?.amountMathCurrency ||
    (session?.euGoldSession
      ? canonicalizeStakeEngineRgsCurrency(session?.currencyCode, { euGoldSession: true })
      : null) ||
    session?.currencyCode ||
    'eur'
  )
}

/** RGS: ganzzahliger Betrag; 1.000.000 = 1,0 Währungseinheit (vgl. stake-engine API_MULTIPLIER). */
export const STAKE_ENGINE_API_MULTIPLIER = 1_000_000

function stakeEngineError(message, cause) {
  return normalizeProviderError('stakeEngine', cause || new Error(message), message)
}

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

/**
 * Optional min gap between plays on one session. Primary protection is the per-session
 * play lock below — Stake Engine RGS is sequential per session (multi in-flight → errors).
 */
const STAKEENGINE_MIN_DELAY_MS = 0

/** Serialize wallet/play (+ end-round retry) per sessionID — one in-flight play at a time. */
const sessionPlayLocks = new Map()

async function withSessionPlayLock(session, fn) {
  const key = String(session?.sessionID || session?.sessionId || '')
  if (!key) return fn()
  const prev = sessionPlayLocks.get(key) || Promise.resolve()
  let release
  const gate = new Promise((r) => {
    release = r
  })
  const next = prev.catch(() => {}).then(() => gate)
  sessionPlayLocks.set(key, next)
  await prev.catch(() => {})
  try {
    return await fn()
  } finally {
    release()
    if (sessionPlayLocks.get(key) === next) sessionPlayLocks.delete(key)
  }
}

const STAKE_ENGINE_PLAY_MODE_BY_SLOT_PREFIX = {
  'coreffectinteractive-cut-n-crash': '688_base',
  'mintyfresh-': 'normal',
}

function isMintyFreshSlug(slotSlug) {
  return String(slotSlug || '').toLowerCase().startsWith('mintyfresh-')
}

/** flowerpoker.har / brew-and-broom.har: play body has no `currency` (session already bound). */
function shouldOmitStakeEnginePlayCurrency(slotSlug) {
  const s = String(slotSlug || '').toLowerCase()
  return s.startsWith('lk7-') || isMintyFreshSlug(s)
}

function getStakeEnginePlayModeForSlot(slotSlug) {
  const slug = String(slotSlug || '').toLowerCase()
  if (!slug) return null
  for (const [prefix, mode] of Object.entries(STAKE_ENGINE_PLAY_MODE_BY_SLOT_PREFIX)) {
    if (slug.startsWith(prefix)) return mode
  }
  return null
}

function stakeEngineModeName(entry) {
  if (typeof entry === 'string') return entry.trim()
  return String(entry?.mode ?? entry?.name ?? '').trim()
}

function isStakeEnginePrimaryPlayModeName(name) {
  const n = String(name || '').toLowerCase()
  return n === 'base' || n === 'normal'
}

function isStakeEngineNonPrimaryPlayModeName(name) {
  const n = String(name || '').toLowerCase().replace(/[_-]/g, '')
  return (
    n === 'ante' ||
    n === 'extra' ||
    n === 'extrachance' ||
    n === 'bonus' ||
    n === 'freespin' ||
    n === 'freespins' ||
    n === 'super' ||
    n === 'superspin' ||
    n === 'buybonus' ||
    n === 'bonusbuy'
  )
}

function parseStakeEngineGameModes(configData) {
  const raw = Array.isArray(configData?.gameModes) ? configData.gameModes : []
  return raw
    .map((m) => {
      if (typeof m === 'string') return { mode: m.trim(), cost: NaN }
      return {
        mode: String(m?.mode ?? m?.name ?? '').trim(),
        cost: Number(m?.cost ?? m?.costMultiplier ?? m?.cost_multiplier),
      }
    })
    .filter((m) => m.mode)
}

function isStakeEngineAnteModeName(name) {
  const n = String(name || '').toLowerCase()
  return n === 'ante' || n === 'extra' || n === 'extra_chance' || n === 'extrachance' || n === 'extra-chance'
}

function findStakeEngineAnteGameMode(modes) {
  if (!Array.isArray(modes)) return null
  return modes.find((m) => isStakeEngineAnteModeName(m?.mode)) || null
}

function isMetaGamingSlug(slotSlug) {
  const slug = String(slotSlug || '').toLowerCase()
  return slug.startsWith('meta-gaming-') || slug.startsWith('metagaming-')
}

function isMetaGamingProvider(session, options) {
  const pid = String(
    options?.providerId || session?.providerId || session?.__catalogProviderId || session?.__resolvedProviderImplId || ''
  ).toLowerCase()
  return pid === 'meta-gaming' || pid === 'metagaming'
}

/**
 * Extra / extra-chance: RGS play uses the ante mode + base amount (Meta Gaming HAR:
 * `{ mode: "ante", amount, currency }`). Paperclip uses ANTE the same way.
 */
function resolveStakeEngineAntePlay(session, extraBet, slotSlug) {
  if (!extraBet) return null
  const fromSessionMode = String(session?.extraBetMode || '').trim()
  if (fromSessionMode) {
    const cost = Number(session?.extraBetMultiplier)
    return {
      mode: fromSessionMode,
      costMultiplier: Number.isFinite(cost) && cost > 0 ? cost : null,
    }
  }
  const fromModes = findStakeEngineAnteGameMode(session?.gameModes)
  if (fromModes?.mode) {
    const cost = Number(fromModes.cost)
    return {
      mode: fromModes.mode,
      costMultiplier: Number.isFinite(cost) && cost > 0 ? cost : null,
    }
  }
  const slug = String(slotSlug || '').toLowerCase()
  if (slug.startsWith('paperclip-')) return { mode: 'ANTE', costMultiplier: 3 }
  if (isMetaGamingSlug(slug) || isMetaGamingProvider(session, null)) {
    return { mode: 'ante', costMultiplier: 3 }
  }
  return null
}

/**
 * Prefer exact mode string from RGS `config.gameModes`.
 * Flower Poker: "base". MintyFresh Brew & Broom HAR: "normal" (BASE is rejected with ERR_VAL).
 * Do not uppercase — some studios reject "BASE" when only "base" is listed.
 */
function pickStakeEnginePlayMode(configData, slotSlug) {
  const modes = Array.isArray(configData?.gameModes) ? configData.gameModes : []
  const names = modes.map(stakeEngineModeName).filter(Boolean)
  const primary = names.find(isStakeEnginePrimaryPlayModeName)
  if (primary) return primary
  const explicit = configData?.mode || configData?.baseMode || configData?.defaultMode
  if (explicit != null && String(explicit).trim() !== '') return String(explicit)
  const fromSlug = getStakeEnginePlayModeForSlot(slotSlug)
  if (fromSlug) return fromSlug
  const firstPlay = names.find((n) => !isStakeEngineNonPrimaryPlayModeName(n))
  if (firstPlay) return firstPlay
  // Legacy default (Waylanders / many studios): uppercase BASE
  return 'BASE'
}

/** Brew & Broom HAR: `{ payload: { requestType: "normal" }, mode: "normal" }`. */
function stakeEnginePlayPayload(mode, slotSlug) {
  const m = String(mode || '')
  if (m.toLowerCase() === 'normal') return { requestType: m }
  if (isMintyFreshSlug(slotSlug)) return { requestType: 'normal' }
  return null
}

function buildStakeEnginePlayBody({ sessionID, amount, mode, currency, omitCurrency, payload }) {
  const body = { sessionID, amount, mode }
  if (!omitCurrency && currency) body.currency = currency
  if (payload && typeof payload === 'object') body.payload = payload
  return body
}

function firstNonEmpty(...values) {
  for (const v of values) {
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return null
}

function queryParam(search, ...names) {
  if (!search) return null
  for (const name of names) {
    const v = search.get(name)
    if (v) return v
  }
  return null
}

function extractSessionFields(obj) {
  if (!obj || typeof obj !== 'object') return null
  const sessionID = firstNonEmpty(obj.sessionID, obj.sessionId, obj.session_id)
  const rgsUrl = firstNonEmpty(obj.rgsUrl, obj.rgs_url, obj.rgs, obj.server)
  if (!sessionID || !rgsUrl) return null
  const gameId = firstNonEmpty(obj.gameId, obj.game_id, obj.gameid)
  return { sessionID, rgsUrl: rgsUrl.replace(/\/$/, ''), gameId }
}

function parseLaunchUrl(urlRaw) {
  const raw = String(urlRaw || '').trim().replace(/&amp;/g, '&')
  if (!raw) return null
  let u
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const hash = String(u.hash || '').replace(/^#/, '')
  const hashQs = new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash)
  const sessionID = queryParam(u.searchParams, 'sessionID', 'sessionId', 'session_id')
    || queryParam(hashQs, 'sessionID', 'sessionId', 'session_id')
  const rgsUrl = queryParam(u.searchParams, 'rgs_url', 'rgsUrl', 'rgs', 'server')
    || queryParam(hashQs, 'rgs_url', 'rgsUrl', 'rgs', 'server')
  if (!sessionID || !rgsUrl) return null
  const gameId = queryParam(u.searchParams, 'gameId', 'game_id', 'gameid')
    || queryParam(hashQs, 'gameId', 'game_id', 'gameid')
  return { sessionID, rgsUrl: rgsUrl.replace(/\/$/, ''), gameId }
}

/** Launch-URL oder Session-Objekt → sessionID + rgsUrl (Studio-Host, nicht nur stake-engine.de). */
function parseConfigFromUrl(config) {
  try {
    if (config && typeof config === 'object') {
      const direct = extractSessionFields(config)
      if (direct) return direct
      const nested = parseConfigFromUrl(config.url || config.config || config.launchUrl || config.href)
      if (nested) return nested
    }
    const raw = typeof config === 'string' ? config.trim() : ''
    if (!raw) return null
    if (raw.startsWith('{')) {
      try {
        return parseConfigFromUrl(JSON.parse(raw))
      } catch {
        // fall through — maybe a URL that starts with {
      }
    }
    return parseLaunchUrl(raw)
  } catch {
    return null
  }
}

function summarizeLaunchConfig(config) {
  try {
    const raw = typeof config === 'string' ? config : config?.url || config?.config || ''
    if (typeof raw === 'string' && raw.startsWith('http')) {
      const u = new URL(raw)
      const keys = [...u.searchParams.keys()]
      return `${u.hostname}${keys.length ? ` ?${keys.join(',')}` : ''}`
    }
    if (config && typeof config === 'object') return `object:${Object.keys(config).slice(0, 8).join(',')}`
    if (raw) return `string(${Math.min(raw.length, 48)}c)`
  } catch {
    // ignore
  }
  return 'empty'
}

/** Betrag in Stake Engine Format: STAKE_ENGINE_API_MULTIPLIER = 1 Einheit */
function toStakeEngineAmount(betAmount, targetCurrency) {
  const curr = (targetCurrency || 'eur').toLowerCase()
  const isZeroDec = isZeroDecimalCurrency(curr)
  // GoldCoins (GC/SC) use 2-decimal minor like fiat — not crypto 1e8.
  const centCurrency = isFiatCurrency(curr) || isGoldCoinCurrency(curr)

  let units
  if (isZeroDec) {
    units = Number(betAmount)
  } else if (centCurrency) {
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

/** Bonus-/FS-Fortsetzung: kein end-round nach diesem play (sonst bricht Pick/Bonus ab). */
export function skipStakeEngineEndRoundAfterSuccessfulPlay(round, options = {}) {
  // Harte Stop-on-Bonus-Regel:
  // In Hunt/Play mit aktiviertem skipContinueOnBonus darf placeBet selbst niemals
  // end-round finalisieren. Sonst wird ein getriggerter Bonus (z. B. Wizard 2000)
  // serverseitig direkt ausgespielt.
  if (options?.skipContinueOnBonus) return true

  const fsLeft = Number(
    round?.freespinsLeft ?? round?.freeSpinsLeft ?? round?.freespins_left ?? round?.fs ?? round?.bonusRounds ?? 0
  )
  if (Number.isFinite(fsLeft) && fsLeft > 0) return true
  const evs = Array.isArray(round?.events) ? round.events : []
  const hasFeatureEnter = evs.some((ev) => {
    const etn = String(ev?.etn || '').toLowerCase()
    return etn === 'feature_enter' || etn === 'fs_enter' || etn === 'freespins_enter' || etn === 'fs_start'
  })
  if (hasFeatureEnter) return true

  // Bonus Hunt: wenn Trigger erkannt wurde, darf kein end-round gesendet werden,
  // sonst wird der Bonus serverseitig sofort abgeschlossen statt "liegen gelassen".
  if (options?.skipContinueOnBonus) {
    const mode = String(round?.mode || '').toLowerCase()
    if (mode === 'bonus') return true

    const hasBonusEventSignal = evs.some((ev) => {
      const fid = ev?.c?.bonusFeatureWon || ev?.c?.bonusFeaturewon
      if (fid != null && String(fid).trim() !== '') return true
      return (ev?.c?.actions || []).some((a) => String(a?.at || '').toLowerCase() === 'bonusfeaturewon')
    })
    if (hasBonusEventSignal) return true

    const stateItems = Array.isArray(round?.state) ? round.state : []
    if (stateItems.length > 0) {
      const stateTypes = new Set(
        stateItems
          .map((s) => String(s?.type || '').toLowerCase().replace(/[_-]/g, ''))
          .filter(Boolean)
      )
      const hasBonusTrigger =
        stateTypes.has('freespintrigger') ||
        stateTypes.has('freespinstart') ||
        stateTypes.has('freespinenter') ||
        stateTypes.has('enterbonus')
      const autoResolvedSameSpin =
        stateTypes.has('freespintrigger') &&
        stateTypes.has('freespinend')
      if (hasBonusTrigger && !autoResolvedSameSpin) {
        return true
      }
    }
  }
  return false
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
      throw stakeEngineError('Stake Engine Proxy Error', e)
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

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency, opts = {}) {
  const src = sourceCurrency?.toLowerCase() || 'usdc'
  const tgt = targetCurrency?.toLowerCase() || 'eur'
  // Only stake.eu uses gold/sweeps wallets; gate XEC→SC math so .com eCash (XEC) stays crypto.
  const euGoldSession = isEuGoldCoinWallet(src, tgt)

  const session = await startThirdPartySession(accessToken, slotSlug, src, tgt, opts)
  const parsed = parseConfigFromUrl(session?.config) || parseConfigFromUrl(session)
  if (!parsed?.sessionID || !parsed?.rgsUrl) {
    throw stakeEngineError(
      `Keine gültige Stake-Engine-Session für ${slotSlug} (${summarizeLaunchConfig(session?.config)}).`
    )
  }

  const authUrl = buildRgsUrl(parsed.rgsUrl, '/wallet/authenticate')
  const authRes = await rgsPost(authUrl, { sessionID: parsed.sessionID })
  let authData
  try {
    authData = await authRes.json()
  } catch (e) {
    const text = await authRes.text()
    throw stakeEngineError(`Stake Engine Auth fehlgeschlagen: ${text || authRes.status}`)
  }

  if (!authRes.ok) {
    const err = authData?.error || authData?.message || authRes.status
    throw stakeEngineError(`Stake Engine: ${err}`)
  }

  logApiCall({ type: 'stakeEngine/authenticate', endpoint: authUrl, request: { sessionID: parsed.sessionID }, response: { config: authData?.config, balance: authData?.balance }, error: null, durationMs: null })

  const configData = authData?.config || {}
  const playMode = pickStakeEnginePlayMode(configData, slotSlug)
  const gameModes = parseStakeEngineGameModes(configData)
  const anteMode = findStakeEngineAnteGameMode(gameModes)
  const catalogPid = String(opts?.providerId || '').toLowerCase()
  const metaGaming = isMetaGamingSlug(slotSlug) || catalogPid === 'meta-gaming' || catalogPid === 'metagaming'
  const omitPlayCurrency = shouldOmitStakeEnginePlayCurrency(slotSlug)
  const betLevelsRaw = configData?.betLevels?.map((v) => Number(v)).filter((b) => b > 0) ?? []
  // API play currency (may be XEC on .eu); math currency is wallet-facing (sweeps/gold).
  const apiCurrencyCode = String(authData?.balance?.currency || tgt || 'eur').toUpperCase()
  const amountMathCurrency = canonicalizeStakeEngineRgsCurrency(apiCurrencyCode, { euGoldSession }) || tgt
  const betLevels = betLevelsRaw.map((v) => {
    const units = v / STAKE_ENGINE_API_MULTIPLIER
    const curr = amountMathCurrency

    if (isZeroDecimalCurrency(curr)) {
      return Math.round(units)
    } else if (isFiatCurrency(curr) || isGoldCoinCurrency(curr)) {
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
  const authBalanceUnits = authBalanceRaw != null ? authBalanceRaw / STAKE_ENGINE_API_MULTIPLIER : null
  const initialBalance = authBalanceUnits != null
    ? isZeroDecimalCurrency(amountMathCurrency)
      ? Math.round(authBalanceUnits)
      : Math.round(authBalanceUnits * 100)
    : null

  return {
    sessionID: parsed.sessionID,
    rgsUrl: parsed.rgsUrl,
    betLevels: betLevels.filter((b) => b > 0),
    betLevelsRaw,
    /** Exact RGS play currency (HAR Reel Racing: XEC). */
    currencyCode: apiCurrencyCode,
    /** Wallet math code — on .eu XEC→sweeps; on .com XEC stays xec (crypto). */
    amountMathCurrency,
    euGoldSession,
    stepBet,
    minBet,
    maxBet,
    initialBalance,
    slotSlug: slotSlug || '',
    playMode,
    gameModes,
    extraBetMode: anteMode?.mode || (metaGaming ? 'ante' : null),
    extraBetMultiplier: metaGaming
      ? 3
      : anteMode && Number.isFinite(anteMode.cost) && anteMode.cost > 0
        ? anteMode.cost
        : null,
    supportsExtraBet: Boolean(anteMode?.mode) || metaGaming || String(slotSlug || '').toLowerCase().startsWith('paperclip-'),
    omitPlayCurrency,
    playPayload: stakeEnginePlayPayload(playMode, slotSlug),
    /** Wenn die Session-Config-URL eine Stake-Spiel-UUID enthält — sonst über Slot `stakeGameId` aus Kurator. */
    stakeGameId: parsed.gameId || null,
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
  const antePlay = resolveStakeEngineAntePlay(session, extraBet, slotSlug)
  const effectiveBet = antePlay?.costMultiplier > 0
    ? betAmount * antePlay.costMultiplier
    : getEffectiveBetAmount(betAmount, extraBet, slotSlug || undefined)
  const amountForApi = antePlay ? betAmount : effectiveBet
  // Use wallet math currency (sweeps), not raw RGS code (XEC) — else EU SC bets collapse to min/10c.
  let amount = toStakeEngineAmount(amountForApi, sessionAmountMathCurrency(session))

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

  // RGS is sequential per session — never overlap play/end-round on the same sessionID.
  return withSessionPlayLock(session, async () => {
  const lastPlayAt = session?.lastPlayAt || 0
  const waitMs = STAKEENGINE_MIN_DELAY_MS - (Date.now() - lastPlayAt)
  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs))
  }

  const endUrl = buildRgsUrl(session.rgsUrl, '/wallet/end-round')
  const playUrl = buildRgsUrl(session.rgsUrl, '/wallet/play')
  let mode = antePlay
    ? antePlay.mode
    : (options?.mode ||
        pickStakeEnginePlayMode({ gameModes: session?.gameModes }, slotSlug) ||
        session?.playMode ||
        'BASE')
  // Preserve exact RGS mode casing from authenticate.gameModes (Flower Poker HAR: "base").
  // Do NOT force "BASE" — LK7 rejects uppercase when only "base" is listed.
  // MintyFresh Brew & Broom HAR: mode "normal" + payload.requestType, no currency.
  const omitCurrency =
    Boolean(session?.omitPlayCurrency) || shouldOmitStakeEnginePlayCurrency(slotSlug)
  const playPayload = antePlay
    ? null
    : (session?.playPayload || stakeEnginePlayPayload(mode, slotSlug))
  let playBody = buildStakeEnginePlayBody({
    sessionID: session.sessionID,
    amount,
    mode,
    currency,
    omitCurrency,
    payload: playPayload,
  })
  const t0 = Date.now()
  let playRes = await rgsPost(playUrl, playBody)

  let playData
  try {
    playData = await playRes.json()
  } catch (e) {
    const text = await playRes.text()
    logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: null, error: text || String(e), durationMs: Date.now() - t0 })
    throw stakeEngineError(`Stake Engine Play fehlgeschlagen: ${text || playRes.status}`)
  }

  if (!playRes.ok) {
    const err = playData?.error || playRes.status
    if (err === 'ERR_IPB' || String(err).includes('ERR_IPB')) {
      const ex = stakeEngineError(`Stake Engine: ${err}`)
      ex.insufficientBalance = true
      throw ex
    }
    if (err === 'ERR_IS' || String(err).includes('ERR_IS')) {
      const ex = stakeEngineError('Session abgelaufen. Bitte Session neu starten.')
      ex.sessionClosed = true
      throw ex
    }
    // Runde oft noch „offen“ bis end-round; früher nur bei „active bet“ in message → Retry ausgelassen (Waylanders).
    if (err === 'ERR_VAL' || String(err).includes('ERR_VAL')) {
      const endT = Date.now()
      const endRes = await rgsPost(endUrl, { sessionID: session.sessionID })
      let endPayload = null
      try {
        endPayload = await endRes.json()
      } catch {
        await endRes.text().catch(() => '')
      }
      logApiCall({
        type: 'stakeEngine/end-round',
        endpoint: endUrl,
        request: { sessionID: session.sessionID },
        response: endPayload,
        error: endRes.ok ? null : endRes.status,
        durationMs: Date.now() - endT,
      })
      playRes = await rgsPost(playUrl, playBody)
      try {
        playData = await playRes.json()
      } catch (e) {
        const text = await playRes.text()
        logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: null, error: text || String(e), durationMs: Date.now() - t0 })
        throw stakeEngineError(`Stake Engine Play fehlgeschlagen: ${text || playRes.status}`)
      }
    }
  }

  if (!playRes.ok) {
    const err = playData?.error || playRes.status
    if (err === 'ERR_IS' || String(err).includes('ERR_IS')) {
      logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: playData, error: err, durationMs: Date.now() - t0 })
      const ex = stakeEngineError('Session abgelaufen. Bitte Session neu starten.')
      ex.sessionClosed = true
      throw ex
    }
    if (err === 'ERR_IPB' || String(err).includes('ERR_IPB')) {
      logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: playData, error: err, durationMs: Date.now() - t0 })
      const ex = stakeEngineError(`Stake Engine: ${err}`)
      ex.insufficientBalance = true
      throw ex
    }
    if ((err === 'ERR_VAL' || String(err).includes('ERR_VAL')) && !antePlay) {
      const altBody = buildStakeEnginePlayBody({
        sessionID: session.sessionID,
        amount,
        mode: 'normal',
        omitCurrency: true,
        payload: { requestType: 'normal' },
      })
      if (JSON.stringify(altBody) !== JSON.stringify(playBody)) {
        const altRes = await rgsPost(playUrl, altBody)
        let altData
        try {
          altData = await altRes.json()
        } catch (e) {
          const text = await altRes.text()
          logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: altBody, response: null, error: text || String(e), durationMs: Date.now() - t0 })
          throw stakeEngineError(`Stake Engine Play fehlgeschlagen: ${text || altRes.status}`)
        }
        if (altRes.ok) {
          playRes = altRes
          playData = altData
          playBody = altBody
          session.playMode = 'normal'
          session.omitPlayCurrency = true
          session.playPayload = { requestType: 'normal' }
        } else {
          logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: altBody, response: altData, error: altData?.error || altRes.status, durationMs: Date.now() - t0 })
        }
      }
    }
    if (!playRes.ok) {
      logApiCall({ type: 'stakeEngine/play', endpoint: playUrl, request: playBody, response: playData, error: playData?.error || playRes.status, durationMs: Date.now() - t0 })
      const finalErr = playData?.error || playRes.status
      if (finalErr === 'ERR_VAL' || String(finalErr).includes('ERR_VAL')) {
        throw stakeEngineError('Ungültiger Einsatz (ERR_VAL). Bitte Einsatz prüfen.')
      }
      throw stakeEngineError(`Stake Engine: ${finalErr}`)
    }
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
    const curr = sessionAmountMathCurrency(session).toLowerCase()
    const centCurrency = isFiatCurrency(curr) || isGoldCoinCurrency(curr)
    const wouldBeZero = centCurrency && winInUnitsFromRaw < 0.001
    if (wouldBeZero) winAmount = fromPayoutMult
  }
  const balanceObj = playData?.balance || {}
  const balanceRaw = balanceObj?.amount != null ? Number(balanceObj.amount) : null
  // RGS: XGC/XSC/XEC(.eu only); wallet/UI/houseBets: gold/sweeps.
  const respCurrencyRaw = (balanceObj?.currency || session?.currencyCode || 'EUR').toLowerCase()
  const respCurrency = canonicalizeStakeEngineRgsCurrency(respCurrencyRaw, {
    euGoldSession: Boolean(session?.euGoldSession),
  })
  const balanceUnits = balanceRaw != null ? balanceRaw / STAKE_ENGINE_API_MULTIPLIER : null
  const balanceMinor = balanceUnits != null
    ? isZeroDecimalCurrency(respCurrency)
      ? Math.round(balanceUnits)
      : Math.round(balanceUnits * 100)
    : null

  const winInUnits = winAmount / STAKE_ENGINE_API_MULTIPLIER
  let winDisplay
  if (isZeroDecimalCurrency(respCurrency)) {
    winDisplay = Math.round(winInUnits)
    // VND: Legacy-Responses waren teils in 1/100 VND kodiert. Bei Wizard/Titan sehen wir jedoch
    // konsistente payout/amount-Werte (payoutMultiplier-Pfad), dort darf NICHT nochmals ×100 erfolgen.
    // Daher nur noch als enger Fallback, wenn weder payout noch payoutMultiplier belastbar sind.
    const shouldApplyVndCentFallback =
      respCurrency === 'vnd' &&
      winDisplay > 0 &&
      winDisplay < 1000 &&
      !(hasAuthoritativePayout || fromPayoutMult > 0)
    if (shouldApplyVndCentFallback) {
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

  // waylanders.har: Gewinn → round.active:true bis /wallet/end-round; ohne finalize ERR_VAL beim nächsten play.
  const needsEndRoundFinalize =
    round.active === true || (winDisplay > 0 && round.active !== false)
  if (needsEndRoundFinalize && !skipStakeEngineEndRoundAfterSuccessfulPlay(round, options)) {
    const endT = Date.now()
    const endRes = await rgsPost(endUrl, { sessionID: session.sessionID })
    let endPayload = null
    try {
      endPayload = await endRes.json()
    } catch {
      await endRes.text().catch(() => '')
    }
    logApiCall({
      type: 'stakeEngine/end-round',
      endpoint: endUrl,
      request: { sessionID: session.sessionID },
      response: endPayload,
      error: endRes.ok ? null : endRes.status,
      durationMs: Date.now() - endT,
    })
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
      // HAR / Stake Engine: round.betID is the numeric casino bet id (e.g. 13335567427).
      roundId: round?.betID ?? round?.betId ?? round?.roundId ?? round?.id ?? null,
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
  })
}
