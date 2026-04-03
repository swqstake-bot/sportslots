import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react'
import { fetchChallengeList, fetchCurrencyRates, extractProviderGroupSlug } from '../api/stakeChallenges'
import { getProvider } from '../api/providers'
import { isFiat, formatAmount, formatBetLabel, toUnits, toMinor, ZERO_DECIMAL_CURRENCIES } from '../utils/formatAmount'
import { parseBetResponse } from '../utils/parseBetResponse'
import { Button } from './ui/Button'
import { CURRENCY_GROUPS, PROVIDER_CURRENCIES } from '../constants/currencies'
import { notifyChallengeStart, requestNotificationPermission } from '../utils/notifications'
import { addDiscoveredFromChallenges } from '../utils/discoveredSlots'
import { effectiveSpinMultiplierFromParsed } from '../api/providers/stakeEngine'
import { appendBet } from '../utils/betHistoryDb'
import {
  formatStakeShareBetId,
  isPersistableStakeHouseBetShareId,
  pickStakeHouseBetShareRawId,
  stakeBetIdForPreviewApi,
  stakeBetModalShareUrl,
} from '../utils/stakeBetShareId'
import { normalizeBetSlugForHouseMatch, houseBetSlugMatchesSessionSlug } from '../utils/slotSlugMatching'
import { setHunterSlotTargets } from '../utils/hunterSlotTargetsBridge'
import { subscribeToHouseBets } from '../api/stakeRealtimeFacade'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import {
  usdLimitToInputStr,
  parseUsdLimitInput,
  isUsdLimitInputCharsOk,
} from '../utils/usdLimitInput'
import { saveFirstSlotWinIfNeeded } from '../utils/slotFirstWin'

/** Challenge-Liste: alle Einträge wie von Stake; Session/Spins über stakeEngine — nicht unterstützte Slots scheitern zur Laufzeit. */

const REFRESH_INTERVAL_MS = 2 * 60 * 1000 // 2 Minuten
/** DevTools: [Hunter-BetID] — nur bei Bedarf auf true (sonst volle Konsole). */
const DEBUG_HUNTER_BETID_MATCH = false
/** Chrome/F12-Konsole: Best-Multi + Bet-ID als `console.table` bei Änderung (zum Prüfen von Share-IDs). */
const LOG_HUNTER_BEST_TO_CONSOLE = false
/** Pending-Einträge älter: aus Queue entfernen (sonst wächst sie endlos, Matching wird langsam). */
const PENDING_HOUSEBET_MAX_AGE_MS = 35000
/** houseBets oft vor HTTP-Response — bis Pending mit Multi da ist, Events kurz puffern. */
const HOUSEBET_RETRY_BUFFER_MAX_MS = 25000
const HOUSEBET_RETRY_BUFFER_MAX = 40
/** Wenn houseBets nie matcht: Best-Multi-UI trotzdem aus HTTP (sonst hängt die Anzeige). */
const HOUSEBET_DEFERRED_UI_MULTI_MS = 5000
const PAGE_SIZE = 24 // Stake Default
/** UI-Obergrenze für parallele Läufe & Anzahl Challenge-Listen-Seiten (Slider). */
const CHALLENGE_SLIDER_MAX = 100

const HUNTER_TARGET_CANDIDATES = [
  ...CURRENCY_GROUPS.fiat.map((c) => c.value),
  ...CURRENCY_GROUPS.crypto.map((c) => c.value),
]

function generateHunterRunId() {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/** Queue-Eintrag: eindeutiger Run + Challenge-ID + Index für die N-te Zielwährung (0 = günstigster Auto-Probe wie bisher). optional forcedTargetCurrency = manuelle Zielwährung (überschreibt Auto). */
function normalizeQueueItem(raw) {
  if (raw && typeof raw === 'object' && raw.runId && raw.challengeId) {
    const idx = Number(raw.currencySlotIndex)
    const f = raw.forcedTargetCurrency
    return {
      runId: String(raw.runId),
      challengeId: String(raw.challengeId),
      currencySlotIndex: Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : 0,
      forcedTargetCurrency:
        f != null && String(f).trim() !== '' ? String(f).trim().toLowerCase() : null,
    }
  }
  const cid = typeof raw === 'string' ? raw : raw?.challengeId
  return {
    runId: generateHunterRunId(),
    challengeId: String(cid),
    currencySlotIndex: 0,
    forcedTargetCurrency: null,
  }
}

function countHunterSlotsForChallenge(challengeId, queue, activeRuns) {
  const cid = String(challengeId)
  let n = 0
  for (const item of queue) {
    const q = normalizeQueueItem(item)
    if (q.challengeId === cid) n++
  }
  for (const run of Object.values(activeRuns)) {
    if (run?.challengeId === cid && run?.status === 'running') n++
  }
  return n
}

function buildProbeCacheKey(challengeId, slotSlug, sourceCurr, minBetUsd) {
  const cid = String(challengeId || '')
  const slug = String(slotSlug || '').toLowerCase()
  const src = String(sourceCurr || '').toLowerCase()
  const min = Number(minBetUsd || 0)
  return `${cid}|${slug}|${src}|${Number.isFinite(min) ? min.toFixed(6) : '0.000000'}`
}

function getRateForCurrency(rates, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (c === 'usd') return 1
  return rates[c] || 0
}

/** Minor units → USD (wie im Spin-Loop: toUnits * Kurs) */
function minorToUsd(amountMinor, currency, rates) {
  if (amountMinor == null || currency == null) return 0
  const n = Number(amountMinor)
  if (!Number.isFinite(n)) return 0
  const c = String(currency).toLowerCase()
  const r = getRateForCurrency(rates, c)
  if (!r) return 0
  return toUnits(n, c) * r
}

/** Effektiver USD-Wert nach gleicher Rundung wie beim Hunter-Lauf (ceil + toMinor). */
function effectiveUsdAfterRounding(minBetUsd, rate, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (!rate || rate <= 0) return null
  let targetBetUnits = minBetUsd / rate
  if (ZERO_DECIMAL_CURRENCIES.includes(c)) {
    targetBetUnits = Math.ceil(targetBetUnits)
  } else if (isFiat(c)) {
    targetBetUnits = Math.ceil(targetBetUnits * 100) / 100
  } else {
    targetBetUnits = Math.ceil(targetBetUnits * 1e8) / 1e8
  }
  const minor = toMinor(targetBetUnits, c)
  return toUnits(minor, c) * rate
}

/**
 * Bei fast gleichem effektivem USD: Reihenfolge für Probes (niedrig = früher).
 * PKR/INR/… vor ARS/CLP/… — sonst schlägt oft Alphabet (ars vor pkr) bzw. zu wenige Proben.
 */
const FIAT_PROBE_PRIORITY = new Map([
  ['pkr', 0],
  ['inr', 1],
  ['idr', 2],
  ['php', 3],
  ['vnd', 4],
  ['krw', 5],
  ['jpy', 6],
  ['cny', 7],
  ['rub', 8],
  ['try', 9],
  ['pln', 10],
  ['ngn', 11],
  ['eur', 20],
  ['usd', 21],
  ['cad', 22],
  ['aud', 23],
  ['dkk', 24],
  ['ars', 50],
  ['mxn', 51],
  ['clp', 52],
  ['pen', 53],
  ['brl', 54],
  ['cop', 55],
])

function fiatProbeRank(tCurr) {
  const k = String(tCurr || '').toLowerCase()
  return FIAT_PROBE_PRIORITY.has(k) ? FIAT_PROBE_PRIORITY.get(k) : 100
}

const USD_EFF_TIE_EPS = 0.015

/**
 * PKR vs INR: `effectiveUsdAfterRounding` ignoriert echte Session-Bet-Levels (z. B. 10 PKR günstiger
 * als kleinstes INR). Wenn die Modell-USD fast gleich sind, PKR vor INR sortieren.
 */
const PKR_INR_MODEL_TIE_USD = 0.012

function comparePkrVsInrInSort(a, b) {
  const pa = (a.tCurr || '').toLowerCase()
  const pb = (b.tCurr || '').toLowerCase()
  if (pa === 'pkr' && pb === 'inr') {
    const d = Math.abs(a.usdEff - b.usdEff)
    if (d <= PKR_INR_MODEL_TIE_USD) return -1
    return a.usdEff - b.usdEff
  }
  if (pa === 'inr' && pb === 'pkr') {
    const d = Math.abs(a.usdEff - b.usdEff)
    if (d <= PKR_INR_MODEL_TIE_USD) return 1
    return a.usdEff - b.usdEff
  }
  return null
}

/**
 * Sortierung für Session-Probes:
 * 1) Fiat vor Crypto (PKR/RUB/… vor LTC/DOGE; USDC/USDT aus Probe-Pool)
 * 2) niedrigster effektiver USD-Bet (nach Rundung)
 * 3) bei ~gleichem USD: Fiat-Priorität (PKR vor ARS), dann bevorzugte Zielwährung
 */
function sortTargetCandidatesForProbe(allowedList, rates, minBetUsd, preferred) {
  const pref = (preferred || 'usd').toLowerCase()
  const candidates = []
  for (const tCurr of allowedList) {
    const rate = getRateForCurrency(rates, tCurr)
    if (!rate || rate <= 0) continue
    const usdEff = effectiveUsdAfterRounding(minBetUsd, rate, tCurr)
    if (usdEff == null || !Number.isFinite(usdEff)) continue
    const excess = usdEff - minBetUsd
    candidates.push({ tCurr, excess, fiat: isFiat(tCurr), usdEff })
  }
  if (candidates.length === 0) return []
  candidates.sort((a, b) => {
    if (a.fiat !== b.fiat) return a.fiat ? -1 : 1
    const pkrInr = comparePkrVsInrInSort(a, b)
    if (pkrInr !== null) return pkrInr
    const du = a.usdEff - b.usdEff
    if (Math.abs(du) > USD_EFF_TIE_EPS) return du
    const ra = fiatProbeRank(a.tCurr)
    const rb = fiatProbeRank(b.tCurr)
    if (ra !== rb) return ra - rb
    if (a.tCurr === pref) return -1
    if (b.tCurr === pref) return 1
    return a.usdEff - b.usdEff
  })
  return candidates.map((c) => c.tCurr)
}

/** Genug Proben, damit PKR & Co. nicht hinter den ersten 6 „Alphabet“-Kandidaten verschwinden. */
const MAX_TARGET_SESSION_PROBES = 20
/** Pause zwischen Session-Probes gegen „Please slow down“ / Rate-Limits */
const SESSION_PROBE_DELAY_MS = 400
/** Pause zwischen erfolgreichen Spins (Challenge Hunter) — niedrig hält RGS-Stress, zu niedrig → Fehler */
const HUNTER_SPIN_DELAY_MS = 150
const HUNTER_SPIN_ERROR_RETRY_MS = 2000
/** Ohne Limit: bei mehreren parallelen Läufen wächst die Recharts-Serie unbegrenzt → Renderer-Abstürze (OOM). */
const SESSION_NET_SERIES_MAX_POINTS = 5000
/** Stablecoins: aus Session-Probes (wie BTC/LTC — Nutzer will klassische Fiat wie PKR/RUB) */
const AUTO_PROBE_EXCLUDED_CURRENCIES = new Set(['usdc', 'usdt'])
/** Frühabbruch nur wenn sehr nah am Challenge-Minimum (nicht bei +$0.02 wie zuvor). */
const TARGET_PROBE_EARLY_STOP_REL = 0.02
const TARGET_PROBE_EARLY_STOP_ABS_USD = 0.002

/**
 * MinBet → Einsatz inkl. Bet-Levels; usdAt = effektiver USD-Wert des gewählten Levels.
 */
function computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd) {
  let targetBetUnits = minBetUsd / rate
  if (ZERO_DECIMAL_CURRENCIES.includes(tCurr)) {
    targetBetUnits = Math.ceil(targetBetUnits)
  } else if (isFiat(tCurr)) {
    targetBetUnits = Math.ceil(targetBetUnits * 100) / 100
  } else {
    targetBetUnits = Math.ceil(targetBetUnits * 1e8) / 1e8
  }
  let betAmount = toMinor(targetBetUnits, tCurr)
  const betLevels = Array.isArray(session?.betLevels) ? session.betLevels.slice().sort((a, b) => a - b) : []
  if (betLevels.length) {
    const bestLevel = pickSmallestBetLevelForMinUsd(betLevels, tCurr, rate, minBetUsd)
    if (bestLevel != null) {
      betAmount = bestLevel
    } else {
      const nextLevel = betLevels.find((lvl) => lvl >= betAmount)
      if (nextLevel != null) betAmount = nextLevel
    }
  }
  const usdAt = toUnits(betAmount, tCurr) * rate
  return { betAmount, usdAt }
}

function getAllowedTargetCurrenciesForSlot(providerId) {
  const list = PROVIDER_CURRENCIES[providerId] || PROVIDER_CURRENCIES.stakeEngine
  const allowed = new Set(list.map((c) => c.toLowerCase()))
  return HUNTER_TARGET_CANDIDATES.filter((c) => allowed.has(c))
}

/** Kleinster Bet-Level in Minor, der minBetUsd (USD) noch erfüllt. */
function pickSmallestBetLevelForMinUsd(betLevels, tCurr, rate, minBetUsd) {
  if (!Array.isArray(betLevels) || betLevels.length === 0) return null
  const sorted = [...betLevels].sort((a, b) => a - b)
  let best = null
  let bestUsd = Infinity
  for (const lvl of sorted) {
    const usd = toUnits(lvl, tCurr) * rate
    if (usd + 1e-9 >= minBetUsd) {
      if (usd < bestUsd - 1e-9) {
        bestUsd = usd
        best = lvl
      }
    }
  }
  return best
}

/**
 * fetchChallengeList liefert verschachtelt `game: { slug, name, … }`.
 * fetchAllChallenges mappt auf gameSlug/gameName – der Hunter nutzt Rohlisten, daher vereinheitlichen.
 */
function normalizeChallengeRow(c) {
  if (!c) return c
  const slug = c.gameSlug || c.game?.slug
  const name = c.gameName || c.game?.name
  const providerGroupSlug = extractProviderGroupSlug(c.game)
  return {
    ...c,
    gameSlug: slug,
    gameName: name != null && String(name).trim() !== '' ? name : slug,
    providerGroupSlug,
  }
}

const BEST_MULTI_STORAGE_KEY = 'slotbot_hunter_best_multi_by_slug'
/** Lifetime: Share-ID zum höchsten jemals getroffenen Multi pro Slot (nur houseBets). */
const BEST_BET_ID_OVERALL_KEY = 'slotbot_hunter_best_betid_by_slug'
const CHALLENGE_HITS_STORAGE_KEY = 'slotbot_hunter_challenge_hits'

function persistChallengeHitRecord(entry) {
  try {
    const raw = localStorage.getItem(CHALLENGE_HITS_STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return
    arr.unshift({ ...entry, at: Date.now() })
    localStorage.setItem(CHALLENGE_HITS_STORAGE_KEY, JSON.stringify(arr.slice(0, 500)))
  } catch (_) {}
}

function loadBestMultiMap() {
  try {
    const raw = localStorage.getItem(BEST_MULTI_STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return {}
    return o
  } catch {
    return {}
  }
}

function persistBestMultiMap(map) {
  try {
    localStorage.setItem(BEST_MULTI_STORAGE_KEY, JSON.stringify(map))
  } catch (_) {}
}

function loadBestBetIdMap() {
  try {
    const raw = localStorage.getItem(BEST_BET_ID_OVERALL_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return {}
    const next = {}
    let dirty = false
    for (const [k, v] of Object.entries(o)) {
      if (typeof v !== 'string' || !String(v).trim()) continue
      const t = String(v).trim()
      if (isPersistableStakeHouseBetShareId(t)) next[k] = t
      else dirty = true
    }
    if (dirty) {
      try {
        localStorage.setItem(BEST_BET_ID_OVERALL_KEY, JSON.stringify(next))
      } catch (_) {}
    }
    return next
  } catch {
    return {}
  }
}

function persistBestBetIdMap(map) {
  try {
    localStorage.setItem(BEST_BET_ID_OVERALL_KEY, JSON.stringify(map))
  } catch (_) {}
}

/** Lifetime-Rekord-Multi für Slug (Storage + optional React-State-Ref). */
function getOverallBestMultiForSlug(slug, bestMultiBySlotRefObj) {
  if (!slug) return 0
  const fromLs = Number(loadBestMultiMap()[slug])
  const fromRef = bestMultiBySlotRefObj && bestMultiBySlotRefObj[slug] != null ? Number(bestMultiBySlotRefObj[slug]) : 0
  return Math.max(Number.isFinite(fromLs) ? fromLs : 0, Number.isFinite(fromRef) ? fromRef : 0)
}

/** House-Match gehört zum Lifetime-Rekord (gleicher Multi wie bestRecord)? → Overall-Bet-ID speichern. */
function shouldPersistOverallBetId(slug, storageSlug, spinMulti, bestMultiBySlotRefObj) {
  const key = storageSlug || slug
  if (!key || spinMulti == null || !Number.isFinite(Number(spinMulti))) return false
  const best = getOverallBestMultiForSlug(key, bestMultiBySlotRefObj)
  if (best <= 0) return false
  const tol = Math.max(0.03, best * 0.025)
  return Number(spinMulti) + tol >= best
}

function loadOverallBetIdForSlug(slug) {
  if (!slug) return null
  const m = loadBestBetIdMap()
  const v = m[slug]
  return v && isPersistableStakeHouseBetShareId(String(v)) ? String(v).trim() : null
}

/**
 * Rekord-Multi (State), Lifetime-Bet-ID (Storage), Run-Best× + Run-Bet-ID (activeRuns).
 */
function buildHunterBestConsoleSnapshot(bestMultiBySlot, activeRuns) {
  const runBestBySlug = {}
  const betRunBySlug = {}
  for (const r of Object.values(activeRuns || {})) {
    if (!r?.slotSlug) continue
    const slug = r.slotSlug
    const br = Number(r.bestMultiRun) || 0
    if (br > (runBestBySlug[slug] ?? 0)) runBestBySlug[slug] = br
    const bid = r.bestBetId && String(r.bestBetId).trim()
    // Run-Bet-ID: jede gesetzte ID anzeigen (Persist-Regel gilt nur für Lifetime-Map / Links).
    if (bid) {
      const prev = betRunBySlug[slug]
      if (!prev || br >= prev.br) betRunBySlug[slug] = { betId: bid, br }
    }
  }
  let persisted = {}
  try {
    persisted = loadBestBetIdMap() || {}
  } catch (_) {}
  const slugs = new Set([
    ...Object.keys(bestMultiBySlot || {}),
    ...Object.keys(runBestBySlug),
    ...Object.keys(betRunBySlug),
    ...Object.keys(persisted),
  ])
  const rows = []
  for (const slug of slugs) {
    const rec = bestMultiBySlot[slug]
    const bestRecord = rec != null && Number.isFinite(Number(rec)) && Number(rec) > 0 ? Number(rec) : null
    const runBest = runBestBySlug[slug] ?? null
    const betIdOverall =
      persisted[slug] && isPersistableStakeHouseBetShareId(persisted[slug]) ? String(persisted[slug]).trim() : null
    const betIdRun = betRunBySlug[slug]?.betId || null
    if (
      bestRecord != null ||
      (runBest != null && runBest > 0) ||
      betIdOverall ||
      betIdRun
    ) {
      rows.push({
        slug,
        bestRecord: bestRecord != null ? Number(bestRecord.toFixed(4)) : null,
        betIdOverall: betIdOverall || null,
        runBest: runBest != null && runBest > 0 ? Number(runBest.toFixed(4)) : null,
        betIdRun: betIdRun || null,
      })
    }
  }
  rows.sort((a, b) => (b.bestRecord ?? b.runBest ?? 0) - (a.bestRecord ?? a.runBest ?? 0))
  return rows
}

/**
 * Race: WebSocket houseBet kann vor placeBet-HTTP fertig sein — dann war pending leer.
 * Passende Events wieder in die Queue, Worker erneut anstoßen.
 */
function flushHouseBetRetryBufferForSlug(retryBufRef, queueRef, slugNorm, scheduleFn) {
  const buf = retryBufRef.current
  if (!buf.length) return
  const keep = []
  let pushed = 0
  for (const entry of buf) {
    const ps = normalizeBetSlugForHouseMatch(entry.bItem?.gameSlug)
    if (houseBetSlugMatchesSessionSlug(ps, slugNorm)) {
      queueRef.current.push(entry.bItem)
      pushed++
    } else {
      keep.push(entry)
    }
  }
  retryBufRef.current = keep
  if (pushed) scheduleFn?.()
}

const HUNTER_FILTER_STORAGE_KEY = 'slotbot_hunter_filter_settings'

const DEFAULT_HUNTER_FILTERS = {
  minMinBet: 0,
  maxMinBet: 0.2,
  minPrizeUsd: 5,
  sourceCurrency: 'xrp',
  targetCurrency: 'usd',
  maxParallel: 1,
  pagesToLoad: 3,
  stopLoss: 0,
  stopProfit: 0,
  /** Per Kurs+Rundung kleinste USD-Überschreitung über minBet; nach Session: kleinster passender betLevel */
  autoOptimalTargetCurrency: true,
}

function clampHunterInt(n, min, max) {
  const v = parseInt(String(n), 10)
  if (Number.isNaN(v)) return min
  return Math.min(max, Math.max(min, v))
}

function normalizeHunterFilterObject(o) {
  if (!o || typeof o !== 'object') return { ...DEFAULT_HUNTER_FILTERS }
  const src = String(o.sourceCurrency || DEFAULT_HUNTER_FILTERS.sourceCurrency).toLowerCase()
  const tgt = String(o.targetCurrency || DEFAULT_HUNTER_FILTERS.targetCurrency).toLowerCase()
  return {
    minMinBet: Number.isFinite(Number(o.minMinBet)) ? Number(o.minMinBet) : DEFAULT_HUNTER_FILTERS.minMinBet,
    maxMinBet: Number.isFinite(Number(o.maxMinBet)) ? Number(o.maxMinBet) : DEFAULT_HUNTER_FILTERS.maxMinBet,
    minPrizeUsd: Number.isFinite(Number(o.minPrizeUsd)) ? Number(o.minPrizeUsd) : DEFAULT_HUNTER_FILTERS.minPrizeUsd,
    sourceCurrency: src || DEFAULT_HUNTER_FILTERS.sourceCurrency,
    targetCurrency: tgt || DEFAULT_HUNTER_FILTERS.targetCurrency,
    maxParallel: clampHunterInt(o.maxParallel, 1, CHALLENGE_SLIDER_MAX),
    pagesToLoad: clampHunterInt(o.pagesToLoad, 1, CHALLENGE_SLIDER_MAX),
    stopLoss: Number.isFinite(Number(o.stopLoss)) ? Number(o.stopLoss) : 0,
    stopProfit: Number.isFinite(Number(o.stopProfit)) ? Number(o.stopProfit) : 0,
    autoOptimalTargetCurrency:
      typeof o.autoOptimalTargetCurrency === 'boolean'
        ? o.autoOptimalTargetCurrency
        : DEFAULT_HUNTER_FILTERS.autoOptimalTargetCurrency,
  }
}

/** Nur Filter-Felder (ohne id/name) für Vorlagen */
function pickHunterFilters(record) {
  if (!record || typeof record !== 'object') return { ...DEFAULT_HUNTER_FILTERS }
  const { id: _id, name: _name, ...rest } = record
  return normalizeHunterFilterObject(rest)
}

const HUNTER_USER_PRESETS_KEY = 'slotbot_hunter_user_presets_v1'

function loadUserPresets() {
  try {
    const raw = localStorage.getItem(HUNTER_USER_PRESETS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p === 'object' && String(p.name || '').trim())
      .map((p) => {
        const id = String(p.id || '').trim() || `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const name = String(p.name).trim().slice(0, 80)
        const filters = pickHunterFilters(p)
        return { id, name, ...filters }
      })
  } catch {
    return []
  }
}

function persistUserPresets(list) {
  try {
    localStorage.setItem(HUNTER_USER_PRESETS_KEY, JSON.stringify(list))
  } catch (_) {}
}

function loadHunterFilters() {
  try {
    const raw = localStorage.getItem(HUNTER_FILTER_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_HUNTER_FILTERS }
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return { ...DEFAULT_HUNTER_FILTERS }
    return normalizeHunterFilterObject(o)
  } catch {
    return { ...DEFAULT_HUNTER_FILTERS }
  }
}

function saveHunterFilters(payload) {
  try {
    localStorage.setItem(HUNTER_FILTER_STORAGE_KEY, JSON.stringify(payload))
  } catch (_) {}
}

/** Einmal beim Modul-Load – konsistente Startwerte für alle useState-Felder */
const hunterFiltersInitial = loadHunterFilters()

const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    height: '100%',
    overflow: 'hidden',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  input: {
    padding: '0.4rem',
    background: 'var(--bg-deep)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontSize: '0.85rem',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    marginBottom: '0.25rem',
    fontVariantNumeric: 'tabular-nums',
  }
}

export default function AutoChallengeHunter({ accessToken, webSlots = [], onDiscoveredSlots }) {
  const [minMinBet, setMinMinBet] = useState(hunterFiltersInitial.minMinBet)
  const [maxMinBet, setMaxMinBet] = useState(hunterFiltersInitial.maxMinBet)
  const [minPrizeUsd, setMinPrizeUsd] = useState(hunterFiltersInitial.minPrizeUsd)
  const [sourceCurrency, setSourceCurrency] = useState(hunterFiltersInitial.sourceCurrency)
  const [targetCurrency, setTargetCurrency] = useState(hunterFiltersInitial.targetCurrency)
  const [huntEnabled, setHuntEnabled] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [maxParallel, setMaxParallel] = useState(hunterFiltersInitial.maxParallel)
  const [pagesToLoad, setPagesToLoad] = useState(hunterFiltersInitial.pagesToLoad)
  const [stopLoss, setStopLoss] = useState(hunterFiltersInitial.stopLoss)
  const [stopProfit, setStopProfit] = useState(hunterFiltersInitial.stopProfit)
  const [stopLossStr, setStopLossStr] = useState(() => usdLimitToInputStr(hunterFiltersInitial.stopLoss))
  const [stopProfitStr, setStopProfitStr] = useState(() => usdLimitToInputStr(hunterFiltersInitial.stopProfit))
  const [autoOptimalTargetCurrency, setAutoOptimalTargetCurrency] = useState(
    hunterFiltersInitial.autoOptimalTargetCurrency
  )

  const [userPresets, setUserPresets] = useState(() => loadUserPresets())
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [presetSelectValue, setPresetSelectValue] = useState('')

  const cryptoOptions = useMemo(() => CURRENCY_GROUPS.crypto, [])
  const fiatOptions = useMemo(() => CURRENCY_GROUPS.fiat, [])
  /** Dropdown: gleiche Kandidaten wie Session-Probes (stakeEngine). */
  const hunterTargetCurrencyOptions = useMemo(() => {
    const allowed = getAllowedTargetCurrenciesForSlot('stakeEngine')
    return [...allowed].sort((a, b) => a.localeCompare(b))
  }, [])

  const [challenges, setChallenges] = useState([])
  /** Pro Challenge: nächste Queue-Zielwährung — '' = Auto (Sortierung / Probes). */
  const [manualTargetCurrencyByChallengeId, setManualTargetCurrencyByChallengeId] = useState({})
  const [queue, setQueue] = useState([])
  const queueRef = useRef([])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  const [activeRuns, setActiveRuns] = useState({})
  const [rates, setRates] = useState({})
  const [logs, setLogs] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)
  const [totalSessionStats, setTotalSessionStats] = useState({ wagered: 0, won: 0, lost: 0 })
  // Mini-Chart: kumulierte Netto-Entwicklung (USD) pro Spin (global für diese Session)
  // React/Chart kann bei sehr vielen Spins zusätzlichen Render-Overhead erzeugen.
  // Wenn du nur Stats brauchst: Chart aus.
  const ENABLE_SESSION_NET_CHART = false
  const [sessionNetSeries, setSessionNetSeries] = useState(() => [{ time: Date.now(), netUsd: 0 }])
  /** Höchster getroffener Multiplikator pro Slot-Slug (persistiert). */
  const [bestMultiBySlot, setBestMultiBySlot] = useState(() => loadBestMultiMap())
  const setBestMultiBySlotRef = useRef(setBestMultiBySlot)
  setBestMultiBySlotRef.current = setBestMultiBySlot
  const bestMultiBySlotRef = useRef(bestMultiBySlot)
  useEffect(() => {
    bestMultiBySlotRef.current = bestMultiBySlot
  }, [bestMultiBySlot])
  /** Pro Run: max. Multi — wird mit houseBets bestätigt (wie bestMultiRun im State nach WS). */
  const runBestMultiSyncRef = useRef({})
  /** Memoized measured ranking from first probe pass: [{ tCurr, usdAt }] sorted by real effective USD. */
  const challengeProbeRankingRef = useRef({})
  /** Nach Persist der Overall-Bet-ID: UI/Konsole neu lesen. */
  const [hunterStorageTick, setHunterStorageTick] = useState(0)
  const bumpHunterStorageRef = useRef(() => {})
  useEffect(() => {
    bumpHunterStorageRef.current = () => setHunterStorageTick((t) => t + 1)
  }, [])

  useEffect(() => {
    const next = {}
    for (const run of Object.values(activeRuns)) {
      if (run?.status !== 'running' || !run.slotSlug) continue
      const m = Number(run.targetMultiplier)
      if (!Number.isFinite(m) || m <= 0) continue
      const slug = run.slotSlug
      if (!next[slug]) next[slug] = []
      next[slug].push(m)
    }
    for (const k of Object.keys(next)) {
      next[k] = [...new Set(next[k])].sort((a, b) => a - b)
    }
    setHunterSlotTargets(next)
  }, [activeRuns])

  useEffect(() => {
    const hasRunningChallenges =
      huntEnabled ||
      queue.length > 0 ||
      Object.values(activeRuns).some((run) => run?.status === 'running')
    try {
      window.dispatchEvent(
        new CustomEvent('challenge-running-status', {
          detail: { running: hasRunningChallenges },
        })
      )
    } catch (_) {}
    return () => {
      try {
        window.dispatchEvent(
          new CustomEvent('challenge-running-status', {
            detail: { running: false },
          })
        )
      } catch (_) {}
    }
  }, [huntEnabled, queue, activeRuns])

  const maxParallelClamped = Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, maxParallel))
  const pagesToLoadClamped = Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, pagesToLoad))

  const runnersRef = useRef({})
  const processedIdsRef = useRef(new Set())
  /** Challenge-IDs, die der Nutzer per „Aus Liste“ o. Ä. aus dem Hunt genommen hat – nicht erneut auto-einreihen. */
  const dismissedChallengeIdsRef = useRef(new Set())
  const activeRunsRef = useRef(activeRuns)
  activeRunsRef.current = activeRuns
  const totalStatsRef = useRef(totalSessionStats)
  totalStatsRef.current = totalSessionStats
  /** Stabil für refreshChallenges-Deps: sonst ändert sich webSlots bei jeder Discovery → useEffect feuert endlos. */
  const webSlotsRef = useRef(webSlots)
  webSlotsRef.current = webSlots
  const onDiscoveredSlotsRef = useRef(onDiscoveredSlots)
  onDiscoveredSlotsRef.current = onDiscoveredSlots

  // Debug/Test: in Challenge-Mode Subscription unabhängig von SlotControl sichtbar machen
  // (SlotControl wird im "challenges"-Tab typischerweise nicht gemountet.)
  /** Nach placeBet in Reihenfolge; nächstes houseBets mit gleichem Slug → Bet-ID (FIFO, wie FRIDA: iid ohne Betrag/Multi-Match). */
  const pendingHouseBetMatchRef = useRef([])
  /** Pro Run monoton steigend — ordnet Pending-Spins zu, Fallback nur wenn `${runId}:${seq}` nicht gematcht. */
  const hunterSpinSeqByRunRef = useRef({})
  const houseBetMatchedSpinKeysRef = useRef(new Set())

  // houseBets Updates kommen sehr häufig.
  // Damit React keine "message handler took Xms"-Violations auslöst (und wir weniger UI/Storage churn haben),
  // enqueue wir Events und verarbeiten sie gebündelt in einem Worker-Tick.
  const houseBetEventQueueRef = useRef([])
  const houseBetWorkerScheduledRef = useRef(false)
  /** Race WS vor HTTP: houseBet-Objekte kurz halten, nach Pending-Push erneut matchen. */
  const houseBetRetryBufferRef = useRef([]) // { key, bItem, at }[]
  const scheduleHouseBetWorkerRef = useRef(() => {})
  const HOUSEBET_WORKER_MAX_EVENTS = 20

  const runningChallengeCount = useMemo(
    () => Object.values(activeRuns).filter((r) => r?.status === 'running').length,
    [activeRuns]
  )

  const log = useCallback((msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100))
  }, [])

  const hunterConsoleSnapshotRef = useRef('')
  useEffect(() => {
    if (!LOG_HUNTER_BEST_TO_CONSOLE) return
    const rows = buildHunterBestConsoleSnapshot(bestMultiBySlot, activeRuns)
    const key = JSON.stringify(rows)
    if (key === hunterConsoleSnapshotRef.current) return
    hunterConsoleSnapshotRef.current = key
    console.log(
      '%c[Hunter] Best Multi / Bet-IDs',
      'color:#39d98a;font-weight:bold',
      '— betIdOverall = Lifetime (Slot) · betIdRun = dieser Lauf · nur houseBets'
    )
    if (rows.length) console.table(rows)
    else console.log('[Hunter] (noch keine Best×- oder Bet-ID-Einträge)')
  }, [bestMultiBySlot, activeRuns, hunterStorageTick])

  useEffect(() => {
    if (!accessToken) return
    if (runningChallengeCount <= 0) return

    if (DEBUG_HUNTER_BETID_MATCH) {
      console.warn('[AutoChallengeHunter] houseBets subscription init', {
        runningChallengeCount,
        hasAccessToken: !!accessToken,
      })
    }

    let cancelled = false
    let sub = null

    const runWorkerTick = () => {
      // Kein stakeHouseBetAmountToMajor / kein Betrag-Multi-Match — FRIDA-FIFO (Slug + Pending-Reihenfolge).
      houseBetWorkerScheduledRef.current = false

      const rnow = Date.now()
      houseBetRetryBufferRef.current = houseBetRetryBufferRef.current.filter(
        (e) => rnow - e.at < HOUSEBET_RETRY_BUFFER_MAX_MS
      )
      if (houseBetRetryBufferRef.current.length > HOUSEBET_RETRY_BUFFER_MAX) {
        houseBetRetryBufferRef.current = houseBetRetryBufferRef.current.slice(
          -HOUSEBET_RETRY_BUFFER_MAX
        )
      }

      const q = houseBetEventQueueRef.current
      if (q.length === 0) return

        // Time-slicing: nur wenige Events pro Tick, damit der Main-Thread nicht lange blockiert
        const batch = q.splice(0, HOUSEBET_WORKER_MAX_EVENTS)
        // Sammeln von Matches, damit wir React nur 1x pro Tick updaten
        const bestBetByRunId = {}
        const multiUiByRunId = {}
        const betIdToPersistOverall = {}
        /** Pro Run: max. Multi bereits in diesem Batch verarbeitet (für prevBest + korrekte Reihenfolge). */
        const batchRunBestMulti = {}
        for (const bItem of batch) {
          const payloadSlug = normalizeBetSlugForHouseMatch(bItem?.gameSlug)
          const payloadCurr = String(bItem?.currency || '').toLowerCase()
          if (!payloadSlug) continue

          const active = activeRunsRef.current || {}
          const runningSlugList = Object.values(active)
            .filter((r) => r?.status === 'running' && r?.slotSlug)
            .map((r) => normalizeBetSlugForHouseMatch(r.slotSlug))
          const hasRunningForHouseBet = runningSlugList.some((s) =>
            houseBetSlugMatchesSessionSlug(payloadSlug, s)
          )
          if (!hasRunningForHouseBet) continue

          const pending = pendingHouseBetMatchRef.current

          // Wie FRIDA (MainForm): houseBets.iid direkt nutzen — kein Abgleich Betrag/Multi.
          // Pending wird nach jedem HTTP-Spin in Reihenfolge eingereiht; erstes passendes Slug = dieses Event (FIFO).
          let bestMatchIdx = -1
          // 1) Prefer strict match by slug + currency (important for copy runs of same slot).
          if (payloadCurr) {
            for (let i = 0; i < pending.length; i++) {
              const p = pending[i]
              if (p.multi == null) continue
              if (!houseBetSlugMatchesSessionSlug(payloadSlug, p.slug)) continue
              if (String(p.currency || '').toLowerCase() !== payloadCurr) continue
              bestMatchIdx = i
              break
            }
          }
          // 2) Fallback to slug-only FIFO.
          if (bestMatchIdx < 0) {
            for (let i = 0; i < pending.length; i++) {
              const p = pending[i]
              if (p.multi == null) continue
              if (!houseBetSlugMatchesSessionSlug(payloadSlug, p.slug)) continue
              bestMatchIdx = i
              break
            }
          }

          if (bestMatchIdx >= 0) {
            const p = pending[bestMatchIdx]
            const runId = p.runId
            const rawId = pickStakeHouseBetShareRawId(bItem)
            const shareId = rawId ? formatStakeShareBetId(rawId) : null
            pending.splice(bestMatchIdx, 1)
            if (p.spinSeq != null) {
              houseBetMatchedSpinKeysRef.current.add(`${runId}:${p.spinSeq}`)
            }

            const spinM = Number(p.multi) || 0
            const prevBest = Math.max(
              activeRunsRef.current[runId]?.bestMultiRun ?? 0,
              batchRunBestMulti[runId] ?? 0
            )
            batchRunBestMulti[runId] = Math.max(prevBest, spinM)

            // UI: höchster Multi in diesem Batch gewinnt (nicht nur das letzte Event).
            const prevUiM = multiUiByRunId[runId]?.multi ?? 0
            if (spinM > prevUiM) {
              multiUiByRunId[runId] = {
                multi: spinM,
                storageSlug: p.storageSlug,
                slug: p.slug,
                spinSeq: p.spinSeq,
              }
            } else if (!multiUiByRunId[runId]) {
              multiUiByRunId[runId] = {
                multi: spinM,
                storageSlug: p.storageSlug,
                slug: p.slug,
                spinSeq: p.spinSeq,
              }
            }

            // Run-Bet-ID nur wenn dieser Spin den Lauf-Best × verbessert (nicht jede neue houseBets-Zeile).
            if (shareId && spinM > prevBest) {
              bestBetByRunId[runId] = shareId
              const key = p.storageSlug != null ? p.storageSlug : p.slug
              if (
                isPersistableStakeHouseBetShareId(shareId) &&
                shouldPersistOverallBetId(p.slug, key, spinM, bestMultiBySlotRef.current)
              ) {
                betIdToPersistOverall[key] = shareId
              }
            }
          }

          if (bestMatchIdx < 0) {
            const hasPendingForSlug = pending.some((p) =>
              houseBetSlugMatchesSessionSlug(payloadSlug, p.slug)
            )
            if (hasRunningForHouseBet && !hasPendingForSlug) {
              const dedupeKey = pickStakeHouseBetShareRawId(bItem) || bItem?.id
              if (dedupeKey) {
                const buf = houseBetRetryBufferRef.current
                if (!buf.some((e) => e.key === dedupeKey)) {
                  buf.push({ key: dedupeKey, bItem, at: Date.now() })
                  if (buf.length > HOUSEBET_RETRY_BUFFER_MAX) buf.shift()
                }
              }
            }
          }
        }

      // 1x React update + 1x localStorage persist pro Tick
      const runIds = [
        ...new Set([...Object.keys(bestBetByRunId), ...Object.keys(multiUiByRunId)]),
      ]
      if (runIds.length) {
        for (const runId of runIds) {
          const m = multiUiByRunId[runId]
          if (m && m.multi != null && Number.isFinite(Number(m.multi))) {
            const prevS = runBestMultiSyncRef.current[runId] ?? 0
            runBestMultiSyncRef.current[runId] = Math.max(Number(prevS) || 0, Number(m.multi))
          }
        }

        setActiveRuns((prev) => {
          const next = { ...prev }
          for (const runId of runIds) {
            const run = next[runId]
            if (!run || run.status !== 'running') continue
            const m = multiUiByRunId[runId]
            const nextBest =
              m && m.multi != null && Number.isFinite(Number(m.multi))
                ? Math.max(run.bestMultiRun ?? 0, Number(m.multi))
                : run.bestMultiRun
            const bid = bestBetByRunId[runId]
            next[runId] = {
              ...run,
              bestBetId: bid != null ? bid : run.bestBetId ?? null,
              bestMultiRun: nextBest,
            }
          }
          return next
        })

        for (const runId of runIds) {
          const m = multiUiByRunId[runId]
          if (!m || m.multi == null || !Number.isFinite(Number(m.multi))) continue
          const slugKey = m.storageSlug != null ? m.storageSlug : m.slug
          setBestMultiBySlotRef.current((prev) => {
            const cur = prev[slugKey] ?? 0
            const nm = Number(m.multi)
            if (nm <= cur) return prev
            const nmap = { ...prev, [slugKey]: nm }
            persistBestMultiMap(nmap)
            return nmap
          })
        }

        try {
          const keys = Object.keys(betIdToPersistOverall)
          if (keys.length) {
            const bestBetIdMap = loadBestBetIdMap()
            const merged = { ...bestBetIdMap }
            for (const k of keys) {
              const v = betIdToPersistOverall[k]
              if (v && isPersistableStakeHouseBetShareId(v)) merged[k] = v
            }
            persistBestBetIdMap(merged)
            bumpHunterStorageRef.current?.()
          }
        } catch (_) {}

        if (DEBUG_HUNTER_BETID_MATCH) {
          log(`houseBets: Bet-ID + Best-Multi für ${runIds.length} Run(s) (nach houseBets).`)
        }
      }

      // Wenn noch Events drin sind, direkt wieder planend
      if (houseBetEventQueueRef.current.length > 0) {
        houseBetWorkerScheduledRef.current = true
        setTimeout(runWorkerTick, 0)
      }
    }

    const scheduleHouseBetWorker = () => {
      if (houseBetWorkerScheduledRef.current) return
      houseBetWorkerScheduledRef.current = true
      setTimeout(runWorkerTick, 0)
    }
    scheduleHouseBetWorkerRef.current = scheduleHouseBetWorker

    subscribeToHouseBets(accessToken, (b) => {
      const now = Date.now()
      const pendBefore = pendingHouseBetMatchRef.current
      while (pendBefore.length > 0 && now - pendBefore[0].at > PENDING_HOUSEBET_MAX_AGE_MS) {
        pendBefore.shift()
      }
      houseBetEventQueueRef.current.push(b)
      scheduleHouseBetWorker()
    }).then((s) => {
      if (cancelled) {
        try {
          s?.disconnect?.()
        } catch (_) {}
        return
      }
      sub = s
    })

    return () => {
      cancelled = true
      scheduleHouseBetWorkerRef.current = () => {}
      houseBetRetryBufferRef.current = []
      try {
        sub?.disconnect?.()
      } catch (_) {}
    }
  }, [accessToken, runningChallengeCount, log])

  const applyFilters = useCallback((partial) => {
    const n = pickHunterFilters(partial)
    setMinMinBet(n.minMinBet)
    setMaxMinBet(n.maxMinBet)
    setMinPrizeUsd(n.minPrizeUsd)
    setSourceCurrency(n.sourceCurrency)
    setTargetCurrency(n.targetCurrency)
    setMaxParallel(n.maxParallel)
    setPagesToLoad(n.pagesToLoad)
    setStopLoss(n.stopLoss)
    setStopProfit(n.stopProfit)
    setStopLossStr(usdLimitToInputStr(n.stopLoss))
    setStopProfitStr(usdLimitToInputStr(n.stopProfit))
    setAutoOptimalTargetCurrency(n.autoOptimalTargetCurrency)
  }, [])

  const restoreDefaultFilters = useCallback(() => {
    applyFilters(DEFAULT_HUNTER_FILTERS)
    setPresetSelectValue('')
    log('Filter auf Standard zurückgesetzt (gespeichert).')
  }, [applyFilters, log])

  const loadPresetById = useCallback(
    (id) => {
      if (!id) return
      const user = userPresets.find((p) => p.id === id)
      if (user) {
        applyFilters(user)
        log(`Vorlage geladen: ${user.name}`)
      }
    },
    [applyFilters, userPresets, log]
  )

  const saveCurrentPreset = useCallback(() => {
    const name = presetNameDraft.trim()
    if (!name) {
      log('Bitte einen Namen für die Vorlage eingeben.')
      return
    }
    const raw = {
      minMinBet,
      maxMinBet,
      minPrizeUsd,
      sourceCurrency,
      targetCurrency,
      maxParallel: maxParallelClamped,
      pagesToLoad: pagesToLoadClamped,
      stopLoss,
      stopProfit,
      autoOptimalTargetCurrency,
    }
    const nameLower = name.toLowerCase()
    const existing = userPresets.find((p) => p.name.toLowerCase() === nameLower)
    const id = existing?.id || crypto.randomUUID()
    const entry = { id, name, ...pickHunterFilters(raw) }
    setUserPresets((prev) => {
      const next = [...prev.filter((p) => p.id !== id), entry]
      persistUserPresets(next)
      return next
    })
    setPresetSelectValue(id)
    log(`Vorlage gespeichert: ${name}`)
  }, [
    presetNameDraft,
    minMinBet,
    maxMinBet,
    minPrizeUsd,
    sourceCurrency,
    targetCurrency,
    maxParallelClamped,
    pagesToLoadClamped,
    stopLoss,
    stopProfit,
    autoOptimalTargetCurrency,
    userPresets,
    log,
  ])

  const deleteSelectedUserPreset = useCallback(() => {
    if (!presetSelectValue) return
    const isUser = userPresets.some((p) => p.id === presetSelectValue)
    if (!isUser) {
      log('Nur gespeicherte Vorlagen können gelöscht werden.')
      return
    }
    setUserPresets((prev) => {
      const next = prev.filter((p) => p.id !== presetSelectValue)
      persistUserPresets(next)
      return next
    })
    setPresetSelectValue('')
    log('Vorlage gelöscht.')
  }, [presetSelectValue, userPresets, log])

  useEffect(() => {
    saveHunterFilters({
      minMinBet,
      maxMinBet,
      minPrizeUsd,
      sourceCurrency,
      targetCurrency,
      maxParallel: Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, maxParallel)),
      pagesToLoad: Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, pagesToLoad)),
      stopLoss,
      stopProfit,
      autoOptimalTargetCurrency,
    })
  }, [
    minMinBet,
    maxMinBet,
    minPrizeUsd,
    sourceCurrency,
    targetCurrency,
    maxParallel,
    pagesToLoad,
    stopLoss,
    stopProfit,
    autoOptimalTargetCurrency,
  ])

  const refreshChallenges = useCallback(async () => {
    if (!accessToken) return
    try {
      log('Lade Challenges & Kurse...')
      
      // Rates laden für Umrechnungen
      const newRates = await fetchCurrencyRates(accessToken)
      setRates(newRates)

      const pageCount = Math.max(1, pagesToLoadClamped)
      const requests = Array.from({ length: pageCount }, (_, i) =>
        fetchChallengeList(accessToken, { limit: PAGE_SIZE, offset: PAGE_SIZE * i })
      )
      
      const results = await Promise.all(requests)
      const all = results.flatMap((r) => r.challenges || [])
      
      // Duplikate entfernen (durch Pagination Überschneidung möglich)
      const unique = []
      const seen = new Set()
      for (const c of all) {
        if (!seen.has(c.id)) {
          seen.add(c.id)
          unique.push(normalizeChallengeRow(c))
        }
      }

      log(`${unique.length} Challenges gefunden.`)
      setChallenges(unique)
      setLastRefresh(Date.now())

      // Neue Slots/Provider automatisch hinzufügen (Session-only)
      const slotsSnapshot = webSlotsRef.current || []
      const knownSlugs = new Set(slotsSnapshot.map((s) => s.slug))
      const addedSlots = addDiscoveredFromChallenges(unique, knownSlugs)
      if (addedSlots.length > 0) {
        log(`${addedSlots.length} neue Slots/Provider entdeckt: ${addedSlots.map(s => s.name).join(', ')}`)
        onDiscoveredSlotsRef.current?.(addedSlots)
      }

      // Kombiniere vorhandene Slots mit neu entdeckten für diese Runde
      const currentSlots = [...slotsSnapshot, ...addedSlots]

      let addedCount = 0
      for (const c of unique) {
        if (processedIdsRef.current.has(c.id)) continue
        if (dismissedChallengeIdsRef.current.has(c.id)) continue
        if (
          Object.values(activeRunsRef.current).some(
            (r) => r.challengeId === c.id && r.status === 'running'
          )
        )
          continue
        
        const minBet = c.minBetUsd || 0
        const prizeUsd = getPrizeUsd(c, newRates)
        const isMinBetOk = minBet >= minMinBet && minBet <= maxMinBet
        const isPrizeOk = (prizeUsd || 0) >= minPrizeUsd
        
        const cSlug = c.gameSlug || c.game?.slug
        const cName = c.gameName || c.game?.name || cSlug
        // Nutze currentSlots statt webSlots (Prop)
        let slot = currentSlots.find((s) => s.slug === cSlug)
        if (!slot) {
          slot = { slug: cSlug, name: cName || cSlug, id: cSlug }
        }

        // isSlotOk ist immer true, da wir Fallback haben. 
        // WICHTIG: Wenn wir 100% Logik wollen, sollten wir prüfen, ob wir ihn spielen KÖNNEN.
        // Aber die Anforderung war "Availability Logic: Enforced 'Available' status... defaults to simulation".
        // Also ist eligible = true korrekt.
        
        const eligible =
          isMinBetOk && isPrizeOk && !c.completedAt && c.active !== false

        if (eligible) {
          log(`Neue Challenge gefunden: ${cName} (${c.minBetUsd}$)`)
          processedIdsRef.current.add(c.id)
          setQueue((q) => [
            ...q,
            { runId: generateHunterRunId(), challengeId: c.id, currencySlotIndex: 0 },
          ])
          addedCount++
        } else {
          if (c.completedAt || c.active === false) processedIdsRef.current.add(c.id)
        }
      }
      
      if (addedCount > 0) log(`${addedCount} Challenges zur Queue hinzugefügt.`)

    } catch (err) {
      log(`Fehler beim Laden: ${err.message}`)
    }
  }, [accessToken, minMinBet, maxMinBet, minPrizeUsd, pagesToLoadClamped, log])

  useEffect(() => {
    if (!huntEnabled) return
    requestNotificationPermission() // Berechtigung anfragen beim Aktivieren
    refreshChallenges()
    const interval = setInterval(refreshChallenges, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [huntEnabled, refreshChallenges])

  useEffect(() => {
    if (!autoStart) return
    requestNotificationPermission() // Berechtigung anfragen beim Auto-Start
    if (queue.length > 0) return
    const hasRunning = Object.values(activeRuns).some((run) => run?.status === 'running')
    if (hasRunning) return
    processedIdsRef.current.clear()
    refreshChallenges()
  }, [autoStart, queue.length, activeRuns, refreshChallenges])

  const getPrizeUsd = (c, currentRates = rates) => {
    if (c.award == null) return 0
    const currency = (c.currency || 'usd').toLowerCase()
    if (currency === 'usd') return c.award
    const rate = currentRates[currency] || 0
    if (!rate) return 0
    return c.award * rate
  }

  /** Anzeige Gewinn/Preis der Challenge: USD-Näherung + optional Betrag in Spiel-Währung */
  const formatChallengePrize = (c) => {
    if (c.award == null || !(Number(c.award) > 0)) return { main: '—', hint: null }
    const usd = getPrizeUsd(c)
    const main = `~$${usd.toFixed(2)}`
    const cur = (c.currency || 'usd').toLowerCase()
    let hint = null
    if (cur !== 'usd' && c.currency) {
      try {
        hint = formatBetLabel(c.award, c.currency)
      } catch {
        hint = null
      }
    }
    return { main, hint }
  }

  const formatPrize = (c) => formatChallengePrize(c).main

  const getChallengeMeta = useCallback((c) => {
    const minBet = c.minBetUsd || 0
    const prizeUsd = getPrizeUsd(c, rates)
    const isMinBetOk = minBet >= minMinBet && minBet <= maxMinBet
    const isPrizeOk = (prizeUsd || 0) >= minPrizeUsd
    const slots = webSlotsRef.current || []
    const slug = c.gameSlug || c.game?.slug
    const displayName = c.gameName || c.game?.name || slug
    let slot = slots.find((s) => s.slug === slug)
    if (!slot) {
      slot = { slug, name: displayName || slug, id: slug }
    }
    const isSlotOk = true
    const eligible =
      isMinBetOk && isPrizeOk && isSlotOk && !c.completedAt && c.active !== false
    return { minBet, prizeUsd, isMinBetOk, isPrizeOk, slot, isSlotOk, eligible }
  }, [minMinBet, maxMinBet, minPrizeUsd, rates])

  const activeRunList = useMemo(() => {
    return Object.entries(activeRuns).map(([id, run]) => ({ id, ...run }))
  }, [activeRuns])

  const runningCount = activeRunList.filter(r => r.status === 'running').length

  const netUsd = totalSessionStats.won - totalSessionStats.lost
  const sessionNetChartData = useMemo(
    () => sessionNetSeries.map((p) => ({ time: p.time, net: p.netUsd })),
    [sessionNetSeries]
  )
  const sessionNetMin = Math.min(0, ...sessionNetSeries.map((p) => p.netUsd))
  const sessionNetMax = Math.max(0, ...sessionNetSeries.map((p) => p.netUsd))
  const sessionNetPadding = Math.max(0.01, (sessionNetMax - sessionNetMin) * 0.08)

  const hasAnythingToStop =
    runningCount > 0 || queue.length > 0 || huntEnabled || autoStart

  const eligibleChallenges = useMemo(() => {
    return challenges.filter((c) => {
      const meta = getChallengeMeta(c)
      return meta.eligible
    })
  }, [challenges, getChallengeMeta])

  useEffect(() => {
    if (!huntEnabled || !autoStart || queue.length === 0) return
    if (runningCount >= maxParallelClamped) return
    const nextId = queue[0]
    setQueue(q => q.slice(1))
    startChallengeRun(nextId)
  }, [huntEnabled, autoStart, queue, runningCount, maxParallelClamped])

  useEffect(() => {
    if (!huntEnabled || !autoStart) return
    if (queue.length > 0) return
    if (runningCount >= maxParallelClamped) return
    const toQueue = eligibleChallenges
      .map((c) => c.id)
      .filter(
        (id) =>
          !processedIdsRef.current.has(id) && !dismissedChallengeIdsRef.current.has(id)
      )
    if (toQueue.length === 0) return
    setQueue((q) => [
      ...q,
      ...toQueue.map((id) => ({ runId: generateHunterRunId(), challengeId: id, currencySlotIndex: 0 })),
    ])
    toQueue.forEach((id) => processedIdsRef.current.add(id))
  }, [huntEnabled, autoStart, queue.length, runningCount, maxParallelClamped, eligibleChallenges])

  const startChallengeRun = async (queueItemRaw) => {
    const qItem = normalizeQueueItem(queueItemRaw)
    const { runId, challengeId, currencySlotIndex, forcedTargetCurrency: forcedRaw } = qItem
    const forced = (forcedRaw || '').trim().toLowerCase()
    const challenge = challenges.find((c) => c.id === challengeId)
    if (!challenge) {
      log(`Challenge ${challengeId} nicht mehr gefunden.`)
      return
    }

    const gSlug = challenge.gameSlug || challenge.game?.slug
    const gName = challenge.gameName || challenge.game?.name || gSlug
    let slot = (webSlotsRef.current || []).find((s) => s.slug === gSlug)
    if (!slot) {
      slot = { slug: gSlug, name: gName || gSlug, providerId: 'stakeEngine' }
    }

    const prizeParts = formatChallengePrize(challenge)
    runnersRef.current[runId] = { stop: false }
    runBestMultiSyncRef.current[runId] = 0
    setActiveRuns((prev) => ({
      ...prev,
      [runId]: {
        challengeId,
        runId,
        currencySlotIndex,
        status: 'running',
        spins: 0,
        wagered: 0,
        /** Kumulierter Nettogewinn in USD (wie totalSessionStats / netSpinUsd), nicht Summe Brutto-„win“ in Minor */
        wonUsd: 0,
        balance: 0,
        currentBet: 0,
        slotName: slot.name,
        slotSlug: gSlug,
        bestMultiRun: 0,
        bestBetId: null,
        targetMultiplier: challenge.targetMultiplier,
        prizeDisplay: prizeParts.main,
        prizeHint: prizeParts.hint,
        startTime: Date.now(),
        forcedTargetCurrency: forced || null,
      },
    }))

    const copyLabel = currencySlotIndex > 0 ? ` (Kopie #${currencySlotIndex + 1})` : ''
    const manualCurrLabel = forced ? ` · ${forced.toUpperCase()} (manuell)` : ''
    log(`Starte Challenge: ${gName}${copyLabel}${manualCurrLabel} (Ziel: ${challenge.targetMultiplier}x)`)
    notifyChallengeStart(gName || gSlug, challenge.targetMultiplier)

    try {
      const provider = await getProvider(slot.providerId)
      if (!provider) throw new Error(`Kein Provider für ${slot.providerId}`)

      const sCurr = sourceCurrency.toLowerCase()
      const providerId = slot.providerId || 'stakeEngine'
      const preferredTarget = (targetCurrency || 'usd').toLowerCase()
      const minBetUsd = challenge.minBetUsd
      const probeCacheKey = buildProbeCacheKey(challenge.id, slot.slug, sCurr, minBetUsd)

      let session = null
      let tCurr = preferredTarget
      let rate
      let betAmount

      if (forced) {
        const r = getRateForCurrency(rates, forced)
        if (!r) throw new Error(`Kein Kurs für ${forced.toUpperCase()}`)
        tCurr = forced
        rate = r
        log(`Session mit manueller Zielwährung: ${sCurr.toUpperCase()} → ${forced.toUpperCase()}…`)
        session = await provider.startSession(accessToken, slot.slug, sCurr, forced)
        const computed = computeBetFromMinBetAndSession(session, forced, r, minBetUsd)
        betAmount = computed.betAmount
        log(
          `Manuell: Einsatz effektiv ~$${computed.usdAt.toFixed(2)} USD · Challenge-Mindesteinsatz (Stake, USD): $${minBetUsd}`
        )
      } else if (autoOptimalTargetCurrency) {
        const allowed = getAllowedTargetCurrenciesForSlot(providerId)
        const probeAllowed = allowed.filter(
          (c) => !AUTO_PROBE_EXCLUDED_CURRENCIES.has(String(c).toLowerCase())
        )
        const allowedFiat = probeAllowed.filter((c) => isFiat(c))
        const probePool = allowedFiat.length > 0 ? allowedFiat : probeAllowed
        const ordered =
          probePool.length && minBetUsd != null
            ? sortTargetCandidatesForProbe(probePool, rates, minBetUsd, preferredTarget)
            : []

        if (currencySlotIndex === 0 && ordered.length > 0) {
          const probeLimit = Math.min(ordered.length, MAX_TARGET_SESSION_PROBES)
          let bestProbe = null
          const measuredProbes = []
          const tightUsd =
            minBetUsd != null
              ? minBetUsd + Math.max(TARGET_PROBE_EARLY_STOP_ABS_USD, minBetUsd * TARGET_PROBE_EARLY_STOP_REL)
              : Infinity

          for (let i = 0; i < probeLimit; i++) {
            if (i > 0) {
              await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
            }
            const cand = ordered[i]
            const r = getRateForCurrency(rates, cand)
            if (!r) continue
            try {
              log(`Session-Probe: ${sCurr.toUpperCase()} -> ${cand.toUpperCase()}…`)
              const sess = await provider.startSession(accessToken, slot.slug, sCurr, cand)
              const { betAmount: ba, usdAt } = computeBetFromMinBetAndSession(sess, cand, r, minBetUsd)
              measuredProbes.push({ tCurr: cand, usdAt })
              if (!bestProbe || usdAt < bestProbe.usdAt - 1e-9) {
                bestProbe = { session: sess, tCurr: cand, rate: r, betAmount: ba, usdAt }
              }
              if (usdAt <= tightUsd) break
            } catch (e) {
              log(`Probe ${cand.toUpperCase()}: ${e?.message || e}`)
            }
          }

          if (bestProbe) {
            if (measuredProbes.length > 0) {
              const dedup = new Map()
              for (const p of measuredProbes) {
                const k = String(p.tCurr || '').toLowerCase()
                if (!k) continue
                const ex = dedup.get(k)
                if (!ex || p.usdAt < ex.usdAt) dedup.set(k, { tCurr: k, usdAt: p.usdAt })
              }
              challengeProbeRankingRef.current[probeCacheKey] = Array.from(dedup.values()).sort(
                (a, b) => a.usdAt - b.usdAt
              )
            }
            session = bestProbe.session
            tCurr = bestProbe.tCurr
            rate = bestProbe.rate
            betAmount = bestProbe.betAmount
            log(
              `Zielwährung auto (Bet-Levels): ${tCurr.toUpperCase()} — Einsatz effektiv ~$${bestProbe.usdAt.toFixed(2)} USD · Challenge-Min (Stake, USD): $${minBetUsd}`
            )
            if (probeLimit > 1) {
              log(`  (bis zu ${probeLimit} Proben; gewählt: geringster effektiver USD-Bet)`)
            }
          }
        } else if (currencySlotIndex > 0 && ordered.length > 0) {
          const measured = Array.isArray(challengeProbeRankingRef.current[probeCacheKey])
            ? challengeProbeRankingRef.current[probeCacheKey].map((x) => x.tCurr).filter(Boolean)
            : []
          const ranked = measured.length > 0 ? measured : ordered
          const idx = Math.min(currencySlotIndex, ranked.length - 1)
          const cand = ranked[idx]
          const r = getRateForCurrency(rates, cand)
          if (!r) {
            log(`Kein Kurs für ${String(cand).toUpperCase()} — Fallback manuelle Zielwährung.`)
          } else {
            try {
              if (idx !== currencySlotIndex) {
                log(
                  `Nur ${ranked.length} Ziel-Kandidaten — nutze Index ${idx} statt ${currencySlotIndex} (${cand.toUpperCase()})`
                )
              } else {
                log(
                  `Zielwährung Kopie #${currencySlotIndex + 1}: ${cand.toUpperCase()} (${measured.length > 0 ? 'gemessene' : 'modellierte'} Sortierung, Index ${idx})`
                )
              }
              await new Promise((res) => setTimeout(res, SESSION_PROBE_DELAY_MS))
              const sess = await provider.startSession(accessToken, slot.slug, sCurr, cand)
              const { betAmount: ba, usdAt } = computeBetFromMinBetAndSession(sess, cand, r, minBetUsd)
              session = sess
              tCurr = cand
              rate = r
              betAmount = ba
              log(
                `Einsatz effektiv ~$${usdAt.toFixed(2)} USD in ${cand.toUpperCase()} · Challenge-Min (Stake, USD): $${minBetUsd}`
              )
            } catch (e) {
              log(`Session ${cand.toUpperCase()}: ${e?.message || e}`)
              throw e
            }
          }
        } else if (currencySlotIndex > 0 && ordered.length === 0) {
          log('Keine Ziel-Kandidaten für Kopie-Zuweisung — Fallback manuelle Zielwährung.')
        }
      }

      if (!session) {
        tCurr = preferredTarget
        log(`Starte Session: ${sCurr.toUpperCase()} -> ${tCurr.toUpperCase()}...`)
        session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
        rate = getRateForCurrency(rates, tCurr)
        if (!rate) throw new Error(`Kein Kurs für ${tCurr.toUpperCase()}`)
        const computed = computeBetFromMinBetAndSession(session, tCurr, rate, minBetUsd)
        betAmount = computed.betAmount
        log(
          `Einsatz effektiv ~$${computed.usdAt.toFixed(2)} USD · Challenge-Min (Stake, USD): $${minBetUsd}`
        )
      }

      const betUsdLine =
        rate && betAmount != null ? (toUnits(betAmount, tCurr) * rate).toFixed(2) : null
      log(
        `Berechneter Einsatz: ${formatAmount(betAmount, tCurr)} ${tCurr.toUpperCase()}` +
          (betUsdLine != null ? ` (≈ $${betUsdLine} USD)` : '') +
          ` · Challenge-Min (Stake, nur USD-Vorgabe): $${minBetUsd}`
      )
      setActiveRuns((prev) => ({
        ...prev,
        [runId]: {
          ...prev[runId],
          currentBet: betAmount,
          runCurrency: tCurr,
        },
      }))

      let stopReason = null
      let targetHit = false
      while (!runnersRef.current[runId]?.stop) {
        const total = totalStatsRef.current
        const net = total.won - total.lost
        if (stopLoss > 0 && total.lost >= stopLoss) {
          log(`Stop Loss erreicht: $${total.lost.toFixed(2)} – alle Läufe stoppen, Auto-Start aus, Warteschlange leer.`)
          Object.keys(runnersRef.current).forEach((id) => {
            if (runnersRef.current[id]) runnersRef.current[id].stop = true
          })
          setAutoStart(false)
          setQueue([])
          processedIdsRef.current.clear()
          stopReason = 'stop_loss'
          break
        }
        if (stopProfit > 0 && net >= stopProfit) {
          log(`Stop Profit erreicht: $${net.toFixed(2)} – alle Läufe stoppen, Auto-Start aus, Warteschlange leer.`)
          Object.keys(runnersRef.current).forEach((id) => {
            if (runnersRef.current[id]) runnersRef.current[id].stop = true
          })
          setAutoStart(false)
          setQueue([])
          processedIdsRef.current.clear()
          stopReason = 'stop_profit'
          break
        }

        try {
          const pendPre = pendingHouseBetMatchRef.current
          while (pendPre.length > 80) pendPre.shift()

          const result = await provider.placeBet(session, betAmount, false, false, { slotSlug: gSlug })
          const { data, nextSeq, session: updatedSession } = result || {}
          session = updatedSession ? updatedSession : session ? { ...session, seq: nextSeq } : session

          let parsed = data ? parseBetResponse(data, betAmount) : { winAmount: 0, balance: null }
          const winMinorSe = data?._stakeEngine?.winMinor
          if (winMinorSe !== undefined && winMinorSe !== null) {
            const w = Number(winMinorSe)
            if (Number.isFinite(w)) {
              parsed = {
                ...parsed,
                winAmount: w,
                multiplier: betAmount > 0 ? w / betAmount : parsed.multiplier,
              }
            }
          }
          const win = parsed.winAmount || 0
          const wageredUsd = toUnits(betAmount, tCurr) * rate
          const payoutUsd = toUnits(win, tCurr) * rate
          const netSpinUsd = payoutUsd - wageredUsd
          // Chart-Point: globaler kumulierter Netto (USD)
          const netUsdAfter = net + netSpinUsd
          if (ENABLE_SESSION_NET_CHART) {
            setSessionNetSeries((prev) => {
              const next = [...prev, { time: Date.now(), netUsd: netUsdAfter }]
              if (next.length <= SESSION_NET_SERIES_MAX_POINTS) return next
              return next.slice(-SESSION_NET_SERIES_MAX_POINTS)
            })
          }
          setTotalSessionStats(t => ({
            wagered: t.wagered + wageredUsd,
            won: t.won + Math.max(0, netSpinUsd),
            lost: t.lost + Math.max(0, -netSpinUsd),
          }))
          const rawRound = data?._stakeEngine?.raw?.round
          const payoutMultRaw = Number(rawRound?.payoutMultiplier ?? rawRound?.payout_multiplier ?? 0)
          const betN = Number(betAmount) || 0
          const impliedMulti = betN > 0 && (parsed.winAmount || 0) > 0 ? parsed.winAmount / betN : 0
          const safeMulti =
            impliedMulti > 0
              ? impliedMulti
              : effectiveSpinMultiplierFromParsed(payoutMultRaw, parsed)

          const spinSeq =
            (hunterSpinSeqByRunRef.current[runId] = (hunterSpinSeqByRunRef.current[runId] || 0) + 1)

          // houseBets-Matching: Pending mit HTTP-Multi; UI-Best-Multi erst nach houseBets (oder Fallback).
          const matchEntry = {
            runId,
            challengeId,
            slug: normalizeBetSlugForHouseMatch(gSlug),
            storageSlug: gSlug,
            currency: String(tCurr).toLowerCase(),
            betAmountMajor: toUnits(betAmount, tCurr),
            at: Date.now(),
            multi: safeMulti,
            spinSeq,
          }
          pendingHouseBetMatchRef.current.push(matchEntry)
          flushHouseBetRetryBufferForSlug(
            houseBetRetryBufferRef,
            houseBetEventQueueRef,
            normalizeBetSlugForHouseMatch(gSlug),
            () => scheduleHouseBetWorkerRef.current?.()
          )

          setTimeout(() => {
            const k = `${runId}:${spinSeq}`
            if (houseBetMatchedSpinKeysRef.current.has(k)) return
            setBestMultiBySlotRef.current((prev) => {
              const cur = prev[gSlug] ?? 0
              if (safeMulti <= cur) return prev
              const nmap = { ...prev, [gSlug]: safeMulti }
              persistBestMultiMap(nmap)
              return nmap
            })
            setActiveRuns((prev) => {
              const run = prev[runId]
              if (!run || run.status !== 'running') return prev
              return {
                ...prev,
                [runId]: {
                  ...run,
                  bestMultiRun: Math.max(run.bestMultiRun ?? 0, safeMulti),
                },
              }
            })
            const prevS = runBestMultiSyncRef.current[runId] ?? 0
            runBestMultiSyncRef.current[runId] = Math.max(Number(prevS) || 0, safeMulti)
          }, HOUSEBET_DEFERRED_UI_MULTI_MS)

          // RoundId für "Beste Multi" Kopieren (nicht nur wenn Ziel erreicht ist)
          const resolvedRoundId =
            parsed?.roundId != null
              ? String(parsed.roundId)
              : rawRound?.betID != null
                ? String(rawRound.betID)
                : rawRound?.roundId != null
                  ? String(rawRound.roundId)
                  : rawRound?.id != null
                    ? String(rawRound.id)
                    : rawRound?.betId != null
                      ? String(rawRound.betId)
                      : null

          if (win > 0) {
            void saveFirstSlotWinIfNeeded({
              slotSlug: gSlug,
              slotName: gName,
              providerId: slot.providerId,
              providerGroupSlug: challenge.providerGroupSlug ?? extractProviderGroupSlug(challenge.game),
              betAmountMinor: betAmount,
              winAmountMinor: win,
              currency: tCurr,
              multiplier: safeMulti,
              roundId: resolvedRoundId,
              shareBetId: null,
              betAmountApiRaw: data?._stakeEngine?.betAmountApiRaw ?? null,
              payoutApiRaw: data?._stakeEngine?.payoutApiRaw ?? null,
              payoutFromMultiplierApiRaw: data?._stakeEngine?.payoutFromMultiplierApiRaw ?? null,
            }).then((r) => {
              if (r?.saved) {
                const parts = [r.path, r.csvPath, r.slotCsvPath].filter(Boolean)
                log(
                  `Erster Gewinn gespeichert: ${gName || gSlug}${parts.length ? ` → ${parts.join(' | ')}` : ''}`
                )
              }
            })
          }

          setActiveRuns((prev) => ({
            ...prev,
            [runId]: {
              ...prev[runId],
              spins: prev[runId].spins + 1,
              wagered: prev[runId].wagered + betAmount,
              wonUsd: (prev[runId].wonUsd ?? 0) + Math.max(0, netSpinUsd),
              balance: parsed.balance,
              bestMultiRun: prev[runId].bestMultiRun ?? 0,
              bestBetId: prev[runId].bestBetId ?? null,
            },
          }))

          const multi = safeMulti
          if (multi >= challenge.targetMultiplier) {
            log(`ZIEL ERREICHT! Multi: ${multi.toFixed(2)}x (Ziel: ${challenge.targetMultiplier}x)`)
            targetHit = true
            const rawR = data?._stakeEngine?.raw?.round
            const roundId =
              parsed.roundId != null
                ? String(parsed.roundId)
                : rawR?.roundId != null
                  ? String(rawR.roundId)
                  : rawR?.id != null
                    ? String(rawR.id)
                    : rawR?.betId != null
                      ? String(rawR.betId)
                      : null
            log(
              'Ziel erreicht — Bet-ID für Share-Link nur aus houseBets (WebSocket); „Copy ID“ auf der Run-Karte'
            )
            const cc = (parsed.currencyCode || tCurr || 'usd').toUpperCase()
            appendBet(
              gSlug,
              {
                betAmount,
                winAmount: win,
                isBonus: false,
                balance: parsed.balance,
                currencyCode: cc,
                roundId: roundId ?? undefined,
              },
              gName
            ).catch(() => {})
            persistChallengeHitRecord({
              challengeId,
              roundId,
              slotSlug: gSlug,
              slotName: gName,
              targetMultiplier: challenge.targetMultiplier,
              hitMulti: multi,
              currency: tCurr,
            })
            log(`Treffer gespeichert (Bet-Historie + Liste): Round ${roundId ?? '—'}`)
            break
          }
          
          await new Promise((r) => setTimeout(r, HUNTER_SPIN_DELAY_MS))

        } catch (e) {
          const msg = String(e?.message || '')
          log(`Spin Fehler: ${msg}`)
          if (e?.insufficientBalance || msg.includes('ERR_IPB')) {
            log('Guthaben reicht nicht (ERR_IPB) – alle Hunter-Läufe und Auto-Start werden gestoppt.')
            Object.keys(runnersRef.current).forEach((id) => {
              if (runnersRef.current[id]) runnersRef.current[id].stop = true
            })
            setAutoStart(false)
            setQueue([])
            processedIdsRef.current.clear()
            setHuntEnabled(false)
            stopReason = 'insufficient_balance'
            break
          }
          await new Promise((r) => setTimeout(r, HUNTER_SPIN_ERROR_RETRY_MS))
        }
      }
      
      log('Challenge beendet.')
      const status = challenge.completedAt ? 'completed' : targetHit ? 'target_hit' : (stopReason || 'stopped')
      setActiveRuns((prev) => ({
        ...prev,
        [runId]: { ...prev[runId], status },
      }))

    } catch (e) {
      log(`Fehler bei Challenge Start: ${e.message}`)
      setActiveRuns((prev) => ({
        ...prev,
        [runId]: { ...prev[runId], status: 'failed' },
      }))
    } finally {
      delete runnersRef.current[runId]
      try {
        delete runBestMultiSyncRef.current[runId]
      } catch (_) {}
      try {
        delete hunterSpinSeqByRunRef.current[runId]
      } catch (_) {}
      try {
        for (const k of houseBetMatchedSpinKeysRef.current) {
          if (String(k).startsWith(`${runId}:`)) houseBetMatchedSpinKeysRef.current.delete(k)
        }
      } catch (_) {}
    }
  }

  const stopAllRunners = () => {
    Object.keys(runnersRef.current).forEach((id) => {
      runnersRef.current[id].stop = true
    })
    setHuntEnabled(false)
    setAutoStart(false)
    setQueue([])
    processedIdsRef.current.clear()
    dismissedChallengeIdsRef.current.clear()
    log('Alles gestoppt: aktive Spins, Scan, Auto-Start, Warteschlange geleert.')
  }

  const resetSession = () => {
    Object.keys(runnersRef.current).forEach(id => {
      runnersRef.current[id].stop = true
    })
    runnersRef.current = {}
    processedIdsRef.current.clear()
    dismissedChallengeIdsRef.current.clear()
    setQueue([])
    setActiveRuns({})
    setHunterSlotTargets({})
    setTotalSessionStats({ wagered: 0, won: 0, lost: 0 })
    if (ENABLE_SESSION_NET_CHART) {
      setSessionNetSeries([{ time: Date.now(), netUsd: 0 }])
    }
    setAutoStart(false)
    setHuntEnabled(false)
    setLastRefresh(null)
  }

  const clearLogs = () => {
    setLogs([])
  }

  const startAllRunners = () => {
    setAutoStart(true)
    if (!huntEnabled) setHuntEnabled(true)
    if (queue.length === 0 && runningCount === 0) {
      processedIdsRef.current.clear()
      dismissedChallengeIdsRef.current.clear()
      refreshChallenges()
    }
  }

  /** Einen Lauf aus der Warteschlange starten — ohne Scan & ohne Auto-Start (reine Handsteuerung). */
  const startNextQueuedManually = () => {
    if (queue.length === 0) {
      log('Warteschlange ist leer.')
      return
    }
    if (runningCount >= maxParallelClamped) {
      log(`Bereits ${maxParallelClamped} Läufe parallel — freien Slot abwarten oder einen Run stoppen.`)
      return
    }
    const nextId = queue[0]
    setQueue((q) => q.slice(1))
    startChallengeRun(nextId)
    log('Nächste Challenge aus der Queue gestartet (manuell).')
  }

  /** Ein laufender Run: Flag setzen — Schleife bricht nach dem aktuell laufenden Spin ab (nicht mitten in placeBet). */
  const stopRunByRunId = useCallback((runId) => {
    if (runnersRef.current[runId]) {
      runnersRef.current[runId].stop = true
    }
  }, [])

  /** Alle aktiven Läufe zu einer Challenge (z. B. mehrere Zielwährungen) — jeweils nach aktuellem Spin. */
  const stopRunsForChallenge = useCallback(
    (challengeId) => {
      const runs = Object.values(activeRunsRef.current).filter(
        (r) => r.challengeId === challengeId && r.status === 'running'
      )
      for (const r of runs) {
        const rid = r.runId
        if (rid && runnersRef.current[rid]) {
          runnersRef.current[rid].stop = true
        }
      }
      if (runs.length === 1) {
        log('Nach aktuellem Spin stoppen: 1 Lauf dieser Challenge.')
      } else if (runs.length > 1) {
        log(`Nach aktuellem Spin stoppen: ${runs.length} parallele Läufe dieser Challenge.`)
      }
    },
    [log]
  )

  const removeRun = (runId) => {
    const snap = activeRunsRef.current[runId]
    const cid = snap?.challengeId
    if (runnersRef.current[runId]) {
      runnersRef.current[runId].stop = true
      delete runnersRef.current[runId]
    }
    setActiveRuns((prev) => {
      const next = { ...prev }
      delete next[runId]
      return next
    })
    setQueue((q) => q.filter((item) => normalizeQueueItem(item).runId !== runId))
    setTimeout(() => {
      if (!cid) return
      const anyOther =
        queueRef.current.some((x) => normalizeQueueItem(x).challengeId === cid) ||
        Object.values(activeRunsRef.current).some((r) => r.challengeId === cid)
      if (!anyOther) {
        dismissedChallengeIdsRef.current.add(cid)
        processedIdsRef.current.delete(cid)
      }
    }, 0)
  }

  const renderChallengeCard = (c, inQueue = false, metaOverride = null, showReasons = false, queueItem = null) => {
    const meta = metaOverride || getChallengeMeta(c)
    const { main: prizeMain, hint: prizeHint } = formatChallengePrize(c)
    const runsForChallenge = Object.values(activeRuns).filter(
      (r) => r.challengeId === c.id && r.status === 'running'
    )
    const runningCountForC = runsForChallenge.length
    const isRunning = runningCountForC > 0
    const hasFinishedRun = Object.values(activeRuns).some(
      (r) => r.challengeId === c.id && r.status !== 'running'
    )
    const inQueueLocal = queue.some((x) => normalizeQueueItem(x).challengeId === c.id)
    const queueCountForC = queue.filter((x) => normalizeQueueItem(x).challengeId === c.id).length
    const stakeClosed = !!(c.completedAt || c.active === false)
    const canQueue = !stakeClosed
    const filterEligible = meta.eligible
    const badges = []
    if (showReasons) {
      if (!meta.isSlotOk) badges.push('Nicht verfügbar')
      if (!meta.isMinBetOk) badges.push('MinBet Filter')
      if (!meta.isPrizeOk) badges.push('Preis Filter')
      if (c.completedAt || c.active === false) badges.push('Stake: beendet')
      if (inQueueLocal) badges.push(`Warteschlange${queueCountForC > 1 ? ` (${queueCountForC})` : ''}`)
      if (isRunning) badges.push(runningCountForC > 1 ? `Läuft (${runningCountForC})` : 'Läuft')
      else if (hasFinishedRun) badges.push('Run beendet')
    }

    const qMeta = queueItem ? normalizeQueueItem(queueItem) : null
    const copyHint =
      qMeta && qMeta.currencySlotIndex > 0 ? ` → Ziel #${qMeta.currencySlotIndex + 1}` : ''

    return (
      <div 
        key={inQueue && qMeta ? `${c.id}-${qMeta.runId}` : c.id} 
        className={inQueue ? 'hunter-queue-item' : 'hunter-card hunter-challenge-card'}
        style={
          !inQueue && canQueue && !filterEligible
            ? { borderStyle: 'dashed', borderColor: 'rgba(251, 191, 36, 0.55)' }
            : undefined
        }
        title={
          canQueue
            ? filterEligible
              ? 'Klick: In die Warteschlange (mehrfach = nächste Zielwährung bei Auto-Optimal)'
              : 'Klick: In die Warteschlange (Filter Min/Preis passt nicht — trotzdem möglich)'
            : stakeClosed
              ? 'Challenge auf Stake beendet'
              : ''
        }
        onClick={() => {
          if (!canQueue) return
          dismissedChallengeIdsRef.current.delete(c.id)
          const slotIndex = countHunterSlotsForChallenge(c.id, queue, activeRuns)
          const manual = (manualTargetCurrencyByChallengeId[c.id] || '').trim().toLowerCase()
          setQueue((q) => [
            ...q,
            {
              runId: generateHunterRunId(),
              challengeId: c.id,
              currencySlotIndex: slotIndex,
              ...(manual ? { forcedTargetCurrency: manual } : {}),
            },
          ])
          processedIdsRef.current.add(c.id)
        }}
      >
        <div style={{fontWeight: 600, marginBottom: '0.25rem'}}>
          {c.gameName || c.gameSlug || c.game?.name || c.game?.slug}
          {copyHint ? (
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>{copyHint}</span>
          ) : null}
        </div>
        <div style={STYLES.statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Ziel-Multi</span>
          <span style={{ fontWeight: 600 }}>{c.targetMultiplier}×</span>
        </div>
        <div style={STYLES.statRow}>
          <span style={{ color: 'var(--text-muted)' }}>Zu gewinnen</span>
          <span style={{ textAlign: 'right' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{prizeMain}</span>
            {prizeHint ? (
              <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                {prizeHint}
              </span>
            ) : null}
          </span>
        </div>
        <div style={STYLES.statRow}>
          <span
            style={{ color: 'var(--text-muted)' }}
            title="Mindesteinsatz der Challenge bei Stake in USD (nicht der Umrechnungswert deines Einsatzes in INR/PKR/…)"
          >
            Challenge-Min: ${c.minBetUsd}
          </span>
          {!meta.isSlotOk && <span style={{color: 'var(--error)'}}>Nicht verfügbar</span>}
          {isRunning && <span style={{color: 'var(--accent)'}}>Läuft …</span>}
          {hasFinishedRun && !isRunning && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Run fertig</span>
          )}
        </div>
        {!inQueue && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: '0.35rem' }}
          >
            <label
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: '0.12rem',
              }}
            >
              Ziel (Spiel)
            </label>
            <select
              value={manualTargetCurrencyByChallengeId[c.id] ?? ''}
              onChange={(e) => {
                e.stopPropagation()
                const v = e.target.value
                setManualTargetCurrencyByChallengeId((prev) => ({ ...prev, [c.id]: v }))
              }}
              style={{
                width: '100%',
                fontSize: '0.72rem',
                padding: '0.25rem 0.35rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-deep)',
                color: 'var(--text)',
              }}
            >
              <option value="">Auto (Sortierung / Probes)</option>
              {hunterTargetCurrencyOptions.map((cc) => (
                <option key={cc} value={cc}>
                  {cc.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
        {inQueue && qMeta && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: '0.35rem' }}
          >
            <label
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: '0.12rem',
              }}
            >
              Ziel
            </label>
            <select
              value={qMeta.forcedTargetCurrency || ''}
              onChange={(e) => {
                e.stopPropagation()
                const v = e.target.value.trim().toLowerCase()
                setQueue((q) =>
                  q.map((item) => {
                    const n = normalizeQueueItem(item)
                    if (n.runId !== qMeta.runId) return item
                    return { ...item, forcedTargetCurrency: v || null }
                  })
                )
              }}
              style={{
                width: '100%',
                fontSize: '0.72rem',
                padding: '0.25rem 0.35rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-deep)',
                color: 'var(--text)',
              }}
            >
              <option value="">Auto</option>
              {hunterTargetCurrencyOptions.map((cc) => (
                <option key={cc} value={cc}>
                  {cc.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
        {(() => {
          const slug = c.gameSlug || c.game?.slug
          const rec = slug && bestMultiBySlot[slug] != null ? bestMultiBySlot[slug] : null
          if (rec == null || rec <= 0) return null
          return (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Bisher max. Multi: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{rec.toFixed(2)}×</span>
            </div>
          )
        })()}
        {showReasons && badges.length > 0 && (
          <div style={{ ...STYLES.statRow, color: 'var(--text-muted)' }}>
            <span>{badges.join(' · ')}</span>
          </div>
        )}
        {canQueue && !filterEligible && showReasons && (
          <div style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: '0.2rem' }}>
            Filter (Min/Preis) — trotzdem queue-fähig
          </div>
        )}
        {isRunning && (
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ marginTop: '0.4rem' }}
          >
            <Button
              size="small"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                stopRunsForChallenge(c.id)
              }}
              title="Kein weiterer Spin nach dem gerade laufenden (HTTP) — pro parallelem Lauf dieser Challenge"
            >
              Nach Spin stoppen
            </Button>
          </div>
        )}
        {inQueue && qMeta && (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              setQueue((q) => {
                const next = q.filter((item) => normalizeQueueItem(item).runId !== qMeta.runId)
                const still = next.some((item) => normalizeQueueItem(item).challengeId === c.id)
                if (!still) processedIdsRef.current.delete(c.id)
                return next
              })
            }}
          >
            Entfernen
          </Button>
        )}
        {!inQueue && inQueueLocal && (
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              setQueue((q) => {
                const next = q.filter((item) => normalizeQueueItem(item).challengeId !== c.id)
                processedIdsRef.current.delete(c.id)
                return next
              })
            }}
          >
            Queue leeren
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="hunter-dashboard" style={STYLES.container}>
      <div className="hunter-header">
        <div className="hunter-title">Auto Challenge Hunter</div>
        <div className="hunter-controls">
           <div className="hunter-meta" style={{ marginRight: '1rem' }}>
             {lastRefresh ? `Update: ${new Date(lastRefresh).toLocaleTimeString()}` : ''}
           </div>
           <Button onClick={clearLogs}>Logs löschen</Button>
           <Button
             onClick={resetSession}
             variant="secondary"
             title="Queue, Statistik und Scan zurücksetzen (wie neu starten)"
           >
             Alles zurücksetzen
           </Button>
           <Button onClick={refreshChallenges} disabled={!accessToken} title="Challenges jetzt neu laden">
             Neu laden
           </Button>
           <Button
             variant={huntEnabled ? 'primary' : 'outline'}
             onClick={() => setHuntEnabled(!huntEnabled)}
             title={huntEnabled ? 'Challenge-Liste nicht mehr automatisch aktualisieren' : 'Regelmäßig Challenges von Stake laden'}
           >
             {huntEnabled ? 'Scan: ein' : 'Scan: aus'}
           </Button>
           {huntEnabled && (
             <Button
               variant={autoStart ? 'success' : 'outline'}
               onClick={() => setAutoStart(!autoStart)}
               title={autoStart ? 'Keine neuen Runs aus der Warteschlange starten' : 'Warteschlange automatisch abarbeiten, sobald ein Slot frei ist'}
             >
               Auto-Start: {autoStart ? 'an' : 'aus'}
             </Button>
           )}
        </div>
      </div>

      <div className="hunter-grid">
        <div className="hunter-sidebar">
          <div className="hunter-card">
            <h3 className="hunter-section-title" style={{ marginBottom: '0.5rem' }}>Einstellungen</h3>
            <div style={{ marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', lineHeight: 1.35 }}>
                Filter und Währungen werden automatisch auf diesem Gerät gespeichert.
              </p>
              <div style={STYLES.inputGroup}>
                <label style={STYLES.label}>Vorlagen</label>
                <select
                  value={presetSelectValue}
                  onChange={(e) => {
                    const v = e.target.value
                    setPresetSelectValue(v)
                    if (v) loadPresetById(v)
                  }}
                  style={{ ...STYLES.input, width: '100%' }}
                >
                  <option value="">— Vorlage wählen —</option>
                  {userPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.3 }}>
                  Vorlagen werden nur lokal gespeichert.
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                <input
                  type="text"
                  placeholder="Name für Vorlage"
                  value={presetNameDraft}
                  onChange={(e) => setPresetNameDraft(e.target.value)}
                  style={{ ...STYLES.input, flex: '1 1 120px', minWidth: 0, fontSize: '0.8rem' }}
                />
                <button
                  type="button"
                  onClick={saveCurrentPreset}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem',
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedUserPreset}
                  disabled={!userPresets.some((p) => p.id === presetSelectValue)}
                  title="Ausgewählte Vorlage löschen"
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.25rem 0.5rem',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    cursor: userPresets.some((p) => p.id === presetSelectValue) ? 'pointer' : 'not-allowed',
                    opacity: userPresets.some((p) => p.id === presetSelectValue) ? 1 : 0.5,
                  }}
                >
                  Löschen
                </button>
              </div>
              <button
                type="button"
                onClick={restoreDefaultFilters}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.5rem',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                Standard-Filter laden
              </button>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>MinBet Bereich ($)</label>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem'}}>
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Min"
                  value={minMinBet} 
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    setMinMinBet(Number.isNaN(v) ? 0 : v)
                  }}
                  style={{...STYLES.input, width: '100%'}} 
                />
                <input 
                  type="number" 
                  step="0.01" 
                  placeholder="Max"
                  value={maxMinBet} 
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    setMaxMinBet(Number.isNaN(v) ? 0 : v)
                  }}
                  style={{...STYLES.input, width: '100%'}} 
                />
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Min Preis ($)</label>
              <input 
                type="number" 
                step="1" 
                value={minPrizeUsd} 
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setMinPrizeUsd(Number.isNaN(v) ? 0 : v)
                }}
                style={STYLES.input} 
              />
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Erlaubte Währungen</label>
              <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                <div>
                  <label style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>Quelle (Crypto)</label>
                  <select 
                    value={sourceCurrency} 
                    onChange={e => setSourceCurrency(e.target.value)}
                    style={STYLES.input}
                  >
                    {cryptoOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>Ziel (Fiat/Display)</label>
                  <select 
                    value={targetCurrency} 
                    onChange={e => setTargetCurrency(e.target.value)}
                    style={STYLES.input}
                  >
                    {fiatOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    <option disabled>--- Crypto ---</option>
                    {cryptoOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.4rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    marginTop: '0.25rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoOptimalTargetCurrency}
                    onChange={(e) => setAutoOptimalTargetCurrency(e.target.checked)}
                    style={{ marginTop: '0.1rem' }}
                  />
                  <span>
                    Zielwährung automatisch (Fiat wie CLP/PKR/RUB/… — keine USDC/USDT/LTC/DOGE-Probes; bis zu 20 Sessions mit
                    Pause; 1. Lauf = günstigster USD-Bet; 2./3./4. gleiche Challenge = 2./3./4. Kandidat der Sortierung)
                  </span>
                </label>
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Max Slots gleichzeitig (max. {CHALLENGE_SLIDER_MAX})</label>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <input
                  type="range"
                  min={1}
                  max={CHALLENGE_SLIDER_MAX}
                  step={1}
                  value={maxParallelClamped}
                  onChange={(e) =>
                    setMaxParallel(Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.8rem', minWidth: 28, textAlign: 'right' }}>
                  {maxParallelClamped}
                </span>
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Seiten laden (max. {CHALLENGE_SLIDER_MAX})</label>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <input
                  type="range"
                  min={1}
                  max={CHALLENGE_SLIDER_MAX}
                  step={1}
                  value={pagesToLoadClamped}
                  onChange={(e) =>
                    setPagesToLoad(Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.8rem', minWidth: 28, textAlign: 'right' }}>
                  {pagesToLoadClamped}
                </span>
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Stop Loss (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0 = aus"
                value={stopLossStr}
                onChange={(e) => {
                  const raw = e.target.value
                  if (!isUsdLimitInputCharsOk(raw)) return
                  setStopLossStr(raw)
                  setStopLoss(parseUsdLimitInput(raw))
                }}
                onBlur={() => {
                  const v = parseUsdLimitInput(stopLossStr)
                  setStopLoss(v)
                  setStopLossStr(usdLimitToInputStr(v))
                }}
                style={STYLES.input}
              />
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Stop Profit (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0 = aus"
                value={stopProfitStr}
                onChange={(e) => {
                  const raw = e.target.value
                  if (!isUsdLimitInputCharsOk(raw)) return
                  setStopProfitStr(raw)
                  setStopProfit(parseUsdLimitInput(raw))
                }}
                onBlur={() => {
                  const v = parseUsdLimitInput(stopProfitStr)
                  setStopProfit(v)
                  setStopProfitStr(usdLimitToInputStr(v))
                }}
                style={STYLES.input}
              />
            </div>
          </div>

          <div className="hunter-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 className="hunter-section-title" style={{ marginBottom: '0.5rem' }}>Warteschlange ({queue.length})</h3>
            <div style={{overflowY: 'auto', flex: 1}}>
              {queue.map((item) => {
                const q = normalizeQueueItem(item)
                const c = challenges.find((ch) => ch.id === q.challengeId)
                return c ? renderChallengeCard(c, true, null, true, item) : null
              })}
              {queue.length === 0 && <div style={{color: 'var(--text-muted)', fontSize: '0.8rem'}}>Leer</div>}
            </div>
          </div>
        </div>

        <div className="hunter-main">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <div className="hunter-help-bar">
              <strong>Neu laden</strong> = Challenges holen (ohne Scan) · Karten unten <strong>Ziel</strong>-Dropdown &amp; <strong>klicken</strong> = Warteschlange ·{' '}
              <strong>Nächsten starten</strong> = manuell ohne Auto-Hunt · <strong>Scan</strong> = Liste dauernd aktualisieren ·{' '}
              <strong>Auto-Start</strong> = Queue automatisch · <strong>Alles stoppen</strong> = Stop &amp; Queue leer
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="hunter-meta" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Parallel: {runningCount} / {maxParallelClamped}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  onClick={startNextQueuedManually}
                  variant="primary"
                  disabled={queue.length === 0 || runningCount >= maxParallelClamped}
                  title="Startet genau einen Lauf aus der Warteschlange — ohne Scan und ohne Auto-Start"
                >
                  Nächsten starten
                </Button>
                <Button
                  onClick={startAllRunners}
                  variant="secondary"
                  title="Scan + Auto-Start einschalten und ggf. sofort Challenges neu laden (Auto-Hunt)"
                >
                  Auto-Hunt starten
                </Button>
                <Button
                  onClick={stopAllRunners}
                  variant="danger"
                  disabled={!hasAnythingToStop}
                  title={
                    hasAnythingToStop
                      ? 'Aktive Spins stoppen, Scan & Auto-Start ausschalten, Warteschlange leeren'
                      : 'Nichts aktiv (keine Läufe, Scan aus, Queue leer)'
                  }
                >
                  Alles stoppen
                </Button>
              </div>
            </div>
          </div>
          <div className="hunter-kpi-strip">
            <div className="hunter-kpi-card">
              <div className="hunter-kpi-label">Wagered (USD)</div>
              <div className="hunter-kpi-value">${totalSessionStats.wagered.toFixed(2)}</div>
            </div>
            <div className="hunter-kpi-card">
              <div className="hunter-kpi-label">Netto-Gewinne (USD)</div>
              <div className="hunter-kpi-value">${totalSessionStats.won.toFixed(2)}</div>
            </div>
            <div className="hunter-kpi-card">
              <div className="hunter-kpi-label">Netto-Verluste (USD)</div>
              <div className="hunter-kpi-value">${totalSessionStats.lost.toFixed(2)}</div>
            </div>
            <div className="hunter-kpi-card">
              <div className="hunter-kpi-label">Netto (USD)</div>
              <div className="hunter-kpi-value" style={{ color: netUsd >= 0 ? 'var(--success)' : 'var(--error)' }}>${netUsd.toFixed(2)}</div>
            </div>
          </div>

          {ENABLE_SESSION_NET_CHART && (
            <div
              className="hunter-net-chart"
              style={{
                marginTop: '0.5rem',
                padding: '0.45rem 0.55rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Session Netto-Verlauf</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{Math.max(0, sessionNetSeries.length - 1)} Spins</div>
              </div>
              <div style={{ width: '100%', height: 54 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sessionNetChartData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="hunterNetGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={netUsd >= 0 ? '#00e701' : '#f43f5e'}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={netUsd >= 0 ? '#00e701' : '#f43f5e'}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide domain={['dataMin', 'dataMax']} />
                    <YAxis hide domain={[sessionNetMin - sessionNetPadding, sessionNetMax + sessionNetPadding]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1a2c38', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text)' }}
                      formatter={(val) => [`$${Number(val).toFixed(2)}`, 'Netto']}
                      labelFormatter={() => ''}
                    />
                    <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.8} />
                    <Area
                      type="monotone"
                      dataKey="net"
                      stroke={netUsd >= 0 ? '#00e701' : '#f43f5e'}
                      strokeWidth={1.6}
                      fill="url(#hunterNetGradient)"
                      fillOpacity={1}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="hunter-status-bar">
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
              <span style={{color: 'var(--text-muted)'}}>Laufen</span>
              <span className="hunter-meta">{runningCount} / {maxParallelClamped}</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
              <span style={{color: 'var(--text-muted)'}}>Queue</span>
              <span className="hunter-meta">{queue.length}</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.35rem'}}>
              {activeRunList.slice(0, 6).map((run) => (
                <span
                  key={run.id}
                  className="hunter-pill"
                  title={run.runCurrency ? `${run.slotName} · ${run.runCurrency}` : run.slotName}
                >
                  {run.runCurrency ? `${run.slotName} · ${String(run.runCurrency).toUpperCase()}` : run.slotName}
                </span>
              ))}
              {activeRunList.length > 6 && (
                <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>+{activeRunList.length - 6}</span>
              )}
            </div>
          </div>
          {activeRunList.length === 0 ? (
            <div className="hunter-empty">
              Keine aktive Challenge. <br/>
              Unten Karten in die Warteschlange klicken, dann <strong>Nächsten starten</strong> — oder Auto-Hunt mit Scan.
            </div>
          ) : (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem'}}>
              {activeRunList.map((run) => {
                const ch = challenges.find((x) => x.id === run.challengeId)
                const prizeLine = ch ? formatChallengePrize(ch) : { main: run.prizeDisplay ?? '—', hint: run.prizeHint ?? null }
                const copyBetIdRun =
                  run.bestBetId && isPersistableStakeHouseBetShareId(String(run.bestBetId))
                    ? String(run.bestBetId).trim()
                    : null
                const copyBetIdRecord = loadOverallBetIdForSlug(run.slotSlug)
                const copyBetId = copyBetIdRun || copyBetIdRecord || null
                const previewBetId = copyBetId ? stakeBetIdForPreviewApi(copyBetId) : null
                const stakeBetLink = copyBetId ? stakeBetModalShareUrl(copyBetId) : null
                return (
                <div key={run.id} className="hunter-run-card">
                  <div className="hunter-run-card-inner">
                  <div style={{fontWeight: 600, marginBottom: '0.4rem' }}>
                    {run.slotName}
                    {run.currencySlotIndex > 0 ? (
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {' '}
                        (Kopie #{run.currencySlotIndex + 1}
                        {run.runCurrency ? ` · ${String(run.runCurrency).toUpperCase()}` : ''})
                      </span>
                    ) : run.runCurrency ? (
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {' '}
                        · {String(run.runCurrency).toUpperCase()}
                      </span>
                    ) : null}
                    {run.forcedTargetCurrency ? (
                      <span
                        style={{ fontWeight: 500, color: 'var(--accent)', fontSize: '0.68rem', marginLeft: '0.25rem' }}
                        title="Zielwährung manuell auf der Karte gewählt"
                      >
                        manuell
                      </span>
                    ) : null}
                  </div>
                  <div style={STYLES.statRow}>
                    <span>Status</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      {run.status === 'running' ? (
                        <span
                          title="Läuft"
                          aria-label="Läuft"
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: 'radial-gradient(circle at 35% 35%, #86efac, #16a34a)',
                            boxShadow: '0 0 6px 2px rgba(34, 197, 94, 0.9), 0 0 16px rgba(34, 197, 94, 0.5)',
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{run.status}</span>
                      )}
                    </span>
                  </div>
                  <div style={STYLES.statRow}><span>Spins</span><span>{run.spins}</span></div>
                  <div style={STYLES.statRow}>
                    <span>Wagered (USD)</span>
                    <span>${minorToUsd(run.wagered, run.runCurrency || targetCurrency, rates).toFixed(2)}</span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span>Won (USD)</span>
                    <span>
                      $
                      {(run.wonUsd != null
                        ? run.wonUsd
                        : minorToUsd(run.won ?? 0, run.runCurrency || targetCurrency, rates)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span>Bet (USD)</span>
                    <span>${minorToUsd(run.currentBet, run.runCurrency || targetCurrency, rates).toFixed(2)}</span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ fontWeight: 600 }}>Ziel-Multi</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {run.targetMultiplier != null && Number.isFinite(Number(run.targetMultiplier))
                        ? `${Number(run.targetMultiplier).toLocaleString('de-DE', { maximumFractionDigits: 2 })}×`
                        : '—'}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Zu gewinnen</span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{prizeLine.main}</span>
                      {prizeLine.hint ? (
                        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.12rem' }}>
                          {prizeLine.hint}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Max (dieser Run)</span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <span>{(run.bestMultiRun ?? 0).toFixed(2)}×</span>
                      <button
                        type="button"
                        disabled={!copyBetIdRun}
                        onClick={() => {
                          if (!copyBetIdRun) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(copyBetIdRun).catch(() => {})
                              log(`Bet-ID (dieser Run, houseBets) kopiert — ${run.slotName}`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: copyBetIdRun ? 'pointer' : 'not-allowed',
                          opacity: copyBetIdRun ? 1 : 0.45,
                        }}
                        title={
                          copyBetIdRun
                            ? 'Share-ID nur aus houseBets zu diesem Lauf / diesem Max-Multi'
                            : 'Noch keine Bet-ID für diesen Lauf (houseBets).'
                        }
                      >
                        Copy Run
                      </button>
                      <button
                        type="button"
                        disabled={!stakeBetLink}
                        onClick={() => {
                          if (!stakeBetLink) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(stakeBetLink).catch(() => {})
                              log(`Stake Bet-Link kopiert (${run.slotName})`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: stakeBetLink ? 'pointer' : 'not-allowed',
                          opacity: stakeBetLink ? 1 : 0.45,
                        }}
                        title={
                          stakeBetLink
                            ? 'Voller Link wie Stake „Link teilen“ (?iid= exakt houseBets.iid, encodiert)'
                            : 'Zuerst Bet-ID (Copy ID).'
                        }
                      >
                        Link
                      </button>
                      <button
                        type="button"
                        disabled={!previewBetId}
                        onClick={() => {
                          if (!previewBetId) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(previewBetId).catch(() => {})
                              log(`Bet-Preview UUID kopiert (${run.slotName}) — für POST /bet/preview Body betId`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: previewBetId ? 'pointer' : 'not-allowed',
                          opacity: previewBetId ? 1 : 0.45,
                        }}
                        title={
                          previewBetId
                            ? 'Nur die UUID (ohne casino:-Prefix) für Stake REST Bet Preview: { "betId": "<uuid>" }'
                            : 'Zuerst Bet-ID übernehmen (Copy ID).'
                        }
                      >
                        Preview
                      </button>
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Rekord (Slot)</span>
                    <span>
                      {run.slotSlug && bestMultiBySlot[run.slotSlug] != null
                        ? `${bestMultiBySlot[run.slotSlug].toFixed(2)}×`
                        : '—'}
                    </span>
                  </div>
                  <div style={STYLES.statRow}>
                    <span style={{ color: 'var(--text-muted)' }}>Bet-ID Rekord (Slot)</span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.68rem', wordBreak: 'break-all', textAlign: 'right' }}>
                        {copyBetIdRecord || '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!copyBetIdRecord}
                        onClick={() => {
                          if (!copyBetIdRecord) return
                          try {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(copyBetIdRecord).catch(() => {})
                              log(`Bet-ID (Lifetime-Rekord Slot, houseBets) kopiert — ${run.slotName}`)
                            }
                          } catch (_) {}
                        }}
                        style={{
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: copyBetIdRecord ? 'pointer' : 'not-allowed',
                          opacity: copyBetIdRecord ? 1 : 0.45,
                        }}
                        title="Share-ID zum höchsten jemals getroffenen Multi an diesem Slot (nur WebSocket)"
                      >
                        Copy
                      </button>
                    </span>
                  </div>
                  <div style={{marginTop: '0.5rem'}}>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <Button
                        onClick={() => stopRunByRunId(run.id)}
                        variant="secondary"
                        disabled={run.status !== 'running'}
                        title={
                          run.status === 'running'
                            ? 'Kein weiterer Spin nach dem gerade laufenden — nur dieser parallele Lauf'
                            : 'Kein aktiver Spin'
                        }
                      >
                        Nach Spin stoppen
                      </Button>
                      <Button
                        onClick={() => removeRun(run.id)}
                        variant="outline"
                        title="Aus Liste und Queue entfernen"
                      >
                        Aus Liste
                      </Button>
                    </div>
                  </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
          
          <div className="hunter-log">
            {logs.map((l, i) => (
              <div key={i} className="hunter-log-line">{l}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="hunter-found-panel">
        <div className="hunter-found-head">
          Gefundene Challenges
          <span style={{ display: 'block', fontWeight: 400, fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Alle Challenges aus der Stake-Liste (RGS) · Klick = Warteschlange · „Neu laden“ füllt die Liste
          </span>
        </div>
        <div className="hunter-found-body">
          <div className="hunter-found-grid">
          {challenges.map((c) => {
            const meta = getChallengeMeta(c)
            return renderChallengeCard(c, false, meta, true)
          })}
          </div>
        </div>
      </div>
    </div>
  )
}
