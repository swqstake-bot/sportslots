import { useState, useCallback, useRef, useEffect, useMemo, forwardRef, useImperativeHandle, useSyncExternalStore } from 'react'
import { getProvider } from '../api/providers'
import { PROVIDERS as PROVIDERS_BASIC } from '../constants/slots'
import { PROVIDERS as PROVIDERS_META } from '../constants/providers'
import { ALL_CURRENCIES, filterCurrenciesByProvider } from '../constants/currencies'
import { fetchSupportedCurrencies } from '../api/stakeChallenges'
import { isFiat, isStable } from '../utils/formatAmount'
import { getEffectiveBetAmount } from '../constants/bet'
import { parseBetResponse } from '../utils/parseBetResponse'
import { formatBetLabel, formatAmount, toUnits, toMinor } from '../utils/formatAmount'
import StatsDisplay from './StatsDisplay'
import BetList from './BetList'
import LogViewer from './LogViewer'
import { logApiCall, saveBonusLog, isSaveBonusLogsEnabled } from '../utils/apiLogger'
import { saveSlotSpinSample, saveBonusSpinSample, hasEnoughSamplesForSlot } from '../utils/slotSpinSamples'
import { notifyBonusHit } from '../utils/notifications'
import { loadBetHistory, appendBet } from '../utils/betHistoryDb'
import { getSlotCurrency, setSlotCurrency } from '../utils/slotCurrencyConfig'
import { subscribeHunterSlotTargets, getHunterSlotTargetsSnapshot } from '../utils/hunterSlotTargetsBridge'
import { fetchCurrencyRates } from '../api/stakeChallenges'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useSlotRealtime } from './hooks/useSlotRealtime'

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

function formatTargetMultiLabel(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return ''
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/\.?0+$/, '')
}

const SlotControl = forwardRef(function SlotControl({ slot, accessToken, compact = false, onLogUpdate, useSharedCurrency = false, sharedSourceCurrency, sharedTargetCurrency, initialTargetCurrency, initialBetHint, initialMinBetUsd, initialExpanded = false, sharedCryptoOnly = false, challengeTargetMultipliers }, ref) {
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

  const provider = getProvider(slot.providerId)
  const [expanded, setExpanded] = useState(initialExpanded)
  const baseBetLevels =
    slot.betLevels ||
    (slot.providerId === 'pragmatic' ? SESSION_DEPENDENT_BET_LEVELS : DEFAULT_BET_LEVELS)
  const betLevelsForInit = baseBetLevels
  const defaultBetIdx = Math.min(4, Math.max(0, betLevelsForInit.length - 1))
  const betForHint = initialBetHint != null && initialBetHint > 0
    ? betLevelsForInit.find((b) => b >= initialBetHint) ?? betLevelsForInit[0]
    : null
  const initialBet = betForHint ?? (betLevelsForInit[defaultBetIdx] ?? 5000)
  const initialCur = (initialTargetCurrency || '').toLowerCase()
  const saved = getSlotCurrency(slot.slug)
  const [sourceCurrency, setSourceCurrency] = useState(
    initialCur || saved?.source || 'usdc'
  )
  const [targetCurrency, setTargetCurrency] = useState(
    initialCur || saved?.target || 'eur'
  )
  const effectiveSource = useSharedCurrency ? (sharedSourceCurrency || 'usdc') : sourceCurrency
  const effectiveTarget = useSharedCurrency ? (sharedTargetCurrency || 'eur') : targetCurrency
  const [session, setSession] = useState(null)
  const betLevels = session?.betLevels?.length ? session.betLevels : baseBetLevels
  const [betAmount, setBetAmount] = useState(initialBet)
  const [extraBet, setExtraBet] = useState(false)
  const [loading, setLoading] = useState(false)
  const [spinLoading, setSpinLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [betHistory, setBetHistory] = useState([])
  const betHistoryLengthRef = useRef(0)
  const [logRefreshKey, setLogRefreshKey] = useState(0)
  const triggerLogRefresh = useCallback(() => {
    setLogRefreshKey((k) => k + 1)
    onLogUpdate?.()
  }, [onLogUpdate])
  const [autospinCount, setAutospinCount] = useState(10)
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
  const toUsdCents = useCallback((amount, curr) => {
    if (amount == null || amount === 0) return amount
    const c = (curr || 'usd').toLowerCase()
    const rate = ['usd', 'usdc', 'usdt'].includes(c) ? 1 : (currencyRates[c] ?? 0.001)
    return Math.round(toUnits(amount, c) * rate * 100)
  }, [currencyRates])
  // BetList + Stats ausschließlich aus WebSocket (houseBets) – Single Source of Truth
  const sessionBets = useMemo(
    () => (sessionStartAt ? betHistory.filter((b) => (b.addedAt ?? 0) >= sessionStartAt) : betHistory),
    [betHistory, sessionStartAt]
  )
  const stats = useMemo(() => {
    let spins = 0, totalWageredUsd = 0, totalWonUsd = 0, winCount = 0, lossCount = 0
    let biggestWinUsd = 0, biggestMultiplier = 0, multiOver100xCount = 0, multiOver100xSum = 0
    let lastBalance = null, lastCurrency = null
    for (const b of sessionBets) {
      const bet = Number(b.betAmount) || 0
      const win = (b.isBonus && b.stoppedBonus) ? 0 : (Number(b.winAmount) || 0)
      const curr = (b.currencyCode || 'usd').toLowerCase()
      const betUsd = toUsdCents(bet, curr)
      const winUsd = toUsdCents(win, curr)
      spins += 1
      totalWageredUsd += betUsd || 0
      totalWonUsd += winUsd || 0
      if (win > 0) winCount += 1
      else lossCount += 1
      if ((winUsd || 0) > biggestWinUsd) biggestWinUsd = winUsd || 0
      if (bet > 0 && win > 0) {
        const m = win / bet
        if (m > biggestMultiplier) biggestMultiplier = m
        if (m >= 100) { multiOver100xCount += 1; multiOver100xSum += m }
      }
      if (b.balance != null) lastBalance = b.balance
      if (b.currencyCode) lastCurrency = b.currencyCode
    }
    const currentBalance = wsBalance ?? lastBalance ?? balanceFromPlaceBet
    const balanceCurr = (wsBalance != null ? effectiveTarget : null) ?? (lastCurrency || effectiveTarget || 'usd')
    const currentBalanceUsd = currentBalance != null ? toUsdCents(currentBalance, balanceCurr) : null
    const sessionStartBalanceUsd = sessionStartBalance != null ? toUsdCents(sessionStartBalance, effectiveTarget) : null
    return {
      spins, totalWagered: totalWageredUsd, totalWon: totalWonUsd, winCount, lossCount,
      biggestWin: biggestWinUsd, biggestMultiplier, multiOver100xCount, multiOver100xSum,
      currentBalance: currentBalanceUsd, sessionStartBalance: sessionStartBalanceUsd,
    }
  }, [sessionBets, sessionStartBalance, wsBalance, balanceFromPlaceBet, effectiveTarget, toUsdCents])

  const allowedCurrencies = filterCurrenciesByProvider(supportedCurrencies, [slot]) || supportedCurrencies
  const cryptoOpts = allowedCurrencies.filter((c) => !isFiat(c.value) || isStable(c.value))
  const fiatOpts = allowedCurrencies.filter((c) => isFiat(c.value) && !isStable(c.value))

  useEffect(() => {
    if (initialBetHint != null && initialBetHint > 0) return
    if (initialMinBetUsd != null && initialMinBetUsd > 0) return
    const levels = session?.betLevels?.length ? session.betLevels : betLevels
    const idx = Math.min(4, Math.max(0, levels.length - 1))
    setBetAmount(levels[idx] ?? 5000)
  }, [slot.slug, session?.betLevels, betLevels, initialBetHint, initialMinBetUsd])

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
      const uc = toUsdCents(lvl, curr)
      return typeof uc === 'number' && Number.isFinite(uc) && uc >= minCents
    })
    if (pick != null) setBetAmount(pick)
  }, [initialBetHint, initialMinBetUsd, slot.slug, session?.betLevels, betLevels, baseBetLevels, effectiveTarget, toUsdCents])

  useEffect(() => {
    setSession(null)
    setError('')
    setBalanceFromPlaceBet(null)
  }, [slot.slug])

  useEffect(() => {
    loadBetHistory(slot.slug, 200)
      .then((list) => {
        const mapped = list.map((b) => ({
          id: b.id,
          betAmount: b.betAmount,
          winAmount: b.winAmount,
          isBonus: b.isBonus,
          balance: b.balance,
          roundId: b.roundId,
          addedAt: b.addedAt,
        }))
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
    setBetHistory((prev) => {
      const last = prev[prev.length - 1]
      if (rid && last && String(last.roundId ?? '') === rid) {
        return prev // Duplikat vermeiden (gleicher Round)
      }
      if (!rid && last && (now - (last.addedAt ?? 0)) < 150) {
        const same = (last.betAmount ?? 0) === (parsed.betAmount ?? 0) &&
          (last.winAmount ?? 0) === (parsed.winAmount ?? 0) &&
          !!last.isBonus === !!parsed.isBonus
        if (same) return prev
      }
      const entry = {
        id: now + Math.random(),
        betAmount: parsed.betAmount,
        winAmount: parsed.winAmount ?? 0,
        isBonus: parsed.isBonus,
        balance: parsed.balance,
        currencyCode: parsed.currencyCode,
        roundId: roundId ?? undefined,
        addedAt: now,
      }
      appendBet(slot.slug, entry, slot.name).catch(() => {})
      return [...prev, entry]
    })
  }, [slot.slug])

  /**
   * Realtime (houseBets) ist primär, aber in manchen Sessions bleibt sie leer/verspätet.
   * Dann fallbacken wir pro Spin auf parseBetResponse, damit Stats/BetList im Play-Mode nicht leer bleiben.
   */
  const scheduleFallbackHistoryAppend = useCallback((parsed, baselineCount, delayMs = 1400) => {
    if (fillBetHistoryFromPlaceBet) return
    if (!parsed?.success) return
    setTimeout(() => {
      if (betHistoryLengthRef.current > baselineCount) return
      addToBetHistory({ ...parsed, winAmount: parsed.winAmount ?? 0 })
    }, delayMs)
  }, [fillBetHistoryFromPlaceBet, addToBetHistory])

  const isStakeEngine = slot?.providerId === 'stakeEngine' || PROVIDERS_META[slot?.providerId]?.aliasOf === 'stakeEngine'
  const fillBetHistoryFromPlaceBet = isStakeEngine

  const updateStatsFromResult = useCallback((result, betAmt, useExtraBet = false) => {
    const effectiveBet = getEffectiveBetAmount(betAmt ?? 0, useExtraBet, slot?.slug)
    const parsed = parseBetResponse(result, effectiveBet)
    lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
    if (parsed.balance != null) setBalanceFromPlaceBet(parsed.balance)
    // Stake Engine: houseBets liefert oft nichts – BetList aus placeBet füllen
    if (fillBetHistoryFromPlaceBet && parsed.success) {
      addToBetHistory({ ...parsed, winAmount: parsed.winAmount })
    }
  }, [slot?.slug, slot?.providerId, addToBetHistory, fillBetHistoryFromPlaceBet])

  useSlotRealtime({
    accessToken,
    effectiveTarget,
    fillBetHistoryFromPlaceBet,
    slot,
    setWsBalance,
    addToBetHistory,
  })

  async function handleStartSession() {
    if (!provider?.startSession) {
      setError('Provider nicht implementiert.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const t0 = performance.now()
      const s = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget)
      const levels = s.betLevels?.length ? s.betLevels : betLevels
      if (levels.length && !levels.includes(betAmount)) {
        setBetAmount(levels[Math.min(4, levels.length - 1)])
      }
      setSession(s)
      setLastResult(null)
      lastBalanceRef.current = s?.initialBalance ?? null
      spinsSinceRefreshRef.current = 0
      setSessionStartBalance(s?.initialBalance ?? null)
      setWsBalance(s?.initialBalance ?? null)
      setBalanceFromPlaceBet(s?.initialBalance ?? null)
      setSessionStartAt(Date.now())
      const hasFull = await hasEnoughSamplesForSlot(slot.slug).catch(() => false)
      setSlotHasFullSamples(hasFull)
      slotHasFullSamplesRef.current = hasFull
      logApiCall({
        type: `${slot.providerId}/session`,
        endpoint: 'startSession',
        request: { slug: slot.slug, sourceCurrency: effectiveSource, targetCurrency: effectiveTarget },
        response: s,
        error: null,
        durationMs: Math.round(performance.now() - t0),
      })
      triggerLogRefresh()
      return s
    } catch (err) {
      const msg = err?.message || 'Session konnte nicht gestartet werden'
      setError(msg)
      logApiCall({ type: `${slot.providerId}/session`, endpoint: 'startSession', request: { slug: slot.slug, sourceCurrency: effectiveSource, targetCurrency: effectiveTarget }, response: null, error: msg, durationMs: null })
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
    try {
      const beforeCount = betHistoryLengthRef.current
      let currentSession = session
      if (sessionRefreshSpins > 0 && spinsSinceRefreshRef.current >= sessionRefreshSpins) {
        currentSession = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget)
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
      scheduleFallbackHistoryAppend(parsed, beforeCount)
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
      saveSlotSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, slotSlug: slot.slug }, response: data, skipIfFull: slotHasFullSamplesRef.current })
      if (parsed.isBonus) saveBonusSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, slotSlug: slot.slug }, response: data })
      triggerLogRefresh()
    } catch (err) {
      const msg = err?.message || 'Spin fehlgeschlagen'
      setError(msg)
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
      setError('Anzahl Spins darf nicht negativ sein.')
      return
    }
    autospinCancelRef.current = false
    setIsAutospinning(true)
    setAutospinProgress(0)
    setError('')
    let spinsDone = 0
    let spinsSinceRefresh = 0
    let winStreak = 0
    let lossStreak = 0
    // Summen in USD-Cent (wie stats.totalWagered / totalWon) – konsistent mit Autospin Profit/Loss-Schwellen (ganze USD × 100)
    let aggWageredUsdCents = stats.totalWagered
    let aggWonUsdCents = stats.totalWon

    while ((autospinCount === 0 || spinsDone < autospinCount) && !autospinCancelRef.current) {
      try {
        const beforeCount = betHistoryLengthRef.current
        if (sessionRefreshSpins > 0 && spinsSinceRefresh >= sessionRefreshSpins) {
          let newSession
          try {
            newSession = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget)
          } catch (refreshErr) {
            await new Promise((r) => setTimeout(r, 2500))
            newSession = await provider.startSession(accessToken, slot.slug, effectiveSource, effectiveTarget)
          }
          currentSession = newSession
          setSession(newSession)
          spinsSinceRefresh = 0
        }

        const placeBetOpts = autospinStopOnBonus && autospinMinScatter >= 1
          ? { slotSlug: slot.slug, skipContinueIfBonusMinScatter: autospinMinScatter }
          : { slotSlug: slot.slug }
        const result = await provider.placeBet(currentSession, betAmount, extraBet, false, placeBetOpts)
        const { data, nextSeq, session: updatedSession } = result
        currentSession = updatedSession || { ...currentSession, seq: nextSeq }
        setSession(currentSession)
        setLastResult(data)
        spinsSinceRefresh += 1
        const effectiveBet = getEffectiveBetAmount(betAmount, extraBet, slot.slug)
        const parsed = parseBetResponse(data, effectiveBet)
        scheduleFallbackHistoryAppend(parsed, beforeCount)

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
        saveSlotSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, ...placeBetOpts }, response: data, skipIfFull: slotHasFullSamplesRef.current })
        if (parsed.isBonus) saveBonusSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet, ...placeBetOpts }, response: data })

        let winAmount = parsed.winAmount
        // Kein Balance-Delta-Fallback: Vault-Auszahlungen würden als Win erscheinen

        const betCurr = (parsed.currencyCode || effectiveTarget || 'usd').toLowerCase()
        const betUsdCentsRaw = toUsdCents(effectiveBet, betCurr)
        const winUsdCentsRaw = toUsdCents(winAmount, betCurr)
        const betUsdCents = typeof betUsdCentsRaw === 'number' && Number.isFinite(betUsdCentsRaw) ? betUsdCentsRaw : 0
        const winUsdCents = typeof winUsdCentsRaw === 'number' && Number.isFinite(winUsdCentsRaw) ? winUsdCentsRaw : 0
        const netAfterUsdCents = (aggWonUsdCents + winUsdCents) - (aggWageredUsdCents + betUsdCents)
        const profitThresholdUsdCents = Math.max(0, autospinStopProfitValue) * 100
        const lossThresholdUsdCents = Math.max(0, autospinStopLossValue) * 100

        const bonusMeetsScatter = autospinMinScatter <= 0 ||
          (parsed.scatterCount != null && parsed.scatterCount >= autospinMinScatter) ||
          (parsed.scatterCount == null && parsed.isBonus)
        if (autospinStopOnBonus && (parsed.shouldStopOnBonus ?? parsed.isBonus) && bonusMeetsScatter) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount, stoppedBonus: true })
          setError(`Autospin stopped: bonus${parsed.scatterCount != null ? ` (${parsed.scatterCount} scatters)` : ''} hit after ${spinsDone + 1} spin(s)`)
          notifyBonusHit(slot.name, spinsDone + 1)
          triggerLogRefresh()
          break
        }

        if (autospinStopOnProfit && netAfterUsdCents >= profitThresholdUsdCents) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setError(`Autospin stopped: profit reached after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnNetLoss && netAfterUsdCents <= -lossThresholdUsdCents) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setError(`Autospin stopped: loss limit reached after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }

        if (autospinStopOnMulti && winAmount > 0 && effectiveBet > 0) {
          const mult = winAmount / effectiveBet
          const stakeOkForMultiStop =
            !autospinStopMultiOnlyAt010Usd ||
            (betUsdCents >= 9 && betUsdCents <= 11)
          if (mult >= autospinStopMultiplier && stakeOkForMultiStop) {
            lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
            addToBetHistory({ ...parsed, winAmount })
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
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setError(`Autospin stopped: win after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnLoss && !isWin) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setError(`Autospin stopped: loss after ${spinsDone + 1} spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnMinutes && sessionStartAt && Math.floor((Date.now() - sessionStartAt) / 60000) >= Math.max(1, autospinStopMinutes || 0)) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
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
            lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
            addToBetHistory({ ...parsed, winAmount })
            setError(`Autospin stopped: ${n}x ${autospinStopStreakType === 'win' ? 'win' : 'loss'} streak after ${spinsDone + 1} spin(s)`)
            triggerLogRefresh()
            break
          }
        }

        updateStatsFromResult(data, betAmount, extraBet)
        triggerLogRefresh()
        spinsDone += 1
        aggWageredUsdCents += betUsdCents
        aggWonUsdCents += winUsdCents
        setAutospinProgress(spinsDone)
      } catch (err) {
        const msg = err?.message || 'Spin failed'
        setError(`${msg} (nach ${spinsDone} Spins)`)
        if (err?.sessionClosed) setSession(null)
        logApiCall({ type: `${slot.providerId}/autospin`, endpoint: 'placeBet', request: { betAmount }, response: null, error: msg, durationMs: null })
        triggerLogRefresh()
        break
      }

      if ((autospinCount === 0 || spinsDone < autospinCount) && !autospinCancelRef.current) {
        // Kein künstlicher Delay – Geschwindigkeit nur durch API/Netzwerk begrenzt
        await new Promise((r) => setTimeout(r, 0))
      }
    }

    setIsAutospinning(false)
    setAutospinProgress(null)
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
  }

  function getSettings() {
    return {
      sourceCurrency: effectiveSource,
      targetCurrency: effectiveTarget,
      betAmount,
      extraBet,
      autospinCount,
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
  }

  useImperativeHandle(ref, () => ({
    startSession: handleStartSession,
    stopAll: handleStopAll,
    startAutospin: handleAutospin,
    getSettings,
    applySettings,
  }), [accessToken, slot.slug, effectiveSource, effectiveTarget, provider, betLevels, baseBetLevels, session?.betLevels, sourceCurrency, targetCurrency, betAmount, extraBet, autospinCount, autospinStopOnBonus, autospinMinScatter, autospinStopOnMulti, autospinStopMultiOnlyAt010Usd, autospinStopMultiplier, autospinStopOnWin, autospinStopOnLoss, autospinStopOnStreak, autospinStopStreakCount, autospinStopStreakType, sessionRefreshSpins])

  if (!provider) {
    return (
      <div style={STYLES.error}>
        Provider "{slot.providerId}" is not yet available as a web provider.
        For backend providers: start the SSP server (see README).
      </div>
    )
  }

  const settingsCollapsed = compact && isAutospinning
  const providerId = slot.providerId
  const providerMeta = PROVIDERS_META[providerId] || {}
  const providerBasic = PROVIDERS_BASIC[providerId] || {}

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: settingsCollapsed ? '0.17rem' : (compact ? '0.28rem' : '1.5rem'),
      alignItems: 'start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: settingsCollapsed ? '0.12rem' : (compact ? '0.28rem' : '1rem'), minWidth: 0, color: 'var(--text)' }}>
      {settingsCollapsed && challengeTargetLabels.length > 0 && (
        <div
          style={{ fontSize: '0.58rem', fontWeight: 600, color: 'var(--accent)', lineHeight: 1.2 }}
          title="Challenge target multiplier (Auto Hunter / selection)"
        >
          {slot.name} · Target {challengeTargetLabels.join(' · ')}x
        </div>
      )}
      {!settingsCollapsed && (
      <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: compact ? '0.25rem' : '0.4rem' }}>
        <span style={{ fontWeight: 700, fontSize: compact ? '0.88rem' : '1.02rem', lineHeight: 1.2, color: 'var(--text)' }}>{slot.name}</span>
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
      <div style={{ ...STYLES.section, display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
        {!useSharedCurrency && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <select
              value={allowedCurrencies.some((c) => c.value === sourceCurrency) ? sourceCurrency : (allowedCurrencies[0]?.value || 'usdc')}
              onChange={(e) => { const v = e.target.value; setSourceCurrency(v); setSlotCurrency(slot.slug, { source: v }) }}
              style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
              title="Account currency"
            >
              {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
              {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            </select>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>
            <select
              value={allowedCurrencies.some((c) => c.value === targetCurrency) ? targetCurrency : (allowedCurrencies[0]?.value || 'eur')}
              onChange={(e) => { const v = e.target.value; setTargetCurrency(v); setSlotCurrency(slot.slug, { target: v }) }}
              style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
              title="Game currency"
            >
              {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
              {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            </select>
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

      <div style={{ ...STYLES.section, marginTop: compact ? '0.2rem' : '0.75rem', marginBottom: compact ? '0.3rem' : '1rem' }}>
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
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={autospinStopOnBonus} onChange={(e) => setAutospinStopOnBonus(e.target.checked)} style={STYLES.checkbox} />
            On bonus
          </label>
          <select value={autospinMinScatter} onChange={(e) => setAutospinMinScatter(Number(e.target.value))} style={{ ...STYLES.select, width: 72 }} disabled={!autospinStopOnBonus} title="Only at >=X scatters">
            <option value={0}>Any</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5</option>
          </select>
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
        </div>
        <details style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Advanced stop options</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
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
      </div>

      <div style={{ ...STYLES.row, marginTop: '0.5rem', gap: '0.4rem' }}>
        <button
          onClick={handleStartSession}
          disabled={loading}
          style={compact ? { ...STYLES.btn, padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : STYLES.btn}
        >
          {loading ? 'Starting...' : 'Start session'}
        </button>
        <button
          onClick={handleSpin}
          disabled={!session || spinLoading || isAutospinning}
          style={compact ? { ...STYLES.btn, padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : STYLES.btn}
        >
          {spinLoading ? 'Spin…' : 'Spin'}
        </button>
        <button
          onClick={isAutospinning ? handleStopAutospin : handleAutospin}
          disabled={!session || loading}
          style={{
            ...(compact ? { padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : {}),
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
          style={compact ? { ...STYLES.btnSecondary, padding: '0.35rem 0.6rem', fontSize: '0.75rem' } : STYLES.btnSecondary}
        >
          Export CSV
        </button>
      </div>
      </>
      )}

      {settingsCollapsed && (
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
      )}

      {session && !settingsCollapsed && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
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
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: settingsCollapsed ? '0.17rem' : (compact ? '0.35rem' : '0.5rem'), minWidth: 0, color: 'var(--text)' }}>
      {!session && betHistory.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Start a session, then spin or autospin - statistics and spins appear here.
        </p>
      )}
      <StatsDisplay
        stats={(() => {
          // Höchster Multi: auch aus betHistory ableiten, damit er mit der BetList übereinstimmt
          const sessionBets = sessionStartAt ? betHistory.filter((b) => (b.addedAt ?? 0) >= sessionStartAt) : betHistory
          let biggestMultiFromHistory = 0
          for (const b of sessionBets) {
            const bet = Number(b.betAmount) || 0
            const win = Number(b.winAmount) || 0
            if (bet > 0 && win > 0) {
              const m = win / bet
              if (m > biggestMultiFromHistory) biggestMultiFromHistory = m
            }
          }
          const enrichedStats = biggestMultiFromHistory > (stats.biggestMultiplier || 0)
            ? { ...stats, biggestMultiplier: biggestMultiFromHistory }
            : stats
          return enrichedStats
        })()}
        currencyCode="usd"
        compact={compact}
        minimal={settingsCollapsed}
      />
      {betHistory.length > 0 && (() => {
        // Chart nur aus aktueller Session (sessionStartAt), sonst passt es nicht zu Stats
        const sessionBets = sessionStartAt ? betHistory.filter((b) => (b.addedAt ?? 0) >= sessionStartAt) : betHistory
        if (sessionBets.length === 0) return null
        let cum = 0
        const cumNets = sessionBets.map((b) => {
          const win = (b.isBonus && b.stoppedBonus) ? 0 : (Number(b.winAmount) || 0)
          const bet = Number(b.betAmount) || 0
          const curr = (b.currencyCode || 'usd').toLowerCase()
          const netUsd = (toUsdCents(win, curr) ?? 0) - (toUsdCents(bet, curr) ?? 0)
          cum += netUsd
          return cum
        })
        if (cumNets.length === 0) return null
        const lastNet = cumNets[cumNets.length - 1]
        const statsNet = (stats.totalWon ?? 0) - (stats.totalWagered ?? 0)
        const useStatsAsReference = sessionStartAt && Math.abs(lastNet - statsNet) > Math.max(1, Math.abs(statsNet) * 0.01)
        const currencyCode = 'usd'
        const chartColors = ['#00e701', '#22c55e', '#f59e0b', '#8b5cf6']
        const colorIndex = [...slot.slug].reduce((a, c) => a + c.charCodeAt(0), 0) % chartColors.length
        const strokeColor = chartColors[colorIndex]
        const maxPoints = 200
        const step = cumNets.length > maxPoints ? Math.ceil(cumNets.length / maxPoints) : 1
        const chartData = [
          { spin: 0, net: 0 },
          ...cumNets
            .map((net, i) => ({ spin: i + 1, net }))
            .filter((_, i) => i % step === 0 || i === cumNets.length - 1),
        ]
        const minV = Math.min(0, ...cumNets)
        const maxV = Math.max(0, ...cumNets)
        const padding = Math.max(1, (maxV - minV) * 0.05) || 1
        const chartHeight = settingsCollapsed ? 24 : (compact ? 38 : 80)
        const innerChartH = Math.max(16, chartHeight - (settingsCollapsed ? 18 : (compact ? 22 : 36)))
        return (
          <div style={{ marginTop: settingsCollapsed ? '0.12rem' : (compact ? '0.2rem' : '0.5rem'), padding: settingsCollapsed ? '0.12rem 0.2rem' : (compact ? '0.25rem 0.35rem' : '0.75rem'), background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: settingsCollapsed ? 4 : 6, minHeight: chartHeight, color: 'var(--text)' }}>
            <div style={{ fontSize: settingsCollapsed ? '0.5rem' : (compact ? '0.58rem' : '0.85rem'), fontWeight: 600, marginBottom: settingsCollapsed ? '0.1rem' : '0.2rem', color: 'var(--text-muted)' }}>
              Session Netto · {slot.name}
              {useStatsAsReference && lastNet !== statsNet && <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Chart ≠ Stats)</span>}
            </div>
            <div style={{ width: '100%', height: innerChartH }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="sessionNettoGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="spin" hide domain={['dataMin', 'dataMax']} />
                  <YAxis hide domain={[minV - padding, maxV + padding]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a2c38', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text)' }}
                    formatter={(val) => [formatAmount(Number(val), currencyCode), 'Netto']}
                    labelFormatter={(spin) => `Spin ${spin}`}
                  />
                  <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" strokeOpacity={0.8} />
                  <Area
                    type="monotone"
                    dataKey="net"
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    fill="url(#sessionNettoGradient)"
                    fillOpacity={1}
                    isAnimationActive={true}
                    animationDuration={400}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}
      <BetList bets={betHistory.slice(-30).map((b) => {
          const curr = (b.currencyCode || 'usd').toLowerCase()
          return {
            ...b,
            betAmount: toUsdCents(b.betAmount, curr) ?? b.betAmount,
            winAmount: toUsdCents(b.winAmount, curr) ?? b.winAmount,
            currencyCode: 'USD',
          }
        })} totalCount={betHistory.length} currencyCode="usd" compact={compact} minimal={settingsCollapsed} />

      {!compact && (
      <details style={{ marginTop: '0.5rem' }}>
        <summary style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
          API-Logs (für Coding / Debug)
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <LogViewer refreshKey={logRefreshKey} />
          {lastResult && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Letzter Spin (Raw JSON)
              </summary>
              <pre style={{ ...STYLES.result, marginTop: '0.5rem', maxHeight: 150 }}>
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </details>
      )}
      </div>
    </div>
  )
})

export default SlotControl
