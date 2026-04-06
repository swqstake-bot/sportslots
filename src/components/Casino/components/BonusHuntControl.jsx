/**
 * Bonus Hunt – mehrere Slots nacheinander spielen bis jeder Bonus bekommt.
 * Nutzt gleiche Währung/Einsatz für alle.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import styles from './BonusHuntControl.module.css'
import { getProvider } from '../api/providers'
import { getImpliedScatterLevel } from '../api/providers/hacksaw'
import { ALL_CURRENCIES, filterCurrenciesByProvider } from '../constants/currencies'
import { fetchSupportedCurrencies, fetchCurrencyRates } from '../api/stakeChallenges'
import { formatAmount, formatBetLabel, isFiat, isStable, toMinor, toUnits } from '../utils/formatAmount'
import { getEffectiveBetAmount } from '../constants/bet'
import { SlotSelectMulti } from './SlotSelectGrouped'
import SlotSlider from './SlotSlider'
import { parseBetResponse } from '../utils/parseBetResponse'
import { isSlotNoExtraBet, addSlotNoExtraBet } from '../utils/slotExtraBetMemory'
import { loadHasBonusSlugs, toggleHasBonusSlug, removeHasBonusSlug, clearHasBonusSlugs } from '../utils/slotSets'
import { notifyBonusHit } from '../utils/notifications'
import { saveBonusLog, isSaveBonusLogsEnabled, setSaveBonusLogsEnabled, exportBonusLogsAsFile, clearBonusLogs } from '../utils/apiLogger'
import { saveSlotSpinSample, saveBonusSpinSample } from '../utils/slotSpinSamples'
import { subscribeToHouseBets } from '../api/stakeRealtimeFacade'
import { subscribeToBetUpdates } from '../api/stakeBalanceSubscription'
import { PROVIDERS as PROVIDERS_META } from '../constants/providers'
import { houseBetSlugMatchesSessionSlug } from '../utils/slotSlugMatching'
import { TipMenu } from '../../ui/TipMenu'

const HUNT_BET_LEVELS = [
  1100, 2200, 4400, 6600, 8800, 11000, 22000, 44000, 66000, 110000, 220000,
]
const CLOUDFLARE_RETRY_WAIT_MS = 5000
const CLOUDFLARE_MAX_RETRIES = 3
const GENERIC_RETRY_WAIT_MS = 5000

function isCloudflareError(err) {
  const msg = (err?.message || '').toLowerCase()
  return msg.includes('just a moment') || msg.includes('cloudflare') || msg.includes('html statt json')
}

function smoothPathFromPoints(points, tension = 0.22) {
  if (!Array.isArray(points) || points.length === 0) return ''
  if (points.length === 1) return `M ${points[0][0]},${points[0][1]}`
  if (points.length === 2) return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`

  let d = `M ${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const cp1x = p1[0] + (p2[0] - p0[0]) * tension
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`
  }
  return d
}

function normalizeNameToken(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function BonusHuntControl({
  slots,
  accessToken,
  /** @type {string[]} */
  selectedSlugs = [],
  onToggleSlot,
  onSelectAll,
  onSelectNone,
  slotSets = [],
  loadedSetId = '',
  onLoadSlotSet,
  onSaveSlotSet,
  onDeleteSlotSet,
  favorites = [],
  onToggleFavorite,
}) {
  const [sourceCurrency, setSourceCurrency] = useState('usdc')
  const [targetCurrency, setTargetCurrency] = useState('eur')
  const [betAmount, setBetAmount] = useState(11000)
  const [huntBetLevels, setHuntBetLevels] = useState(HUNT_BET_LEVELS)
  const [extraBet, setExtraBet] = useState(false)
  const [maxSpinsPerSlot, setMaxSpinsPerSlot] = useState(0)
  const [maxLossLimit, setMaxLossLimit] = useState(0)
  const [stopOnMulti, setStopOnMulti] = useState(false)
  const [stopOnMultiplier, setStopOnMultiplier] = useState(10)
  const [minScatterForStop, setMinScatterForStop] = useState(0) // 0=Jeder Bonus, 3/4/5=nur mind. X Scatter
  const [gambleOption, setGambleOption] = useState(false) // false=collect, true=gamble
  const [sessionRefreshSpins, setSessionRefreshSpins] = useState(0)
  const [parallelHuntEnabled, setParallelHuntEnabled] = useState(false)
  const [maxParallelSlots, setMaxParallelSlots] = useState(3)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')
  const [huntState, setHuntState] = useState({})
  const [betHistory, setBetHistory] = useState([])
  const [currentBalance, setCurrentBalance] = useState(null)
  const [currencyCode, setCurrencyCode] = useState(null)
  const [currencyRates, setCurrencyRates] = useState({})
  const [saveBonusLogs, setSaveBonusLogs] = useState(isSaveBonusLogsEnabled())
  const cancelRef = useRef(false)
  const [hasBonusSlugs, setHasBonusSlugs] = useState(() => new Set(loadHasBonusSlugs()))
  const [wheelOpenedSlugs, setWheelOpenedSlugs] = useState(() => new Set())
  const [autoOpenGame, setAutoOpenGame] = useState(true)
  const [lastWheelWinner, setLastWheelWinner] = useState(null)
  const [bonusOpeningResults, setBonusOpeningResults] = useState({})
  const [loggerUpdateSignal, setLoggerUpdateSignal] = useState(0)
  const [showDetailedProgress, setShowDetailedProgress] = useState(false)
  const [tipCopied, setTipCopied] = useState(false)
  const [showTipMenu, setShowTipMenu] = useState(false)
  const tipMenuRef = useRef(null)
  const pendingSpinsRef = useRef([])
  const recentHouseBetsRef = useRef([])
  const recentLoggerBetsRef = useRef([])
  const houseBetSubRef = useRef(null)
  const loggerBetSubRef = useRef(null)
  const popupOpeningsRef = useRef(new Map())
  const bonusResolveTimersRef = useRef(new Map())
  const latestBetHistoryRef = useRef([])
  const latestBonusOpeningResultsRef = useRef({})

  useEffect(() => {
    function handleClickOutside(event) {
      if (tipMenuRef.current && !tipMenuRef.current.contains(event.target)) {
        setShowTipMenu(false)
      }
    }
    if (showTipMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTipMenu])

  useEffect(() => {
    if (!accessToken) return
    fetchCurrencyRates(accessToken).then(setCurrencyRates).catch(() => setCurrencyRates({}))
  }, [accessToken])



  const selectedSlots = slots.filter((s) => selectedSlugs.includes(s.slug))
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
  const allowedCurrencies = selectedSlots.length
    ? (filterCurrenciesByProvider(supportedCurrencies, selectedSlots) || supportedCurrencies)
    : supportedCurrencies
  const cryptoOpts = allowedCurrencies.filter((c) => !isFiat(c.value) || isStable(c.value))
  const fiatOpts = allowedCurrencies.filter((c) => isFiat(c.value) && !isStable(c.value))

  useEffect(() => {
    if (selectedSlots.length === 0) return
    const allowed = filterCurrenciesByProvider(supportedCurrencies, selectedSlots) || supportedCurrencies
    const vals = new Set(allowed.map((c) => (c.value || c).toLowerCase()))
    setSourceCurrency((prev) => (!vals.has(prev.toLowerCase()) && allowed[0] ? allowed[0].value : prev))
    setTargetCurrency((prev) => (!vals.has(prev.toLowerCase()) && allowed[0] ? allowed[0].value : prev))
  }, [selectedSlugs.join(','), slots?.length ?? 0, supportedCurrencies.length])

  useEffect(() => {
    if (!accessToken || isRunning) return
    const slot = selectedSlots[0]
    if (!slot) {
      setHuntBetLevels(HUNT_BET_LEVELS)
      return
    }
    const provider = getProvider(slot.providerId)
    let cancelled = false
    const fallbackLevels = slot.betLevels?.length ? slot.betLevels : HUNT_BET_LEVELS
    if (!provider?.startSession) {
      setHuntBetLevels(fallbackLevels)
      if (!fallbackLevels.includes(betAmount)) {
        const nearest = fallbackLevels.reduce((best, v) =>
          Math.abs(v - betAmount) < Math.abs(best - betAmount) ? v : best, fallbackLevels[0])
        setBetAmount(nearest ?? fallbackLevels[0])
      }
      return () => { cancelled = true }
    }
    provider.startSession(accessToken, slot.slug, sourceCurrency, targetCurrency)
      .then((session) => {
        if (cancelled) return
        const levels = session?.betLevels?.length ? session.betLevels : fallbackLevels
        setHuntBetLevels(levels)
        if (!levels.includes(betAmount)) {
          const nearest = levels.reduce((best, v) =>
            Math.abs(v - betAmount) < Math.abs(best - betAmount) ? v : best, levels[0])
          setBetAmount(nearest ?? levels[0])
        }
      })
      .catch(() => {
        if (cancelled) return
        setHuntBetLevels(fallbackLevels)
        if (!fallbackLevels.includes(betAmount)) {
          const nearest = fallbackLevels.reduce((best, v) =>
            Math.abs(v - betAmount) < Math.abs(best - betAmount) ? v : best, fallbackLevels[0])
          setBetAmount(nearest ?? fallbackLevels[0])
        }
      })
    return () => { cancelled = true }
  }, [accessToken, isRunning, selectedSlugs.join(','), slots?.length ?? 0, sourceCurrency, targetCurrency])

  const toggleSlot = (slug) => {
    if (isRunning) return
    onToggleSlot?.(slug)
  }
  const selectAll = () => {
    if (isRunning) return
    onSelectAll?.()
  }
  const selectNone = () => {
    if (isRunning) return
    onSelectNone?.()
  }

  const handleToggleHasBonus = (slug) => {
    if (isRunning) return
    toggleHasBonusSlug(slug)
    setHasBonusSlugs(new Set(loadHasBonusSlugs()))
  }

  const handleUncheckAllBonus = () => {
    if (isRunning) return
    if (!window.confirm('Remove the "has bonus" status for ALL slots?')) return
    clearHasBonusSlugs()
    setHasBonusSlugs(new Set())
  }

  const handleToggleBonusLogs = (checked) => {
    setSaveBonusLogs(checked)
    setSaveBonusLogsEnabled(checked)
  }

  const slotMatchesGame = useCallback((slotSlug, gameSlug) => houseBetSlugMatchesSessionSlug(gameSlug, slotSlug), [])
  const slotNameBySlug = useMemo(() => {
    const map = new Map()
    for (const s of slots || []) {
      if (s?.slug) map.set(String(s.slug), String(s.name || s.slug))
    }
    return map
  }, [slots])

  useEffect(() => {
    let cancelled = false
    const startLoggerStream = async () => {
      try {
        let token = accessToken
        if (!token && window.electronAPI?.getSessionToken) {
          token = await window.electronAPI.getSessionToken()
        }
        if (!token || cancelled) return
        try {
          if (loggerBetSubRef.current?.disconnect) loggerBetSubRef.current.disconnect()
        } catch (_) {}
        loggerBetSubRef.current = await subscribeToBetUpdates(token, (b) => {
          const ts = Date.parse(String(b?.receivedAt || ''))
          recentLoggerBetsRef.current = [
            {
              gameSlug: String(b?.gameSlug || '').toLowerCase(),
              gameName: String(b?.gameName || '').toLowerCase(),
              amount: Number(b?.amount ?? 0),
              payout: Number(b?.payout ?? 0),
              payoutMultiplier: Number(b?.payoutMultiplier ?? 0),
              currency: String(b?.currency || '').toLowerCase(),
              ts: Number.isFinite(ts) ? ts : Date.now(),
            },
            ...recentLoggerBetsRef.current,
          ].slice(0, 500)
          const hasPendingOpenings = Object.values(latestBonusOpeningResultsRef.current || {}).some(
            (entry) => entry?.status === 'opened' || entry?.status === 'closed_pending'
          )
          if (hasPendingOpenings) setLoggerUpdateSignal((n) => n + 1)
        })
      } catch (_) {
        // Ignore background logger stream errors for Bonus Hunt panel.
      }
    }
    void startLoggerStream()
    return () => {
      cancelled = true
      try {
        if (loggerBetSubRef.current?.disconnect) loggerBetSubRef.current.disconnect()
      } catch (_) {}
      loggerBetSubRef.current = null
    }
  }, [accessToken])

  const clearResolveTimer = useCallback((slotSlug) => {
    const t = bonusResolveTimersRef.current.get(slotSlug)
    if (t) {
      clearTimeout(t)
      bonusResolveTimersRef.current.delete(slotSlug)
    }
  }, [])

  const findResolvedBonusForSlot = useCallback((slotSlug, openingMeta = null) => {
    if (!slotSlug) return null
    const latest = [...latestBetHistoryRef.current]
      .reverse()
      .find((b) => b?.slotSlug === slotSlug && b?.isBonus && b?.stoppedBonus)
    if (latest) {
      const payoutMinor = Number(latest.winAmount ?? 0)
      const wagerMinor = Number(latest.betAmount ?? 0)
      if (Number.isFinite(payoutMinor) && payoutMinor > 0 && Number.isFinite(wagerMinor) && wagerMinor > 0) {
        return {
          payoutMinor,
          wagerMinor,
          multiplier: payoutMinor / wagerMinor,
        }
      }
    }

    // Resolve opened bonus rounds from the same stream used by the Game Logger.
    const openedTs = Date.parse(String(openingMeta?.openedAt || ''))
    const closedTs = Date.parse(String(openingMeta?.closedAt || ''))
    const now = Date.now()
    const fromTs = Number.isFinite(openedTs) ? openedTs - 15000 : now - 10 * 60 * 1000
    const toTs = Number.isFinite(closedTs) ? closedTs + 120000 : now + 120000
    const slotName = String(openingMeta?.slotName || slotNameBySlug.get(slotSlug) || slotSlug)
    const slotNameNorm = normalizeNameToken(slotName)
    const candidates = recentLoggerBetsRef.current
      .filter((lb) => {
        if (slotMatchesGame(slotSlug, lb?.gameSlug)) return true
        const gameNameNorm = normalizeNameToken(lb?.gameName || '')
        if (!slotNameNorm || !gameNameNorm) return false
        return (
          gameNameNorm === slotNameNorm ||
          gameNameNorm.includes(slotNameNorm) ||
          slotNameNorm.includes(gameNameNorm)
        )
      })
      .filter((lb) => {
        const ts = Number(lb?.ts || 0)
        if (!Number.isFinite(ts) || ts <= 0) return true
        return ts >= fromTs && ts <= toTs
      })
      .map((lb) => {
        const curr = String(lb?.currency || targetCurrency || sourceCurrency || 'usdc').toLowerCase()
        const amountMajor = Number(lb?.amount || 0)
        const payoutMajor = Number(lb?.payout || 0)
        const payoutMultiplier = Number(lb?.payoutMultiplier || 0)
        const wagerMinor = amountMajor > 0 ? toMinor(amountMajor, curr) : 0
        let payoutMinor = payoutMajor > 0 ? toMinor(payoutMajor, curr) : 0
        if (payoutMinor <= 0 && wagerMinor > 0 && Number.isFinite(payoutMultiplier) && payoutMultiplier > 0) {
          payoutMinor = Math.round(wagerMinor * payoutMultiplier)
        }
        const multiplier = wagerMinor > 0
          ? (Number.isFinite(payoutMultiplier) && payoutMultiplier > 0 ? payoutMultiplier : payoutMinor / wagerMinor)
          : 0
        return {
          payoutMinor,
          wagerMinor,
          multiplier,
          ts: Number(lb?.ts || 0),
        }
      })
      .filter((x) => x.payoutMinor > 0)
      .sort((a, b) => {
        const byTs = (Number(b.ts) || 0) - (Number(a.ts) || 0)
        if (byTs !== 0) return byTs
        return Number(b.payoutMinor || 0) - Number(a.payoutMinor || 0)
      })
    if (candidates.length > 0) {
      const best = candidates[0]
      const wagerMinor = best.wagerMinor > 0 ? best.wagerMinor : Number(latest?.betAmount || 0)
      return {
        payoutMinor: best.payoutMinor,
        wagerMinor,
        multiplier: best.multiplier > 0 ? best.multiplier : (wagerMinor > 0 ? best.payoutMinor / wagerMinor : 0),
      }
    }
    return null
  }, [slotMatchesGame, slotNameBySlug, sourceCurrency, targetCurrency])

  const findResolvedBonusFromPersistedLogger = useCallback(async (slotSlug, openingMeta = null) => {
    if (!slotSlug || !window.electronAPI?.loadLoggerBetLogs) return null
    try {
      const openedTs = Date.parse(String(openingMeta?.openedAt || ''))
      const closedTs = Date.parse(String(openingMeta?.closedAt || ''))
      const now = Date.now()
      const fromTs = Number.isFinite(openedTs) ? openedTs - 15000 : now - 20 * 60 * 1000
      const toTs = Number.isFinite(closedTs) ? closedTs + 240000 : now + 240000
      const slotName = String(openingMeta?.slotName || slotNameBySlug.get(slotSlug) || slotSlug)
      const slotNameNorm = normalizeNameToken(slotName)

      const rows = await window.electronAPI.loadLoggerBetLogs({ limit: 1000 })
      if (!Array.isArray(rows) || rows.length === 0) return null

      const candidates = rows
        .map((row) => {
          const ts = Date.parse(String(row?.receivedAt || row?.createdAt || row?.timestamp || ''))
          return { row, ts: Number.isFinite(ts) ? ts : 0 }
        })
        .filter(({ row, ts }) => {
          if (ts > 0 && (ts < fromTs || ts > toTs)) return false
          const rowSlug = row?.gameSlug
          if (slotMatchesGame(slotSlug, rowSlug)) return true
          const gameNameNorm = normalizeNameToken(row?.gameName || row?.slotName || '')
          if (!slotNameNorm || !gameNameNorm) return false
          return (
            gameNameNorm === slotNameNorm ||
            gameNameNorm.includes(slotNameNorm) ||
            slotNameNorm.includes(gameNameNorm)
          )
        })
        .map(({ row, ts }) => {
          const curr = String(row?.currency || targetCurrency || sourceCurrency || 'usdc').toLowerCase()
          const amountMajor = Number(row?.amount || 0)
          const payoutMajor = Number(row?.payout || 0)
          const payoutMultiplier = Number(row?.payoutMultiplier || 0)
          const wagerMinor = amountMajor > 0 ? toMinor(amountMajor, curr) : 0
          let payoutMinor = payoutMajor > 0 ? toMinor(payoutMajor, curr) : 0
          if (payoutMinor <= 0 && wagerMinor > 0 && Number.isFinite(payoutMultiplier) && payoutMultiplier > 0) {
            payoutMinor = Math.round(wagerMinor * payoutMultiplier)
          }
          const multiplier = wagerMinor > 0
            ? (Number.isFinite(payoutMultiplier) && payoutMultiplier > 0 ? payoutMultiplier : payoutMinor / wagerMinor)
            : 0
          return { payoutMinor, wagerMinor, multiplier, ts }
        })
        .filter((c) => Number(c.payoutMinor) > 0)
        .sort((a, b) => {
          const byTs = (Number(b.ts) || 0) - (Number(a.ts) || 0)
          if (byTs !== 0) return byTs
          return Number(b.payoutMinor || 0) - Number(a.payoutMinor || 0)
        })
      if (candidates.length === 0) return null
      return candidates[0]
    } catch (_) {
      return null
    }
  }, [slotMatchesGame, slotNameBySlug, sourceCurrency, targetCurrency])

  const applyResolvedOpening = useCallback((slotSlug, resolved) => {
    if (!slotSlug || !resolved) return false
    clearResolveTimer(slotSlug)
    setBonusOpeningResults((prev) => {
      const current = prev[slotSlug] || { slotSlug }
      return {
        ...prev,
        [slotSlug]: {
          ...current,
          status: 'resolved',
          payoutMinor: resolved.payoutMinor,
          wagerMinor: resolved.wagerMinor,
          multiplier: resolved.multiplier,
          resolvedAt: new Date().toISOString(),
        },
      }
    })
    return true
  }, [clearResolveTimer])

  const tryResolveOpeningResult = useCallback(async (slotSlug, openingMeta = null, retry = 0, maxRetry = 18) => {
    if (!slotSlug) return false
    const resolved = findResolvedBonusForSlot(slotSlug, openingMeta)
    if (resolved) {
      return applyResolvedOpening(slotSlug, resolved)
    }
    if (retry === 0 || retry % 3 === 0) {
      const persisted = await findResolvedBonusFromPersistedLogger(slotSlug, openingMeta)
      if (persisted) return applyResolvedOpening(slotSlug, persisted)
    }
    if (retry >= maxRetry) return false
    clearResolveTimer(slotSlug)
    const timeout = setTimeout(() => {
      void tryResolveOpeningResult(slotSlug, openingMeta, retry + 1, maxRetry)
    }, 900)
    bonusResolveTimersRef.current.set(slotSlug, timeout)
    return false
  }, [applyResolvedOpening, clearResolveTimer, findResolvedBonusForSlot, findResolvedBonusFromPersistedLogger])

  const openBonusGamePopup = useCallback(async (slot, trigger = 'manual') => {
    if (!slot?.slug) return
    const slug = slot.slug
    const slotName = slot.name || slot.slug
    const openedAt = new Date().toISOString()
    setBonusOpeningResults((prev) => ({
      ...prev,
      [slug]: {
        ...(prev[slug] || {}),
        slotSlug: slug,
        slotName,
        openedAt,
        status: prev[slug]?.status === 'resolved' ? 'resolved' : 'opened',
        trigger,
      },
    }))
    if (!window.electronAPI?.openSlotPopup) return
    try {
      const res = await window.electronAPI.openSlotPopup({ slug, locale: 'en' })
      if (res?.ok && res?.popupId) {
        popupOpeningsRef.current.set(res.popupId, { slotSlug: slug, slotName, openedAt })
        setBonusOpeningResults((prev) => ({
          ...prev,
          [slug]: {
            ...(prev[slug] || {}),
            slotSlug: slug,
            slotName,
            openedAt,
            popupId: res.popupId,
            status: prev[slug]?.status === 'resolved' ? 'resolved' : 'opened',
            trigger,
          },
        }))
      }
    } catch (_) {
      // Ignore popup open errors; opening can be retried manually.
    }
  }, [])

  useEffect(() => {
    latestBetHistoryRef.current = betHistory
    latestBonusOpeningResultsRef.current = bonusOpeningResults
    const unresolved = Object.values(bonusOpeningResults).filter((entry) => entry?.status === 'closed_pending')
    if (unresolved.length === 0) return
    unresolved.forEach((entry) => {
      if (entry?.slotSlug) void tryResolveOpeningResult(entry.slotSlug, entry, 0, 18)
    })
  }, [betHistory, bonusOpeningResults, tryResolveOpeningResult])

  useEffect(() => {
    if (!loggerUpdateSignal) return
    const unresolved = Object.values(latestBonusOpeningResultsRef.current || {}).filter(
      (entry) => entry?.status === 'opened' || entry?.status === 'closed_pending'
    )
    if (unresolved.length === 0) return
    unresolved.forEach((entry) => {
      if (entry?.slotSlug) void tryResolveOpeningResult(entry.slotSlug, entry, 0, 6)
    })
  }, [loggerUpdateSignal, tryResolveOpeningResult])

  useEffect(() => {
    if (!window.electronAPI?.onSlotPopupClosed) return
    const unsub = window.electronAPI.onSlotPopupClosed((payload) => {
      const popupId = payload?.popupId
      const fromMap = popupId ? popupOpeningsRef.current.get(popupId) : null
      const slotSlug = fromMap?.slotSlug || payload?.slug
      if (!slotSlug) return
      const closedAt = payload?.closedAt || new Date().toISOString()
      setBonusOpeningResults((prev) => {
        const current = prev[slotSlug] || { slotSlug, slotName: fromMap?.slotName || slotSlug }
        if (current.status === 'resolved') return prev
        return {
          ...prev,
          [slotSlug]: {
            ...current,
            slotSlug,
            slotName: current.slotName || fromMap?.slotName || slotSlug,
            popupId: current.popupId || popupId,
            closedAt,
            status: 'closed_pending',
          },
        }
      })
      if (popupId) popupOpeningsRef.current.delete(popupId)
      void tryResolveOpeningResult(slotSlug, { ...fromMap, closedAt }, 0, 18)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [tryResolveOpeningResult])

  async function runHunt(slugsToRun = null) {
    const slugs = slugsToRun ?? selectedSlugs
    const slugsFiltered = slugs.filter((slug) => !hasBonusSlugs.has(slug))
    const toRun = slugsFiltered
      .map((slug) => slots.find((s) => s.slug === slug))
      .filter(Boolean)

    if (toRun.length === 0) {
      setError(slugsToRun ? 'No slots available to retry.' : slugs.length > 0 ? 'All selected slots already have a bonus (has bonus).' : 'Select at least one slot.')
      return
    }

    cancelRef.current = false
    setWheelOpenedSlugs(new Set())
    setLastWheelWinner(null)
    setBonusOpeningResults({})
    setIsRunning(true)
    setError('')
    setBetHistory([])
    setCurrentBalance(null)
    setCurrencyCode(null)
    pendingSpinsRef.current = []
    recentHouseBetsRef.current = []
    recentLoggerBetsRef.current = []
    popupOpeningsRef.current = new Map()
    bonusResolveTimersRef.current.forEach((t) => clearTimeout(t))
    bonusResolveTimersRef.current.clear()
    try {
      if (houseBetSubRef.current?.disconnect) houseBetSubRef.current.disconnect()
    } catch (_) {}
    houseBetSubRef.current = await subscribeToHouseBets(accessToken, (b) => {
      const gameSlug = String(b?.gameSlug || '').toLowerCase()
      const hbCurrency = (b?.currency || '').toLowerCase()
      const target = (targetCurrency || 'eur').toLowerCase()
      const source = (sourceCurrency || 'usdc').toLowerCase()
      if (hbCurrency && hbCurrency !== target && hbCurrency !== source) {
        if (BONUS_HUNT_DEBUG) console.log('[BH houseBet] skip currency', { hbCurrency, target, source })
        return
      }
      const curr = hbCurrency || target
      const rawAmount = Number(b?.amount) || 0
      const rawPayout = Number(b?.payout) ?? 0
      if (!gameSlug || rawAmount <= 0) return
      const amountAsMinor = rawAmount < 500 ? toMinor(rawAmount, curr) : rawAmount
      const pending = pendingSpinsRef.current
      const tol = (v) => Math.max(1, Math.abs(v) * 0.08)
      const targetRate = ['usd', 'usdc', 'usdt'].includes(target) ? 1 : Number(currencyRates[target] || 0)
      const toUsdFromTarget = (minor) => toUnits(minor, target) * targetRate
      const hbRate = ['usd', 'usdc', 'usdt'].includes(curr) ? 1 : Number(currencyRates[curr] || 0)
      const stakeSendsMajor = rawAmount < 500
      const amountTargetMinor =
        curr === target
          ? (stakeSendsMajor ? toMinor(rawAmount, curr) : rawAmount)
          : (() => {
              const amountUsd = stakeSendsMajor ? rawAmount * hbRate : toUnits(rawAmount, curr) * hbRate
              const targetMajor = targetRate > 0 ? amountUsd / targetRate : 0
              return toMinor(targetMajor, target)
            })()
      const rawAmountUsd = hbRate > 0 ? (rawAmount < 500 ? rawAmount * hbRate : toUnits(rawAmount, curr) * hbRate) : 0
      const amountMatches = (p) => {
        const m1 = Math.abs(p.effectiveBet - rawAmount) <= tol(rawAmount)
        const m2 = Math.abs(p.effectiveBet - amountAsMinor) <= tol(amountAsMinor)
        const m3 = p.baseBet != null && Math.abs(p.baseBet - rawAmount) <= tol(rawAmount)
        const m4 = p.baseBet != null && Math.abs(p.baseBet - amountAsMinor) <= tol(amountAsMinor)
        const effUsd = toUsdFromTarget(p.effectiveBet)
        const usdTol = (u) => Math.max(0.01, Math.abs(u) * 0.55)
        const m5 = rawAmount < 500 && hbRate > 0 && targetRate > 0 && Math.abs(effUsd - rawAmountUsd) <= usdTol(rawAmountUsd)
        const m6 = p.baseBet != null && rawAmount < 500 && hbRate > 0 && targetRate > 0 && Math.abs(toUsdFromTarget(p.baseBet) - rawAmountUsd) <= usdTol(rawAmountUsd)
        const ok = m1 || m2 || m3 || m4 || m5 || m6
        if (BONUS_HUNT_DEBUG && pending.length > 0) {
          console.log('[BH houseBet] amountMatch', { effectiveBet: p.effectiveBet, rawAmount, rawAmountUsd, effUsd, curr, target, ok, m5, m6 })
        }
        return ok
      }
      const idx = pending.findIndex(
        (p) => slotMatchesGame(p.slotSlug, gameSlug) && amountMatches(p)
      )
      if (idx >= 0) {
        const { historyId, slotSlug } = pending[idx]
        const matchedSlot = toRun.find((s) => s.slug === slotSlug)
        const isStakeEngine = matchedSlot && (matchedSlot.providerId === 'stakeEngine' || PROVIDERS_META[matchedSlot.providerId]?.aliasOf === 'stakeEngine')
        pendingSpinsRef.current = pending.filter((_, i) => i !== idx)
        // Stake Engine: RGS liefert korrekte Daten; houseBets kann Duplikate/0x erzeugen → nicht überschreiben
        if (!isStakeEngine) {
          let payoutMinor
          if (curr === target) {
            payoutMinor = stakeSendsMajor ? toMinor(rawPayout, curr) : rawPayout
          } else {
            const payoutUsd = stakeSendsMajor ? rawPayout * hbRate : toUnits(rawPayout, curr) * hbRate
            const payoutTargetMajor = targetRate > 0 ? payoutUsd / targetRate : 0
            payoutMinor = toMinor(payoutTargetMajor, target)
          }
          if (BONUS_HUNT_DEBUG) console.log('[BH houseBet] MATCH → winUpdate', { historyId, gameSlug, rawPayout, curr, target, payoutMinor })
          setBetHistory((prev) =>
            prev.map((e) => {
              if (e.id !== historyId) return e
              const existing = e.winAmount ?? 0
              if (existing > 0 && payoutMinor <= 0) return e
              return {
                ...e,
                // Source of truth: actual stake from houseBets/logger stream (handles provider-specific extra-bet differences).
                betAmount: amountTargetMinor > 0 ? amountTargetMinor : e.betAmount,
                winAmount: payoutMinor,
              }
            })
          )
        }
      } else {
        if (BONUS_HUNT_DEBUG && pending.length > 0) {
          console.log('[BH houseBet] NO MATCH → recent', {
            gameSlug,
            rawAmount,
            rawAmountUsd,
            amountAsMinor,
            curr,
            target,
            pending: pending.map((p) => ({ slot: p.slotSlug, eff: p.effectiveBet, effUsd: toUsdFromTarget(p.effectiveBet), base: p.baseBet })),
          })
        }
        recentHouseBetsRef.current = [
          { gameSlug, rawAmount, amountAsMinor, rawPayout, curr, ts: Date.now() },
          ...recentHouseBetsRef.current,
        ].slice(0, 30)
      }
    })

    setHuntState(() => {
      const next = {}
      toRun.forEach((s) => {
        next[s.slug] = { status: 'waiting', spins: 0, totalWagered: 0 }
      })
      return next
    })

    const useParallel = parallelHuntEnabled && maxParallelSlots >= 2 && toRun.length > 1
    const queue = useParallel ? [...toRun] : null

    async function runSingleSlot(slot) {
      const provider = getProvider(slot.providerId)
      if (!provider?.startSession || !provider?.placeBet) {
        setHuntState((h) => ({
          ...h,
          [slot.slug]: { ...h[slot.slug], status: 'done', spins: 0, totalWagered: 0, error: 'Provider not supported' },
        }))
        return
      }

      setHuntState((h) => ({ ...h, [slot.slug]: { ...h[slot.slug], status: 'spinning' } }))

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      let session = null
      let genericSessionRetryUsed = false
      for (let sessAttempt = 0; sessAttempt <= CLOUDFLARE_MAX_RETRIES; sessAttempt++) {
        try {
          session = await provider.startSession(accessToken, slot.slug, sourceCurrency, targetCurrency)
          break
        } catch (err) {
          if (sessAttempt < CLOUDFLARE_MAX_RETRIES && isCloudflareError(err)) {
            await new Promise((r) => setTimeout(r, CLOUDFLARE_RETRY_WAIT_MS))
            continue
          }
          if (!isCloudflareError(err) && !genericSessionRetryUsed) {
            genericSessionRetryUsed = true
            await sleep(GENERIC_RETRY_WAIT_MS)
            continue
          }
          setError(`${slot.name}: ${err?.message || 'Session failed'}`)
          setHuntState((h) => ({ ...h, [slot.slug]: { ...h[slot.slug], status: 'done', error: err?.message } }))
          return
        }
      }

      let slotSpins = 0
      let slotWagered = 0
      let gotBonus = false
      let spinsSinceRefresh = 0
      let lastBalance = session?.initialBalance ?? null
      const initialBalance = session?.initialBalance ?? lastBalance ?? 0
      let genericSpinRetryUsed = false

      while (!cancelRef.current && !gotBonus) {
        if (maxLossLimit > 0 && initialBalance != null && lastBalance != null) {
          const netLoss = initialBalance - lastBalance
          if (netLoss >= maxLossLimit) {
            setHuntState((h) => ({
              ...h,
              [slot.slug]: { status: 'done', spins: slotSpins, totalWagered: slotWagered, stoppedLoss: true },
            }))
            break
          }
        }
        if (maxSpinsPerSlot > 0 && slotSpins >= maxSpinsPerSlot) {
          setHuntState((h) => ({
            ...h,
            [slot.slug]: {
              status: 'done',
              spins: slotSpins,
              totalWagered: slotWagered,
              skipped: true,
            },
          }))
          break
        }

        try {
          if (sessionRefreshSpins > 0 && spinsSinceRefresh >= sessionRefreshSpins) {
            let genericRefreshRetryUsed = false
            for (let srAttempt = 0; srAttempt <= CLOUDFLARE_MAX_RETRIES; srAttempt++) {
              try {
                session = await provider.startSession(accessToken, slot.slug, sourceCurrency, targetCurrency)
                spinsSinceRefresh = 0
                break
              } catch (srErr) {
                if (srAttempt < CLOUDFLARE_MAX_RETRIES && isCloudflareError(srErr)) {
                  await new Promise((r) => setTimeout(r, CLOUDFLARE_RETRY_WAIT_MS))
                  continue
                }
                if (!isCloudflareError(srErr) && !genericRefreshRetryUsed) {
                  genericRefreshRetryUsed = true
                  await sleep(GENERIC_RETRY_WAIT_MS)
                  continue
                }
                throw srErr
              }
            }
          }

          const useExtraBet = extraBet && !isSlotNoExtraBet(slot.slug)
          const placeBetOpts = {
            slotSlug: slot.slug,
            skipContinueOnBonus: true,
            gambleOnBonus: gambleOption,
            ...(minScatterForStop >= 1 ? { skipContinueIfBonusMinScatter: minScatterForStop } : {}),
          }
          let result
          let usedExtraBet = useExtraBet
          let lastPlaceBetErr = null
          let genericPlaceBetRetryUsed = false
          for (let cfAttempt = 0; cfAttempt <= CLOUDFLARE_MAX_RETRIES; cfAttempt++) {
            try {
              result = await provider.placeBet(session, betAmount, useExtraBet, false, placeBetOpts)
              lastPlaceBetErr = null
              break
            } catch (err) {
              lastPlaceBetErr = err
              if (cfAttempt < CLOUDFLARE_MAX_RETRIES && isCloudflareError(err)) {
                await new Promise((r) => setTimeout(r, CLOUDFLARE_RETRY_WAIT_MS))
                continue
              }
              if (!isCloudflareError(err) && !genericPlaceBetRetryUsed) {
                genericPlaceBetRetryUsed = true
                await sleep(GENERIC_RETRY_WAIT_MS)
                continue
              }
              if (useExtraBet) {
                let noExtraOk = false
                let genericNoExtraRetryUsed = false
                for (let neAttempt = 0; neAttempt <= CLOUDFLARE_MAX_RETRIES && !noExtraOk; neAttempt++) {
                  try {
                    session = await provider.startSession(accessToken, slot.slug, sourceCurrency, targetCurrency)
                    spinsSinceRefresh = 0
                    if (session?.initialBalance != null) lastBalance = session.initialBalance
                    result = await provider.placeBet(session, betAmount, false, false, placeBetOpts)
                    addSlotNoExtraBet(slot.slug)
                    usedExtraBet = false
                    lastPlaceBetErr = null
                    noExtraOk = true
                  } catch (retryErr) {
                    if (neAttempt < CLOUDFLARE_MAX_RETRIES && isCloudflareError(retryErr)) {
                      await new Promise((r) => setTimeout(r, CLOUDFLARE_RETRY_WAIT_MS))
                      continue
                    }
                    if (!isCloudflareError(retryErr) && !genericNoExtraRetryUsed) {
                      genericNoExtraRetryUsed = true
                      await sleep(GENERIC_RETRY_WAIT_MS)
                      continue
                    }
                    setError(`${slot.name}: ${retryErr?.message || 'Spin failed'}`)
                    setHuntState((h) => ({ ...h, [slot.slug]: { ...h[slot.slug], status: 'done', error: retryErr?.message } }))
                    return
                  }
                }
                if (noExtraOk) break
              }
              throw lastPlaceBetErr
            }
          }
          if (lastPlaceBetErr) throw lastPlaceBetErr
          const { data, nextSeq, session: updatedSession, initialBonusScatter } = result
          session = updatedSession || { ...session, seq: nextSeq }
          spinsSinceRefresh += 1

          const effectiveBet = getEffectiveBetAmount(betAmount, usedExtraBet, slot.slug)
          const parsed = parseBetResponse(data, effectiveBet)
          const scatterForStat = initialBonusScatter ?? getImpliedScatterLevel(parsed, slot.slug) ?? parsed.scatterCount
          slotSpins += 1
          slotWagered += effectiveBet

          if (BONUS_HUNT_DEBUG) {
            console.log('[BH spin] parsed', {
              slot: slot.slug,
              effectiveBet,
              parsedWin: parsed.winAmount,
              parsedBalance: parsed.balance,
              currencyCode: parsed.currencyCode,
              isBonus: parsed.isBonus,
              lastAwa: data?.round?.events?.length ? data.round.events[data.round.events.length - 1]?.awa : null,
            })
          }

          saveSlotSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet: usedExtraBet, ...placeBetOpts }, response: data, skipIfFull: true })
          if (parsed.isBonus) saveBonusSpinSample({ slotSlug: slot.slug, slotName: slot.name, providerId: slot.providerId, request: { betAmount, extraBet: usedExtraBet, ...placeBetOpts }, response: data })
          if (isSaveBonusLogsEnabled() && parsed.isBonus) {
            saveBonusLog({
              slotSlug: slot.slug,
              slotName: slot.name,
              betAmount,
              effectiveBet,
              request: { betAmount, extraBet: usedExtraBet },
              response: data,
              parsed: { isBonus: parsed.isBonus, scatterCount: parsed.scatterCount, bonusFeatureId: parsed.bonusFeatureId },
            })
          }

          let winAmount = parsed.winAmount
          if (winAmount === 0 && parsed.balance != null && lastBalance != null && !useParallel) {
            winAmount = Math.max(0, parsed.balance - lastBalance + effectiveBet)
          }
          const recentHb = recentHouseBetsRef.current
          const tol = (v) => Math.max(1, Math.abs(v) * 0.02)
          const hbIdx = recentHb.findIndex((hb) => {
          if (!slotMatchesGame(slot.slug, hb.gameSlug)) return false
            const amtMinor = hb.amountAsMinor ?? hb.rawAmount
            return (
              Math.abs(effectiveBet - hb.rawAmount) <= tol(hb.rawAmount) ||
              Math.abs(effectiveBet - amtMinor) <= tol(amtMinor) ||
              Math.abs(betAmount - hb.rawAmount) <= tol(hb.rawAmount) ||
              Math.abs(betAmount - amtMinor) <= tol(amtMinor)
            )
          })
          if (hbIdx >= 0) {
            const hb = recentHb[hbIdx]
            const stakeSendsMajor = (hb.rawAmount ?? 0) < 500
            winAmount = stakeSendsMajor ? toMinor(hb.rawPayout ?? 0, hb.curr || targetCurrency) : (hb.rawPayout ?? hb.payout ?? 0)
            if (BONUS_HUNT_DEBUG) console.log('[BH spin] recentHb match → win', { parsedWin: parsed.winAmount, winFromHb: winAmount, hb: { rawPayout: hb.rawPayout, curr: hb.curr, stakeSendsMajor } })
            recentHouseBetsRef.current = recentHb.filter((_, i) => i !== hbIdx)
          }
          if (parsed.balance != null) lastBalance = parsed.balance

          if (parsed.balance != null) {
            if (BONUS_HUNT_DEBUG) {
              const curr = parsed.currencyCode || targetCurrency
              const u = toUnits(parsed.balance, curr)
              const usd = ['usd', 'usdc', 'usdt'].includes((curr || '').toLowerCase()) ? u : (currencyRates[(curr || '').toLowerCase()] || 0.001) * u
              console.log('[BH balance]', { raw: parsed.balance, curr, units: u, usdEst: usd.toFixed(2) })
            }
            setCurrentBalance(parsed.balance)
            setCurrencyCode(parsed.currencyCode)
          }

          let shouldStopOnBonus = false
          if (provider.shouldSkipBonus) {
            shouldStopOnBonus = provider.shouldSkipBonus(parsed, {
              slotSlug: slot.slug,
              skipContinueOnBonus: true,
              skipContinueIfBonusMinScatter: minScatterForStop
            })
          } else {
            const bonusMeetsScatter = minScatterForStop <= 0 ||
              (parsed.scatterCount != null && parsed.scatterCount >= minScatterForStop) ||
              (parsed.scatterCount == null && parsed.isBonus)
            shouldStopOnBonus = (parsed.shouldStopOnBonus ?? parsed.isBonus) && bonusMeetsScatter
          }

          const hitMulti = stopOnMulti && winAmount > 0 && effectiveBet > 0 && winAmount / effectiveBet >= stopOnMultiplier

          // Bei Stopp auf Bonus: Win nicht in Statistik – der Bonus wird vom User selbst gespielt
          const statWinAmount = shouldStopOnBonus ? 0 : winAmount

          const historyId = `${slot.slug}-${Date.now()}-${slotSpins}`
          pendingSpinsRef.current = [
            ...pendingSpinsRef.current,
            { slotSlug: slot.slug, effectiveBet, baseBet: betAmount, historyId },
          ]
          setBetHistory((h) => [
            ...h,
            {
              id: historyId,
              slotSlug: slot.slug,
              slotName: slot.name,
              betAmount: effectiveBet,
              winAmount: statWinAmount,
              isBonus: parsed.isBonus || (scatterForStat != null && scatterForStat >= 3),
              scatterCount: scatterForStat,
              balance: parsed.balance,
              stoppedBonus: shouldStopOnBonus,
            },
          ])

          if (lastBalance != null && (lastBalance <= 0 || lastBalance < effectiveBet)) {
            setHuntState((h) => ({
              ...h,
              [slot.slug]: {
                status: 'done',
                spins: slotSpins,
                totalWagered: slotWagered,
                balanceEmpty: true,
              },
            }))
            setError(lastBalance <= 0 ? 'Balance empty - bonus hunt stopped.' : 'Balance too low for the next bet.')
            cancelRef.current = true
            return
          }

          if (shouldStopOnBonus || hitMulti) {
            gotBonus = true
            notifyBonusHit(slot.name, slotSpins)
            setHuntState((h) => ({
              ...h,
              [slot.slug]: {
                status: 'done',
                spins: slotSpins,
                totalWagered: slotWagered,
                bonusWin: shouldStopOnBonus ? winAmount : undefined,
                multiWin: hitMulti ? winAmount : undefined,
                scatterCount: scatterForStat ?? parsed.scatterCount,
              },
            }))
          } else {
            setHuntState((h) => ({
              ...h,
              [slot.slug]: { ...h[slot.slug], spins: slotSpins, totalWagered: slotWagered },
            }))
          }
          genericSpinRetryUsed = false
        } catch (err) {
          if (!isCloudflareError(err) && !genericSpinRetryUsed) {
            genericSpinRetryUsed = true
            await sleep(GENERIC_RETRY_WAIT_MS)
            continue
          }
          setError(`${slot.name}: ${err?.message || 'Spin failed'}`)
          setHuntState((h) => ({ ...h, [slot.slug]: { ...h[slot.slug], status: 'done', error: err?.message } }))
          break
        }

        await new Promise((r) => setTimeout(r, 50))
      }
    }

    if (useParallel) {
      const runWorker = async () => {
        while (queue.length > 0 && !cancelRef.current) {
          const slot = queue.shift()
          if (!slot) break
          await runSingleSlot(slot)
        }
      }
      const workerCount = Math.min(maxParallelSlots, toRun.length)
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
    } else {
      for (const slot of toRun) {
        if (cancelRef.current) break
        await runSingleSlot(slot)
      }
    }

    setIsRunning(false)
  }

  useEffect(() => {
    return () => {
      try {
        if (houseBetSubRef.current?.disconnect) houseBetSubRef.current.disconnect()
      } catch (_) {}
      houseBetSubRef.current = null
      try {
        if (loggerBetSubRef.current?.disconnect) loggerBetSubRef.current.disconnect()
      } catch (_) {}
      loggerBetSubRef.current = null
      bonusResolveTimersRef.current.forEach((t) => clearTimeout(t))
      bonusResolveTimersRef.current.clear()
    }
  }, [])

  function stopHunt() {
    cancelRef.current = true
  }

  const statsCurrency = currencyCode || targetCurrency || sourceCurrency || 'usdc'
  const toUsd = (v, curr) => {
    const c = (curr || statsCurrency || 'usdc').toLowerCase()
    const units = toUnits(v, c)
    if (['usd', 'usdc', 'usdt'].includes(c)) return units
    const rate = c ? Number(currencyRates[c] || 0) : 0
    return rate > 0 ? units * rate : 0
  }
  const format = (v) => `$${toUsd(v, statsCurrency).toFixed(2)}`
  const formatWithUsd = (v, displayCurr) => `$${toUsd(v, displayCurr || statsCurrency).toFixed(2)}`

  const BONUS_HUNT_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('bonus_hunt_debug') === '1'

  const doneCount = Object.values(huntState).filter((h) => h?.status === 'done' && !h?.skipped && !h?.stoppedLoss && !h?.balanceEmpty && !h?.error).length
  const huntComplete = !isRunning && Object.keys(huntState).length > 0 &&
    Object.values(huntState).every((h) => h?.status === 'done')
  const completedBonusSlots = useMemo(() => {
    if (!huntComplete) return []
    return Object.keys(huntState)
      .filter((slug) => {
        const h = huntState[slug]
        return h?.status === 'done' && !h?.skipped && !h?.stoppedLoss && !h?.balanceEmpty && !h?.error
      })
      .map((slug) => slots.find((s) => s.slug === slug))
      .filter(Boolean)
  }, [huntComplete, huntState, slots])

  const wheelSlots = useMemo(() => {
    const bySlug = new Map()
    for (const s of completedBonusSlots) bySlug.set(s.slug, s)
    for (const s of selectedSlots) {
      if (hasBonusSlugs.has(s.slug) && !bySlug.has(s.slug)) bySlug.set(s.slug, s)
    }
    return Array.from(bySlug.values())
  }, [completedBonusSlots, selectedSlots, hasBonusSlugs])
  const skippedCount = Object.values(huntState).filter((h) => h?.skipped || h?.stoppedLoss).length
  const totalSpins = Object.values(huntState).reduce((s, h) => s + (h?.spins || 0), 0)
  const totalWageredFromHistory = betHistory.reduce((sum, b) => sum + (Number(b?.betAmount) || 0), 0)
  const totalWageredFromState = Object.values(huntState).reduce((s, h) => s + (h?.totalWagered || 0), 0)
  const totalWagered = totalWageredFromHistory > 0 ? totalWageredFromHistory : totalWageredFromState
  const progressRows = useMemo(() => {
    return selectedSlugs
      .map((slug) => ({ slot: slots.find((s) => s.slug === slug), state: huntState[slug] }))
      .filter(({ slot }) => slot)
  }, [selectedSlugs, slots, huntState])
  const slotWageredByHistory = useMemo(() => {
    const map = {}
    for (const b of betHistory) {
      const slug = b?.slotSlug
      if (!slug) continue
      map[slug] = (map[slug] || 0) + (Number(b?.betAmount) || 0)
    }
    return map
  }, [betHistory])
  const sliderBonusSlots = useMemo(() => {
    const source = huntComplete ? wheelSlots : selectedSlots
    return source.filter((slot) => hasBonusSlugs.has(slot.slug))
  }, [huntComplete, wheelSlots, selectedSlots, hasBonusSlugs])
  const openedBonusCount = useMemo(
    () => sliderBonusSlots.filter((slot) => wheelOpenedSlugs.has(slot.slug)).length,
    [sliderBonusSlots, wheelOpenedSlugs]
  )
  const openingEntries = useMemo(() => Object.values(bonusOpeningResults), [bonusOpeningResults])
  const resolvedOpeningEntries = useMemo(
    () => openingEntries.filter((entry) => entry?.status === 'resolved' && Number(entry?.payoutMinor) > 0),
    [openingEntries]
  )
  const openingInProgressEntries = useMemo(
    () => openingEntries.filter((entry) => entry?.status === 'opened' || entry?.status === 'closed_pending'),
    [openingEntries]
  )
  const openingTotalWinMinor = resolvedOpeningEntries.reduce((sum, entry) => sum + Number(entry.payoutMinor || 0), 0)
  const openingTotalWinUsd = toUsd(openingTotalWinMinor, statsCurrency)
  const openingCostUsd = toUsd(totalWagered, statsCurrency)
  const openingProfitUsd = openingTotalWinUsd - openingCostUsd
  const openingProfitPct = openingCostUsd > 0 ? (openingProfitUsd / openingCostUsd) * 100 : 0
  const remainingForBreakEvenUsd = Math.max(0, openingCostUsd - openingTotalWinUsd)
  const remainingBonusCount = Math.max(0, (sliderBonusSlots?.length || 0) - resolvedOpeningEntries.length)
  const avgNeedPerBonusUsd = remainingBonusCount > 0 ? remainingForBreakEvenUsd / remainingBonusCount : 0
  const avgStakeMinor = useMemo(() => {
    const openedResolvedStakes = resolvedOpeningEntries
      .map((entry) => Number(entry?.wagerMinor || 0))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (openedResolvedStakes.length > 0) {
      return openedResolvedStakes.reduce((sum, n) => sum + n, 0) / openedResolvedStakes.length
    }
    const bets = betHistory.filter((b) => Number(b?.betAmount) > 0)
    if (bets.length === 0) return Number(betAmount || 0)
    return bets.reduce((sum, b) => sum + Number(b.betAmount || 0), 0) / bets.length
  }, [betAmount, betHistory, resolvedOpeningEntries])
  const avgStakeUsd = toUsd(avgStakeMinor, statsCurrency)
  const avgNeedMultiPerBonus = avgStakeUsd > 0 ? avgNeedPerBonusUsd / avgStakeUsd : 0
  const allOpenedAndResolved = (sliderBonusSlots?.length || 0) > 0 && resolvedOpeningEntries.length >= sliderBonusSlots.length

  const getDisplayWin = (b) => {
    const win = b.winAmount ?? 0
    if (b.isBonus && b.stoppedBonus && win === 0) return 0
    return win
  }

  function handleRetrySkipped() {
    const skippedSlugs = Object.entries(huntState)
      .filter(([, h]) => h?.skipped || h?.stoppedLoss)
      .map(([slug]) => slug)
    if (skippedSlugs.length > 0) runHunt(skippedSlugs)
  }

  return (
    <div className="bonushunt-root" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {(selectedSlots.length >= 2 || (huntComplete && wheelSlots.length >= 2)) && (
        <div className="casino-card" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.25rem' }}>
          {huntComplete && <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.02em' }}>Bonus opening - choose the next bonus</div>}
          {sliderBonusSlots.length > 0 && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Opened: <span style={{ color: 'var(--accent)' }}>{openedBonusCount}</span> / {sliderBonusSlots.length}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoOpenGame}
                onChange={(e) => setAutoOpenGame(e.target.checked)}
              />
              Auto Open Game
            </label>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={!lastWheelWinner?.slug}
              onClick={() => {
                if (!lastWheelWinner?.slug) return
                void openBonusGamePopup(lastWheelWinner, 'manual')
              }}
            >
              Open Game
            </button>
            {lastWheelWinner?.name && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Current: <strong style={{ color: 'var(--text)' }}>{lastWheelWinner.name}</strong>
              </span>
            )}
          </div>
          <SlotSlider
            slots={huntComplete ? wheelSlots : selectedSlots}
            bonusSlots={huntComplete ? wheelSlots.filter(slot => hasBonusSlugs.has(slot.slug)) : selectedSlots.filter(slot => hasBonusSlugs.has(slot.slug))}
            disabled={isRunning}
            openedSlugs={wheelOpenedSlugs}
            onWinner={(slot) => {
              if (!slot?.slug) return
              setLastWheelWinner(slot)
              setWheelOpenedSlugs((prev) => new Set([...prev, slot.slug]))
              if (autoOpenGame) {
                void openBonusGamePopup(slot, 'auto')
              }
              if (huntComplete) {
                // Bei Bonus Opening entfernen wir ihn NICHT aus hasBonusSlugs,
                // damit er in der Liste als "Bonus" bleibt, aber als "Opened" markiert wird.
                // removeHasBonusSlug(slot.slug) // <--- ENTFERNT
                // setHasBonusSlugs(new Set(loadHasBonusSlugs())) // <--- ENTFERNT
                // Wir verlassen uns rein auf wheelOpenedSlugs für die Anzeige "OPENED".
              }
            }}
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
      <div className="casino-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
        <h3 className="casino-card-header" style={{ marginBottom: '0.75rem' }}>
          <span className="casino-card-header-accent"></span>
          Slots & Settings
        </h3>
        <div className={styles.section}>
          <span className={styles.label}>Slots (click to select)</span>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.35rem' }}>
          <select value={loadedSetId} onChange={(e) => onLoadSlotSet?.(e.target.value)} className={styles.select} style={{ width: 'auto', minWidth: 120 }} disabled={isRunning}>
            <option value="">— Load slot set —</option>
            {slotSets.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({(s.slugs || s.slots || []).length})</option>
            ))}
          </select>
          <button type="button" onClick={() => onSaveSlotSet?.()} disabled={isRunning || selectedSlugs.length === 0} className={styles.btnSecondary}>
            Save
          </button>
          {loadedSetId && (
            <button type="button" onClick={() => onDeleteSlotSet?.()} disabled={isRunning} className={styles.btnSecondary} style={{ color: 'var(--error)' }}>
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={selectAll} className={styles.btnSecondary} disabled={isRunning}>All</button>
          <button type="button" onClick={selectNone} className={styles.btnSecondary} disabled={isRunning}>None</button>
          <button type="button" onClick={handleUncheckAllBonus} className={styles.btnSecondary} style={{ color: 'var(--text)' }} disabled={isRunning}>Uncheck Bonus</button>
          <button
            type="button"
            onClick={() => {
              const names = selectedSlots.map((s) => s.name || s.slug).join('\n')
              if (names) navigator.clipboard?.writeText(names)
            }}
            className={styles.btnSecondary} style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
            disabled={isRunning || selectedSlots.length === 0}
            title="Copy names for WheelOfNames.com (one name per line)"
          >
            🎡 Copy
          </button>
        </div>
        <SlotSelectMulti
          slots={slots}
          selectedSlugs={selectedSlugs}
          onToggle={toggleSlot}
          hasBonusSlugs={hasBonusSlugs}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          disabled={isRunning}
        />
        </div>

        <div className={`${styles.section} ${styles.sectionBlock}`}>
        <span className={styles.label} style={{ marginBottom: '0.5rem' }}>Currency & Bet</span>
        <div className={styles.row} style={{ flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <select value={allowedCurrencies.some((c) => c.value === sourceCurrency) ? sourceCurrency : (allowedCurrencies[0]?.value || 'usdc')} onChange={(e) => setSourceCurrency(e.target.value)} className={styles.select} style={{ minWidth: 90, flex: 'none' }} disabled={isRunning}>
            {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
          </select>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>→</span>
          <select value={allowedCurrencies.some((c) => c.value === targetCurrency) ? targetCurrency : (allowedCurrencies[0]?.value || 'eur')} onChange={(e) => setTargetCurrency(e.target.value)} className={styles.select} style={{ minWidth: 90, flex: 'none' }} disabled={isRunning}>
            {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
          </select>
          <select value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className={styles.select} style={{ minWidth: 100, flex: 'none' }} disabled={isRunning}>
            {huntBetLevels.map((v) => <option key={v} value={v}>{formatBetLabel(v, targetCurrency)}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={extraBet} onChange={(e) => setExtraBet(e.target.checked)} disabled={isRunning} />
            Extra
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={saveBonusLogs} onChange={(e) => handleToggleBonusLogs(e.target.checked)} disabled={isRunning} />
            Bonus log
          </label>
          <button type="button" onClick={() => exportBonusLogsAsFile()} className={styles.btnSecondary} disabled={isRunning}>Export</button>
          <button type="button" onClick={() => { if (window.confirm('Delete bonus logs?')) clearBonusLogs() }} className={styles.btnSecondary} style={{ color: 'var(--error)' }} disabled={isRunning}>Delete</button>
        </div>
        <div className={styles.row} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
            Max Spins: <input type="number" min={0} value={maxSpinsPerSlot || ''} onChange={(e) => setMaxSpinsPerSlot(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0=∞" className={styles.select} style={{ width: 52 }} disabled={isRunning} title="0 = unlimited" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }} title="Stop after loss limit in selected currency">
            Loss: <input type="number" min={0} value={maxLossLimit || ''} onChange={(e) => setMaxLossLimit(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0" className={styles.select} style={{ width: 52 }} disabled={isRunning} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={stopOnMulti} onChange={(e) => setStopOnMulti(e.target.checked)} disabled={isRunning} />
            Multi <input type="number" min={2} value={stopOnMultiplier} onChange={(e) => setStopOnMultiplier(Math.max(2, parseInt(e.target.value) || 2))} className={styles.select} style={{ width: 44 }} disabled={isRunning || !stopOnMulti} />×
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }} title="Minimum scatter count to stop on bonus">
            Scatter: <select value={minScatterForStop} onChange={(e) => setMinScatterForStop(Number(e.target.value))} className={styles.select} style={{ width: 90 }} disabled={isRunning}>
              <option value={0}>Any</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }} title="Gamble when bonus triggers">
            <input type="checkbox" checked={gambleOption} onChange={(e) => setGambleOption(e.target.checked)} disabled={isRunning} />
            Gamble
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
            Refresh: <input type="number" min={0} value={sessionRefreshSpins || ''} onChange={(e) => setSessionRefreshSpins(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0" className={styles.select} style={{ width: 48 }} disabled={isRunning} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }} title="Run multiple slots in parallel">
            <input type="checkbox" checked={parallelHuntEnabled} onChange={(e) => setParallelHuntEnabled(e.target.checked)} disabled={isRunning} />
            <input type="range" min={2} value={maxParallelSlots} onChange={(e) => setMaxParallelSlots(Math.max(2, parseInt(e.target.value) || 2))} style={{ width: 80 }} disabled={isRunning || !parallelHuntEnabled} />
            <span style={{ minWidth: 16 }}>{maxParallelSlots}</span> parallel
          </label>
        </div>
        </div>

        <div className={styles.row} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          {!isRunning ? (
            <>
              <button onClick={() => runHunt()} className={styles.btn} disabled={selectedSlugs.length === 0}>
                Start bonus hunt ({selectedSlugs.length} slot{selectedSlugs.length !== 1 ? 's' : ''})
              </button>
              {skippedCount > 0 && Object.keys(huntState).length > 0 && (
                <button onClick={handleRetrySkipped} className={styles.btnSecondary}>
                  Retry ({skippedCount} remaining)
                </button>
              )}
            </>
          ) : (
            <button onClick={stopHunt} className={`${styles.btn} ${styles.btnStop}`}>
              Stop
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }} title="Console logs for balance, wins and house-bet matching">
              <input
                type="checkbox"
                checked={BONUS_HUNT_DEBUG}
                onChange={(e) => {
                  try { window.localStorage.setItem('bonus_hunt_debug', e.target.checked ? '1' : '0') } catch (_) {}
                  window.location.reload()
                }}
                style={{ marginRight: '0.25rem' }}
              />
              Debug
            </label>
            <TipMenu />
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}
      </div>

      <div className="casino-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
        <h3 className="casino-card-header" style={{ marginBottom: 0 }}>
          <span className="casino-card-header-accent"></span>
          Progress & Statistics
        </h3>
      {Object.keys(huntState).length === 0 && !isRunning && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Start a bonus hunt to see progress, balance and spins here.
        </p>
      )}
      {(currentBalance != null || isRunning) && (
        <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          <span className={styles.label}>Balance</span>
          <div className={styles.balanceBadge}>
            {currentBalance != null
              ? formatWithUsd(currentBalance, currencyCode || targetCurrency || sourceCurrency)
              : '–'}
          </div>
        </div>
      )}

      {Object.keys(huntState).length > 0 && (
        <div className={styles.progressList}>
          <div className={styles.statsTitle}>
            Progress {doneCount}/{Object.keys(huntState).length}
            {skippedCount > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
                    ({skippedCount} skipped/stopped)
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.45rem' }}>
            {progressRows.map(({ slot, state }) => {
              const opened = wheelOpenedSlugs.has(slot.slug)
              const running = state?.status === 'spinning'
              const failed = state?.status === 'done' && (state?.skipped || state?.error || state?.balanceEmpty)
              const done = state?.status === 'done' && !failed
              const marker = opened ? 'OPEN' : running ? 'RUN' : failed ? 'ERR' : done ? 'DONE' : 'WAIT'
              const markerColor = opened
                ? 'var(--accent)'
                : running
                  ? 'var(--accent)'
                  : failed
                    ? 'var(--error)'
                    : done
                      ? 'var(--success)'
                      : 'var(--text-muted)'
              return (
                <div
                  key={slot.slug}
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    background: 'color-mix(in srgb, var(--bg-elevated) 90%, rgba(var(--accent-rgb), 0.1))',
                    padding: '0.45rem 0.55rem',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: markerColor }}>{marker}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{state?.spins || 0} Spins</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={slot.name}>
                    {slot.name}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Bonus opened: <strong style={{ color: 'var(--accent)' }}>{openedBonusCount}</strong> / {sliderBonusSlots.length || 0}
            </span>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowDetailedProgress((v) => !v)}>
              {showDetailedProgress ? 'Hide details' : 'Show details'}
            </button>
          </div>

          {showDetailedProgress && progressRows.map(({ slot, state }, i, arr) => (
            <div
              key={`${slot.slug}_detail`}
              className={`${styles.progressItem} ${i === arr.length - 1 ? styles.progressItemLast : ''}`.trim()}
            >
              <span>
                {wheelOpenedSlugs.has(slot.slug) ? (
                  <span className={styles.progressOpened}>🎁 OPEN</span>
                ) : hasBonusSlugs.has(slot.slug) ? (
                  <span className={styles.progressCheck}>✓</span>
                ) : state?.status === 'done' && !state?.skipped && !state?.error && !state?.balanceEmpty ? (
                  <span className={styles.progressCheck}>✓</span>
                ) : state?.status === 'done' && (state?.skipped || state?.error || state?.balanceEmpty) ? (
                  <span className={styles.progressCross}>✗</span>
                ) : state?.status === 'spinning' ? (
                  <span className={styles.progressSpinning}>⟳</span>
                ) : (
                  <span className={styles.progressWait}>○</span>
                )}
              </span>
              <span style={{ flex: 1 }}>
                {slot.name}
                {state?.spins != null && state.spins > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                    ({state.spins} Spins{state.scatterCount != null ? `, ${state.scatterCount} Scatter` : ''}{(slotWageredByHistory[slot.slug] || state.totalWagered) ? `, ${format(slotWageredByHistory[slot.slug] || state.totalWagered)}` : ''})
                  </span>
                )}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, cursor: isRunning ? 'default' : 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }} title="Skip this slot in the next hunt (prevents session timeouts)">
                <input
                  type="checkbox"
                  checked={hasBonusSlugs.has(slot.slug)}
                  onChange={() => handleToggleHasBonus(slot.slug)}
                  disabled={isRunning}
                />
                has bonus
              </label>
            </div>
          ))}
        </div>
      )}

      {(openedBonusCount > 0 || openingEntries.length > 0) && (
        <div className={styles.statsCard} style={{ marginTop: '0.2rem' }}>
          <div className={styles.statsTitle} style={{ marginBottom: '0.55rem' }}>Bonus Opening Live Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))', gap: '0.4rem 0.75rem', fontSize: '0.84rem' }}>
            <span>Current total win</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--success)' }}>${openingTotalWinUsd.toFixed(2)}</span>
            <span>Profit / Loss</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: openingProfitUsd >= 0 ? 'var(--success)' : 'var(--error)' }}>
              {openingProfitUsd >= 0 ? '+' : ''}${openingProfitUsd.toFixed(2)} ({openingProfitPct >= 0 ? '+' : ''}{openingProfitPct.toFixed(1)}%)
            </span>
            <span>Break-even missing</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              ${remainingForBreakEvenUsd.toFixed(2)}
            </span>
            <span>Need avg per bonus</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {remainingBonusCount > 0 ? `${avgNeedMultiPerBonus.toFixed(1)}x / $${avgNeedPerBonusUsd.toFixed(2)}` : 'Reached'}
            </span>
          </div>

          {openingInProgressEntries.length > 0 && (
            <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Waiting for payout confirmation: {openingInProgressEntries.map((entry) => entry.slotName || entry.slotSlug).join(', ')}
            </div>
          )}

          {resolvedOpeningEntries.length > 0 && (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.55rem' }}>
              <div className={styles.statsTitle} style={{ marginBottom: '0.4rem' }}>Bonus Opening Logger</div>
              <div style={{ display: 'grid', gap: '0.3rem' }}>
                {[...resolvedOpeningEntries].slice().reverse().map((entry) => (
                  <div key={`openlog_${entry.slotSlug}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.slotName || entry.slotSlug}</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>
                      {Number(entry.multiplier || 0).toFixed(1)}x ${toUsd(entry.payoutMinor || 0, statsCurrency).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allOpenedAndResolved && (
            <div style={{ marginTop: '0.85rem', padding: '0.7rem 0.8rem', borderRadius: 'var(--radius-md)', border: `1px solid ${openingProfitUsd >= 0 ? 'var(--success)' : 'var(--error)'}`, background: openingProfitUsd >= 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,102,0.08)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: openingProfitUsd >= 0 ? 'var(--success)' : 'var(--error)' }}>
                {openingProfitUsd >= 0 ? 'Profit' : 'Loss'}: {openingProfitUsd >= 0 ? '+' : ''}${openingProfitUsd.toFixed(2)} ({openingProfitPct >= 0 ? '+' : ''}{openingProfitPct.toFixed(1)}%)
              </div>
              {remainingForBreakEvenUsd > 0 && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Still need avg {avgNeedMultiPerBonus.toFixed(1)}x / ${avgNeedPerBonusUsd.toFixed(2)} per remaining bonus to break even.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {totalSpins > 0 && (() => {
        const slotStatsMap = {}
        for (const b of betHistory) {
          const key = b.slotSlug || b.slotName
          if (!key) continue
          if (!slotStatsMap[key]) {
            slotStatsMap[key] = { slotName: b.slotName, spins: 0, wagered: 0, won: 0, maxMulti: 0 }
          }
          const st = slotStatsMap[key]
          st.spins += 1
          st.wagered += b.betAmount ?? 0
          const displayWin = getDisplayWin(b)
          st.won += displayWin
          const multi = b.betAmount > 0 ? displayWin / b.betAmount : 0
          if (multi > st.maxMulti) st.maxMulti = multi
        }
        const slotStats = Object.entries(slotStatsMap).map(([k, v]) => ({ key: k, ...v, net: v.won - v.wagered }))
        const totalWon = slotStats.reduce((s, st) => s + st.won, 0)
        const totalNetFromSpins = totalWon - totalWagered
        // Netto aus echter Balance-Änderung (Start → Ende) – korrekt auch bei gestoppten Boni
        let totalNet = totalNetFromSpins
        const firstWithBalance = betHistory.find((b) => b.balance != null)
        const lastWithBalance = betHistory.length > 0 ? betHistory[betHistory.length - 1] : null
        if (firstWithBalance && lastWithBalance?.balance != null) {
          const startBalance = firstWithBalance.balance + (firstWithBalance.betAmount ?? 0) - (getDisplayWin(firstWithBalance) ?? 0)
          const balanceNet = lastWithBalance.balance - startBalance
          totalNet = balanceNet
        }
        const roiPct = totalWagered > 0 ? ((totalNet / totalWagered) * 100).toFixed(1) : null
        const scatterDist = { 3: 0, 4: 0, 5: 0 }
        for (const b of betHistory) {
          if (b.isBonus && b.scatterCount >= 3 && b.scatterCount <= 5) {
            scatterDist[b.scatterCount] += 1
          }
        }
        const hasScatterData = scatterDist[3] + scatterDist[4] + scatterDist[5] > 0
        return (
          <div className={styles.statsCard}>
            {huntComplete && (
              <div style={{
                padding: '0.75rem',
                marginBottom: '1rem',
                background: 'var(--accent-glow)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.5rem' }}>
                  Bonus hunt complete
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  <span>
                    Net: <strong style={{ color: totalNet >= 0 ? 'var(--success)' : 'var(--error)' }}>
                      {totalNet >= 0 ? '+' : ''}{format(totalNet)}
                    </strong>
                  </span>
                  {roiPct != null && (
                    <span>
                      ROI: <strong style={{ color: parseFloat(roiPct) >= 0 ? 'var(--success)' : 'var(--error)' }}>
                        {parseFloat(roiPct) >= 0 ? '+' : ''}{roiPct}%
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className={styles.statsTitle}>Bonus Hunt Statistics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.95rem', marginBottom: slotStats.length > 1 ? '1rem' : 0 }}>
              <span>Total spins</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{totalSpins}</span>
              <span>Total wagered</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{format(totalWagered)}</span>
              <span>Total win</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--success)' }}>{format(totalWon)}</span>
              <span>Net</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: totalNet >= 0 ? 'var(--success)' : 'var(--error)' }}>
                {totalNet >= 0 ? '+' : ''}{format(totalNet)}
              </span>
              {roiPct != null && (
                <>
                  <span>ROI</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: parseFloat(roiPct) >= 0 ? 'var(--success)' : 'var(--error)' }}>
                    {parseFloat(roiPct) >= 0 ? '+' : ''}{roiPct}%
                  </span>
                </>
              )}
              {hasScatterData && (
                <>
                  <span>Scatter 3/4/5</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {scatterDist[3]} / {scatterDist[4]} / {scatterDist[5]}
                  </span>
                </>
              )}
            </div>
            {slotStats.length > 1 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                <div className={styles.statsTitle} style={{ marginBottom: '0.5rem', display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '0.5rem 1rem', paddingRight: '0.5rem' }}>
                  <span>Slot</span>
                  <span>Spins</span>
                  <span>Max ×</span>
                  <span>Wagered</span>
                  <span>Net</span>
                </div>
                {slotStats.map((st) => (
                  <div
                    key={st.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto auto',
                      gap: '0.5rem 1rem',
                      fontSize: '0.85rem',
                      padding: '0.35rem 0',
                      borderBottom: '1px solid var(--border)',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={st.slotName}>
                      {st.slotName}
                    </span>
                    <span>{st.spins}</span>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {st.maxMulti > 0 ? `${st.maxMulti.toFixed(1)}×` : '–'}
                    </span>
                    <span>{format(st.wagered)}</span>
                    <span style={{ color: st.net >= 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                      {st.net >= 0 ? '+' : ''}{format(st.net)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {betHistory.length > 0 && (() => {
        const chartColors = ['#d12b3a', '#f97316', '#fb7185', '#fbbf24', '#a78bfa', '#ef4444']
        const slotKeys = [...new Set(betHistory.map((b) => b.slotSlug || b.slotName).filter(Boolean))]
        const slotNames = {}
        betHistory.forEach((b) => {
          const k = b.slotSlug || b.slotName
          if (k) slotNames[k] = b.slotName
        })

        if (slotKeys.length === 0) return null

        const padL = 34
        const padR = 8
        const padT = 8
        const padB = 16
        const w = 268
        const h = 82
        const chartW = w - padL - padR
        const chartH = h - padT - padB

        const toChartY = (val, minV, range) => padT + chartH - ((val - minV) / range) * chartH
        const toChartX = (i, divisor) => padL + (i / divisor) * chartW

        if (slotKeys.length === 1) {
          const balances = betHistory.map((b) => b.balance).filter((v) => v != null)
          if (balances.length === 0) return null
          const inUsd = balances.map((v) => toUsd(v, statsCurrency))
          const minB = Math.min(...inUsd)
          const maxB = Math.max(...inUsd)
          const range = maxB - minB || 0.01
          const divisor = balances.length > 1 ? balances.length - 1 : 1
          const pts = balances.map((v, i) => [toChartX(i, divisor), toChartY(toUsd(v, statsCurrency), minB, range)])
          const smoothLinePath = smoothPathFromPoints(pts)
          const latestPoint = pts[pts.length - 1]
          const areaPath = pts.length >= 2
            ? `M ${pts[0][0]},${pts[0][1]} L ${pts.slice(1).map(([x, y]) => `${x},${y}`).join(' ')} L ${pts[pts.length - 1][0]},${h - padB} L ${pts[0][0]},${h - padB} Z`
            : ''
          return (
            <div className={styles.chart}>
              <div className={styles.statsTitle} style={{ marginBottom: '0.75rem', color: 'rgba(255,255,255,0.9)' }}>Balance ($) · {slotNames[slotKeys[0]] || slotKeys[0]}</div>
              <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minHeight: 82 }}>
                <defs>
                  <linearGradient id="bh-balance-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = padT + chartH * (1 - t)
                  const val = minB + t * (maxB - minB)
                  return <g key={t}><line x1={padL} x2={w - padR} y1={y} y2={y} className={styles.chartGrid} /><text x={padL - 6} y={y + 4} fontSize="10" fill="rgba(255,255,255,0.6)" textAnchor="end" fontFamily="system-ui">${val.toFixed(2)}</text></g>
                })}
                {areaPath && <path d={areaPath} fill="url(#bh-balance-fill)" />}
                {smoothLinePath && <path d={smoothLinePath} fill="none" stroke="rgba(var(--accent-rgb), 0.22)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />}
                {smoothLinePath && <path d={smoothLinePath} fill="none" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
                {latestPoint && (
                  <g>
                    <circle cx={latestPoint[0]} cy={latestPoint[1]} r="4.5" fill="rgba(var(--accent-rgb), 0.2)" />
                    <circle cx={latestPoint[0]} cy={latestPoint[1]} r="2.1" fill="var(--accent)" stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
                  </g>
                )}
              </svg>
            </div>
          )
        }

        const cumBySlot = {}
        slotKeys.forEach((k) => { cumBySlot[k] = [] })
        let cum = {}
        slotKeys.forEach((k) => { cum[k] = 0 })
        let globalIdx = 0
        for (const b of betHistory) {
          const key = b.slotSlug || b.slotName
          if (!key || !cumBySlot[key]) continue
          const net = getDisplayWin(b) - (b.betAmount ?? 0)
          cum[key] += net
          cumBySlot[key].push({ x: globalIdx, y: cum[key] })
          globalIdx += 1
        }
        const allY = Object.values(cumBySlot).flatMap((pts) => pts.map((p) => p.y))
        const inUsdY = allY.map((y) => toUsd(y, statsCurrency))
        const minV = inUsdY.length ? Math.min(0, ...inUsdY) : 0
        const maxV = inUsdY.length ? Math.max(0, ...inUsdY) : 0.01
        const range = maxV - minV || 0.01
        const divisor = globalIdx > 1 ? globalIdx - 1 : 1
        const zeroY = toChartY(0, minV, range)

        const showZero = minV < 0 && maxV > 0
        const yTicks = [0, 0.25, 0.5, 0.75, 1]
        return (
          <div className={`${styles.chart} ${styles.chartMultiSlot}`}>
            <div className={styles.statsTitle} style={{ marginBottom: '0.75rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>Cumulative net per slot ($)</div>
            <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minHeight: 82 }}>
              {yTicks.map((t) => {
                const y = padT + chartH * (1 - t)
                const val = minV + t * range
                return <g key={t}><line x1={padL} x2={w - padR} y1={y} y2={y} className={styles.chartGrid} /><text x={padL - 6} y={y + 4} fontSize="10" fill="rgba(255,255,255,0.6)" textAnchor="end" fontFamily="system-ui">${val.toFixed(2)}</text></g>
              })}
              {showZero && <line x1={padL} x2={w - padR} y1={zeroY} y2={zeroY} className={styles.chartZeroLine} />}
              {slotKeys.map((key, idx) => {
                const pts = cumBySlot[key]
                if (!pts.length) return null
                const color = chartColors[idx % chartColors.length]
                const points = pts.map((p) => {
                  const yUsd = toUsd(p.y, statsCurrency)
                  const x = toChartX(p.x, divisor)
                  const y = toChartY(yUsd, minV, range)
                  return [x, y]
                })
                const smoothLinePath = smoothPathFromPoints(points)
                const latestPoint = points[points.length - 1]
                return (
                  <g key={key}>
                    {smoothLinePath && (
                      <path
                        d={smoothLinePath}
                        fill="none"
                        stroke={`${color}55`}
                        strokeWidth="4.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {smoothLinePath && (
                      <path
                        d={smoothLinePath}
                        fill="none"
                        stroke={color}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {latestPoint && (
                      <>
                        <circle cx={latestPoint[0]} cy={latestPoint[1]} r="4.2" fill={`${color}2f`} />
                        <circle cx={latestPoint[0]} cy={latestPoint[1]} r="1.9" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
                      </>
                    )}
                  </g>
                )
              })}
            </svg>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: '1rem' }}>
              {slotKeys.map((key, idx) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.9)' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: chartColors[idx % chartColors.length], boxShadow: `0 0 8px ${chartColors[idx % chartColors.length]}80` }} />
                  {slotNames[key] || key}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {betHistory.length > 0 && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Spins ({betHistory.length})
          </summary>
          <div className={styles.chart}>
            <div className={styles.betRow} style={{ color: 'var(--text-muted)', fontSize: '0.7rem', borderBottom: '1px solid var(--border)' }}>
              <span>Slot</span>
              <span>Wagered</span>
              <span>Win</span>
              <span>Net</span>
              <span>×</span>
            </div>
            <div className={styles.betList}>
              {[...betHistory].reverse().slice(0, 30).filter((b) => (b.betAmount ?? 0) !== 0 || (b.winAmount ?? 0) !== 0).map((b) => {
                const displayWin = getDisplayWin(b)
                const net = displayWin - b.betAmount
                const mult = b.betAmount > 0 ? (displayWin / b.betAmount).toFixed(1) : '0'
                return (
                  <div
                    key={b.id}
                    className={styles.betRow} style={b.isBonus ? { background: 'rgba(255, 193, 7, 0.06)' } : undefined}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.slotName}>
                      {b.slotName}
                    </span>
                    <span>{format(b.betAmount)}</span>
                    <span style={{ color: b.winAmount > 0 ? 'var(--success)' : undefined }}>
                      {b.isBonus ? 'Bonus' : format(b.winAmount)}
                    </span>
                    <span style={{ color: net >= 0 ? 'var(--success)' : 'var(--error)' }}>
                      {b.isBonus ? '–' : `${net >= 0 ? '+' : ''}${format(net)}`}
                    </span>
                    <span style={{ color: b.winAmount > 0 ? 'var(--success)' : undefined }}>{b.isBonus ? '–' : `${mult}×`}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </details>
      )}
      </div>
      </div>
    </div>
  )
}
