import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { getProvider } from '../api/providers'
import { PROVIDERS as PROVIDERS_BASIC } from '../constants/slots'
import { PROVIDERS as PROVIDERS_META } from '../constants/providers'
import { ALL_CURRENCIES, filterCurrenciesByProvider } from '../constants/currencies'
import { fetchSupportedCurrencies } from '../api/stakeChallenges'
import { isFiat, isStable } from '../utils/formatAmount'
import { getEffectiveBetAmount } from '../constants/bet'
import { parseBetResponse } from '../utils/parseBetResponse'
import { formatBetLabel, formatAmount } from '../utils/formatAmount'
import StatsDisplay from './StatsDisplay'
import BetList from './BetList'
import LogViewer from './LogViewer'
import { logApiCall, saveBonusLog, isSaveBonusLogsEnabled } from '../utils/apiLogger'
import { saveSlotSpinSample, saveBonusSpinSample, hasEnoughSamplesForSlot } from '../utils/slotSpinSamples'
import { notifyBonusHit } from '../utils/notifications'
import { loadBetHistory, appendBet } from '../utils/betHistoryDb'
import { getSlotCurrency, setSlotCurrency } from '../utils/slotCurrencyConfig'
import { subscribeToBetUpdates } from '../api/stakeBalanceSubscription'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

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

const SlotControl = forwardRef(function SlotControl({ slot, accessToken, compact = false, onLogUpdate, useSharedCurrency = false, sharedSourceCurrency, sharedTargetCurrency, initialTargetCurrency, initialBetHint, initialExpanded = false, sharedCryptoOnly = false }, ref) {
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
  const [logRefreshKey, setLogRefreshKey] = useState(0)
  const triggerLogRefresh = useCallback(() => {
    setLogRefreshKey((k) => k + 1)
    onLogUpdate?.()
  }, [onLogUpdate])
  const [autospinCount, setAutospinCount] = useState(10)
  const [autospinStopOnBonus, setAutospinStopOnBonus] = useState(true)
  const [autospinMinScatter, setAutospinMinScatter] = useState(0) // 0=Jeder Bonus, 3/4/5=nur mind. X Scatter
  const [autospinStopOnMulti, setAutospinStopOnMulti] = useState(false)
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
  const [stats, setStats] = useState({
    spins: 0,
    totalWagered: 0,
    totalWon: 0,
    winCount: 0,
    lossCount: 0,
    biggestWin: 0,
    biggestMultiplier: 0,
    multiOver100xCount: 0,
    multiOver100xSum: 0,
    currentBalance: null,
    sessionStartBalance: null,
    currencyCode: null,
  })

  const allowedCurrencies = filterCurrenciesByProvider(supportedCurrencies, [slot]) || supportedCurrencies
  const cryptoOpts = allowedCurrencies.filter((c) => !isFiat(c.value) || isStable(c.value))
  const fiatOpts = allowedCurrencies.filter((c) => isFiat(c.value) && !isStable(c.value))

  useEffect(() => {
    if (initialBetHint != null && initialBetHint > 0) return
    const levels = session?.betLevels?.length ? session.betLevels : betLevels
    const idx = Math.min(4, Math.max(0, levels.length - 1))
    setBetAmount(levels[idx] ?? 5000)
  }, [slot.slug, session?.betLevels, betLevels, initialBetHint])

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
        setError('Session abgelaufen. Bitte Session neu starten.')
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

  const updateStatsFromResult = useCallback((result, betAmt, useExtraBet = false) => {
    const effectiveBet = getEffectiveBetAmount(betAmt, useExtraBet, slot?.slug)
    const parsed = parseBetResponse(result, effectiveBet)

    // Fallback Balance-Delta deaktiviert: Vault-Auszahlungen während Spin würden fälschlich als Win gezählt.
    // RGS/Stake Engine liefert winAmountDisplay; houseBets liefert echte Payouts.
    let winAmount = parsed.winAmount
    lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
    const parsedWithWin = { ...parsed, winAmount }

    addToBetHistory(parsedWithWin)
    setStats((prev) => {
      const newStats = { ...prev }
      if (!parsed.success) return prev
      newStats.spins += 1
      newStats.totalWagered += effectiveBet
      newStats.totalWon += winAmount
      if (winAmount > 0) newStats.winCount += 1
      else newStats.lossCount += 1
      if (winAmount > prev.biggestWin) newStats.biggestWin = winAmount
      if (winAmount > 0 && effectiveBet > 0) {
        const mult = winAmount / effectiveBet
        if (mult > (prev.biggestMultiplier || 0)) newStats.biggestMultiplier = mult
        if (mult >= 100) {
          newStats.multiOver100xCount += 1
          newStats.multiOver100xSum += mult
        }
      }
      if (parsed.balance != null) newStats.currentBalance = parsed.balance
      if (parsed.currencyCode) newStats.currencyCode = parsed.currencyCode
      return newStats
    })
  }, [addToBetHistory])

  useEffect(() => {
    if (!accessToken) return
    // Stake Engine: RGS liefert bereits alle Daten über placeBet; houseBets würde Duplikate (1.000 + 0 VND) erzeugen
    const isStakeEngine = slot.providerId === 'stakeEngine' || PROVIDERS_META[slot.providerId]?.aliasOf === 'stakeEngine'
    if (isStakeEngine) return
    const sub = subscribeToBetUpdates(accessToken, (b) => {
      const slug = String(b?.gameSlug || '')
      if (!slug) return
      // Exakt oder slot.slug endet mit -gameSlug (z.B. hacksaw-le-bandit vs le-bandit)
      const matches = slug === slot.slug || slot.slug.endsWith('-' + slug)
      if (!matches) return
      const betAmount = Number(b?.amount) || 0
      const winAmount = Number(b?.payout) || 0
      const currencyCode = (b?.currency || '').toUpperCase() || null
      addToBetHistory({ betAmount, winAmount, isBonus: false, balance: undefined, currencyCode, roundId: b?.id })
      setStats((prev) => {
        const next = { ...prev }
        next.spins += 1
        next.totalWagered += betAmount
        next.totalWon += winAmount
        if (winAmount > 0) next.winCount += 1
        else next.lossCount += 1
        if (winAmount > prev.biggestWin) next.biggestWin = winAmount
        if (winAmount > 0 && betAmount > 0) {
          const mult = winAmount / betAmount
          if (mult > (prev.biggestMultiplier || 0)) next.biggestMultiplier = mult
          if (mult >= 100) {
            next.multiOver100xCount += 1
            next.multiOver100xSum += mult
          }
        }
        if (!prev.currencyCode && currencyCode) next.currencyCode = currencyCode
        return next
      })
    })
    return () => {
      try { sub.disconnect() } catch (_) {}
    }
  }, [accessToken, slot.slug, slot.providerId, addToBetHistory])

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
      setStats({
        spins: 0,
        totalWagered: 0,
        totalWon: 0,
        winCount: 0,
        lossCount: 0,
        biggestWin: 0,
        biggestMultiplier: 0,
        multiOver100xCount: 0,
        multiOver100xSum: 0,
        currentBalance: s?.initialBalance ?? null,
        sessionStartBalance: s?.initialBalance ?? null,
        currencyCode: s?.currencyCode ?? null,
      })
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
      setError('Zuerst Session starten.')
      return
    }
    if (!provider?.placeBet) {
      setError('Provider placeBet nicht verfügbar.')
      return
    }
    setSpinLoading(true)
    setError('')
    try {
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
    let aggTotalWagered = stats.totalWagered
    let aggTotalWon = stats.totalWon

    while ((autospinCount === 0 || spinsDone < autospinCount) && !autospinCancelRef.current) {
      try {
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

        const bonusMeetsScatter = autospinMinScatter <= 0 ||
          (parsed.scatterCount != null && parsed.scatterCount >= autospinMinScatter) ||
          (parsed.scatterCount == null && parsed.isBonus)
        if (autospinStopOnBonus && (parsed.shouldStopOnBonus ?? parsed.isBonus) && bonusMeetsScatter) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount, stoppedBonus: true })
          setStats((prev) => ({
            ...prev,
            spins: prev.spins + 1,
            totalWagered: prev.totalWagered + effectiveBet,
            ...(parsed.balance != null && { currentBalance: parsed.balance }),
            ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
          }))
          setError(`Autospin gestoppt: Bonus${parsed.scatterCount != null ? ` (${parsed.scatterCount} Scatter)` : ''} getroffen nach ${spinsDone + 1} Spin(s)`)
          notifyBonusHit(slot.name, spinsDone + 1)
          triggerLogRefresh()
          break
        }

        const netAfter = (aggTotalWon + winAmount) - (aggTotalWagered + effectiveBet)
        if (autospinStopOnProfit && netAfter >= autospinStopProfitValue) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setStats((prev) => ({
            ...prev,
            spins: prev.spins + 1,
            totalWagered: prev.totalWagered + effectiveBet,
            totalWon: prev.totalWon + winAmount,
            winCount: prev.winCount + (winAmount > 0 ? 1 : 0),
            lossCount: prev.lossCount + (winAmount > 0 ? 0 : 1),
            biggestWin: Math.max(prev.biggestWin, winAmount),
            ...(parsed.balance != null && { currentBalance: parsed.balance }),
            ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
          }))
          setError(`Autospin gestoppt: Profit erreicht nach ${spinsDone + 1} Spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnNetLoss && netAfter <= -Math.max(0, autospinStopLossValue)) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setStats((prev) => ({
            ...prev,
            spins: prev.spins + 1,
            totalWagered: prev.totalWagered + effectiveBet,
            totalWon: prev.totalWon + winAmount,
            winCount: prev.winCount + (winAmount > 0 ? 1 : 0),
            lossCount: prev.lossCount + (winAmount > 0 ? 0 : 1),
            biggestWin: Math.max(prev.biggestWin, winAmount),
            ...(parsed.balance != null && { currentBalance: parsed.balance }),
            ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
          }))
          setError(`Autospin gestoppt: Loss-Limit erreicht nach ${spinsDone + 1} Spin(s)`)
          triggerLogRefresh()
          break
        }

        if (autospinStopOnMulti && winAmount > 0 && effectiveBet > 0) {
          const mult = winAmount / effectiveBet
          if (mult >= autospinStopMultiplier) {
            lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
            addToBetHistory({ ...parsed, winAmount })
            setStats((prev) => ({
              ...prev,
              spins: prev.spins + 1,
              totalWagered: prev.totalWagered + effectiveBet,
              totalWon: prev.totalWon + winAmount,
              winCount: prev.winCount + 1,
              biggestWin: Math.max(prev.biggestWin, winAmount),
              biggestMultiplier: Math.max(prev.biggestMultiplier || 0, winAmount / effectiveBet),
            ...(winAmount > 0 && effectiveBet > 0 && (winAmount / effectiveBet) >= 100
              ? { multiOver100xCount: prev.multiOver100xCount + 1, multiOver100xSum: prev.multiOver100xSum + (winAmount / effectiveBet) }
              : {}),
              ...(parsed.balance != null && { currentBalance: parsed.balance }),
              ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
            }))
            setError(`Autospin gestoppt: ${mult.toFixed(1)}× getroffen nach ${spinsDone + 1} Spin(s)`)
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
          setStats((prev) => ({
            ...prev,
            spins: prev.spins + 1,
            totalWagered: prev.totalWagered + effectiveBet,
            totalWon: prev.totalWon + winAmount,
            winCount: prev.winCount + 1,
            ...(parsed.balance != null && { currentBalance: parsed.balance }),
            ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
          }))
          setError(`Autospin gestoppt: Win nach ${spinsDone + 1} Spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnLoss && !isWin) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setStats((prev) => ({
            ...prev,
            spins: prev.spins + 1,
            totalWagered: prev.totalWagered + effectiveBet,
            lossCount: prev.lossCount + 1,
            ...(parsed.balance != null && { currentBalance: parsed.balance }),
            ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
          }))
          setError(`Autospin gestoppt: Loss nach ${spinsDone + 1} Spin(s)`)
          triggerLogRefresh()
          break
        }
        if (autospinStopOnMinutes && sessionStartAt && Math.floor((Date.now() - sessionStartAt) / 60000) >= Math.max(1, autospinStopMinutes || 0)) {
          lastBalanceRef.current = parsed.balance ?? lastBalanceRef.current
          addToBetHistory({ ...parsed, winAmount })
          setStats((prev) => ({
            ...prev,
            spins: prev.spins + 1,
            totalWagered: prev.totalWagered + effectiveBet,
            totalWon: prev.totalWon + winAmount,
            winCount: prev.winCount + (isWin ? 1 : 0),
            lossCount: prev.lossCount + (isWin ? 0 : 1),
            ...(parsed.balance != null && { currentBalance: parsed.balance }),
            ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
          }))
          setError(`Autospin gestoppt: Zeitlimit erreicht nach ${spinsDone + 1} Spin(s)`)
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
            setStats((prev) => ({
              ...prev,
              spins: prev.spins + 1,
              totalWagered: prev.totalWagered + effectiveBet,
              totalWon: prev.totalWon + winAmount,
              winCount: prev.winCount + (isWin ? 1 : 0),
              lossCount: prev.lossCount + (isWin ? 0 : 1),
              ...(parsed.balance != null && { currentBalance: parsed.balance }),
              ...(parsed.currencyCode && { currencyCode: parsed.currencyCode }),
            }))
            setError(`Autospin gestoppt: ${n}× ${autospinStopStreakType === 'win' ? 'Win' : 'Loss'}-Streak nach ${spinsDone + 1} Spin(s)`)
            triggerLogRefresh()
            break
          }
        }

        updateStatsFromResult(data, betAmount, extraBet)
        triggerLogRefresh()
        spinsDone += 1
        aggTotalWagered += effectiveBet
        aggTotalWon += winAmount
        setAutospinProgress(spinsDone)
      } catch (err) {
        const msg = err?.message || 'Spin fehlgeschlagen'
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
  }), [accessToken, slot.slug, effectiveSource, effectiveTarget, provider, betLevels, baseBetLevels, session?.betLevels, sourceCurrency, targetCurrency, betAmount, extraBet, autospinCount, autospinStopOnBonus, autospinMinScatter, autospinStopOnMulti, autospinStopMultiplier, autospinStopOnWin, autospinStopOnLoss, autospinStopOnStreak, autospinStopStreakCount, autospinStopStreakType, sessionRefreshSpins])

  if (!provider) {
    return (
      <div style={STYLES.error}>
        Provider „{slot.providerId}“ ist noch nicht als Web-Provider verfügbar.
        Für Backend-Provider: SSP-Server starten (siehe README).
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
      {!settingsCollapsed && (
      <>
      <div style={{ ...STYLES.section, display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
        {!useSharedCurrency && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <select
              value={allowedCurrencies.some((c) => c.value === sourceCurrency) ? sourceCurrency : (allowedCurrencies[0]?.value || 'usdc')}
              onChange={(e) => { const v = e.target.value; setSourceCurrency(v); setSlotCurrency(slot.slug, { source: v }) }}
              style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
              title="Kontowährung"
            >
              {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
              {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            </select>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>
            <select
              value={allowedCurrencies.some((c) => c.value === targetCurrency) ? targetCurrency : (allowedCurrencies[0]?.value || 'eur')}
              onChange={(e) => { const v = e.target.value; setTargetCurrency(v); setSlotCurrency(slot.slug, { target: v }) }}
              style={{ ...STYLES.select, minWidth: 90, flex: 'none' }}
              title="Spielwährung"
            >
              {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
              {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <select value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} style={{ ...STYLES.select, minWidth: 110, flex: 'none' }} title="Einsatz">
            {betLevels.map((v) => <option key={v} value={v}>{formatBetLabel(v, effectiveTarget)}</option>)}
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
            title="0 = unendlich"
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>Spins {autospinCount === 0 ? '(∞)' : ''}</span>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={autospinStopOnBonus} onChange={(e) => setAutospinStopOnBonus(e.target.checked)} style={STYLES.checkbox} />
            Bei Bonus
          </label>
          <select value={autospinMinScatter} onChange={(e) => setAutospinMinScatter(Number(e.target.value))} style={{ ...STYLES.select, width: 72 }} disabled={!autospinStopOnBonus} title="Nur bei ≥X Scatter">
            <option value={0}>Jeder</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5</option>
          </select>
          <label style={{ ...STYLES.checkboxRow, cursor: 'pointer', fontSize: '0.8rem' }}>
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
        </div>
        <details style={{ marginTop: '0.35rem', fontSize: '0.8rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Erweiterte Stopp-Optionen</summary>
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
              Profit ≥ <input type="number" min={0} value={autospinStopProfitValue || 0} onChange={(e) => setAutospinStopProfitValue(Math.max(0, parseInt(e.target.value) || 0))} style={{ ...STYLES.select, width: 70 }} disabled={!autospinStopOnProfit} /> {(stats.currencyCode || effectiveTarget).toUpperCase()}
            </label>
            <label style={{ ...STYLES.checkboxRow, cursor: 'pointer' }}>
              <input type="checkbox" checked={autospinStopOnNetLoss} onChange={(e) => setAutospinStopOnNetLoss(e.target.checked)} style={STYLES.checkbox} />
              Loss ≥ <input type="number" min={0} value={autospinStopLossValue || 0} onChange={(e) => setAutospinStopLossValue(Math.max(0, parseInt(e.target.value) || 0))} style={{ ...STYLES.select, width: 70 }} disabled={!autospinStopOnNetLoss} /> {(stats.currencyCode || effectiveTarget).toUpperCase()}
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
          {loading ? 'Starte…' : 'Session starten'}
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
          {isAutospinning ? 'Stoppen' : `Autospin (${autospinCount})`}
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
            {formatBetLabel(getEffectiveBetAmount(betAmount, extraBet, slot.slug), effectiveTarget)}
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
            {autospinProgress != null ? `Stop (${autospinProgress}/${autospinCount})` : 'Stoppen'}
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
          Session starten, dann Spin oder Autospin – Statistik und Spins erscheinen hier.
        </p>
      )}
      <StatsDisplay stats={stats} currencyCode={stats.currencyCode || effectiveTarget} compact={compact} minimal={settingsCollapsed} />
      {betHistory.length > 0 && (() => {
        // Chart nur aus aktueller Session (sessionStartAt), sonst passt es nicht zu Stats
        const sessionBets = sessionStartAt ? betHistory.filter((b) => (b.addedAt ?? 0) >= sessionStartAt) : betHistory
        if (sessionBets.length === 0) return null
        // Session-Netto: Y-Achse unten = Minus, oben = Plus
        let cum = 0
        const cumNets = sessionBets.map((b) => {
          const win = (b.isBonus && b.stoppedBonus) ? 0 : (Number(b.winAmount) || 0)
          const bet = Number(b.betAmount) || 0
          cum += win - bet
          return cum
        })
        if (cumNets.length === 0) return null
        const lastNet = cumNets[cumNets.length - 1]
        const statsNet = (stats.totalWon ?? 0) - (stats.totalWagered ?? 0)
        const useStatsAsReference = sessionStartAt && Math.abs(lastNet - statsNet) > Math.max(1, Math.abs(statsNet) * 0.01)
        const currencyCode = stats.currencyCode || effectiveTarget
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
      <BetList bets={betHistory.slice(-30)} totalCount={betHistory.length} currencyCode={stats.currencyCode || effectiveTarget} compact={compact} minimal={settingsCollapsed} />

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
