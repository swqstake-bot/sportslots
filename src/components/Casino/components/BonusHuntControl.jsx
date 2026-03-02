/**
 * Bonus Hunt – mehrere Slots nacheinander spielen bis jeder Bonus bekommt.
 * Nutzt gleiche Währung/Einsatz für alle.
 */
import { useState, useRef, useEffect, useMemo } from 'react'
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
import { subscribeToBetUpdates } from '../api/stakeBalanceSubscription'
import { TipMenu } from '../../ui/TipMenu'

const HUNT_BET_LEVELS = [
  1100, 2200, 4400, 6600, 8800, 11000, 22000, 44000, 66000, 110000, 220000,
]
const CLOUDFLARE_RETRY_WAIT_MS = 5000
const CLOUDFLARE_MAX_RETRIES = 3

function isCloudflareError(err) {
  const msg = (err?.message || '').toLowerCase()
  return msg.includes('just a moment') || msg.includes('cloudflare') || msg.includes('html statt json')
}

const STYLES = {
  section: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' },
  row: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  select: {
    flex: 1,
    minWidth: 120,
    padding: '0.6rem 0.75rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: '0.9rem',
  },
  btn: {
    padding: '0.75rem 1.25rem',
    background: 'var(--accent)',
    color: 'var(--bg-deep)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnStop: { background: 'var(--error)' },
  btnSecondary: {
    padding: '0.5rem 1rem',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  progressList: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
  },
  progressItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid var(--border)',
    fontSize: '0.9rem',
  },
  progressItemLast: { borderBottom: 'none' },
  progressCheck: { color: 'var(--success)', fontSize: '1.2rem' },
  progressCross: { color: 'var(--error)', fontSize: '1.2rem' },
  progressOpened: { color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', marginRight: '0.25rem' },
  progressSpinning: { color: 'var(--accent)' },
  progressWait: { color: 'var(--text-muted)' },
  statsCard: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--text)',
  },
  statsTitle: { fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' },
  balanceBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    color: 'var(--text)',
  },
  chart: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    minHeight: 120,
    color: 'var(--text)',
  },
  chartGrid: { stroke: 'var(--border)', strokeWidth: 0.5, opacity: 0.6 },
  chartZeroLine: { stroke: 'var(--text-muted)', strokeWidth: 1, opacity: 0.5, strokeDasharray: '4 2' },
  betList: {
    marginTop: '1rem',
    maxHeight: 200,
    overflowY: 'auto',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '0.8rem',
    color: 'var(--text)',
  },
  betRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 4rem 4rem 4rem 2rem',
    gap: '0.5rem',
    padding: '0.25rem 0',
    borderBottom: '1px solid var(--border)',
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
  const [tipCopied, setTipCopied] = useState(false)
  const [showTipMenu, setShowTipMenu] = useState(false)
  const tipMenuRef = useRef(null)
  const pendingSpinsRef = useRef([])
  const recentHouseBetsRef = useRef([])
  const houseBetSubRef = useRef(null)

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
    if (!window.confirm('Möchtest du wirklich bei ALLEN Slots den "hat Bonus"-Status entfernen?')) return
    clearHasBonusSlugs()
    setHasBonusSlugs(new Set())
  }

  const handleToggleBonusLogs = (checked) => {
    setSaveBonusLogs(checked)
    setSaveBonusLogsEnabled(checked)
  }

  async function runHunt(slugsToRun = null) {
    const slugs = slugsToRun ?? selectedSlugs
    const slugsFiltered = slugs.filter((slug) => !hasBonusSlugs.has(slug))
    const toRun = slugsFiltered
      .map((slug) => slots.find((s) => s.slug === slug))
      .filter(Boolean)

    if (toRun.length === 0) {
      setError(slugsToRun ? 'Keine Slots zum Erneut versuchen.' : slugs.length > 0 ? 'Alle ausgewählten Slots haben bereits Bonus (hat Bonus).' : 'Mindestens einen Slot auswählen.')
      return
    }

    cancelRef.current = false
    setWheelOpenedSlugs(new Set())
    setIsRunning(true)
    setError('')
    setBetHistory([])
    setCurrentBalance(null)
    setCurrencyCode(null)
    pendingSpinsRef.current = []
    recentHouseBetsRef.current = []
    try {
      if (houseBetSubRef.current?.disconnect) houseBetSubRef.current.disconnect()
    } catch (_) {}
    const slotMatchesHouseBet = (slotSlug, gameSlug) =>
      !gameSlug ? false : slotSlug === gameSlug || slotSlug.endsWith('-' + gameSlug)
    houseBetSubRef.current = subscribeToBetUpdates(accessToken, (b) => {
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
      const FALLBACK_RATES = { ars: 0.001, brl: 0.17, mxn: 0.05, eur: 1.07, ltc: 95, btc: 97000, eth: 3500, doge: 0.4, bch: 450, shib: 0.00002, xrp: 0.55, trx: 0.23, sol: 220, matic: 0.4, ada: 0.5, bnb: 680 }
      const amountAsMinor = rawAmount < 500 ? toMinor(rawAmount, curr) : rawAmount
      const pending = pendingSpinsRef.current
      const tol = (v) => Math.max(1, Math.abs(v) * 0.05)
      const targetRate = (currencyRates[target] ?? FALLBACK_RATES[target]) || 0.001
      const toUsdFromTarget = (minor) => toUnits(minor, target) * targetRate
      const hbRate = ['usd', 'usdc', 'usdt'].includes(curr) ? 1 : (currencyRates[curr] ?? FALLBACK_RATES[curr] ?? 0)
      const rawAmountUsd = rawAmount < 500 ? rawAmount * (hbRate || 1) : toUnits(rawAmount, curr) * (hbRate || 1)
      const amountMatches = (p) => {
        const m1 = Math.abs(p.effectiveBet - rawAmount) <= tol(rawAmount)
        const m2 = Math.abs(p.effectiveBet - amountAsMinor) <= tol(amountAsMinor)
        const m3 = p.baseBet != null && Math.abs(p.baseBet - rawAmount) <= tol(rawAmount)
        const m4 = p.baseBet != null && Math.abs(p.baseBet - amountAsMinor) <= tol(amountAsMinor)
        const effUsd = toUsdFromTarget(p.effectiveBet)
        const m5 = rawAmount < 500 && hbRate > 0 && Math.abs(effUsd - rawAmountUsd) <= Math.max(0.005, Math.abs(rawAmountUsd) * 0.15)
        const m6 = p.baseBet != null && rawAmount < 500 && hbRate > 0 && Math.abs(toUsdFromTarget(p.baseBet) - rawAmountUsd) <= Math.max(0.005, Math.abs(rawAmountUsd) * 0.15)
        const ok = m1 || m2 || m3 || m4 || m5 || m6
        if (BONUS_HUNT_DEBUG && pending.length > 0) {
          console.log('[BH houseBet] amountMatch', { effectiveBet: p.effectiveBet, rawAmount, effUsd, ok, m5, m6 })
        }
        return ok
      }
      const idx = pending.findIndex(
        (p) => slotMatchesHouseBet(p.slotSlug, gameSlug) && amountMatches(p)
      )
      if (idx >= 0) {
        const { historyId } = pending[idx]
        const stakeSendsMajor = rawAmount < 500
        let payoutMinor
        if (curr === target) {
          payoutMinor = stakeSendsMajor ? toMinor(rawPayout, curr) : rawPayout
        } else {
          const payoutUsd = stakeSendsMajor ? rawPayout * hbRate : toUnits(rawPayout, curr) * hbRate
          const payoutTargetMajor = targetRate > 0 ? payoutUsd / targetRate : 0
          payoutMinor = toMinor(payoutTargetMajor, target)
        }
        if (BONUS_HUNT_DEBUG) console.log('[BH houseBet] MATCH → winUpdate', { historyId, gameSlug, rawPayout, curr, target, payoutMinor })
        pendingSpinsRef.current = pending.filter((_, i) => i !== idx)
        setBetHistory((prev) =>
          prev.map((e) => {
            if (e.id !== historyId) return e
            const existing = e.winAmount ?? 0
            if (existing > 0 && payoutMinor <= 0) return e
            return { ...e, winAmount: payoutMinor }
          })
        )
      } else {
        if (BONUS_HUNT_DEBUG && pending.length > 0) {
          console.log('[BH houseBet] NO MATCH → recent', {
            gameSlug,
            rawAmount,
            amountAsMinor,
            rawPayout,
            curr,
            pending: pending.map((p) => ({ slot: p.slotSlug, eff: p.effectiveBet, base: p.baseBet })),
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
          [slot.slug]: { ...h[slot.slug], status: 'done', spins: 0, totalWagered: 0, error: 'Provider nicht unterstützt' },
        }))
        return
      }

      setHuntState((h) => ({ ...h, [slot.slug]: { ...h[slot.slug], status: 'spinning' } }))

      let session = null
      for (let sessAttempt = 0; sessAttempt <= CLOUDFLARE_MAX_RETRIES; sessAttempt++) {
        try {
          session = await provider.startSession(accessToken, slot.slug, sourceCurrency, targetCurrency)
          break
        } catch (err) {
          if (sessAttempt < CLOUDFLARE_MAX_RETRIES && isCloudflareError(err)) {
            await new Promise((r) => setTimeout(r, CLOUDFLARE_RETRY_WAIT_MS))
            continue
          }
          setError(`${slot.name}: ${err?.message || 'Session fehlgeschlagen'}`)
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
              if (useExtraBet) {
                let noExtraOk = false
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
            if (!slotMatchesHouseBet(slot.slug, hb.gameSlug)) return false
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
              winAmount,
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
            setError(lastBalance <= 0 ? 'Balance leer – Bonus Hunt gestoppt.' : 'Balance zu niedrig für weiteren Einsatz.')
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
        } catch (err) {
          setError(`${slot.name}: ${err?.message || 'Spin fehlgeschlagen'}`)
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
    }
  }, [])

  function stopHunt() {
    cancelRef.current = true
  }

  const statsCurrency = currencyCode || targetCurrency || sourceCurrency || 'usdc'
  const FALLBACK_USD_RATES = { ars: 0.001, brl: 0.17, mxn: 0.05, clp: 0.001, inr: 0.012, idr: 0.000063, php: 0.017, pkr: 0.0036, pln: 0.25, ngn: 0.0006, cny: 0.14, krw: 0.00075, jpy: 0.0067, vnd: 0.00004, eur: 1.07, aud: 0.65, cad: 0.72, gbp: 1.27, dkk: 0.14, pen: 0.26, rub: 0.01, try: 0.03, ltc: 95, btc: 97000, eth: 3500, doge: 0.4, bch: 450, shib: 0.00002, xrp: 0.55, trx: 0.23, sol: 220, matic: 0.4, ada: 0.5, bnb: 680 }
  const toUsd = (v, curr) => {
    const c = (curr || statsCurrency || 'usdc').toLowerCase()
    const units = toUnits(v, c)
    if (['usd', 'usdc', 'usdt'].includes(c)) return units
    const rate = (c && currencyRates[c]) ?? (c && FALLBACK_USD_RATES[c])
    return rate != null && rate > 0 ? units * rate : units
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
  const totalWagered = Object.values(huntState).reduce((s, h) => s + (h?.totalWagered || 0), 0)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {(selectedSlots.length >= 2 || (huntComplete && wheelSlots.length >= 2)) && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          {huntComplete && <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent)' }}>Bonus Opening – Welchen Bonus als nächstes?</div>}
          <SlotSlider
            slots={huntComplete ? wheelSlots : selectedSlots}
            bonusSlots={huntComplete ? wheelSlots.filter(slot => hasBonusSlugs.has(slot.slug)) : selectedSlots.filter(slot => hasBonusSlugs.has(slot.slug))}
            disabled={isRunning}
            openedSlugs={wheelOpenedSlugs}
            onWinner={(slot) => {
              if (!slot?.slug) return
              setWheelOpenedSlugs((prev) => new Set([...prev, slot.slug]))
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, color: 'var(--text)' }}>
        <div style={STYLES.section}>
          <span style={STYLES.label}>Slots für Bonus Hunt (anklicken zum Auswählen)</span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem' }}>
          <select
            value={loadedSetId}
            onChange={(e) => onLoadSlotSet?.(e.target.value)}
            style={{ ...STYLES.select, width: 'auto', minWidth: 140 }}
            disabled={isRunning}
          >
            <option value="">— Slot-Set laden —</option>
            {slotSets.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({(s.slugs || s.slots || []).length})</option>
            ))}
          </select>
          <button type="button" onClick={() => onSaveSlotSet?.()} disabled={isRunning || selectedSlugs.length === 0} style={STYLES.btnSecondary}>
            Speichern
          </button>
          {loadedSetId && (
            <button type="button" onClick={() => onDeleteSlotSet?.()} disabled={isRunning} style={{ ...STYLES.btnSecondary, color: 'var(--error)' }}>
              Löschen
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={selectAll} style={STYLES.btnSecondary} disabled={isRunning}>Alle</button>
          <button type="button" onClick={selectNone} style={STYLES.btnSecondary} disabled={isRunning}>Keine</button>
          <button type="button" onClick={handleUncheckAllBonus} style={{ ...STYLES.btnSecondary, color: 'var(--text)' }} disabled={isRunning}>Uncheck Bonus</button>
          <button
            type="button"
            onClick={() => {
              const names = selectedSlots.map((s) => s.name || s.slug).join('\n')
              if (names) navigator.clipboard?.writeText(names)
            }}
            style={{ ...STYLES.btnSecondary, padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
            disabled={isRunning || selectedSlots.length === 0}
            title="Namen für WheelOfNames.com kopieren (ein Name pro Zeile)"
          >
            🎡 Copy
          </button>
        </div>
        <SlotSelectMulti
          slots={slots}
          selectedSlugs={selectedSlugs}
          onToggle={toggleSlot}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
          disabled={isRunning}
        />
        </div>

        <div style={STYLES.section}>
        <div style={{ marginBottom: '0.35rem' }}>
          <span style={{ ...STYLES.label, marginBottom: 0 }}>Währung & Einsatz (für alle Slots)</span>
        </div>
        <div style={STYLES.row}>
          <select
            value={allowedCurrencies.some((c) => c.value === sourceCurrency) ? sourceCurrency : (allowedCurrencies[0]?.value || 'usdc')}
            onChange={(e) => setSourceCurrency(e.target.value)}
            style={STYLES.select}
            disabled={isRunning}
          >
            {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
          </select>
          <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>→</span>
          <select
            value={allowedCurrencies.some((c) => c.value === targetCurrency) ? targetCurrency : (allowedCurrencies[0]?.value || 'eur')}
            onChange={(e) => setTargetCurrency(e.target.value)}
            style={STYLES.select}
            disabled={isRunning}
          >
            {cryptoOpts.length > 0 && <optgroup label="Crypto">{cryptoOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
            {fiatOpts.length > 0 && <optgroup label="Fiat">{fiatOpts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>}
          </select>
        </div>
        <div style={{ ...STYLES.row, marginTop: '0.5rem' }}>
          <select
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
            style={STYLES.select}
            disabled={isRunning}
          >
            {huntBetLevels.map((v) => (
              <option key={v} value={v}>
                {formatBetLabel(v, targetCurrency)}
              </option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={extraBet}
              onChange={(e) => setExtraBet(e.target.checked)}
              disabled={isRunning}
            />
            Extra Bet (mod_bonus)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={saveBonusLogs}
              onChange={(e) => handleToggleBonusLogs(e.target.checked)}
              disabled={isRunning}
            />
            Bonus-API-Log
          </label>
          <button
            type="button"
            onClick={() => exportBonusLogsAsFile()}
            style={STYLES.btnSecondary}
            disabled={isRunning}
          >
            Export Logs
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Bonus-Logs wirklich löschen?')) {
                clearBonusLogs()
              }
            }}
            style={{ ...STYLES.btnSecondary, color: 'var(--error)' }}
            disabled={isRunning}
            title="Löscht alle gespeicherten Bonus-Logs"
          >
            Löschen
          </button>
        </div>
        <div style={{ ...STYLES.row, marginTop: '0.75rem', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            Max Spins pro Slot:
            <input
              type="number"
              min={0}
              max={9999}
              value={maxSpinsPerSlot || ''}
              onChange={(e) => setMaxSpinsPerSlot(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0=∞"
              style={{ ...STYLES.select, width: 70 }}
              disabled={isRunning}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} title="Stopp wenn Verlust in Währungseinheiten erreicht">
            Stopp bei Verlust:
            <input
              type="number"
              min={0}
              value={maxLossLimit || ''}
              onChange={(e) => setMaxLossLimit(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0=aus"
              style={{ ...STYLES.select, width: 70 }}
              disabled={isRunning}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={stopOnMulti}
              onChange={(e) => setStopOnMulti(e.target.checked)}
              disabled={isRunning}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
            />
            Stop on Multi
            <input
              type="number"
              min={2}
              max={1000}
              value={stopOnMultiplier}
              onChange={(e) => setStopOnMultiplier(Math.max(2, parseInt(e.target.value) || 2))}
              style={{ ...STYLES.select, width: 56 }}
              disabled={isRunning || !stopOnMulti}
            />
            ×
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} title="Hacksaw: Bei 4+ werden nur 4/5-Scatter-Boni gesammelt (Stopp). 3er-Boni werden durchgespielt und weiter gejagt. Le Cowboy: Bei 5-Scatter-Hunt wird automatisch auf 5er gambelt.">
            Stopp bei Scatter:
            <select
              value={minScatterForStop}
              onChange={(e) => setMinScatterForStop(Number(e.target.value))}
              style={{ ...STYLES.select, width: 100 }}
              disabled={isRunning}
            >
              <option value={0}>Jeder Bonus</option>
              <option value={3}>3+ Scatter</option>
              <option value={4}>4+ Scatter</option>
              <option value={5}>5 Scatter</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} title="Bei Bonus mit Gamble-Option (z.B. Bullets and Bounty): Ja = Gambeln, Nein = Collect">
            <input
              type="checkbox"
              checked={gambleOption}
              onChange={(e) => setGambleOption(e.target.checked)}
              disabled={isRunning}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
            />
            Bonus Gamble
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            Session-Refresh nach:
            <input
              type="number"
              min={0}
              max={9999}
              value={sessionRefreshSpins || ''}
              onChange={(e) => setSessionRefreshSpins(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0=nie"
              style={{ ...STYLES.select, width: 70 }}
              disabled={isRunning}
            />
            Spins
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} title="Mehrere Slots gleichzeitig huntieren (wie im SSP)">
            <input
              type="checkbox"
              checked={parallelHuntEnabled}
              onChange={(e) => setParallelHuntEnabled(e.target.checked)}
              disabled={isRunning}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
            />
            Multihunt
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="range"
                min={2}
                max={30}
                value={maxParallelSlots}
                onChange={(e) => setMaxParallelSlots(Math.min(30, Math.max(2, parseInt(e.target.value) || 2)))}
                style={{ width: 110 }}
                disabled={isRunning || !parallelHuntEnabled}
              />
              <span style={{ fontSize: '0.8rem', minWidth: 18, textAlign: 'right' }}>{maxParallelSlots}</span>
            </div>
            Slots parallel
          </label>
        </div>
        </div>

        <div style={{ ...STYLES.row, flexWrap: 'wrap', gap: '0.5rem' }}>
          {!isRunning ? (
            <>
              <button onClick={() => runHunt()} style={STYLES.btn} disabled={selectedSlugs.length === 0}>
                Bonus Hunt starten ({selectedSlugs.length} Slot{selectedSlugs.length !== 1 ? 's' : ''})
              </button>
              {skippedCount > 0 && Object.keys(huntState).length > 0 && (
                <button onClick={handleRetrySkipped} style={STYLES.btnSecondary}>
                  Erneut versuchen ({skippedCount} übrig)
                </button>
              )}
            </>
          ) : (
            <button onClick={stopHunt} style={{ ...STYLES.btn, ...STYLES.btnStop }}>
              Stoppen
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }} title="Console-Logs für Balance, Wins und HouseBet-Matching">
              <input
                type="checkbox"
                checked={BONUS_HUNT_DEBUG}
                onChange={(e) => {
                  try { window.localStorage.setItem('bonus_hunt_debug', e.target.checked ? '1' : '0') } catch (_) {}
                  window.location.reload()
                }}
                style={{ width: 14, height: 14, marginRight: '0.25rem', accentColor: 'var(--accent)' }}
              />
              Debug
            </label>
            <TipMenu />
          </div>
        </div>

        {error && <div style={STYLES.error}>{error}</div>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, color: 'var(--text)' }}>
      {Object.keys(huntState).length === 0 && !isRunning && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Starte einen Bonus Hunt, um Fortschritt, Balance und Spins hier zu sehen.
        </p>
      )}
      {(currentBalance != null || isRunning) && (
        <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          <span style={STYLES.label}>Kontostand</span>
          <div style={STYLES.balanceBadge}>
            {currentBalance != null
              ? formatWithUsd(currentBalance, currencyCode || targetCurrency || sourceCurrency)
              : '–'}
          </div>
        </div>
      )}

      {Object.keys(huntState).length > 0 && (
        <div style={STYLES.progressList}>
          <div style={STYLES.statsTitle}>
            Fortschritt {doneCount}/{Object.keys(huntState).length}
            {skippedCount > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
                ({skippedCount} noch offen)
              </span>
            )}
          </div>
          {selectedSlugs
            .map((slug) => ({ slot: slots.find((s) => s.slug === slug), state: huntState[slug] }))
            .filter(({ slot }) => slot)
            .map(({ slot, state }, i, arr) => (
              <div
                key={slot.slug}
                style={{
                  ...STYLES.progressItem,
                  ...(i === arr.length - 1 ? STYLES.progressItemLast : {}),
                }}
              >
                <span>
                  {wheelOpenedSlugs.has(slot.slug) ? (
                    <span style={STYLES.progressOpened}>🎁 OPEN</span>
                  ) : hasBonusSlugs.has(slot.slug) ? (
                    <span style={STYLES.progressCheck}>✓</span>
                  ) : state?.status === 'done' && !state?.skipped && !state?.error && !state?.balanceEmpty ? (
                    <span style={STYLES.progressCheck}>✓</span>
                  ) : state?.status === 'done' && (state?.skipped || state?.error || state?.balanceEmpty) ? (
                    <span style={STYLES.progressCross}>✗</span>
                  ) : state?.status === 'spinning' ? (
                    <span style={STYLES.progressSpinning}>⟳</span>
                  ) : (
                    <span style={STYLES.progressWait}>○</span>
                  )}
                </span>
                <span style={{ flex: 1 }}>
                  {slot.name}
                  {state?.spins != null && state.spins > 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      ({state.spins} Spins{state.scatterCount != null ? `, ${state.scatterCount} Scatter` : ''}{state.totalWagered ? `, ${format(state.totalWagered)}` : ''})
                    </span>
                  )}
                  {state?.error && (
                    <span style={{ color: 'var(--error)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      {state.error}
                    </span>
                  )}
                  {state?.skipped && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      (Max erreicht)
                    </span>
                  )}
                  {state?.stoppedLoss && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      (Verlust-Limit)
                    </span>
                  )}
                  {state?.balanceEmpty && (
                    <span style={{ color: 'var(--error)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                      (Balance leer)
                    </span>
                  )}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, cursor: isRunning ? 'default' : 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }} title="Bei nächstem Hunt überspringen (verhindert Session-Timeouts)">
                  <input
                    type="checkbox"
                    checked={hasBonusSlugs.has(slot.slug)}
                    onChange={() => handleToggleHasBonus(slot.slug)}
                    disabled={isRunning}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  hat Bonus
                </label>
              </div>
            ))}
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
        const totalNet = totalWon - totalWagered
        const roiPct = totalWagered > 0 ? ((totalNet / totalWagered) * 100).toFixed(1) : null
        const scatterDist = { 3: 0, 4: 0, 5: 0 }
        for (const b of betHistory) {
          if (b.isBonus && b.scatterCount >= 3 && b.scatterCount <= 5) {
            scatterDist[b.scatterCount] += 1
          }
        }
        const hasScatterData = scatterDist[3] + scatterDist[4] + scatterDist[5] > 0
        return (
          <div style={STYLES.statsCard}>
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
                  Bonus Hunt abgeschlossen
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  <span>
                    Netto: <strong style={{ color: totalNet >= 0 ? 'var(--success)' : 'var(--error)' }}>
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
            <div style={STYLES.statsTitle}>Bonus Hunt Statistik</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.95rem', marginBottom: slotStats.length > 1 ? '1rem' : 0 }}>
              <span>Spins gesamt</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{totalSpins}</span>
              <span>Gesamteinsatz</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{format(totalWagered)}</span>
              <span>Gesamtgewinn</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--success)' }}>{format(totalWon)}</span>
              <span>Netto</span>
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
                <div style={{ ...STYLES.statsTitle, marginBottom: '0.5rem', display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '0.5rem 1rem', paddingRight: '0.5rem' }}>
                  <span>Slot</span>
                  <span>Spins</span>
                  <span>Max ×</span>
                  <span>Einsatz</span>
                  <span>Netto</span>
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
        const chartColors = ['var(--accent)', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
        const slotKeys = [...new Set(betHistory.map((b) => b.slotSlug || b.slotName).filter(Boolean))]
        const slotNames = {}
        betHistory.forEach((b) => {
          const k = b.slotSlug || b.slotName
          if (k) slotNames[k] = b.slotName
        })

        if (slotKeys.length === 0) return null

        const padL = 44
        const padR = 8
        const padT = 8
        const padB = 20
        const w = 320
        const h = 110
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
          const areaPath = pts.length >= 2
            ? `M ${pts[0][0]},${pts[0][1]} L ${pts.slice(1).map(([x, y]) => `${x},${y}`).join(' ')} L ${pts[pts.length - 1][0]},${h - padB} L ${pts[0][0]},${h - padB} Z`
            : ''
          return (
            <div style={STYLES.chart}>
              <div style={{ ...STYLES.statsTitle, marginBottom: '0.5rem' }}>Balance ($) · {slotNames[slotKeys[0]] || slotKeys[0]}</div>
              <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minHeight: 110 }}>
                <defs>
                  <linearGradient id="bh-balance-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <text x={padL - 4} y={padT + 4} fontSize="9" fill="var(--text-muted)" textAnchor="end">${maxB.toFixed(2)}</text>
                <text x={padL - 4} y={h - padB - 4} fontSize="9" fill="var(--text-muted)" textAnchor="end">${minB.toFixed(2)}</text>
                {[0.25, 0.5, 0.75].map((t) => padT + chartH * (1 - t)).map((y) => (
                  <line key={y} x1={padL} x2={w - padR} y1={y} y2={y} style={STYLES.chartGrid} />
                ))}
                {areaPath && <path d={areaPath} fill="url(#bh-balance-fill)" />}
                <polyline
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                />
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
        return (
          <div style={STYLES.chart}>
            <div style={{ ...STYLES.statsTitle, marginBottom: '0.5rem' }}>Kumulatives Netto pro Slot ($)</div>
            <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', minHeight: 110 }}>
              <text x={padL - 4} y={padT + 4} fontSize="9" fill="var(--text-muted)" textAnchor="end">${maxV.toFixed(2)}</text>
              {showZero && <text x={padL - 4} y={zeroY + 4} fontSize="9" fill="var(--text-muted)" textAnchor="end">$0</text>}
              <text x={padL - 4} y={h - padB - 4} fontSize="9" fill="var(--text-muted)" textAnchor="end">${minV.toFixed(2)}</text>
              {[0.25, 0.5, 0.75].map((t) => padT + chartH * (1 - t)).map((y) => (
                <line key={y} x1={padL} x2={w - padR} y1={y} y2={y} style={STYLES.chartGrid} />
              ))}
              {showZero && <line x1={padL} x2={w - padR} y1={zeroY} y2={zeroY} style={STYLES.chartZeroLine} />}
                {slotKeys.map((key, idx) => {
                  const pts = cumBySlot[key]
                  if (!pts.length) return null
                  const color = chartColors[idx % chartColors.length]
                  const points = pts
                    .map((p) => {
                      const yUsd = toUsd(p.y, statsCurrency)
                      const x = toChartX(p.x, divisor)
                      const y = toChartY(yUsd, minV, range)
                      return [x, y]
                    })
                  return (
                    <polyline
                      key={key}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                    />
                  )
                })}
              </svg>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
              {slotKeys.map((key, idx) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: 10, height: 3, background: chartColors[idx % chartColors.length], borderRadius: 2 }} />
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
          <div style={STYLES.chart}>
            <div style={{ ...STYLES.betRow, color: 'var(--text-muted)', fontSize: '0.7rem', borderBottom: '1px solid var(--border)' }}>
              <span>Slot</span>
              <span>Einsatz</span>
              <span>Gewinn</span>
              <span>Netto</span>
              <span>×</span>
            </div>
            <div style={STYLES.betList}>
              {[...betHistory].reverse().slice(0, 30).map((b) => {
                const displayWin = getDisplayWin(b)
                const net = displayWin - b.betAmount
                const mult = b.betAmount > 0 ? (displayWin / b.betAmount).toFixed(1) : '0'
                return (
                  <div
                    key={b.id}
                    style={{
                      ...STYLES.betRow,
                      ...(b.isBonus ? { background: 'rgba(255, 193, 7, 0.06)' } : {}),
                    }}
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
