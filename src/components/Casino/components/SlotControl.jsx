import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle, useSyncExternalStore } from 'react'
import { getProvider } from '../api/providers'
import { PROVIDERS as PROVIDERS_BASIC } from '../constants/slots'
import { PROVIDERS as PROVIDERS_META } from '../constants/providers'
import { ALL_CURRENCIES, filterCurrenciesByProvider, buildSelectableCurrencyOptions, groupSelectableCurrencyOptions, pickDefaultCurrency } from '../constants/currencies'
import { fetchSupportedCurrencies } from '../api/stakeChallenges'
import { isFiat, isStable } from '../utils/formatAmount'
import { useUserStore } from '../../../store/userStore'
import { useStakeSiteStore } from '../../../store/stakeSiteStore'
import { getEffectiveBetAmount } from '../constants/bet'
import { parseBetResponse } from '../utils/parseBetResponse'
import { formatBetLabel, formatAmount, toUnits, toMinor } from '../utils/formatAmount'
import { convertMinorToUsdMajor } from '../utils/monetaryContract'
import { canonicalizeGoldCoinCode, isGoldCoinCurrency } from '../utils/currencyMeta'
import {
  createEmptyCasinoAggregate,
  recomputeCasinoAggregate,
  dedupeBetHistoryForAggregate,
  aggregateToStatsSnapshot,
} from '../utils/casinoStatsEngine'

const SLOT_STATS_WORKER_ENABLED = true
import StatsDisplay from './StatsDisplay'
import BetList from './BetList'
import LogViewer from './LogViewer'
import { logApiCall, saveBonusLog, isSaveBonusLogsEnabled } from '../utils/apiLogger'
import { saveSlotSpinSample, saveBonusSpinSample, hasEnoughSamplesForSlot } from '../utils/slotSpinSamples'
import { notifyBonusHit } from '../utils/notifications'
import { loadBetHistory, appendBet, recordBetHistoryAudit } from '../utils/betHistoryDb'
import { CASINO_BET_SESSION_CLEAR_EVENT } from '../utils/casinoBetSession'
import { getSlotCurrency, setSlotCurrency } from '../utils/slotCurrencyConfig'
import { getSlotBetAmount, setSlotBetAmount, pickClosestBetLevel } from '../utils/slotBetAmountConfig'
import { subscribeHunterSlotTargets, getHunterSlotTargetsSnapshot } from '../utils/hunterSlotTargetsBridge'
import { fetchCurrencyRates } from '../api/stakeChallenges'
import OriginalsProfitChart, { profitsToChartData } from './OriginalsProfitChart'
import { useSlotRealtime } from './hooks/useSlotRealtime'
import { getProviderSessionState } from '../api/providers/providerRuntime'
import { startThirdPartySession } from '../api/stake'
import {
  hasAnyStakeRgsSeedOption,
  resolveStakeRgsGameId,
  rotateStakeRgsSeedAndRefreshSession,
  shouldDeferStakeRgsSeedReset,
  shouldTriggerStakeRgsSeedReset,
} from '../utils/stakeRgsSeedRotate'
import {
  formatHouseBetShareIdForRow,
  pickStakeHouseBetShareRawId,
} from '../utils/stakeBetShareId'

const DEFAULT_BET_LEVELS = [
  1100, 2200, 4400, 6600, 8800, 11000, 13200, 15400, 17600, 19800,
  22000, 33000, 44000, 55000, 66000, 77000, 88000, 99000, 110000,
  165000, 220000, 275000, 330000, 385000, 440000, 495000, 550000,
]

const STYLES = {
  section: { marginBottom: '0.5rem' },
  label: { display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' },
  row: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' },
  select: {
    flex: 1,
    minWidth: 100,
    padding: '0.4rem 0.5rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: '0.85rem',
  },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: '0.35rem', margin: 0 },
  checkbox: { width: 16, height: 16, accentColor: 'var(--accent)' },
  btn: {
    padding: '0.75rem 1.25rem',
    background: 'var(--accent)',
    color: 'var(--bg-deep)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '0.5rem 1rem',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  error: {
    marginTop: '0.75rem',
    padding: '0.6rem',
    background: 'rgba(255, 82, 82, 0.1)',
    border: '1px solid rgba(255, 82, 82, 0.3)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--error)',
    fontSize: '0.85rem',
  },
  warning: {
    marginTop: '0.5rem',
    padding: '0.6rem',
    background: 'rgba(245, 158, 11, 0.12)',
    border: '1px solid rgba(245, 158, 11, 0.35)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--warning, #f59e0b)',
    fontSize: '0.82rem',
  },
  result: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.85rem',
    fontFamily: '"JetBrains Mono", monospace',
    maxHeight: 120,
    overflow: 'auto',
  },
}

// Platzhalter für Pragmatic (Sugar Rush 1000 IDR: 500, 1000, 2000, …)
const SESSION_DEPENDENT_BET_LEVELS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]

const EMPTY_TARGET_MULTIS = []
const BET_HISTORY_DEDUP_MAX = 6000
const FALLBACK_RECONCILE_WINDOW_MS = 60000
/** Stop-on-bonus: User kann den Bonus länger als 60s spielen — Settlement muss die offene Zeile treffen. */
const STOPPED_BONUS_RECONCILE_WINDOW_MS = 30 * 60 * 1000
const PENDING_HOUSE_RECONCILE_SOURCES = new Set(['placebet', 'http_fallback'])

/** WS emits camelCase (`houseBets`); reconcile/orphan paths always use lowercase. */
function normalizeBetHistorySource(source) {
  return String(source || 'unknown').trim().toLowerCase()
}

function isHouseBetHistorySource(source) {
  const s = normalizeBetHistorySource(source)
  return s === 'housebets' || s === 'mybetupdated'
}

/** Normalize currency for bet-history signatures (gold ↔ XGC, sweeps ↔ XSC). */
function betHistoryCurrencyKey(code) {
  const c = String(code || '').toLowerCase()
  if (isGoldCoinCurrency(c)) return canonicalizeGoldCoinCode(c)
  return c
}

/** Attach houseBets.iid onto bet-history rows (Bet ID column). */
function houseShareFieldsFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return {}
  const raw =
    parsed.shareIid != null && String(parsed.shareIid).trim() !== ''
      ? parsed.shareIid
      : parsed.iid != null && String(parsed.iid).trim() !== ''
        ? parsed.iid
        : pickStakeHouseBetShareRawId({
            shareIid: parsed.shareIid ?? parsed.iid ?? null,
            houseTopId: parsed.houseTopId ?? null,
          })
  const formatted = formatHouseBetShareIdForRow(raw)
  if (!formatted) return {}
  const out = { shareIid: formatted, iid: formatted }
  if (parsed.houseTopId != null && String(parsed.houseTopId).trim() !== '') {
    out.houseTopId = String(parsed.houseTopId).trim()
  }
  return out
}

const ORPHAN_HOUSE_SHARE_TTL_MS = 12_000
const ORPHAN_HOUSE_SHARE_MAX = 40

function pruneOrphanHouseShareBuffer(buf, now = Date.now()) {
  while (buf.length && (now - Number(buf[0]?.at || 0)) > ORPHAN_HOUSE_SHARE_TTL_MS) buf.shift()
  while (buf.length > ORPHAN_HOUSE_SHARE_MAX) buf.shift()
}

/** Buffer share ids when houseBets arrives before placeBet (orphan skip — no row). */
function bufferOrphanHouseShare(buf, parsed, currencyCode, now = Date.now()) {
  const fields = houseShareFieldsFromParsed(parsed)
  if (!fields.shareIid) return
  pruneOrphanHouseShareBuffer(buf, now)
  const betAmount = Number(parsed?.betAmount) || 0
  const winAmount = Number(parsed?.stoppedBonus ? 0 : parsed?.winAmount) || 0
  const payoutMultiplier =
    Number(parsed?.payoutMultiplier) > 0
      ? Number(parsed.payoutMultiplier)
      : betAmount > 0
        ? winAmount / betAmount
        : 0
  buf.push({
    at: now,
    betAmount,
    winAmount,
    payoutMultiplier,
    currencyCode: betHistoryCurrencyKey(currencyCode || parsed?.currencyCode || 'usd'),
    ...fields,
  })
}

function claimOrphanHouseShare(buf, { betAmount, winAmount, payoutMultiplier, currencyCode, now = Date.now() }) {
  pruneOrphanHouseShareBuffer(buf, now)
  const wantBet = Number(betAmount) || 0
  const wantMulti = Number(payoutMultiplier)
  const wantFromAmounts =
    Number(betAmount) > 0 && Number(winAmount) >= 0 ? Number(winAmount) / Number(betAmount) : NaN
  const want = Number.isFinite(wantMulti) && wantMulti >= 0 ? wantMulti : wantFromAmounts
  let bestIdx = -1
  let bestScore = -Infinity
  for (let i = 0; i < buf.length; i++) {
    const row = buf[i]
    const age = now - Number(row?.at || 0)
    if (age > ORPHAN_HOUSE_SHARE_TTL_MS) continue
    const rowBet = Number(row?.betAmount) || 0
    if (wantBet > 0 && rowBet > 0) {
      const tol = Math.max(1, Math.max(wantBet, rowBet) * 0.25)
      if (Math.abs(wantBet - rowBet) > tol) continue
    }
    const rowMulti = Number(row?.payoutMultiplier)
    const rowFromAmounts =
      rowBet > 0 && Number(row?.winAmount) >= 0 ? Number(row.winAmount) / rowBet : NaN
    const got = Number.isFinite(rowMulti) && rowMulti >= 0 ? rowMulti : rowFromAmounts
    if (!Number.isFinite(want) || !Number.isFinite(got) || want < 0 || got < 0) continue
    const rel = Math.abs(want - got) / Math.max(want, got, 1e-9)
    if (rel > 0.08 && Math.abs(want - got) > 0.15) continue
    // Oldest matching orphan first (FIFO with placeBet order).
    const score = 1_000_000 * (1 - Math.min(1, rel)) + age
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  if (bestIdx < 0) return {}
  const [claimed] = buf.splice(bestIdx, 1)
  return houseShareFieldsFromParsed(claimed)
}

/** Pick win amount without net+gross double-count (placeBet often gross, house sometimes net). */
function housePayoutMultiplierFromAmounts(bet, win) {
  const b = Number(bet) || 0
  const w = Number(win) || 0
  if (b <= 0 || w < 0) return NaN
  return w / b
}

function resolveReconcileWin(placeWin, houseWin, bet, payoutMultiplier) {
  const p = Number(placeWin) || 0
  const h = Number(houseWin) || 0
  const b = Number(bet) || 0
  const m = Number(payoutMultiplier) || 0
  if (h <= 0 && p <= 0) return 0
  if (h <= 0) return p
  if (p <= 0) return h
  // One side net, other gross (±stake).
  if (b > 0 && Math.abs(h + b - p) <= Math.max(1, b * 0.05)) return p
  if (b > 0 && Math.abs(p + b - h) <= Math.max(1, b * 0.05)) return h
  if (m > 0 && b > 0) {
    const expected = m * b
    return Math.abs(p - expected) <= Math.abs(h - expected) ? p : h
  }
  // House is source of truth when both look like full payouts.
  return h
}

function findPendingRowForHouseReconcile(
  prev,
  { betAmount, parsedWin, payoutMultiplier, signature, now, sessionStartAt }
) {
  // 1) Prefer newest unreconciled stop-on-bonus row (Hacksaw: otherwise FIFO steals settlement → duplicate wins).
  let bonusIdx = -1
  let bonusAt = -Infinity
  for (let i = 0; i < prev.length; i++) {
    const row = prev[i]
    if (sessionStartAt && (row?.addedAt ?? 0) < sessionStartAt) continue
    if (!row?.stoppedBonus) continue
    if (!PENDING_HOUSE_RECONCILE_SOURCES.has(normalizeBetHistorySource(row?.source))) continue
    if (row?.houseBetReconciled) continue
    if ((now - Number(row?.addedAt || 0)) > STOPPED_BONUS_RECONCILE_WINDOW_MS) continue
    const at = Number(row?.addedAt) || 0
    if (at >= bonusAt) {
      bonusAt = at
      bonusIdx = i
    }
  }
  if (bonusIdx >= 0) return bonusIdx

  const houseMultiRaw = Number(payoutMultiplier)
  const houseMulti =
    Number.isFinite(houseMultiRaw) && houseMultiRaw >= 0
      ? houseMultiRaw
      : betAmount > 0 && parsedWin >= 0
        ? parsedWin / betAmount
        : NaN

  // 2) Match open placeBet by multi (+ soft stake). Prevents house wins painting onto older 0×
  //    pending rows while the real win placeBet still shows → brief double win on chart/stats.
  let bestIdx = -1
  let bestScore = -Infinity
  for (let i = 0; i < prev.length; i++) {
    const row = prev[i]
    if (sessionStartAt && (row?.addedAt ?? 0) < sessionStartAt) continue
    if (!PENDING_HOUSE_RECONCILE_SOURCES.has(normalizeBetHistorySource(row?.source))) continue
    if (row?.houseBetReconciled) continue
    if (row?.stoppedBonus) continue
    const age = now - Number(row?.addedAt || 0)
    if (age > FALLBACK_RECONCILE_WINDOW_MS) continue

    const rowBet = Number(row?.betAmount) || 0
    const rowWin = Number(row?.stoppedBonus ? 0 : row?.winAmount) || 0
    if (rowBet <= 0) continue
    if (betAmount > 0) {
      const tol = Math.max(1, Math.max(rowBet, betAmount) * 0.55)
      if (Math.abs(rowBet - betAmount) > tol) continue
    }
    const rowMulti = rowWin / rowBet
    if (!Number.isFinite(rowMulti) || rowMulti < 0) continue

    let multiScore = 0.5
    if (Number.isFinite(houseMulti)) {
      const rel = Math.abs(houseMulti - rowMulti) / Math.max(houseMulti, rowMulti, 1e-9)
      const abs = Math.abs(houseMulti - rowMulti)
      if (rel > 0.08 && abs > 0.15) continue
      multiScore = 1 - Math.min(1, rel)
    }
    // Better multi first; among equals prefer oldest (FIFO for identical 0×).
    const score = multiScore * 1_000_000 + age
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  if (bestIdx >= 0) return bestIdx

  // 3) FIFO fallback when multi unknown / no multi match.
  let fifoIdx = -1
  let fifoAt = Infinity
  for (let i = 0; i < prev.length; i++) {
    const row = prev[i]
    if (sessionStartAt && (row?.addedAt ?? 0) < sessionStartAt) continue
    if (!PENDING_HOUSE_RECONCILE_SOURCES.has(normalizeBetHistorySource(row?.source))) continue
    if (row?.houseBetReconciled) continue
    if (row?.stoppedBonus) continue
    if ((now - Number(row?.addedAt || 0)) > FALLBACK_RECONCILE_WINDOW_MS) continue
    const at = Number(row?.addedAt) || 0
    if (at < fifoAt) {
      fifoAt = at
      fifoIdx = i
    }
  }
  if (fifoIdx >= 0) return fifoIdx

  for (let i = prev.length - 1; i >= 0; i--) {
    const row = prev[i]
    if ((now - Number(row?.addedAt || 0)) > FALLBACK_RECONCILE_WINDOW_MS) break
    if (!PENDING_HOUSE_RECONCILE_SOURCES.has(normalizeBetHistorySource(row?.source))) continue
    if (row?.houseBetReconciled) continue
    const rowCurr = betHistoryCurrencyKey(row?.currencyCode || 'usd')
    const rowSig = `${rowCurr}|${Number(row?.betAmount) || 0}|${Number(row?.winAmount) || 0}|${row?.isBonus ? 1 : 0}`
    if (rowSig === signature) return i
  }
  return -1
}

function formatTargetMultiLabel(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return ''
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '')
}

const SlotControl = forwardRef(function SlotControl({ slot, accessToken, compact = false, onLogUpdate, useSharedCurrency = false, sharedSourceCurrency, sharedTargetCurrency, initialTargetCurrency, initialBetHint, initialMinBetUsd, initialExpanded = false, sharedCryptoOnly = false, challengeTargetMultipliers, layout = 'card', workbenchActive = true, workbenchInstanceId = null, onWorkbenchSessionPublish = null }, ref) {
  const hunterBridgeTargets = useSyncExternalStore(
    subscribeHunterSlotTargets,
    () => getHunterSlotTargetsSnapshot()[slot.slug] ?? EMPTY_TARGET_MULTIS,
    () => EMPTY_TARGET_MULTIS
  )
  const challengeTargetLabels = useMemo(() => {
    const fromProp = Array.isArray(challengeTargetMultipliers) ? challengeTargetMultipliers : []
    const merged = [...new Set([...hunterBridgeTargets, ...fromProp].map(Number).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b)
    return merged.map(formatTargetMultiLabel).filter(Boolean)
  }, [hunterBridgeTargets, challengeTargetMultipliers])

  const effectiveProviderId = String(slot?.slug || '').toLowerCase().startsWith('playnetic-')
    ? 'playnetic'
    : slot.providerId
  const provider = getProvider(effectiveProviderId)
  const [expanded, setExpanded] = useState(initialExpanded)
  const baseBetLevels =
    slot.betLevels ||
    (slot.providerId === 'pragmatic' ? SESSION_DEPENDENT_BET_LEVELS : DEFAULT_BET_LEVELS)
  const betLevelsForInit = baseBetLevels
  const defaultBetIdx = Math.min(4, Math.max(0, betLevelsForInit.length - 1))
  const betForHint = initialBetHint != null && initialBetHint > 0
    ? betLevelsForInit.find((b) => b >= initialBetHint) ?? betLevelsForInit[0]
    : null
  const storedBetResolved = pickClosestBetLevel(betLevelsForInit, getSlotBetAmount(slot.slug))
  const initialBet = betForHint ?? storedBetResolved ?? (betLevelsForInit[defaultBetIdx] ?? 5000)
  const initialCur = (initialTargetCurrency || '').toLowerCase()
  const saved = getSlotCurrency(slot.slug)
  const [sourceCurrency, setSourceCurrency] = useState(
    initialCur || saved?.source || 'usdc'
  )
  const [targetCurrency, setTargetCurrency] = useState(
    initialCur || saved?.target || 'eur'
  )
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const isEuGoldCoins = preferredSite === 'eu'
  // Stake.eu GoldCoins: one wallet currency — source and target must match (GC or SC).
  const effectiveSource = useSharedCurrency
    ? (sharedSourceCurrency || (isEuGoldCoins ? 'sweeps' : 'usdc'))
    : sourceCurrency
  const effectiveTarget = isEuGoldCoins
    ? effectiveSource
    : useSharedCurrency
      ? (sharedTargetCurrency || 'eur')
      : targetCurrency
  const [session, setSession] = useState(null)
  const sessionSlugForLevels =
    session?.slug != null && session.slug !== ''
      ? session.slug
      : session?.slotSlug != null
        ? session.slotSlug
        : null
  const betLevels =
    session?.betLevels?.length > 0 &&
    (sessionSlugForLevels == null ||
      String(sessionSlugForLevels).toLowerCase() === String(slot.slug).toLowerCase())
      ? session.betLevels
      : baseBetLevels
  const [betAmount, setBetAmount] = useState(initialBet)
  const [extraBet, setExtraBet] = useState(false)
  const [loading, setLoading] = useState(false)
  const [spinLoading, setSpinLoading] = useState(false)
  const [error, setError] = useState('')
  const [providerWarning, setProviderWarning] = useState('')
  const [providerRuntimeState, setProviderRuntimeState] = useState(() => getProviderSessionState(slot?.providerId)?.state || 'idle')
  const [lastResult, setLastResult] = useState(null)
  const [betHistory, setBetHistory] = useState([])
  const betHistoryLengthRef = useRef(0)
  const seenBetDedupKeysRef = useRef(new Set())
  const seenBetDedupOrderRef = useRef([])
  /** houseBets-before-placeBet: keep share ids while orphan rows are skipped */
  const orphanHouseShareBufferRef = useRef([])
  const prevSlotSlugRef = useRef(slot.slug)
  const [logRefreshKey, setLogRefreshKey] = useState(0)
  const lastLogRefreshAtRef = useRef(0)
  const triggerLogRefresh = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastLogRefreshAtRef.current < 250) return
    lastLogRefreshAtRef.current = now
    setLogRefreshKey((k) => k + 1)
    onLogUpdate?.()
  }, [onLogUpdate])
  const [autospinCount, setAutospinCount] = useState(10)
  /** Delay between autospins (ms). 0 = as fast as API allows (like Originals / Ante request interval). */
  const [autospinDelayMs, setAutospinDelayMs] = useState(0)
  const [autospinStopOnBonus, setAutospinStopOnBonus] = useState(true)
  const [autospinMinScatter, setAutospinMinScatter] = useState(0) // 0=Jeder Bonus, 3/4/5=nur mind. X Scatter
  const [autospinStopOnMulti, setAutospinStopOnMulti] = useState(false)
  /** Multi-Stopp nur, wenn effektiver Einsatz ~0,10 USD (9–11 USD-Cent); sonst weiterdrehen bis Ziel-Multi bei $0,10 */
  const [autospinStopMultiOnlyAt010Usd, setAutospinStopMultiOnlyAt010Usd] = useState(true)
  const [autospinStopMultiplier, setAutospinStopMultiplier] = useState(10)
  const [autospinStopOnWin, setAutospinStopOnWin] = useState(false)
  const [autospinStopOnLoss, setAutospinStopOnLoss] = useState(false)
  const [autospinStopOnStreak, setAutospinStopOnStreak] = useState(false)
  const [autospinStopStreakCount, setAutospinStopStreakCount] = useState(3)
  const [autospinStopStreakType, setAutospinStopStreakType] = useState('win') // 'win' | 'loss'
  const [sessionRefreshSpins, setSessionRefreshSpins] = useState(0) // 0 = nie, Session nach X Spins neu starten
  // Stake-RGS seed rotate (autospin only; >0 / true = enabled)
  const [seedChangeAfterSpins, setSeedChangeAfterSpins] = useState(0)
  const [seedChangeOnMultiplier, setSeedChangeOnMultiplier] = useState(0)
  const [seedChangeAfterWins, setSeedChangeAfterWins] = useState(0)
  const [seedChangeAfterLosses, setSeedChangeAfterLosses] = useState(0)
  const [seedChangeAfterWinStreak, setSeedChangeAfterWinStreak] = useState(0)
  const [seedChangeAfterLossStreak, setSeedChangeAfterLossStreak] = useState(0)
  const [seedResetOnLoss, setSeedResetOnLoss] = useState(false)
  const [rgsClientSeed, setRgsClientSeed] = useState('') // optional 8 alnum; empty = random
  const [autospinStopOnProfit, setAutospinStopOnProfit] = useState(false)
  const [autospinStopProfitValue, setAutospinStopProfitValue] = useState(0)
  const [autospinStopOnNetLoss, setAutospinStopOnNetLoss] = useState(false)
  const [autospinStopLossValue, setAutospinStopLossValue] = useState(0)
  const [autospinStopOnMinutes, setAutospinStopOnMinutes] = useState(false)
  const [autospinStopMinutes, setAutospinStopMinutes] = useState(0)
  const [sessionStartAt, setSessionStartAt] = useState(null)
  const [slotHasFullSamples, setSlotHasFullSamples] = useState(false)
  const [isAutospinning, setIsAutospinning] = useState(false)
  const [autospinProgress, setAutospinProgress] = useState(null)
  const autospinCancelRef = useRef(false)
  const sessionRef = useRef(null)
  const spinsSinceRefreshRef = useRef(0)
  const lastBalanceRef = useRef(null)
  const slotHasFullSamplesRef = useRef(false)
  const openedBonusPopupsRef = useRef(new Map())
  const statsWorkerRef = useRef(null)
  const statsWorkerReqIdRef = useRef(0)
  const statsAggSessionStartRef = useRef(null)
  sessionRef.current = session
  slotHasFullSamplesRef.current = slotHasFullSamples
  const [supportedCurrencies, setSupportedCurrencies] = useState(ALL_CURRENCIES)

  const BEST_BET_ID_STORAGE_KEY = 'slotbot_hunter_best_betid_by_slug'
  const [bestBetId, setBestBetId] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BEST_BET_ID_STORAGE_KEY)
      const map = raw ? JSON.parse(raw) : {}
      const v = map?.[slot.slug]
      setBestBetId(typeof v === 'string' && v.trim() ? v : null)
    } catch {
      setBestBetId(null)
    }

    const t = setInterval(() => {
      try {
        const raw = localStorage.getItem(BEST_BET_ID_STORAGE_KEY)
        const map = raw ? JSON.parse(raw) : {}
        const v = map?.[slot.slug]
        setBestBetId(typeof v === 'string' && v.trim() ? v : null)
      } catch {
        setBestBetId(null)
      }
    }, 2000)

    return () => clearInterval(t)
  }, [slot.slug])

  // Mount log: hilft sicherzustellen, dass die konkrete SlotControl Instanz im UI wirklich läuft.
  // (Wichtig für deine Frage "keine Subscription-Logs sichtbar".)
  useEffect(() => {
    try {
      console.warn('[SlotControl] mount', {
        slotSlug: slot?.slug,
        providerId: slot?.providerId,
        hasAccessToken: !!accessToken,
        tokenLen: accessToken?.length,
      })
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.slug])

  useEffect(() => {
    function onProviderRuntime(ev) {
      const payload = ev?.detail?.payload || {}
      if (payload?.providerId !== slot?.providerId) return
      const next = getProviderSessionState(slot?.providerId)?.state || 'idle'
      setProviderRuntimeState(next)
    }
    window.addEventListener('sportslots-provider-runtime', onProviderRuntime)
    return () => window.removeEventListener('sportslots-provider-runtime', onProviderRuntime)
  }, [slot?.providerId])

  useEffect(() => {
    if (!accessToken) {
      setSupportedCurrencies(ALL_CURRENCIES)
      return
    }
    let cancelled = false
    fetchSupportedCurrencies(accessToken)
      .then((list) => {
        if (cancelled) return
        const mapped = (list || []).map((c) => ({ value: c, label: c.toUpperCase() }))
        setSupportedCurrencies(mapped.length ? mapped : ALL_CURRENCIES)
      })
      .catch(() => {
        if (cancelled) return
        setSupportedCurrencies(ALL_CURRENCIES)
      })
    return () => { cancelled = true }
  }, [accessToken])
  const [sessionStartBalance, setSessionStartBalance] = useState(null)
  const [wsBalance, setWsBalance] = useState(null)
  const [balanceFromPlaceBet, setBalanceFromPlaceBet] = useState(null)
  const [currencyRates, setCurrencyRates] = useState({})
  useEffect(() => {
    if (!accessToken) return
    fetchCurrencyRates(accessToken).then(setCurrencyRates).catch(() => setCurrencyRates({}))
  }, [accessToken])
  const toUsdMajor = useCallback((amountMinor, curr) => {
    if (amountMinor == null || amountMinor === 0) return Number(amountMinor || 0)
    const conv = convertMinorToUsdMajor(amountMinor, curr, currencyRates)
    // Never coerce null → 0 via Number(null); missing FX must stay null.
    if (conv?.fxStatus !== 'ok' || conv?.usd == null) return null
    const usd = Number(conv.usd)
    return Number.isFinite(usd) ? usd : null
  }, [currencyRates])
  // Stats/BetList: placeBet sofort (Drittanbieter), houseBets reconciled per FIFO
  const sessionBets = useMemo(
    () => (sessionStartAt ? betHistory.filter((b) => (b.addedAt ?? 0) >= sessionStartAt) : betHistory),
    [betHistory, sessionStartAt]
  )
  const sessionBetsDeduped = useMemo(
    () => dedupeBetHistoryForAggregate(sessionBets),
    [sessionBets]
  )
  const betListDisplayRows = useMemo(() => {
    const rows = sessionBetsDeduped.slice(-40)
    return rows.map((b) => {
      const curr = betHistoryCurrencyKey(b.currencyCode || effectiveTarget || 'usd')
      const rawBet = Number(b.betAmount) || 0
      const rawWin = Number(b.winAmount) || 0
      let betUsd = Number(b.betUsdSnapshotMajor)
      let winUsd = Number(b.winUsdSnapshotMajor)
      // Poisoned snapshot: Number(null)===0 was written when FX failed — ignore 0 if raw stake exists.
      if (!Number.isFinite(betUsd) || (betUsd === 0 && rawBet > 0)) {
        betUsd = Number(toUsdMajor(rawBet, curr))
      }
      if (!Number.isFinite(winUsd) || (winUsd === 0 && rawWin > 0)) {
        winUsd = Number(toUsdMajor(rawWin, curr))
      }
      // Rates missing: USD-like + GoldCoins (GC/SC / XSWP) are 1:1 — never flash SOL/etc.
      if (!Number.isFinite(betUsd)) {
        const parity =
          curr === 'usd' || curr === 'usdc' || curr === 'usdt' || isGoldCoinCurrency(curr)
        betUsd = parity ? rawBet / 100 : 0
      }
      if (!Number.isFinite(winUsd)) {
        const parity =
          curr === 'usd' || curr === 'usdc' || curr === 'usdt' || isGoldCoinCurrency(curr)
        winUsd = parity ? rawWin / 100 : 0
      }
      return {
        ...b,
        betAmount: Math.round(betUsd * 100),
        winAmount: Math.round(winUsd * 100),
        currencyCode: 'USD',
      }
    })
  }, [sessionBetsDeduped, toUsdMajor, effectiveTarget])
  const chartCumUsdMajors = useMemo(() => {
    const list = sessionBetsDeduped || []
    if (!list.length) return null
    let cum = 0
    const cumNets = []
    for (const b of list) {
      const curr = betHistoryCurrencyKey(b.currencyCode || effectiveTarget || 'usd')
      const winMinor = (b.isBonus && b.stoppedBonus) ? 0 : (Number(b.winAmount) || 0)
      const betMinor = Number(b.betAmount) || 0
      let betUsd = Number(b.betUsdSnapshotMajor)
      let winUsd = Number(b.winUsdSnapshotMajor)
      // Prefer frozen snapshots so live FX/currency flips don't reshape the whole series.
      if (!Number.isFinite(betUsd) || (betUsd === 0 && betMinor > 0)) {
        betUsd = Number(toUsdMajor(betMinor, curr))
        if (!Number.isFinite(betUsd)) {
          const parity =
            curr === 'usd' || curr === 'usdc' || curr === 'usdt' || isGoldCoinCurrency(curr)
          betUsd = parity ? betMinor / 100 : 0
        }
      }
      if (!Number.isFinite(winUsd) || (winUsd === 0 && winMinor > 0)) {
        winUsd = Number(toUsdMajor(winMinor, curr))
        if (!Number.isFinite(winUsd)) {
          const parity =
            curr === 'usd' || curr === 'usdc' || curr === 'usdt' || isGoldCoinCurrency(curr)
          winUsd = parity ? winMinor / 100 : 0
        }
      }
      cum += winUsd - betUsd
      cumNets.push(Math.round(cum * 100) / 100)
    }
    return cumNets
  }, [sessionBetsDeduped, toUsdMajor, effectiveTarget])
  const chartValuesStable = useMemo(() => {
    if (!chartCumUsdMajors?.length) return null
    return [0, ...chartCumUsdMajors]
  }, [chartCumUsdMajors])
  const chartDataStable = useMemo(
    () => (chartValuesStable ? profitsToChartData(chartValuesStable) : null),
    [chartValuesStable]
  )
  const [statsAgg, setStatsAgg] = useState(() => createEmptyCasinoAggregate())

  useEffect(() => {
    const list = sessionBetsDeduped || []
    const sessionChanged = statsAggSessionStartRef.current !== sessionStartAt
    statsAggSessionStartRef.current = sessionStartAt

    if (sessionChanged && statsWorkerRef.current) {
      try {
        statsWorkerRef.current.terminate()
      } catch {
      }
      statsWorkerRef.current = null
    }

    if (!SLOT_STATS_WORKER_ENABLED || typeof Worker === 'undefined') {
      setStatsAgg(recomputeCasinoAggregate(list, currencyRates))
      return
    }

    if (!statsWorkerRef.current) {
      try {
        const worker = new Worker(new URL('../workers/casinoStatsAggregate.worker.js', import.meta.url), { type: 'module' })
        worker.onmessage = (ev) => {
          const payload = ev?.data || {}
          if ((Number(payload?.reqId) || 0) !== statsWorkerReqIdRef.current) return
          if (payload?.agg) {
            setStatsAgg(payload.agg)
            return
          }
          setStatsAgg(recomputeCasinoAggregate(list, currencyRates))
        }
        worker.onerror = () => {
          setStatsAgg(recomputeCasinoAggregate(list, currencyRates))
        }
        statsWorkerRef.current = worker
      } catch {
        setStatsAgg(recomputeCasinoAggregate(list, currencyRates))
        return
      }
    }

    statsWorkerReqIdRef.current += 1
    const reqId = statsWorkerReqIdRef.current
    try {
      statsWorkerRef.current.postMessage({ reqId, betHistory: list, currencyRates })
    } catch {
      setStatsAgg(recomputeCasinoAggregate(list, currencyRates))
    }
  }, [sessionBetsDeduped, sessionStartAt, currencyRates])

  useEffect(() => {
    return () => {
      if (!statsWorkerRef.current) return
      try {
        statsWorkerRef.current.terminate()
      } catch {
      }
      statsWorkerRef.current = null
    }
  }, [])

  const stats = useMemo(() => {
    return aggregateToStatsSnapshot(statsAgg, {
      balanceFromPlaceBet,
      wsBalance,
      sessionStartBalance,
      effectiveTarget,
      rates: currencyRates,
    })
  }, [statsAgg, balanceFromPlaceBet, wsBalance, sessionStartBalance, effectiveTarget, currencyRates])

  const enrichedStats = useMemo(() => {
    let biggestMultiFromHistory = 0
    for (const b of sessionBetsDeduped || []) {
      const bet = Number(b.betAmount) || 0
      const win = Number(b.winAmount) || 0
      if (bet > 0 && win > 0) {
        const m = win / bet
        if (m > biggestMultiFromHistory) biggestMultiFromHistory = m
      }
    }
    if (biggestMultiFromHistory > (stats.biggestMultiplier || 0)) {
      return { ...stats, biggestMultiplier: biggestMultiFromHistory }
    }
    return stats
  }, [stats, sessionBetsDeduped])

  const buildWorkbenchSessionPayload = useCallback(() => ({
    instanceId: workbenchInstanceId || slot.slug,
    slug: slot.slug,
    name: slot.name,
    sessionStartAt,
    sessionBetsDeduped,
    stats: enrichedStats,
    isRunning: !!isAutospinning,
  }), [workbenchInstanceId, slot.slug, slot.name, sessionStartAt, sessionBetsDeduped, enrichedStats, isAutospinning])

  const onWorkbenchSessionPublishRef = useRef(onWorkbenchSessionPublish)
  onWorkbenchSessionPublishRef.current = onWorkbenchSessionPublish
  useEffect(() => {
    if (layout !== 'workbench' || typeof onWorkbenchSessionPublishRef.current !== 'function') return
    onWorkbenchSessionPublishRef.current(buildWorkbenchSessionPayload())
  }, [layout, buildWorkbenchSessionPayload])

  const availableCurrencies = useUserStore((s) => s.availableCurrencies)
  const walletBalances = useUserStore((s) => s.balances)

  // Account (source): only wallets the user has.
  // Game (target): provider fiat/crypto including USD even with $0 USD wallet (Stake converts).
  const sourceCurrencies = useMemo(() => {
    const owned = availableCurrencies?.length ? availableCurrencies : Object.keys(walletBalances || {})
    if (preferredSite === 'eu') {
      return buildSelectableCurrencyOptions({ site: 'eu', ownedCodes: owned })
    }
    return buildSelectableCurrencyOptions({ site: 'com', ownedCodes: owned })
  }, [preferredSite, availableCurrencies, walletBalances])

  const targetCurrencies = useMemo(() => {
    if (preferredSite === 'eu') return sourceCurrencies
    const providerFiltered = filterCurrenciesByProvider(supportedCurrencies, [slot]) || supportedCurrencies
    return buildSelectableCurrencyOptions({
      site: 'com',
      ownedCodes: null,
      baseList: providerFiltered,
    })
  }, [preferredSite, sourceCurrencies, supportedCurrencies, slot])

  const { crypto: sourceCryptoOpts, fiat: sourceFiatOpts, goldCoins: goldOpts } = useMemo(
    () => groupSelectableCurrencyOptions(sourceCurrencies),
    [sourceCurrencies]
  )
  const { crypto: targetCryptoOpts, fiat: targetFiatOpts } = useMemo(
    () => groupSelectableCurrencyOptions(targetCurrencies),
    [targetCurrencies]
  )

  useEffect(() => {
    const nextSource = pickDefaultCurrency(sourceCurrencies, sourceCurrency, preferredSite)
    if (preferredSite === 'eu') {
      // GoldCoins: wallet = game currency (source === target).
      if (nextSource && (nextSource !== sourceCurrency || nextSource !== targetCurrency)) {
        setSourceCurrency(nextSource)
        setTargetCurrency(nextSource)
        setSlotCurrency(slot.slug, { source: nextSource, target: nextSource })
      }
      return
    }
    const nextTarget = pickDefaultCurrency(targetCurrencies, targetCurrency, preferredSite)
    if (nextSource && nextSource !== sourceCurrency) {
      setSourceCurrency(nextSource)
      setSlotCurrency(slot.slug, { source: nextSource })
    }
    if (nextTarget && nextTarget !== targetCurrency) {
      setTargetCurrency(nextTarget)
      setSlotCurrency(slot.slug, { target: nextTarget })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredSite, sourceCurrencies, targetCurrencies])

  /** Einsatz aus localStorage (pro Slot) auf aktuelle Levels mappen; bei Slot-Wechsel ohne Speicherung Default. */
  useEffect(() => {
    if (initialBetHint != null && initialBetHint > 0) return
    if (initialMinBetUsd != null && initialMinBetUsd > 0) return
    const levels = betLevels
    if (!levels?.length) return
    const slugChanged = prevSlotSlugRef.current !== slot.slug
    prevSlotSlugRef.current = slot.slug

    const stored = getSlotBetAmount(slot.slug)
    if (stored != null && Number.isFinite(stored)) {
      const picked = pickClosestBetLevel(levels, stored)
      if (picked != null) {
        setBetAmount(picked)
        return
      }
    }
    if (slugChanged) {
      const idx = Math.min(4, Math.max(0, levels.length - 1))
      setBetAmount(levels[idx] ?? 5000)
      return
    }
    setBetAmount((prev) => {
      if (levels.includes(prev)) return prev
      return pickClosestBetLevel(levels, prev) ?? levels[Math.min(4, Math.max(0, levels.length - 1))]
    })
  }, [slot.slug, session?.betLevels, betLevels, initialBetHint, initialMinBetUsd])

  useEffect(() => {
    if (betAmount != null && Number.isFinite(betAmount) && betAmount > 0) {
      setSlotBetAmount(slot.slug, betAmount)
    }
  }, [slot.slug, betAmount])

  /** Mindesteinsatz aus Telegram/Challenge (USD) → kleinstes Level ≥ diesem USD-Wert */
  useEffect(() => {
    if (initialBetHint != null && initialBetHint > 0) return
    if (initialMinBetUsd == null || initialMinBetUsd <= 0) return
    const minCents = Math.round(Number(initialMinBetUsd) * 100)
    if (!Number.isFinite(minCents) || minCents <= 0) return
    const levels = session?.betLevels?.length ? session.betLevels : baseBetLevels
    const sorted = [...levels].sort((a, b) => a - b)
      const curr = effectiveTarget
    const pick = sorted.find((lvl) => {
      const usdMajor = toUsdMajor(lvl, curr)
      const uc = usdMajor != null && Number.isFinite(usdMajor) ? Math.round(usdMajor * 100) : null
      return typeof uc === 'number' && Number.isFinite(uc) && uc >= minCents
    })
    if (pick != null) setBetAmount(pick)
  }, [initialBetHint, initialMinBetUsd, slot.slug, session?.betLevels, betLevels, baseBetLevels, effectiveTarget, toUsdMajor])

  useEffect(() => {
    const onClear = () => {
      setBetHistory([])
      seenBetDedupKeysRef.current.clear()
      seenBetDedupOrderRef.current = []
      orphanHouseShareBufferRef.current = []
    }
    window.addEventListener(CASINO_BET_SESSION_CLEAR_EVENT, onClear)
    return () => window.removeEventListener(CASINO_BET_SESSION_CLEAR_EVENT, onClear)
  }, [])

  useEffect(() => {
    setSession(null)
    setError('')
    setBalanceFromPlaceBet(null)
    seenBetDedupKeysRef.current.clear()
    seenBetDedupOrderRef.current = []
    orphanHouseShareBufferRef.current = []
  }, [slot.slug])

  useEffect(() => {
    loadBetHistory(slot.slug, 200)
      .then((list) => {
        const mapped = list.map((b) => ({
          id: b.id,
          slotSlug: b.slotSlug || slot.slug,
          slotName: b.slotName || slot.name,
          betAmount: b.betAmount,
          winAmount: b.winAmount,
          betUsdSnapshotMajor: b.betUsdSnapshotMajor,
          winUsdSnapshotMajor: b.winUsdSnapshotMajor,
          fxRateSnapshot: b.fxRateSnapshot,
          isBonus: b.isBonus,
          stoppedBonus: !!b.stoppedBonus,
          scatterCount: b.scatterCount != null ? Number(b.scatterCount) : undefined,
          balance: b.balance,
          roundId: b.roundId,
          addedAt: b.addedAt,
          source: b.source,
        }))
        const dedupSet = new Set()
        const dedupOrder = []
        for (const row of mapped) {
          const rid = row?.roundId != null ? String(row.roundId) : ''
          if (!rid) continue
          const key = `round:${rid}`
          if (dedupSet.has(key)) continue
          dedupSet.add(key)
          dedupOrder.push(key)
        }
        if (dedupOrder.length > BET_HISTORY_DEDUP_MAX) {
          const keep = dedupOrder.slice(-BET_HISTORY_DEDUP_MAX)
          seenBetDedupKeysRef.current = new Set(keep)
          seenBetDedupOrderRef.current = keep
        } else {
          seenBetDedupKeysRef.current = dedupSet
          seenBetDedupOrderRef.current = dedupOrder
        }
        setBetHistory((prev) => {
          const maxLoaded = mapped.length ? Math.max(...mapped.map((x) => x.addedAt || 0)) : 0
          const newer = prev.filter((p) => (p.addedAt || 0) > maxLoaded)
          return [...mapped, ...newer].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
        })
      })
      .catch(() => {})
  }, [slot.slug])

  useEffect(() => {
    betHistoryLengthRef.current = betHistory.length
  }, [betHistory.length])

  useEffect(() => {
    const hasSession = session?.sessionUuid || session?.sessionID
    if (!provider || !hasSession || isAutospinning) return
    const sendKeepAlive = provider.sendKeepAlive
    if (!sendKeepAlive) return
    const intervalSec = Math.max(60, (session.keepAliveInterval || 300) - 60)
    const id = setInterval(async () => {
      const currentSession = sessionRef.current
      if (!currentSession?.sessionUuid && !currentSession?.sessionID) return
      const { ok, data } = await sendKeepAlive(currentSession)
      if (!ok && (data?.statusCode === 20 || data?.error === 'ERR_IS')) {
        setSession(null)
        setError('Session expired. Please start a new session.')
      }
    }, intervalSec * 1000)
    return () => clearInterval(id)
  }, [provider, session?.sessionUuid, session?.sessionID, session?.keepAliveInterval, isAutospinning])

  const addToBetHistory = useCallback((parsed) => {
    const now = Date.now()
    const roundId = parsed.roundId
    const rid = roundId != null ? String(roundId) : null
    // WS emits camelCase (`houseBets`); all reconcile/orphan paths require lowercase.
    const source = normalizeBetHistorySource(parsed?.source)
    const isHouseSettlement = isHouseBetHistorySource(source)
    // FX must follow the bet's real currency (house/API). Session target is fallback only.
    // Forcing effectiveTarget caused EUR stakes to be valued as SOL/ARS → ~10× USD vs Stake.
    const apiCurr = String(parsed.currencyCode || '').toLowerCase()
    const currencyCode = betHistoryCurrencyKey(apiCurr || effectiveTarget || 'usd')
    const parsedBet = Number(parsed.betAmount) || 0
    const parsedWin = Number(parsed.stoppedBonus ? 0 : (parsed.winAmount ?? 0)) || 0
    const signature = `${currencyCode}|${parsedBet}|${parsedWin}|${parsed.isBonus ? 1 : 0}`
    const incomingShare = houseShareFieldsFromParsed(parsed)

    /** Patch shareIid onto an existing spin row once houseBets.iid arrives. */
    const patchShareOntoRow = (clone, idx, row) => {
      if (!incomingShare.shareIid) return false
      if (houseShareFieldsFromParsed(row).shareIid) return false
      clone[idx] = { ...row, ...incomingShare }
      return true
    }

    setBetHistory((prev) => {
      // Do NOT early-attach share ids — that stamped wrong rows and made the list thrash.
      // Share ids land only via FIFO reconcile, orphan claim, or pending-only last chance.
      let rows = prev
      const last = rows[rows.length - 1]
      // Stake houseBets-IDs sind global eindeutig; Provider-roundIds (z. B. Playnetic `n`) nicht in den Seen-Set.
      if (source === 'placebet') {
        if (
          rid &&
          last &&
          String(last.roundId ?? '') === rid &&
          normalizeBetHistorySource(last.source) === 'placebet' &&
          (now - Number(last.addedAt || 0)) < 150
        ) {
          recordBetHistoryAudit({ slotSlug: slot.slug, event: 'dedup-placebet-roundId', roundId: rid })
          return rows
        }
        // Race: houseBets oft vor placeBet → sonst Leerspin + Ergebnis (Hacksaw/Pragmatic .eu).
        // placeBet merged rückwärts in die jüngste noch nicht reconciled house-Zeile.
        {
          const PLACEBET_HOUSE_LOOSE_MS = 12_000
          let bestIdx = -1
          let bestScore = -Infinity
          for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i]
            const age = now - Number(row?.addedAt || 0)
            if (age > FALLBACK_RECONCILE_WINDOW_MS) break
            if (sessionStartAt && (row?.addedAt ?? 0) < sessionStartAt) continue
            if (!isHouseBetHistorySource(row?.source)) continue
            if (row?.houseBetReconciled) continue
            const rowBet = Number(row?.betAmount) || 0
            let score = 0
            if (parsedBet > 0 && rowBet > 0) {
              const tol = Math.max(1, Math.max(rowBet, parsedBet) * 0.55)
              if (Math.abs(rowBet - parsedBet) <= tol) {
                score = 1_000_000 - age
              } else if (age <= PLACEBET_HOUSE_LOOSE_MS) {
                // Stake.eu: placeBet-Minor vs houseBets-Major/FX kann abweichen — zeitnah trotzdem mergen
                score = 100_000 - age
              } else {
                continue
              }
            } else if (age <= PLACEBET_HOUSE_LOOSE_MS) {
              score = 50_000 - age
            } else {
              continue
            }
            if (score > bestScore) {
              bestScore = score
              bestIdx = i
            }
          }
          if (bestIdx >= 0) {
            const row = rows[bestIdx]
            const clone = rows.slice()
            const houseWin = Number(row?.winAmount ?? 0) || 0
            const placeWin = Number(parsed.stoppedBonus ? 0 : (parsed.winAmount ?? parsedWin)) || 0
            const settledCurr = betHistoryCurrencyKey(
              apiCurr || row?.currencyCode || effectiveTarget || 'usd'
            )
            const rowBet = Number(row?.betAmount) || 0
            // Prefer placeBet when house stake looks 100× too small (legacy integer-as-minor poison).
            let settledBet = rowBet > 0 ? rowBet : parsedBet
            if (
              parsedBet > 0 &&
              rowBet > 0 &&
              isGoldCoinCurrency(settledCurr) &&
              parsedBet >= rowBet * 50 &&
              parsedBet <= rowBet * 150
            ) {
              settledBet = parsedBet
            }
            const mergedWin = resolveReconcileWin(
              placeWin,
              houseWin,
              settledBet,
              parsed?.payoutMultiplier
            )
            const settledWinUsd = convertMinorToUsdMajor(mergedWin, settledCurr, currencyRates)
            const settledBetUsd = convertMinorToUsdMajor(settledBet, settledCurr, currencyRates)
            const settledMulti =
              settledBet > 0 ? mergedWin / settledBet : Number(parsed?.payoutMultiplier) || 0
            const claimed =
              !houseShareFieldsFromParsed(row).shareIid
                ? claimOrphanHouseShare(orphanHouseShareBufferRef.current, {
                    betAmount: settledBet || parsedBet,
                    winAmount: mergedWin,
                    payoutMultiplier: settledMulti,
                    currencyCode: settledCurr,
                    now,
                  })
                : {}
            clone[bestIdx] = {
              ...row,
              // Keep house shareIid from the WS row; placeBet has none.
              ...houseShareFieldsFromParsed(row),
              ...claimed,
              ...(!row.roundId && rid && !/^(house|casino):/i.test(String(rid)) ? { roundId: rid } : {}),
              currencyCode: settledCurr,
              betAmount: settledBet,
              winAmount: mergedWin,
              rawWinAmount: Math.max(
                Number(row?.rawWinAmount ?? 0) || 0,
                Number(parsed.rawWinAmount ?? parsed.winAmount ?? 0) || 0
              ),
              isBonus: !!(row?.isBonus || parsed.isBonus),
              houseBetReconciled: true,
              source: normalizeBetHistorySource(row?.source) || 'housebets',
              id: row?.id,
              addedAt: row?.addedAt,
              ...(settledBetUsd?.fxStatus === 'ok' &&
              settledBetUsd.usd != null &&
              Number.isFinite(Number(settledBetUsd.usd))
                ? { betUsdSnapshotMajor: Number(settledBetUsd.usd) }
                : {}),
              ...(mergedWin > 0 &&
              settledWinUsd?.fxStatus === 'ok' &&
              settledWinUsd.usd != null &&
              Number.isFinite(Number(settledWinUsd.usd))
                ? { winUsdSnapshotMajor: Number(settledWinUsd.usd) }
                : {}),
            }
            if (rid) {
              const roundKey = `round:${rid}`
              seenBetDedupKeysRef.current.add(roundKey)
              seenBetDedupOrderRef.current.push(roundKey)
              while (seenBetDedupOrderRef.current.length > BET_HISTORY_DEDUP_MAX) {
                const old = seenBetDedupOrderRef.current.shift()
                if (old) seenBetDedupKeysRef.current.delete(old)
              }
            }
            if (row.roundId != null) {
              const houseKey = `round:${String(row.roundId)}`
              seenBetDedupKeysRef.current.add(houseKey)
              seenBetDedupOrderRef.current.push(houseKey)
            }
            recordBetHistoryAudit({
              slotSlug: slot.slug,
              event: 'reconcile-placebet-into-housebets',
              roundId: rid ?? row.roundId ?? null,
            })
            return clone
          }
        }
      }
      if (rid && isHouseSettlement) {
        const roundKey = `round:${rid}`
        if (seenBetDedupKeysRef.current.has(roundKey)) {
          // Dedup — attach shareIid only onto the row that already carries this round/share key.
          // Softswiss/BGaming: house rid is `house:…` while placeBet roundId is RGS ResultId —
          // they never match. Also Strict Mode double-invokes this updater and the first run
          // can poison seenBetDedupKeysRef before its clone is discarded → fall through to FIFO.
          if (incomingShare.shareIid) {
            const clone = rows.slice()
            let patched = false
            for (let i = clone.length - 1; i >= 0; i--) {
              const row = clone[i]
              if ((now - Number(row?.addedAt || 0)) > FALLBACK_RECONCILE_WINDOW_MS) break
              if (
                String(row?.roundId ?? '') === rid ||
                houseShareFieldsFromParsed(row).shareIid === incomingShare.shareIid
              ) {
                if (patchShareOntoRow(clone, i, row)) patched = true
                break
              }
            }
            if (patched) {
              recordBetHistoryAudit({ slotSlug: slot.slug, event: 'patch-share-after-dedup-roundId', roundId: rid })
              return clone
            }
            recordBetHistoryAudit({
              slotSlug: slot.slug,
              event: 'dedup-roundId-set-miss-fallthrough',
              roundId: rid,
            })
            // Fall through to FIFO reconcile (do not return bare rows).
          } else {
            recordBetHistoryAudit({ slotSlug: slot.slug, event: 'dedup-roundId-set', roundId: rid })
            return rows
          }
        } else if (last && String(last.roundId ?? '') === rid) {
          if (incomingShare.shareIid && !houseShareFieldsFromParsed(last).shareIid) {
            const clone = rows.slice()
            clone[clone.length - 1] = { ...last, ...incomingShare }
            recordBetHistoryAudit({ slotSlug: slot.slug, event: 'patch-share-on-last-roundId', roundId: rid })
            return clone
          }
          recordBetHistoryAudit({ slotSlug: slot.slug, event: 'dedup-roundId', roundId: rid })
          return rows
        }
      }
      if (isHouseSettlement) {
        const pendingIdx = findPendingRowForHouseReconcile(rows, {
          betAmount: parsedBet,
          parsedWin,
          payoutMultiplier: Number(parsed?.payoutMultiplier) || housePayoutMultiplierFromAmounts(parsedBet, parsedWin),
          signature,
          now,
          sessionStartAt,
        })
        if (pendingIdx >= 0) {
          const clone = rows.slice()
          const prevRoundKey = clone[pendingIdx]?.roundId != null
            ? `round:${String(clone[pendingIdx].roundId)}`
            : null
          const wasStoppedBonus = !!clone[pendingIdx]?.stoppedBonus
          const placeWin = Number(clone[pendingIdx]?.stoppedBonus ? 0 : clone[pendingIdx]?.winAmount) || 0
          const houseWin = Number(parsed.winAmount ?? parsedWin) || 0
          // House/Stake history is source of truth, but avoid net+gross double vs placeBet.
          const placeBetMinor = Math.max(Number(clone[pendingIdx]?.betAmount) || 0, 0)
          let settledBet = parsedBet > 0 ? parsedBet : placeBetMinor
          // Guard: poisoned house major→minor (1 SC read as 1¢) vs placeBet 100¢.
          if (
            placeBetMinor > 0 &&
            parsedBet > 0 &&
            isGoldCoinCurrency(apiCurr || clone[pendingIdx]?.currencyCode || effectiveTarget) &&
            placeBetMinor >= parsedBet * 50 &&
            placeBetMinor <= parsedBet * 150
          ) {
            settledBet = placeBetMinor
          }
          const settledWin = resolveReconcileWin(
            placeWin,
            houseWin,
            settledBet,
            parsed?.payoutMultiplier
          )
          const settledCurr = betHistoryCurrencyKey(
            apiCurr || clone[pendingIdx]?.currencyCode || effectiveTarget || 'usd'
          )
          const settledWinUsd = convertMinorToUsdMajor(settledWin, settledCurr, currencyRates)
          const settledBetUsd = convertMinorToUsdMajor(settledBet, settledCurr, currencyRates)
          clone[pendingIdx] = {
            ...clone[pendingIdx],
            ...incomingShare,
            // Explicit — Softswiss/BGaming share must land on the spin row for BetList.
            shareIid: incomingShare.shareIid || clone[pendingIdx]?.shareIid,
            iid: incomingShare.iid || incomingShare.shareIid || clone[pendingIdx]?.iid,
            source: 'housebets',
            // Keep placeBet RGS roundId; share lives in shareIid (don't overwrite with house:/…).
            roundId: clone[pendingIdx]?.roundId ?? (rid && !/^(house|casino):/i.test(String(rid)) ? rid : undefined),
            currencyCode: settledCurr,
            betAmount: settledBet,
            winAmount: settledWin,
            rawWinAmount: settledWin,
            // Stop-on-bonus: erst jetzt realisieren (nicht raw vom Trigger-Spin / Popup-Close).
            stoppedBonus: false,
            isBonus: wasStoppedBonus ? true : !!clone[pendingIdx]?.isBonus,
            houseBetReconciled: true,
            id: clone[pendingIdx]?.id,
            addedAt: clone[pendingIdx]?.addedAt,
            ...(settledBetUsd?.fxStatus === 'ok' && settledBetUsd.usd != null && Number.isFinite(Number(settledBetUsd.usd))
              ? { betUsdSnapshotMajor: Number(settledBetUsd.usd) }
              : {}),
            ...(settledWinUsd?.fxStatus === 'ok' && settledWinUsd.usd != null && Number.isFinite(Number(settledWinUsd.usd))
              ? { winUsdSnapshotMajor: Number(settledWinUsd.usd) }
              : { winUsdSnapshotMajor: undefined }),
          }
          if (prevRoundKey && prevRoundKey !== `round:${rid}`) {
            seenBetDedupKeysRef.current.delete(prevRoundKey)
          }
          // Only track non-share round ids in the seen set (RGS ResultId / Softswiss bet.id).
          if (rid && !/^(house|casino):/i.test(String(rid))) {
            const roundKey = `round:${rid}`
            seenBetDedupKeysRef.current.add(roundKey)
            seenBetDedupOrderRef.current.push(roundKey)
            while (seenBetDedupOrderRef.current.length > BET_HISTORY_DEDUP_MAX) {
              const old = seenBetDedupOrderRef.current.shift()
              if (old) seenBetDedupKeysRef.current.delete(old)
            }
          }
          try {
            console.warn('[slot-bet-id]', {
              phase: 'fifo-reconcile',
              shareIid: incomingShare.shareIid || null,
              pendingIdx,
            })
          } catch (_) {}
          recordBetHistoryAudit({ slotSlug: slot.slug, event: 'reconcile-placebet-with-housebets', roundId: rid ?? null })
          return clone
        }
        // No open placeBet via FIFO: skip only true echoes (open placeBet or <2.5s duplicate delivery).
        // Do not skip later same-stake losses — those are real consecutive spins.
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i]
          const age = now - Number(row?.addedAt || 0)
          if (age > FALLBACK_RECONCILE_WINDOW_MS) break
          if (sessionStartAt && (row?.addedAt ?? 0) < sessionStartAt) continue
          const rowCurr = betHistoryCurrencyKey(row?.currencyCode || effectiveTarget || 'usd')
          const rowWin = Number(row?.stoppedBonus ? 0 : (row?.winAmount ?? 0)) || 0
          const rowSig = `${rowCurr}|${Number(row?.betAmount) || 0}|${rowWin}|${row?.isBonus ? 1 : 0}`
          if (rowSig !== signature) continue
          const rowSource = normalizeBetHistorySource(row?.source)
          const isOpenPlace = PENDING_HOUSE_RECONCILE_SOURCES.has(rowSource) && !row?.houseBetReconciled
          const isRecentEcho = age <= 2500
          if (!isOpenPlace && !isRecentEcho) continue
          // Only attach share onto an *open* placeBet — never stamp the next house
          // settlement onto a recent reconciled same-stake loss (looks like deletes).
          if (isOpenPlace && incomingShare.shareIid) {
            const clone = rows.slice()
            if (patchShareOntoRow(clone, i, row)) {
              recordBetHistoryAudit({
                slotSlug: slot.slug,
                event: 'patch-share-on-signature-echo',
                roundId: rid ?? null,
                source,
              })
              return clone
            }
          }
          const rowShare = houseShareFieldsFromParsed(row).shareIid
          if (isOpenPlace || (rowShare && rowShare === incomingShare.shareIid)) {
            recordBetHistoryAudit({
              slotSlug: slot.slug,
              event: 'dedup-house-settlement-signature',
              roundId: rid ?? null,
              source,
            })
            if (rid) {
              const roundKey = `round:${rid}`
              seenBetDedupKeysRef.current.add(roundKey)
              seenBetDedupOrderRef.current.push(roundKey)
              while (seenBetDedupOrderRef.current.length > BET_HISTORY_DEDUP_MAX) {
                const old = seenBetDedupOrderRef.current.shift()
                if (old) seenBetDedupKeysRef.current.delete(old)
              }
            }
            return rows
          }
        }
        // Same-spin echo only (net vs gross within ~2.5s). Do NOT collapse later same-stake losses.
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i]
          const age = now - Number(row?.addedAt || 0)
          if (age > FALLBACK_RECONCILE_WINDOW_MS) break
          if (sessionStartAt && (row?.addedAt ?? 0) < sessionStartAt) continue
          if (!row?.houseBetReconciled) continue
          if (age > 2500) continue
          const rowBet = Number(row?.betAmount) || 0
          if (parsedBet > 0 && rowBet > 0) {
            const tol = Math.max(1, rowBet * 0.08)
            if (Math.abs(rowBet - parsedBet) > tol) continue
          }
          // Only dedup the exact same share / round — never absorb the next 0× loss.
          const rowShare = houseShareFieldsFromParsed(row).shareIid
          if (incomingShare.shareIid && rowShare === incomingShare.shareIid) {
            recordBetHistoryAudit({
              slotSlug: slot.slug,
              event: 'dedup-house-after-reconcile',
              roundId: rid ?? null,
              source,
            })
            if (rid) {
              const roundKey = `round:${rid}`
              seenBetDedupKeysRef.current.add(roundKey)
              seenBetDedupOrderRef.current.push(roundKey)
              while (seenBetDedupOrderRef.current.length > BET_HISTORY_DEDUP_MAX) {
                const old = seenBetDedupOrderRef.current.shift()
                if (old) seenBetDedupKeysRef.current.delete(old)
              }
            }
            return rows
          }
          if (rid && String(row?.roundId ?? '') === rid) {
            const clone = rows.slice()
            if (incomingShare.shareIid && patchShareOntoRow(clone, i, row)) {
              recordBetHistoryAudit({
                slotSlug: slot.slug,
                event: 'patch-share-after-reconcile',
                roundId: rid ?? null,
                source,
              })
              return clone
            }
            recordBetHistoryAudit({
              slotSlug: slot.slug,
              event: 'dedup-house-after-reconcile',
              roundId: rid ?? null,
              source,
            })
            return rows
          }
        }
        // Last chance: share-only on the same pending FIFO row (never stamp random 0× rows).
        if (incomingShare.shareIid) {
          const pendingShareIdx = findPendingRowForHouseReconcile(rows, {
            betAmount: parsedBet,
            parsedWin,
            payoutMultiplier: Number(parsed?.payoutMultiplier) || housePayoutMultiplierFromAmounts(parsedBet, parsedWin),
            signature,
            now,
            sessionStartAt,
          })
          if (pendingShareIdx >= 0) {
            const row = rows[pendingShareIdx]
            const clone = rows.slice()
            if (patchShareOntoRow(clone, pendingShareIdx, row)) {
              recordBetHistoryAudit({
                slotSlug: slot.slug,
                event: 'patch-share-last-chance',
                roundId: rid ?? null,
                source,
              })
              try {
                console.warn('[slot-bet-id]', {
                  phase: 'attached-last-chance',
                  idx: pendingShareIdx,
                  shareIid: incomingShare.shareIid,
                })
              } catch (_) {}
              return clone
            }
          }
        }
        // houseBets/myBetUpdated ohne offenes placeBet: nicht als eigene Zeile anlegen.
        // Auf .eu (Pragmatic/Hacksaw) kommt House oft vor placeBet → sonst Doppelspins
        // (Leer + Ergebnis). placeBet ist die Spin-Zeile; Share-ID hier puffern, sonst
        // bleibt nur die RGS-roundId (Copy-Links öffnen nicht im Stake Bet-Modal).
        bufferOrphanHouseShare(orphanHouseShareBufferRef.current, parsed, currencyCode, now)
        recordBetHistoryAudit({
          slotSlug: slot.slug,
          event: 'skip-orphan-housebets',
          roundId: rid ?? null,
          source,
        })
        return rows
      } else if (source === 'placebet') {
        // Only same-spin roundId — never signature. Same-stake 0× losses must always append.
        if (rid) {
          for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i]
            if ((now - Number(row?.addedAt || 0)) > FALLBACK_RECONCILE_WINDOW_MS) break
            if (!isHouseBetHistorySource(row?.source)) continue
            if (String(row?.roundId ?? '') === rid) {
              recordBetHistoryAudit({ slotSlug: slot.slug, event: 'dedup-placebet-vs-house-settlement', roundId: rid })
              return rows
            }
          }
        }
      } else if (source === 'http_fallback') {
        // roundId-only; signature would collapse consecutive same-stake losses.
        if (rid) {
          for (let i = rows.length - 1; i >= 0; i--) {
            const row = rows[i]
            if ((now - Number(row?.addedAt || 0)) > FALLBACK_RECONCILE_WINDOW_MS) break
            if (String(row?.roundId ?? '') === rid) {
              recordBetHistoryAudit({ slotSlug: slot.slug, event: 'dedup-http-fallback-vs-existing', roundId: rid })
              return rows
            }
          }
        }
      }
      // Do not time-window-dedup placeBet: fast autospin same-stake losses are real spins.
      if (
        source !== 'placebet' &&
        !rid &&
        last &&
        (now - (last.addedAt ?? 0)) < 150
      ) {
        const same = (last.betAmount ?? 0) === (parsed.betAmount ?? 0) &&
          (last.winAmount ?? 0) === (parsed.winAmount ?? 0) &&
          !!last.isBonus === !!parsed.isBonus
        if (same) {
          recordBetHistoryAudit({ slotSlug: slot.slug, event: 'dedup-time-window', source })
          return rows
        }
      }
      const stoppedBonus = !!parsed.stoppedBonus
      const realizedWin = stoppedBonus ? 0 : (Number(parsed.winAmount ?? 0) || 0)
      const placeMulti =
        Number(parsed?.payoutMultiplier) > 0
          ? Number(parsed.payoutMultiplier)
          : Number(parsed.betAmount) > 0
            ? realizedWin / Number(parsed.betAmount)
            : 0
      const orphanShare =
        source === 'placebet'
          ? claimOrphanHouseShare(orphanHouseShareBufferRef.current, {
              betAmount: parsed.betAmount,
              winAmount: realizedWin,
              payoutMultiplier: placeMulti,
              currencyCode,
              now,
            })
          : {}
      if (orphanShare.shareIid) {
        try {
          console.warn('[slot-bet-id]', {
            phase: 'claim-orphan',
            shareIid: orphanShare.shareIid,
            placeMulti,
          })
        } catch (_) {}
      }
      const entry = {
        id: now + Math.random(),
        slotSlug: slot.slug,
        slotName: slot.name,
        betAmount: parsed.betAmount,
        // Bei Stop-on-bonus: Win erst nach House-Settlement (User spielt Bonus selbst).
        winAmount: realizedWin,
        rawWinAmount: Number(parsed.rawWinAmount ?? parsed.winAmount ?? 0) || 0,
        isBonus: parsed.isBonus || stoppedBonus,
        stoppedBonus,
        scatterCount: parsed.scatterCount != null ? Number(parsed.scatterCount) : undefined,
        balance: parsed.balance,
        currencyCode,
        roundId: roundId ?? undefined,
        ...houseShareFieldsFromParsed(parsed),
        ...orphanShare,
        addedAt: now,
        source,
      }
      const curr = betHistoryCurrencyKey(entry.currencyCode || effectiveTarget || 'usd')
      const betConv = convertMinorToUsdMajor(entry.betAmount, curr, currencyRates)
      const winConv = convertMinorToUsdMajor(entry.winAmount, curr, currencyRates)
      // Only store snapshots on real FX ok — Number(null)===0 used to poison BetList/stats.
      if (betConv?.fxStatus === 'ok' && betConv.usd != null && Number.isFinite(Number(betConv.usd))) {
        entry.betUsdSnapshotMajor = Number(betConv.usd)
      }
      // Kein Win-USD-Snapshot bei gestopptem Bonus — sonst zählen Stats den Trigger-Win doppelt.
      if (
        !stoppedBonus &&
        winConv?.fxStatus === 'ok' &&
        winConv.usd != null &&
        Number.isFinite(Number(winConv.usd))
      ) {
        entry.winUsdSnapshotMajor = Number(winConv.usd)
      }
      if (betConv?.fxStatus === 'ok' && Number.isFinite(Number(betConv?.fxRate))) {
        entry.fxRateSnapshot = Number(betConv.fxRate)
      }
      appendBet(slot.slug, entry, slot.name).catch(() => {})
      try {
        const betUsd =
          entry.betUsdSnapshotMajor != null
            ? entry.betUsdSnapshotMajor
            : toUsdMajor(entry.betAmount, curr)
        const winUsd =
          entry.winUsdSnapshotMajor != null
            ? entry.winUsdSnapshotMajor
            : toUsdMajor(entry.winAmount, curr)
        const multiplier = entry.betAmount > 0 ? (entry.winAmount || 0) / entry.betAmount : 0
        window.dispatchEvent(new CustomEvent('casino-bet-added', {
          detail: {
            slotSlug: slot.slug,
            slotName: slot.name,
            currencyCode: curr,
            betAmount: entry.betAmount,
            winAmount: entry.winAmount,
            betUsd: Number.isFinite(betUsd) ? betUsd : null,
            winUsd: Number.isFinite(winUsd) ? winUsd : null,
            multiplier: Number.isFinite(multiplier) ? multiplier : 0,
            roundId: entry.roundId ?? null,
            addedAt: entry.addedAt,
          },
        }))
      } catch {
        // ignore event dispatch failures
      }
      recordBetHistoryAudit({
        slotSlug: slot.slug,
        event: 'append',
        roundId: entry.roundId ?? null,
        currencyCode: entry.currencyCode ?? null,
        betAmount: entry.betAmount,
        winAmount: entry.winAmount,
      })
      if (rid && isHouseSettlement) {
        const roundKey = `round:${rid}`
        seenBetDedupKeysRef.current.add(roundKey)
        seenBetDedupOrderRef.current.push(roundKey)
        while (seenBetDedupOrderRef.current.length > BET_HISTORY_DEDUP_MAX) {
          const old = seenBetDedupOrderRef.current.shift()
          if (old) seenBetDedupKeysRef.current.delete(old)
        }
      }
      return [...rows, entry]
    })
  }, [slot.slug, slot.name, effectiveTarget, sessionStartAt, toUsdMajor, currencyRates])

  const isStakeEngine =
    effectiveProviderId === 'stakeEngine' ||
    PROVIDERS_META[effectiveProviderId]?.aliasOf === 'stakeEngine'
  // Stake Engine: Spin-Zeilen aus placeBet; houseBets trotzdem abonnieren für Share-IDs (Bet ID Spalte).
  const fillBetHistoryFromPlaceBet = isStakeEngine
  const subscribeHouseBetsForHistory = true

  /** Drittanbieter: sofort aus placeBet, houseBets reconciled später per FIFO. */
  const appendSpinHistoryFromPlaceBet = useCallback((parsed) => {
    if (isStakeEngine || !parsed?.success) return
    addToBetHistory({ ...parsed, winAmount: parsed.winAmount ?? 0, source: 'placebet' })
  }, [isStakeEngine, addToBetHistory])

  const patchLastSpinBetHistory = useCallback((patch) => {
    setBetHistory((prev) => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      if ((Date.now() - Number(last?.addedAt || 0)) > 5000) return prev
      const clone = prev.slice()
      clone[clone.length - 1] = { ...last, ...patch }
      return clone
    })
  }, [])

  const updateStatsFromResult = useCallback((result, betAmt, useExtraBet = false) => {
    const effectiveBet = getEffectiveBetAmount(betAmt ?? 0, useExtraBet, slot?.slug)
    const parsed = parseBetResponse(result, effectiveBet)
    lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
    if (parsed.balance != null) setBalanceFromPlaceBet(parsed.balance)
    // Stake Engine: Zeilen aus placeBet; Share-ID kommt danach per houseBets.
    if (fillBetHistoryFromPlaceBet && parsed.success) {
      addToBetHistory({ ...parsed, winAmount: parsed.winAmount, source: 'placebet' })
    }
  }, [slot?.slug, slot?.providerId, addToBetHistory, fillBetHistoryFromPlaceBet])

  const handleOpenSlotFromBet = useCallback(async (betEntry) => {
    const slug = String(betEntry?.slotSlug || '').trim()
    if (!slug) return
    if (!window.electronAPI?.openSlotPopup) {
      setError('Open slot popup is not available in this build.')
      return
    }
    try {
      const launchSession = await startThirdPartySession(accessToken, slug, effectiveSource, effectiveTarget)
      const launchUrl =
        typeof launchSession?.config === 'string'
          ? launchSession.config
          : launchSession?.config?.url || ''
      const res = await window.electronAPI.openSlotPopup({
        slug,
        locale: 'en',
        sourceCurrency: effectiveSource,
        targetCurrency: effectiveTarget,
        launchUrl,
      })
      if (!res?.ok) {
        setError(res?.error || 'Could not open slot popup.')
        return
      }
      if (res?.popupId && betEntry?.id != null) {
        openedBonusPopupsRef.current.set(res.popupId, {
          betId: betEntry.id,
        })
      }
    } catch (e) {
      setError(e?.message || 'Could not open slot popup.')
    }
  }, [accessToken, effectiveSource, effectiveTarget])

  useEffect(() => {
    if (!window.electronAPI?.onSlotPopupClosed) return
    const unsub = window.electronAPI.onSlotPopupClosed((payload) => {
      const popupId = payload?.popupId
      if (!popupId) return
      // Stop-on-bonus: Win kommt von houseBets nach Settlement — nicht aus rawWinAmount des Trigger-Spins
      // (sonst doppelter Win: einmal „vor Open“, einmal nach House-Settlement).
      openedBonusPopupsRef.current.delete(popupId)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  useSlotRealtime({
    accessToken,
    effectiveTarget,
    subscribeHouseBetsForHistory,
    slot,
    setWsBalance,
    addToBetHistory,
  })

  async function handleStartSession() {
    if (!provider?.startSession) {
      setError('Provider is not implemented.')
      return
    }
    setLoading(true)
    setError('')
    setProviderWarning('')
    try {
      const t0 = performance.now()
      const s = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget, {
        gameName: slot.name,
      })
      const levels = s.betLevels?.length ? s.betLevels : baseBetLevels
      if (levels.length) {
        const stored = getSlotBetAmount(slot.slug)
        const candidate = stored != null && Number.isFinite(stored) ? stored : betAmount
        const next =
          levels.includes(candidate)
            ? candidate
            : pickClosestBetLevel(levels, candidate) ?? levels[Math.min(4, Math.max(0, levels.length - 1))]
        setBetAmount(next)
      }
      setSession(s)
      setLastResult(null)
      lastBalanceRef.current = s?.initialBalance ?? null
      spinsSinceRefreshRef.current = 0
      setSessionStartBalance(s?.initialBalance ?? null)
      setWsBalance(s?.initialBalance ?? null)
      setBalanceFromPlaceBet(s?.initialBalance ?? null)
      setSessionStartAt(Date.now())
      seenBetDedupKeysRef.current.clear()
      seenBetDedupOrderRef.current = []
      orphanHouseShareBufferRef.current = []
      const hasFull = await hasEnoughSamplesForSlot(slot.slug).catch(() => false)
      setSlotHasFullSamples(hasFull)
      slotHasFullSamplesRef.current = hasFull
      logApiCall({
        type: `${effectiveProviderId}/session`,
        endpoint: 'startSession',
        request: { slug: slot.slug, sourceCurrency: effectiveSource, targetCurrency: effectiveTarget },
        response: s,
        error: null,
        durationMs: Math.round(performance.now() - t0),
      })
      triggerLogRefresh()
      return s
    } catch (err) {
      const msg = err?.userMessage || err?.message || 'Could not start session'
      setError(msg)
      if (err?.retryable) setProviderWarning('Provider is unstable right now (retry mode active).')
      logApiCall({ type: `${effectiveProviderId}/session`, endpoint: 'startSession', request: { slug: slot.slug, sourceCurrency: effectiveSource, targetCurrency: effectiveTarget }, response: null, error: msg, durationMs: null })
      triggerLogRefresh()
      return null
    } finally {
      setLoading(false)
    }
  }

  async function handleSpin() {
    if (!session) {
      setError('Start a session first.')
      return
    }
    if (!provider?.placeBet) {
      setError('Provider placeBet is not available.')
      return
    }
    setSpinLoading(true)
    setError('')
    setProviderWarning('')
    try {
      let currentSession = session
      if (sessionRefreshSpins > 0 && spinsSinceRefreshRef.current >= sessionRefreshSpins) {
        currentSession = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget, {
          gameName: slot.name,
        })
        setSession(currentSession)
        spinsSinceRefreshRef.current = 0
      }
      const result = await provider.placeBet(currentSession, betAmount, extraBet, false, { slotSlug: slot.slug })
      const { data, nextSeq, session: updatedSession } = result
      setLastResult(data)
      spinsSinceRefreshRef.current += 1
      updateStatsFromResult(data, betAmount, extraBet)
      setSession((prev) => (updatedSession ? updatedSession : prev ? { ...prev, seq: nextSeq } : null))
      const effectiveBet = getEffectiveBetAmount(betAmount, extraBet, slot.slug)
      const parsed = parseBetResponse(data, effectiveBet)
      appendSpinHistoryFromPlaceBet(parsed)
      if (isSaveBonusLogsEnabled() && parsed.isBonus) {
        saveBonusLog({
          slotSlug: slot.slug,
          slotName: slot.name,
          betAmount,
          effectiveBet,
          request: { betAmount, extraBet },
          response: data,
          parsed: { isBonus: parsed.isBonus, scatterCount: parsed.scatterCount, bonusFeatureId: parsed.bonusFeatureId },
        })
      }
      saveSlotSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: effectiveProviderId, request: { betAmount, extraBet, slotSlug: slot.slug }, response: data, skipIfFull: true })
      if (parsed.isBonus) saveBonusSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, slotSlug: slot.slug }, response: data })
      triggerLogRefresh()
    } catch (err) {
      const msg = err?.userMessage || err?.message || 'Spin failed'
      setError(msg)
      if (err?.retryable) setProviderWarning('Provider responded slowly; retry was attempted.')
      if (err?.sessionClosed) setSession(null)
      logApiCall({ type: `${slot.providerId}/spin`, endpoint: 'placeBet', request: { betAmount, extraBet }, response: null, error: msg, durationMs: null })
      triggerLogRefresh()
    } finally {
      setSpinLoading(false)
    }
  }

  async function handleAutospin() {
    let currentSession = session
    if (!currentSession) {
      try {
        currentSession = await handleStartSession()
      } catch (e) {
        return
      }
    }
    if (!currentSession) {
      // Error is set in handleStartSession
      return
    }

    if (autospinCount < 0) {
      setError('Spin count cannot be negative.')
      return
    }
    autospinCancelRef.current = false
    setIsAutospinning(true)
    setAutospinProgress(0)
    setError('')
    setProviderWarning('')
    let spinsDone = 0
    let spinsSinceRefresh = 0
    let winStreak = 0
    let lossStreak = 0
    let spinsSinceSeed = 0
    let winsSinceSeed = 0
    let lossesSinceSeed = 0
    /** Set when a seed trigger fired during an open bonus/FS round — rotate on next closed spin. */
    let seedResetPending = false
    // Summen in USD-Cent (wie stats.totalWagered / totalWon) – konsistent mit Autospin Profit/Loss-Schwellen (ganze USD × 100)
    let aggWageredUsd = (stats.totalWagered ?? 0) / 100
    let aggWonUsd = (stats.totalWon ?? 0) / 100
    let lastAutospinData = null
    const seedOptsActive =
      isStakeEngine &&
      hasAnyStakeRgsSeedOption({
        seedChangeAfterSpins,
        seedChangeOnMultiplier,
        seedChangeAfterWins,
        seedChangeAfterLosses,
        seedChangeAfterWinStreak,
        seedChangeAfterLossStreak,
        seedResetOnLoss,
      })
    const resetSeedCounters = () => {
      spinsSinceSeed = 0
      winsSinceSeed = 0
      lossesSinceSeed = 0
      seedResetPending = false
    }
    const recordAutospinStopBet = (payload, { stoppedBonus = false } = {}) => {
      lastBalanceRef.current = payload.balance ?? lastBalanceRef.current
      if (isStakeEngine) {
        addToBetHistory({ ...payload, stoppedBonus: !!stoppedBonus, source: 'placebet' })
      } else if (stoppedBonus) {
        patchLastSpinBetHistory({
          stoppedBonus: true,
          rawWinAmount: payload.winAmount,
          winAmount: 0,
        })
      }
    }

    while ((autospinCount === 0 || spinsDone < autospinCount) && !autospinCancelRef.current) {
      try {
        if (sessionRefreshSpins > 0 && spinsSinceRefresh >= sessionRefreshSpins) {
          let newSession
          try {
            newSession = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget, {
              gameName: slot.name,
            })
          } catch (refreshErr) {
            // No long artificial cooldown here; otherwise autospin feels much slower than manual spin.
            await new Promise((r) => setTimeout(r, 150))
            newSession = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget, {
              gameName: slot.name,
            })
          }
          currentSession = newSession
          setSession(newSession)
          spinsSinceRefresh = 0
        }

        const isNolimit = effectiveProviderId === 'nolimit' || String(slot?.slug || '').toLowerCase().startsWith('nolimit-')
        const placeBetOpts = {
          slotSlug: slot.slug,
          fastPath: true,
          ...(autospinStopOnBonus ? { skipContinueOnBonus: true } : {}),
          ...(isNolimit && autospinStopOnBonus ? { stopOnBonus: true } : {}),
          ...(autospinStopOnBonus && autospinMinScatter >= 1
            ? { skipContinueIfBonusMinScatter: autospinMinScatter }
            : {}),
        }
        const result = await provider.placeBet(currentSession, betAmount, extraBet, false, placeBetOpts)
        const { data, nextSeq, session: updatedSession } = result
        lastAutospinData = data
        currentSession = updatedSession || { ...currentSession, seq: nextSeq }
        sessionRef.current = currentSession
        spinsSinceRefresh += 1
        const effectiveBet = getEffectiveBetAmount(betAmount, extraBet, slot.slug)
        const parsed = parseBetResponse(data, effectiveBet)
        const bonusMeetsScatter = autospinMinScatter <= 0 ||
          (parsed.scatterCount != null && parsed.scatterCount >= autospinMinScatter) ||
          (parsed.scatterCount == null && parsed.isBonus)
        const stopForBonus = !!(autospinStopOnBonus && (parsed.shouldStopOnBonus ?? parsed.isBonus) && bonusMeetsScatter)

        // Atomar mit stoppedBonus anlegen — kein Win vor Bonus-Open, kein späteres Patch-Race.
        appendSpinHistoryFromPlaceBet(
          stopForBonus
            ? {
                ...parsed,
                isBonus: true,
                stoppedBonus: true,
                winAmount: 0,
                rawWinAmount: parsed.winAmount ?? 0,
              }
            : parsed
        )

        if (isSaveBonusLogsEnabled() && parsed.isBonus) {
          saveBonusLog({
            slotSlug: slot.slug,
            slotName: slot.name,
            betAmount,
            effectiveBet,
            request: { betAmount, extraBet },
            response: data,
            parsed: { isBonus: parsed.isBonus, scatterCount: parsed.scatterCount, bonusFeatureId: parsed.bonusFeatureId },
          })
          triggerLogRefresh()
        }
        if (!slotHasFullSamplesRef.current) {
          saveSlotSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, ...placeBetOpts }, response: data, skipIfFull: true })
        }
        if (parsed.isBonus) saveBonusSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, ...placeBetOpts }, response: data })

        let winAmount = stopForBonus ? 0 : parsed.winAmount
        // Kein Balance-Delta-Fallback: Vault-Auszahlungen würden als Win erscheinen

        const betCurr = (parsed.currencyCode || effectiveTarget || 'usd').toLowerCase()
        const betUsdRaw = toUsdMajor(effectiveBet, betCurr)
        const winUsdRaw = toUsdMajor(winAmount, betCurr)
        const hasBetUsd = typeof betUsdRaw === 'number' && Number.isFinite(betUsdRaw)
        const hasWinUsd = typeof winUsdRaw === 'number' && Number.isFinite(winUsdRaw)
        const betUsd = hasBetUsd ? betUsdRaw : 0
        const winUsd = hasWinUsd ? winUsdRaw : 0
        const netAfterUsd = (aggWonUsd + winUsd) - (aggWageredUsd + betUsd)
        const profitThresholdUsd = Math.max(0, autospinStopProfitValue)
        const lossThresholdUsd = Math.max(0, autospinStopLossValue)

        if (stopForBonus) {
          if (isStakeEngine) {
            recordAutospinStopBet({ ...parsed, winAmount: 0, stoppedBonus: true }, { stoppedBonus: true })
          }
          setError(`Autospin stopped: bonus${parsed.scatterCount != null ? ` (${parsed.scatterCount} scatters)` : ''} hit after ${spinsDone + 1} spin(s)`)
          notifyBonusHit(slot.name, spinsDone + 1)
          triggerLogRefresh()
          break
        }

        if (autospinStopOnProfit && netAfterUsd >= profitThresholdUsd) {
          recordAutospinStopBet({ ...parsed, winAmount })
          setError(`Autospin stopped: profit reached after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnNetLoss && netAfterUsd <= -lossThresholdUsd) {
          recordAutospinStopBet({ ...parsed, winAmount })
          setError(`Autospin stopped: loss limit reached after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }

        if (autospinStopOnMulti && winAmount > 0 && effectiveBet > 0) {
          const mult = winAmount / effectiveBet
          const stakeOkForMultiStop =
            !autospinStopMultiOnlyAt010Usd ||
            (hasBetUsd && betUsd >= 0.09 && betUsd <= 0.11)
          if (mult >= autospinStopMultiplier && stakeOkForMultiStop) {
            recordAutospinStopBet({ ...parsed, winAmount })
            const stakeHint = autospinStopMultiOnlyAt010Usd ? ' (~$0.10 stake)' : ''
            setError(
              `Autospin stopped: ${mult.toFixed(1)}x (>=${autospinStopMultiplier}x)${stakeHint} after ${spinsDone + 1} spin(s)`
            )
            triggerLogRefresh()
            break
          }
        }

        const isWin = winAmount > 0
        if (isWin) {
          winStreak += 1
          lossStreak = 0
        } else {
          lossStreak += 1
          winStreak = 0
        }

        if (autospinStopOnWin && isWin) {
          recordAutospinStopBet({ ...parsed, winAmount })
          setError(`Autospin stopped: win after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnLoss && !isWin) {
          recordAutospinStopBet({ ...parsed, winAmount })
          setError(`Autospin stopped: loss after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnMinutes && sessionStartAt && Math.floor((Date.now() - sessionStartAt) / 60000) >= Math.max(1, autospinStopMinutes || 0)) {
          recordAutospinStopBet({ ...parsed, winAmount })
          setError(`Autospin stopped: time limit reached after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnStreak) {
          const n = Math.max(1, autospinStopStreakCount || 1)
          const hit =
            (autospinStopStreakType === 'win' && winStreak >= n) ||
            (autospinStopStreakType === 'loss' && lossStreak >= n)
          if (hit) {
            recordAutospinStopBet({ ...parsed, winAmount })
            setError(`Autospin stopped: ${n}x ${autospinStopStreakType === 'win' ? 'win' : 'loss'} streak after ${spinsDone + 1} spin(s)`)
            triggerLogRefresh()
            break
          }
        }

        updateStatsFromResult(data, betAmount, extraBet)
        spinsDone += 1
        if (hasBetUsd && hasWinUsd) {
          aggWageredUsd += betUsd
          aggWonUsd += winUsd
        }

        if (seedOptsActive && !autospinCancelRef.current) {
          spinsSinceSeed += 1
          if (isWin) winsSinceSeed += 1
          else lossesSinceSeed += 1
          const multi = effectiveBet > 0 && winAmount > 0 ? winAmount / effectiveBet : 0
          const seedTrigger =
            seedResetPending ||
            shouldTriggerStakeRgsSeedReset({
              spinsSinceSeed,
              winsSinceSeed,
              lossesSinceSeed,
              winStreak,
              lossStreak,
              isWin,
              multi,
              seedChangeAfterSpins,
              seedChangeOnMultiplier,
              seedChangeAfterWins,
              seedChangeAfterLosses,
              seedChangeAfterWinStreak,
              seedChangeAfterLossStreak,
              seedResetOnLoss,
            })
          if (seedTrigger) {
            const rawRound = data?._stakeEngine?.raw?.round
            if (shouldDeferStakeRgsSeedReset(rawRound)) {
              // Keep intent (multi / every-loss / streak) until the base round closes.
              seedResetPending = true
              logApiCall({
                type: `${slot.providerId}/seed`,
                endpoint: 'deferSeedReset',
                request: { reason: 'open_bonus_or_fs' },
                response: null,
                error: null,
                durationMs: null,
              })
            } else {
              const rotated = await rotateStakeRgsSeedAndRefreshSession({
                gameId: resolveStakeRgsGameId(slot, currentSession),
                clientSeed: rgsClientSeed,
                slug: slot.slug,
                slotName: slot.name,
                startSession: (token, slug, source, target) =>
                  provider.startSession(token, slug, source, target, { gameName: slot.name }),
                accessToken,
                sourceCurrency: effectiveSource,
                targetCurrency: effectiveTarget,
                log: (msg) => {
                  logApiCall({
                    type: `${slot.providerId}/seed`,
                    endpoint: 'rotateSeed',
                    request: { msg },
                    response: null,
                    error: null,
                    durationMs: null,
                  })
                },
              })
              if (rotated?.ok && rotated.session) {
                currentSession = rotated.session
                sessionRef.current = currentSession
                setSession(rotated.session)
                spinsSinceRefresh = 0
                resetSeedCounters()
              } else if (rotated?.error) {
                setProviderWarning(`Seed reset failed: ${rotated.error}`)
                resetSeedCounters()
              }
              triggerLogRefresh()
            }
          }
        }

        if (spinsDone % 4 === 0 || (autospinCount > 0 && spinsDone === autospinCount)) {
          setSession(currentSession)
          setAutospinProgress(spinsDone)
        }
      } catch (err) {
        const msg = err?.userMessage || err?.message || 'Spin failed'
        setError(`${msg} (nach ${spinsDone} Spins)`)
        if (err?.retryable) setProviderWarning('Autospin used retry mode due to provider latency.')
        if (err?.sessionClosed) setSession(null)
        logApiCall({ type: `${slot.providerId}/autospin`, endpoint: 'placeBet', request: { betAmount }, response: null, error: msg, durationMs: null })
        triggerLogRefresh()
        break
      }

      if ((autospinCount === 0 || spinsDone < autospinCount) && !autospinCancelRef.current) {
        const delayMs = Math.max(0, Math.min(60_000, Number(autospinDelayMs) || 0))
        if (delayMs > 0) {
          const end = Date.now() + delayMs
          while (Date.now() < end && !autospinCancelRef.current) {
            await new Promise((r) => setTimeout(r, Math.min(50, end - Date.now())))
          }
        } else {
          await new Promise((r) => setTimeout(r, 0))
        }
      }
    }

    setSession(currentSession)
    if (lastAutospinData) setLastResult(lastAutospinData)
    setIsAutospinning(false)
    setAutospinProgress(null)
    triggerLogRefresh()
    if (autospinCount > 0 && spinsDone === autospinCount && !autospinCancelRef.current) {
      setError('')
    }
  }

  function handleStopAutospin() {
    autospinCancelRef.current = true
  }

  function handleStopAll() {
    autospinCancelRef.current = true
    setIsAutospinning(false)
    setAutospinProgress(null)
    setSession(null)
    setSessionStartAt(null)
    setSessionStartBalance(null)
    setWsBalance(null)
    setError('')
    setProviderWarning('')
  }

  function getSettings() {
    return {
      sourceCurrency: effectiveSource,
      targetCurrency: effectiveTarget,
      betAmount,
      extraBet,
      autospinCount,
      autospinDelayMs,
      autospinStopOnBonus,
      autospinMinScatter,
      autospinStopOnMulti,
      autospinStopMultiOnlyAt010Usd,
      autospinStopMultiplier,
      autospinStopOnWin,
      autospinStopOnLoss,
      autospinStopOnStreak,
      autospinStopStreakCount,
      autospinStopStreakType,
      sessionRefreshSpins,
      autospinStopOnProfit,
      autospinStopProfitValue,
      autospinStopOnNetLoss,
      autospinStopLossValue,
      autospinStopOnMinutes,
      autospinStopMinutes,
      seedChangeAfterSpins,
      seedChangeOnMultiplier,
      seedChangeAfterWins,
      seedChangeAfterLosses,
      seedChangeAfterWinStreak,
      seedChangeAfterLossStreak,
      seedResetOnLoss,
      rgsClientSeed,
    }
  }

  function applySettings(s) {
    if (!s) return
    if (s.sourceCurrency != null) {
      setSourceCurrency(s.sourceCurrency)
      setSlotCurrency(slot.slug, { source: s.sourceCurrency })
    }
    if (s.targetCurrency != null) {
      setTargetCurrency(s.targetCurrency)
      setSlotCurrency(slot.slug, { target: s.targetCurrency })
    }
    if (s.betAmount != null) {
      const levels = session?.betLevels?.length ? session.betLevels : baseBetLevels
      const clamped = levels.includes(s.betAmount)
        ? s.betAmount
        : levels.reduce((best, l) => (Math.abs(l - s.betAmount) < Math.abs(best - s.betAmount) ? l : best), levels[0])
      setBetAmount(clamped)
    }
    if (s.extraBet != null) setExtraBet(!!s.extraBet)
    if (s.autospinCount != null) setAutospinCount(Math.max(0, s.autospinCount))
    if (s.autospinDelayMs != null) {
      const n = Number(s.autospinDelayMs)
      setAutospinDelayMs(Number.isFinite(n) ? Math.max(0, Math.min(60_000, Math.round(n))) : 0)
    }
    if (s.autospinStopOnBonus != null) setAutospinStopOnBonus(!!s.autospinStopOnBonus)
    if (s.autospinMinScatter != null) setAutospinMinScatter(s.autospinMinScatter)
    if (s.autospinStopOnMulti != null) setAutospinStopOnMulti(!!s.autospinStopOnMulti)
    if (s.autospinStopMultiOnlyAt010Usd != null) setAutospinStopMultiOnlyAt010Usd(!!s.autospinStopMultiOnlyAt010Usd)
    if (s.autospinStopMultiplier != null) setAutospinStopMultiplier(s.autospinStopMultiplier)
    if (s.autospinStopOnWin != null) setAutospinStopOnWin(!!s.autospinStopOnWin)
    if (s.autospinStopOnLoss != null) setAutospinStopOnLoss(!!s.autospinStopOnLoss)
    if (s.autospinStopOnStreak != null) setAutospinStopOnStreak(!!s.autospinStopOnStreak)
    if (s.autospinStopStreakCount != null) setAutospinStopStreakCount(s.autospinStopStreakCount)
    if (s.autospinStopStreakType != null) setAutospinStopStreakType(s.autospinStopStreakType)
    if (s.sessionRefreshSpins != null) setSessionRefreshSpins(s.sessionRefreshSpins)
    if (s.autospinStopOnProfit != null) setAutospinStopOnProfit(!!s.autospinStopOnProfit)
    if (s.autospinStopProfitValue != null) setAutospinStopProfitValue(s.autospinStopProfitValue)
    if (s.autospinStopOnNetLoss != null) setAutospinStopOnNetLoss(!!s.autospinStopOnNetLoss)
    if (s.autospinStopLossValue != null) setAutospinStopLossValue(s.autospinStopLossValue)
    if (s.autospinStopOnMinutes != null) setAutospinStopOnMinutes(!!s.autospinStopOnMinutes)
    if (s.autospinStopMinutes != null) setAutospinStopMinutes(s.autospinStopMinutes)
    if (s.seedChangeAfterSpins != null) setSeedChangeAfterSpins(Math.max(0, Math.floor(Number(s.seedChangeAfterSpins) || 0)))
    if (s.seedChangeOnMultiplier != null) {
      const v = Number(s.seedChangeOnMultiplier)
      setSeedChangeOnMultiplier(Number.isFinite(v) && v > 0 ? v : 0)
    }
    if (s.seedChangeAfterWins != null) setSeedChangeAfterWins(Math.max(0, Math.floor(Number(s.seedChangeAfterWins) || 0)))
    if (s.seedChangeAfterLosses != null) setSeedChangeAfterLosses(Math.max(0, Math.floor(Number(s.seedChangeAfterLosses) || 0)))
    if (s.seedChangeAfterWinStreak != null) setSeedChangeAfterWinStreak(Math.max(0, Math.floor(Number(s.seedChangeAfterWinStreak) || 0)))
    if (s.seedChangeAfterLossStreak != null) setSeedChangeAfterLossStreak(Math.max(0, Math.floor(Number(s.seedChangeAfterLossStreak) || 0)))
    if (s.seedResetOnLoss != null) setSeedResetOnLoss(!!s.seedResetOnLoss)
    if (s.rgsClientSeed != null) {
      setRgsClientSeed(String(s.rgsClientSeed || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8))
    }
  }

  useImperativeHandle(ref, () => ({
    startSession: handleStartSession,
    stopAll: handleStopAll,
    startAutospin: handleAutospin,
    getSettings,
    applySettings,
    getWorkbenchSession: buildWorkbenchSessionPayload,
  }), [accessToken, slot.slug, effectiveSource, effectiveTarget, provider, betLevels, baseBetLevels, session?.betLevels, sourceCurrency, targetCurrency, betAmount, extraBet, autospinCount, autospinDelayMs, autospinStopOnBonus, autospinMinScatter, autospinStopOnMulti, autospinStopMultiOnlyAt010Usd, autospinStopMultiplier, autospinStopOnWin, autospinStopOnLoss, autospinStopOnStreak, autospinStopStreakCount, autospinStopStreakType, sessionRefreshSpins, seedChangeAfterSpins, seedChangeOnMultiplier, seedChangeAfterWins, seedChangeAfterLosses, seedChangeAfterWinStreak, seedChangeAfterLossStreak, seedResetOnLoss, rgsClientSeed, buildWorkbenchSessionPayload])

  if (!provider) {
    return (
      <div style={STYLES.error}>
        Provider "{slot.providerId}" is not yet available as a web provider.
        For backend providers: start the SSP server (see README).
      </div>
    )
  }

  const isWorkbench = layout === 'workbench'
  const wbCompact = isWorkbench ? false : compact
  const settingsCollapsed = wbCompact && isAutospinning
  const providerId = slot.providerId
  const providerMeta = PROVIDERS_META[providerId] || {}
  const providerBasic = PROVIDERS_BASIC[providerId] || {}

  const titleBlock = !settingsCollapsed && (
      <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: wbCompact ? '0.25rem' : '0.4rem' }}>
        <span style={{ fontWeight: 700, fontSize: wbCompact ? '0.88rem' : '1.02rem', lineHeight: 1.2, color: 'var(--text)' }}>{slot.name}</span>
        {challengeTargetLabels.length > 0 && (
          <span
            title="Challenge target multiplier (Auto Hunter / selection)"
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              padding: '0.15rem 0.55rem',
              background: 'rgba(0, 231, 170, 0.12)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              color: 'var(--accent)',
            }}
          >
            Target: {challengeTargetLabels.join(' · ')}x
          </span>
        )}
        {bestBetId && (
          <button
            type="button"
            onClick={() => {
              try {
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(bestBetId).catch(() => {})
                  setError('')
                } else {
                  setError('Clipboard not available')
                }
              } catch {
                setError('Clipboard error')
              }
            }}
            style={{ ...STYLES.btnSecondary, padding: '0.2rem 0.45rem', fontSize: '0.68rem', marginLeft: '0.25rem' }}
            title="Copy best bet ID (from ChallengeHunter best multi)"
          >
            Copy Best ID
          </button>
        )}
      </div>
      </>
  )

  const currencyStakeBlock = !settingsCollapsed && (
      <>
      <div style={{ ...STYLES.section, display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
        {!useSharedCurrency && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {isEuGoldCoins ? (
              <select
                value={sourceCurrencies.some((c) => c.value === sourceCurrency) ? sourceCurrency : (sourceCurrencies[0]?.value || 'sweeps')}
                onChange={(e) => {
                  const v = e.target.value
                  setSourceCurrency(v)
                  setTargetCurrency(v)
                  setSlotCurrency(slot.slug, { source: v, target: v })
                }}
                style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
                title="Currency (GC / SC)"
              >
                {goldOpts.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            ) : (
              <>
                <select
                  value={sourceCurrencies.some((c) => c.value === sourceCurrency) ? sourceCurrency : (sourceCurrencies[0]?.value || 'usdc')}
                  onChange={(e) => { const v = e.target.value; setSourceCurrency(v); setSlotCurrency(slot.slug, { source: v }) }}
                  style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
                  title="Account currency"
                >
                  {sourceCryptoOpts.length > 0 && <optgroup label="Crypto">{sourceCryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
                  {sourceFiatOpts.length > 0 && <optgroup label="Fiat">{sourceFiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
                </select>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>
                <select
                  value={targetCurrencies.some((c) => c.value === targetCurrency) ? targetCurrency : (targetCurrencies[0]?.value || 'eur')}
                  onChange={(e) => { const v = e.target.value; setTargetCurrency(v); setSlotCurrency(slot.slug, { target: v }) }}
                  style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
                  title="Game currency"
                >
                  {targetCryptoOpts.length > 0 && <optgroup label="Crypto">{targetCryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
                  {targetFiatOpts.length > 0 && <optgroup label="Fiat">{targetFiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
                </select>
              </>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <select value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} style={{ ...STYLES.select, minWidth: 110, flex: 'none' }} title="Stake">
            {betLevels.map((v) => <option key={v} value={v}>{formatBetLabel(v, effectiveTarget, (providerMeta?.betDisplayDivisor && (!Array.isArray(providerMeta?.betDisplayDivisorSlots) || providerMeta.betDisplayDivisorSlots.includes(slot?.slug))) ? { displayDivisor: providerMeta.betDisplayDivisor } : undefined)}</option>)}
          </select>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }}>
            <input type="checkbox" id={`extraBet-${slot.slug}`} checked={extraBet} onChange={(e) => setExtraBet(e.target.checked)} style={STYLES.checkbox} />
            <span>Extra</span>
          </label>
        </div>
      </div>

      <details style={{ ...STYLES.section, fontSize: '0.75rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Stake Engine / Debug</summary>
        <div style={{ marginTop: '0.35rem', padding: '0.4rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', fontSize: '0.72rem' }}>
          {providerMeta.name || providerId} · ID: {providerId} · Impl: {providerBasic.impl || 'n/a'}
          {providerMeta.betLevelsSource && ` · BetLevels: ${providerMeta.betLevelsSource}`}
          {providerMeta.amountScale && ` · Scale: ${providerMeta.amountScale}`}
          {Array.isArray(providerMeta.zeroDecimalCurrencies) && providerMeta.zeroDecimalCurrencies.length > 0 && ` · ZeroDec: ${providerMeta.zeroDecimalCurrencies.join(', ')}`}
        </div>
      </details>

      <div style={{ ...STYLES.section, marginTop: wbCompact ? '0.2rem' : '0.75rem', marginBottom: wbCompact ? '0.3rem' : '1rem' }}>
        <div style={{ ...STYLES.row, flexWrap: 'wrap', gap: '0.4rem' }}>
          <input
            type="number"
            min={0}
            value={autospinCount}
            onChange={(e) => setAutospinCount(Math.max(0, parseInt(e.target.value) || 0))}
            style={{ ...STYLES.select, width: 64, flex: 'none' }}
            placeholder="0=∞"
            title="0 = infinite"
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>Spins {autospinCount === 0 ? '(∞)' : ''}</span>
          <label
            style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem', gap: '0.25rem' }}
            title="0 = maximum speed (API-limited), like Originals request interval"
          >
            Delay
            <input
              type="number"
              min={0}
              max={60000}
              step={10}
              value={autospinDelayMs}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                setAutospinDelayMs(Number.isFinite(n) ? Math.max(0, Math.min(60_000, n)) : 0)
              }}
              style={{ ...STYLES.select, width: 64, marginLeft: '0.15rem' }}
              disabled={isAutospinning}
            />
            <span style={{ color: 'var(--text-muted)' }}>ms</span>
          </label>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={autospinStopOnBonus} onChange={(e) => setAutospinStopOnBonus(e.target.checked)} style={STYLES.checkbox} />
            On bonus
          </label>
        </div>
        <details style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Advanced stop options ▾</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }} title="Only stop on bonus with at least this many scatters">
            Scatter
            <select value={autospinMinScatter} onChange={(e) => setAutospinMinScatter(Number(e.target.value))} style={{ ...STYLES.select, width: 72, marginLeft: '0.2rem' }} disabled={!autospinStopOnBonus}>
              <option value={0}>Any</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }} title="Stop only when target multiplier is reached at around 0.10 USD stake (not at higher stakes)">
            <input type="checkbox" checked={autospinStopOnMulti} onChange={(e) => setAutospinStopOnMulti(e.target.checked)} style={STYLES.checkbox} />
            Multi
            <input
              type="number"
              min={2}
              value={autospinStopMultiplier}
              onChange={(e) => { const raw = e.target.value; if (raw === '') setAutospinStopMultiplier(2); else { const v = parseInt(raw, 10); if (!Number.isNaN(v)) setAutospinStopMultiplier(v); } }}
              onBlur={() => setAutospinStopMultiplier((p) => Math.max(2, p))}
              style={{ ...STYLES.select, width: 48, marginLeft: '0.2rem' }}
              disabled={!autospinStopOnMulti}
            />
            ×
          </label>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.75rem', opacity: autospinStopOnMulti ? 1 : 0.45 }} title="Only stop when effective stake is around 0.10 USD (9-11 USD cents after conversion)">
            <input
              type="checkbox"
              checked={autospinStopMultiOnlyAt010Usd}
              onChange={(e) => setAutospinStopMultiOnlyAt010Usd(e.target.checked)}
              style={STYLES.checkbox}
              disabled={!autospinStopOnMulti}
            />
            only ~$0.10
          </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnWin} onChange={(e) => setAutospinStopOnWin(e.target.checked)} style={STYLES.checkbox} />
              Stop Win
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnLoss} onChange={(e) => setAutospinStopOnLoss(e.target.checked)} style={STYLES.checkbox} />
              Stop Loss
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnStreak} onChange={(e) => setAutospinStopOnStreak(e.target.checked)} style={STYLES.checkbox} />
              Streak <select value={autospinStopStreakType} onChange={(e) => setAutospinStopStreakType(e.target.value)} style={{ ...STYLES.select, width: 60, marginLeft: '0.2rem' }} disabled={!autospinStopOnStreak}><option value="win">Win</option><option value="loss">Loss</option></select>
              <input type="number" min={1} value={autospinStopStreakCount} onChange={(e) => setAutospinStopStreakCount(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...STYLES.select, width: 40, marginLeft: '0.2rem' }} disabled={!autospinStopOnStreak} />
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              Refresh <input type="number" min={0} value={sessionRefreshSpins || ''} onChange={(e) => setSessionRefreshSpins(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0" style={{ ...STYLES.select, width: 48 }} /> Spins
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnProfit} onChange={(e) => setAutospinStopOnProfit(e.target.checked)} style={STYLES.checkbox} />
              Profit ≥ <input type="number" min={0} value={autospinStopProfitValue || 0} onChange={(e) => setAutospinStopProfitValue(Math.max(0, parseInt(e.target.value) || 0))} style={{ ...STYLES.select, width: 70 }} disabled={!autospinStopOnProfit} /> USD
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnNetLoss} onChange={(e) => setAutospinStopOnNetLoss(e.target.checked)} style={STYLES.checkbox} />
              Loss ≥ <input type="number" min={0} value={autospinStopLossValue || 0} onChange={(e) => setAutospinStopLossValue(Math.max(0, parseInt(e.target.value) || 0))} style={{ ...STYLES.select, width: 70 }} disabled={!autospinStopOnNetLoss} /> USD
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnMinutes} onChange={(e) => setAutospinStopOnMinutes(e.target.checked)} style={STYLES.checkbox} />
              Stop nach <input type="number" min={1} value={autospinStopMinutes || 0} onChange={(e) => setAutospinStopMinutes(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...STYLES.select, width: 56, marginLeft: '0.2rem' }} disabled={!autospinStopOnMinutes} /> Min
            </label>
          </div>
        </details>
        {isStakeEngine && (
          <details style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Seeds (Stake RGS) ▾</summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="0 = off">
                After spins
                <input
                  type="number"
                  min={0}
                  value={seedChangeAfterSpins || ''}
                  onChange={(e) => setSeedChangeAfterSpins(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  style={{ ...STYLES.select, width: 56, marginLeft: '0.2rem' }}
                />
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="0 = off">
                Multi ≥
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={seedChangeOnMultiplier || ''}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setSeedChangeOnMultiplier(Number.isFinite(v) && v > 0 ? v : 0)
                  }}
                  placeholder="0"
                  style={{ ...STYLES.select, width: 56, marginLeft: '0.2rem' }}
                />
                ×
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="0 = off">
                After wins
                <input
                  type="number"
                  min={0}
                  value={seedChangeAfterWins || ''}
                  onChange={(e) => setSeedChangeAfterWins(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  style={{ ...STYLES.select, width: 48, marginLeft: '0.2rem' }}
                />
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="0 = off">
                After losses
                <input
                  type="number"
                  min={0}
                  value={seedChangeAfterLosses || ''}
                  onChange={(e) => setSeedChangeAfterLosses(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  style={{ ...STYLES.select, width: 48, marginLeft: '0.2rem' }}
                />
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="0 = off">
                Win streak
                <input
                  type="number"
                  min={0}
                  value={seedChangeAfterWinStreak || ''}
                  onChange={(e) => setSeedChangeAfterWinStreak(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  style={{ ...STYLES.select, width: 48, marginLeft: '0.2rem' }}
                />
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="0 = off">
                Loss streak
                <input
                  type="number"
                  min={0}
                  value={seedChangeAfterLossStreak || ''}
                  onChange={(e) => setSeedChangeAfterLossStreak(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="0"
                  style={{ ...STYLES.select, width: 48, marginLeft: '0.2rem' }}
                />
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={seedResetOnLoss}
                  onChange={(e) => setSeedResetOnLoss(e.target.checked)}
                  style={STYLES.checkbox}
                />
                Reset on loss
              </label>
              <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }} title="Optional 8 alphanumeric; empty = random">
                Client seed
                <input
                  type="text"
                  value={rgsClientSeed}
                  maxLength={8}
                  placeholder="random"
                  onChange={(e) => {
                    const next = String(e.target.value || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)
                    setRgsClientSeed(next)
                  }}
                  style={{ ...STYLES.select, width: 88, marginLeft: '0.2rem', fontFamily: 'monospace' }}
                />
              </label>
            </div>
          </details>
        )}
      </div>
      </>
  )

  const runButtonsBlock = !settingsCollapsed && (
      <div style={{ ...STYLES.row, marginTop: isWorkbench ? 0 : '0.5rem', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleStartSession}
          disabled={loading}
          style={wbCompact ? { ...STYLES.btn, padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : STYLES.btn}
        >
          {loading ? 'Starting...' : 'Start session'}
        </button>
        <button
          onClick={handleSpin}
          disabled={!session || spinLoading || isAutospinning}
          style={wbCompact ? { ...STYLES.btn, padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : STYLES.btn}
        >
          {spinLoading ? 'Spin…' : 'Spin'}
        </button>
        <button
          onClick={isAutospinning ? handleStopAutospin : handleAutospin}
          disabled={!session || loading}
          style={{
            ...(wbCompact ? { padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : {}),
            ...STYLES.btn,
            ...(isAutospinning
              ? { background: 'var(--error)', color: '#fff' }
              : {}),
          }}
        >
          {isAutospinning ? 'Stop' : `Autospin (${autospinCount})`}
        </button>
        <button
          onClick={() => {
            const rows = [['Game','Bet','Win','Profit','RoundID','Currency']]
            for (const b of betHistory) {
              const bet = Number(b.betAmount || 0)
              const win = Number(b.winAmount || 0)
              const profit = win - bet
              rows.push([slot.name, String(bet), String(win), String(profit), String(b.roundId || ''), String((b.currencyCode || effectiveTarget || '').toUpperCase())])
            }
            const csv = rows.map(r => r.map(v => String(v).replace(/"/g,'""')).map(v => `"${v}"`).join(',')).join('\n')
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${slot.slug}-session.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }}
          disabled={betHistory.length === 0}
          style={wbCompact ? { ...STYLES.btnSecondary, padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : STYLES.btnSecondary}
        >
          Export CSV
        </button>
      </div>
  )

  const collapsedRunBar = settingsCollapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {formatBetLabel(getEffectiveBetAmount(betAmount, extraBet, slot.slug), effectiveTarget, (providerMeta?.betDisplayDivisor && (!Array.isArray(providerMeta?.betDisplayDivisorSlots) || providerMeta.betDisplayDivisorSlots.includes(slot?.slug))) ? { displayDivisor: providerMeta.betDisplayDivisor } : undefined)}
          </span>
          <button
            onClick={handleStopAutospin}
            style={{
              ...STYLES.btn,
              padding: '0.16rem 0.35rem',
              fontSize: '0.58rem',
              background: 'var(--error)',
              color: '#fff',
            }}
          >
            {autospinProgress != null ? `Stop (${autospinProgress}/${autospinCount})` : 'Stop'}
          </button>
        </div>
  )

  const sessionStatusBlock = (
    <>
      {session && !settingsCollapsed && (
        <p style={{ marginTop: isWorkbench ? 0 : '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Session aktiv{session.seq != null ? ` (seq: ${session.seq})` : session.index != null ? ` (idx: ${session.index})` : ''}
          {isAutospinning && autospinProgress != null && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--accent)' }}>
              • Autospin: {autospinProgress}/{autospinCount}
            </span>
          )}
          {sessionStartAt && (
            <span style={{ marginLeft: '0.5rem' }}>
              • Zeit: {Math.floor((Date.now() - sessionStartAt) / 60000)} min
            </span>
          )}
        </p>
      )}
      {error && <div style={STYLES.error}>{error}</div>}
      {providerWarning && <div style={STYLES.warning}>{providerWarning}</div>}
    </>
  )

  const statsBlock = (
    <>
      {!session && betHistory.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Start a session, then spin or autospin - statistics and spins appear here.
        </p>
      )}
      <StatsDisplay
        stats={enrichedStats}
        currencyCode="usd"
        compact={wbCompact}
        minimal={settingsCollapsed}
      />
      {chartDataStable && chartDataStable.length >= 2 && (() => {
        const lastMajor = chartCumUsdMajors[chartCumUsdMajors.length - 1]
        const lastNetCents = Math.round(lastMajor * 100)
        const chartHeight = isWorkbench ? 100 : (wbCompact ? 38 : 80)
        const innerChartH = Math.max(28, chartHeight - (wbCompact ? 22 : 36))
        return (
          <div style={{ marginTop: wbCompact ? '0.2rem' : '0.5rem', padding: wbCompact ? '0.25rem 0.35rem' : '0.75rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, minHeight: chartHeight, color: 'var(--text)' }}>
            <div style={{ fontSize: wbCompact ? '0.58rem' : '0.85rem', fontWeight: 600, marginBottom: '0.2rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>Session Netto (USD) · {slot.name}</span>
              <span className="tabular-nums" style={{ fontWeight: 500 }}>
                {lastMajor >= 0 ? '+' : ''}{formatAmount(lastNetCents, 'usd')} · {chartCumUsdMajors.length} spins
              </span>
            </div>
            <div style={{ width: '100%', height: innerChartH }}>
              <OriginalsProfitChart
                chartData={chartDataStable}
                height={innerChartH}
                domainResetKey={sessionStartAt ?? 'default'}
                compact
              />
            </div>
          </div>
        )
      })()}
    </>
  )

  const betListBlock = (
      <BetList
        bets={betListDisplayRows}
        totalCount={sessionBetsDeduped.length}
        currencyCode="usd"
        compact={wbCompact}
        minimal={settingsCollapsed}
        showBetId
        onOpenSlot={handleOpenSlotFromBet}
      />
  )

  const logsBlock = !wbCompact && (
      <details style={{ marginTop: '0.5rem' }}>
        <summary style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          API logs (coding / debug)
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <LogViewer refreshKey={logRefreshKey} />
          {lastResult && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Last spin (raw JSON)
              </summary>
              <pre style={{ ...STYLES.result, marginTop: '0.5rem', maxHeight: 150 }}>
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </details>
  )

  if (isWorkbench) {
    return (
      <div className="slot-wb-instance" hidden={!workbenchActive} aria-hidden={!workbenchActive}>
        <div className="slot-wb-body slot-wb-body--controls">
          <aside className="slot-wb-left">
            <div className="slot-wb-col-title">Settings</div>
            {settingsCollapsed && challengeTargetLabels.length > 0 && (
              <div style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--accent)', lineHeight: 1.2 }}>
                {slot.name} · Target {challengeTargetLabels.join(' · ')}x
              </div>
            )}
            {titleBlock}
            {currencyStakeBlock}
            {collapsedRunBar}
          </aside>
          <main className="slot-wb-main">
            <div className="slot-wb-col-title">Run & bets</div>
            <div className="slot-wb-run-card">
              {runButtonsBlock}
              {sessionStatusBlock}
            </div>
            {betListBlock}
            {logsBlock}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: wbCompact ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: settingsCollapsed ? '0.17rem' : (wbCompact ? '0.28rem' : '1.5rem'),
      alignItems: 'start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: settingsCollapsed ? '0.12rem' : (wbCompact ? '0.28rem' : '1rem'), minWidth: 0, color: 'var(--text)' }}>
      {settingsCollapsed && challengeTargetLabels.length > 0 && (
        <div
          style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--accent)', lineHeight: 1.2 }}
          title="Challenge target multiplier (Auto Hunter / selection)"
        >
          {slot.name} · Target {challengeTargetLabels.join(' · ')}x
        </div>
      )}
      {titleBlock}
      {currencyStakeBlock}
      {runButtonsBlock}
      {collapsedRunBar}
      {sessionStatusBlock}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: settingsCollapsed ? '0.17rem' : (wbCompact ? '0.35rem' : '0.5rem'), minWidth: 0, color: 'var(--text)' }}>
      {statsBlock}
      {betListBlock}
      {logsBlock}
      </div>
    </div>
  )
})

export default SlotControl
