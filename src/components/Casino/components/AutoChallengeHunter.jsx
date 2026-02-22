import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchChallengeList, fetchCurrencyRates } from '../api/stakeChallenges'
import { getProvider } from '../api/providers'
import { isFiat, formatAmount } from '../utils/formatAmount'
import { parseBetResponse } from '../utils/parseBetResponse'
import { Button } from './ui/Button'
import { CURRENCY_GROUPS } from '../constants/currencies'
import { notifyChallengeStart, requestNotificationPermission } from '../utils/notifications'
import { addDiscoveredFromChallenges } from '../utils/discoveredSlots'

const REFRESH_INTERVAL_MS = 2 * 60 * 1000 // 2 Minuten
const PAGE_SIZE = 24 // Stake Default
const ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']

const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  title: {
    fontSize: '1.1rem',
    fontWeight: 600,
  },
  controls: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: '1rem',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    overflowY: 'auto',
    paddingRight: '0.5rem',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '1rem',
    overflowY: 'auto',
  },
  card: {
    padding: '0.75rem',
    background: 'var(--bg-deep)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.85rem',
  },
  queueItem: {
    padding: '0.5rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  activeItem: {
    borderColor: 'var(--accent)',
    background: 'rgba(var(--accent-rgb), 0.1)',
  },
  logBox: {
    marginTop: 'auto',
    height: 150,
    overflowY: 'auto',
    background: '#000',
    color: '#0f0',
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    padding: '0.5rem',
    borderRadius: 'var(--radius-sm)',
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
  }
}

export default function AutoChallengeHunter({ accessToken, webSlots = [], onDiscoveredSlots }) {
  const [minMinBet, setMinMinBet] = useState(0.00)
  const [maxMinBet, setMaxMinBet] = useState(0.20)
  const [minPrizeUsd, setMinPrizeUsd] = useState(5.00)
  const [sourceCurrency, setSourceCurrency] = useState('xrp')
  const [targetCurrency, setTargetCurrency] = useState('pln')
  const [huntEnabled, setHuntEnabled] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [maxParallel, setMaxParallel] = useState(1)
  const [pagesToLoad, setPagesToLoad] = useState(3)
  const [stopLoss, setStopLoss] = useState(0)
  const [stopProfit, setStopProfit] = useState(0)

  const cryptoOptions = useMemo(() => CURRENCY_GROUPS.crypto, [])
  const fiatOptions = useMemo(() => CURRENCY_GROUPS.fiat, [])

  const [challenges, setChallenges] = useState([])
  const [queue, setQueue] = useState([])
  const [activeRuns, setActiveRuns] = useState({})
  const [rates, setRates] = useState({})
  const [logs, setLogs] = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)
  const [totalSessionStats, setTotalSessionStats] = useState({ wagered: 0, won: 0, lost: 0 })

  const runnersRef = useRef({})
  const processedIdsRef = useRef(new Set())
  const activeRunsRef = useRef(activeRuns)
  const totalStatsRef = useRef(totalSessionStats)

  const toUnits = useCallback((amount, currency) => {
    const c = (currency || '').toLowerCase()
    if (ZERO_DECIMAL_CURRENCIES.includes(c)) return Number(amount)
    if (isFiat(c)) return Number(amount) / 100
    return Number(amount)
  }, [])

  const toMinor = useCallback((units, currency) => {
    const c = (currency || '').toLowerCase()
    if (ZERO_DECIMAL_CURRENCIES.includes(c)) return Math.round(units)
    if (isFiat(c)) return Math.ceil(Number(units) * 100)
    return Number(units)
  }, [])

  const log = useCallback((msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100))
  }, [])

  useEffect(() => {
    totalStatsRef.current = totalSessionStats
  }, [totalSessionStats])
  
  useEffect(() => {
    activeRunsRef.current = activeRuns
  }, [activeRuns])

  const refreshChallenges = useCallback(async () => {
    if (!accessToken) return
    try {
      log('Lade Challenges & Kurse...')
      
      // Rates laden für Umrechnungen
      const newRates = await fetchCurrencyRates(accessToken)
      setRates(newRates)

      const pageCount = Math.max(1, Math.min(20, pagesToLoad))
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
          unique.push(c)
        }
      }

      log(`${unique.length} Challenges gefunden.`)
      setChallenges(unique)
      setLastRefresh(Date.now())

      // Neue Slots/Provider automatisch hinzufügen (wie im Challenge-Tab)
      const addedSlots = addDiscoveredFromChallenges(unique)
      if (addedSlots.length > 0) {
        log(`${addedSlots.length} neue Slots/Provider entdeckt: ${addedSlots.map(s => s.name).join(', ')}`)
        if (onDiscoveredSlots) onDiscoveredSlots()
      }

      let addedCount = 0
      for (const c of unique) {
        if (processedIdsRef.current.has(c.id)) continue
        if (activeRunsRef.current[c.id]?.status === 'running') continue
        
        const minBet = c.minBetUsd || 0
        const prizeUsd = getPrizeUsd(c, newRates)
        const isMinBetOk = minBet >= minMinBet && minBet <= maxMinBet
        const isPrizeOk = (prizeUsd || 0) >= minPrizeUsd
        const slot = webSlots.find((s) => s.slug === c.gameSlug)
        const eligible = isMinBetOk && isPrizeOk && !!slot && !c.completedAt && c.active !== false
        if (eligible) {
          log(`Neue Challenge gefunden: ${c.gameName} (${c.minBetUsd}$)`)
          processedIdsRef.current.add(c.id)
          setQueue(q => [...q, c.id])
          addedCount++
        } else {
          if (c.completedAt || c.active === false) processedIdsRef.current.add(c.id)
        }
      }
      
      if (addedCount > 0) log(`${addedCount} Challenges zur Queue hinzugefügt.`)

    } catch (err) {
      log(`Fehler beim Laden: ${err.message}`)
    }
  }, [accessToken, minMinBet, maxMinBet, minPrizeUsd, webSlots, pagesToLoad])

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
    const rate = currentRates[currency] || 0
    if (!rate) return 0
    return c.award * rate
  }

  const formatPrize = (c) => {
    const usd = getPrizeUsd(c)
    return `~$${usd.toFixed(2)}`
  }

  const getChallengeMeta = useCallback((c) => {
    const minBet = c.minBetUsd || 0
    const prizeUsd = getPrizeUsd(c, rates)
    const isMinBetOk = minBet >= minMinBet && minBet <= maxMinBet
    const isPrizeOk = (prizeUsd || 0) >= minPrizeUsd
    let slot = webSlots.find((s) => s.slug === c.gameSlug)
    if (!slot) {
      slot = { slug: c.gameSlug, name: c.gameName || c.gameSlug, id: c.gameSlug }
    }
    const isSlotOk = true
    const eligible = isMinBetOk && isPrizeOk && isSlotOk && !c.completedAt && c.active !== false
    return { minBet, prizeUsd, isMinBetOk, isPrizeOk, slot, isSlotOk, eligible }
  }, [minMinBet, maxMinBet, minPrizeUsd, rates, webSlots])

  const activeRunList = useMemo(() => {
    return Object.entries(activeRuns).map(([id, run]) => ({ id, ...run }))
  }, [activeRuns])

  const runningCount = activeRunList.filter(r => r.status === 'running').length

  const netUsd = totalSessionStats.won - totalSessionStats.lost

  const eligibleChallenges = useMemo(() => {
    return challenges.filter((c) => {
      if (activeRuns[c.id]?.status === 'running') return false
      const meta = getChallengeMeta(c)
      return meta.eligible
    })
  }, [challenges, activeRuns, getChallengeMeta])

  useEffect(() => {
    if (!huntEnabled || !autoStart || queue.length === 0) return
    if (runningCount >= maxParallel) return
    const nextId = queue[0]
    setQueue(q => q.slice(1))
    startChallengeRun(nextId)
  }, [huntEnabled, autoStart, queue, runningCount, maxParallel])

  useEffect(() => {
    if (!huntEnabled || !autoStart) return
    if (queue.length > 0) return
    if (runningCount >= maxParallel) return
    const toQueue = eligibleChallenges
      .map((c) => c.id)
      .filter((id) => !processedIdsRef.current.has(id))
    if (toQueue.length === 0) return
    setQueue((q) => [...q, ...toQueue])
    toQueue.forEach((id) => processedIdsRef.current.add(id))
  }, [huntEnabled, autoStart, queue.length, runningCount, maxParallel, eligibleChallenges])

  const startChallengeRun = async (challengeId) => {
    const challenge = challenges.find(c => c.id === challengeId)
    if (!challenge) {
      log(`Challenge ${challengeId} nicht mehr gefunden.`)
      return
    }

    let slot = webSlots.find(s => s.slug === challenge.gameSlug)
    if (!slot) {
      slot = { slug: challenge.gameSlug, name: challenge.gameName || challenge.gameSlug, id: challenge.gameSlug }
    }

    runnersRef.current[challengeId] = { stop: false }
    setActiveRuns(prev => ({
      ...prev,
      [challengeId]: {
        status: 'running',
        spins: 0,
        wagered: 0,
        won: 0,
        balance: 0,
        currentBet: 0,
        slotName: slot.name,
        targetMultiplier: challenge.targetMultiplier,
        startTime: Date.now(),
      },
    }))
    
    log(`Starte Challenge: ${challenge.gameName} (Ziel: ${challenge.targetMultiplier}x)`)
    notifyChallengeStart(challenge.gameName || challenge.gameSlug, challenge.targetMultiplier)

    try {
      const provider = await getProvider(slot.providerId)
      if (!provider) throw new Error(`Kein Provider für ${slot.providerId}`)

      const sCurr = sourceCurrency.toLowerCase()
      const tCurr = targetCurrency.toLowerCase()
      
      log(`Starte Session: ${sCurr.toUpperCase()} -> ${tCurr.toUpperCase()}...`)
      
      let session = await provider.startSession(accessToken, slot.slug, sCurr, tCurr)
      
      const rate = rates[tCurr] || 0
      if (!rate) throw new Error(`Kein Kurs für ${tCurr.toUpperCase()}`)
      
      let targetBetUnits = (challenge.minBetUsd / rate)
      
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
        const nextLevel = betLevels.find((lvl) => lvl >= betAmount)
        if (nextLevel != null) {
          betAmount = nextLevel
        }
      }
      
      log(`Berechneter Einsatz: ${formatAmount(betAmount, tCurr)} ${tCurr.toUpperCase()} (Min: $${challenge.minBetUsd})`)
      setActiveRuns(prev => ({
        ...prev,
        [challengeId]: { ...prev[challengeId], currentBet: betAmount },
      }))

      let stopReason = null
      let targetHit = false
      while (!runnersRef.current[challengeId]?.stop) {
        const total = totalStatsRef.current
        const net = total.won - total.lost
        if (stopLoss > 0 && total.lost >= stopLoss) {
          log(`Stop Loss erreicht: $${total.lost.toFixed(2)}`)
          runnersRef.current[challengeId].stop = true
          stopReason = 'stop_loss'
          break
        }
        if (stopProfit > 0 && net >= stopProfit) {
          log(`Stop Profit erreicht: $${net.toFixed(2)}`)
          runnersRef.current[challengeId].stop = true
          stopReason = 'stop_profit'
          break
        }

        try {
          const result = await provider.placeBet(session, betAmount, false, false)
          const { data, nextSeq, session: updatedSession } = result || {}
          session = updatedSession ? updatedSession : session ? { ...session, seq: nextSeq } : session

          const parsed = data ? parseBetResponse(data, betAmount) : { winAmount: 0, balance: null }
          const win = parsed.winAmount || 0
          const wageredUsd = toUnits(betAmount, tCurr) * rate
          const wonUsd = toUnits(win, tCurr) * rate
          const lostUsd = Math.max(0, wageredUsd - wonUsd)
          setTotalSessionStats(t => ({
            wagered: t.wagered + wageredUsd,
            won: t.won + wonUsd,
            lost: t.lost + lostUsd,
          }))
          setActiveRuns(prev => ({
            ...prev,
            [challengeId]: {
              ...prev[challengeId],
              spins: prev[challengeId].spins + 1,
              wagered: prev[challengeId].wagered + betAmount,
              won: prev[challengeId].won + win,
              balance: parsed.balance,
            },
          }))

          const multi = win / betAmount
          if (multi >= challenge.targetMultiplier) {
            log(`ZIEL ERREICHT! Multi: ${multi.toFixed(2)}x (Ziel: ${challenge.targetMultiplier}x)`)
            targetHit = true
            break
          }
          
          await new Promise(r => setTimeout(r, 800))
          
        } catch (e) {
          log(`Spin Fehler: ${e.message}`)
          await new Promise(r => setTimeout(r, 2000))
        }
      }
      
      log('Challenge beendet.')
      const status = challenge.completedAt ? 'completed' : targetHit ? 'target_hit' : (stopReason || 'stopped')
      setActiveRuns(prev => ({
        ...prev,
        [challengeId]: { ...prev[challengeId], status },
      }))

    } catch (e) {
      log(`Fehler bei Challenge Start: ${e.message}`)
      setActiveRuns(prev => ({
        ...prev,
        [challengeId]: { ...prev[challengeId], status: 'failed' },
      }))
    } finally {
      delete runnersRef.current[challengeId]
    }
  }

  const stopAllRunners = () => {
    Object.keys(runnersRef.current).forEach(id => {
      runnersRef.current[id].stop = true
    })
    log('Stoppe alle Runner...')
  }

  const resetSession = () => {
    Object.keys(runnersRef.current).forEach(id => {
      runnersRef.current[id].stop = true
    })
    runnersRef.current = {}
    processedIdsRef.current.clear()
    setQueue([])
    setActiveRuns({})
    setTotalSessionStats({ wagered: 0, won: 0, lost: 0 })
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
      refreshChallenges()
    }
  }

  const stopSingleRunner = (challengeId) => {
    if (runnersRef.current[challengeId]) {
      runnersRef.current[challengeId].stop = true
    }
  }

  const removeRun = (challengeId) => {
    if (runnersRef.current[challengeId]) {
      runnersRef.current[challengeId].stop = true
      delete runnersRef.current[challengeId]
    }
    setActiveRuns(prev => {
      const next = { ...prev }
      delete next[challengeId]
      return next
    })
    setQueue(q => q.filter(id => id !== challengeId))
    processedIdsRef.current.delete(challengeId)
  }

  const renderChallengeCard = (c, inQueue = false, metaOverride = null, showReasons = false) => {
    const meta = metaOverride || getChallengeMeta(c)
    const prize = formatPrize(c)
    const isActive = !!activeRuns[c.id]
    const inQueueLocal = queue.includes(c.id)
    const canQueue = meta.eligible && !inQueue && !inQueueLocal && !isActive
    const badges = []
    if (showReasons) {
      if (!meta.isSlotOk) badges.push('Nicht verfügbar')
      if (!meta.isMinBetOk) badges.push('MinBet Filter')
      if (!meta.isPrizeOk) badges.push('Preis Filter')
      if (c.completedAt || c.active === false) badges.push('Inaktiv')
      if (inQueueLocal) badges.push('Queue')
      if (isActive) badges.push('Aktiv')
    }
    
    return (
      <div 
        key={c.id} 
        style={inQueue ? STYLES.queueItem : STYLES.card}
        onClick={() => {
          if (!canQueue) return
          setQueue(q => [...q, c.id])
          processedIdsRef.current.add(c.id)
        }}
      >
        <div style={{fontWeight: 600, marginBottom: '0.25rem'}}>
          {c.gameName || c.gameSlug}
        </div>
        <div style={STYLES.statRow}>
          <span>Ziel: {c.targetMultiplier}x</span>
          <span style={{color: 'var(--accent)'}}>{prize}</span>
        </div>
        <div style={STYLES.statRow}>
          <span style={{color: 'var(--text-muted)'}}>Min: ${c.minBetUsd}</span>
          {!meta.isSlotOk && <span style={{color: 'var(--error)'}}>Nicht verfügbar</span>}
          {isActive && <span style={{color: 'var(--accent)'}}>Aktiv</span>}
        </div>
        {showReasons && badges.length > 0 && (
          <div style={{ ...STYLES.statRow, color: 'var(--text-muted)' }}>
            <span>{badges.join(' · ')}</span>
          </div>
        )}
        {inQueue && <Button size="small" onClick={(e) => {
          e.stopPropagation()
          setQueue(q => q.filter(id => id !== c.id))
        }}>Entfernen</Button>}
      </div>
    )
  }

  return (
    <div style={STYLES.container}>
      <div style={STYLES.header}>
        <div style={STYLES.title}>Auto Challenge Hunter</div>
        <div style={STYLES.controls}>
           <div style={{fontSize: '0.8rem', marginRight: '1rem'}}>
             {lastRefresh ? `Update: ${new Date(lastRefresh).toLocaleTimeString()}` : ''}
           </div>
           <Button onClick={clearLogs}>Logs löschen</Button>
           <Button onClick={resetSession} variant="secondary">Reset Session</Button>
           <Button onClick={refreshChallenges} disabled={!accessToken}>Reload</Button>
           <Button 
             variant={huntEnabled ? 'primary' : 'outline'} 
             onClick={() => setHuntEnabled(!huntEnabled)}
           >
             {huntEnabled ? 'Aktiv' : 'Inaktiv'}
           </Button>
           {huntEnabled && (
             <Button 
               variant={autoStart ? 'success' : 'outline'}
               onClick={() => setAutoStart(!autoStart)}
             >
               Auto-Start: {autoStart ? 'AN' : 'AUS'}
             </Button>
           )}
        </div>
      </div>

      <div style={STYLES.grid}>
        <div style={STYLES.sidebar}>
          <div style={STYLES.card}>
            <h3 style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}>Einstellungen</h3>
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
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Max Slots gleichzeitig</label>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={maxParallel}
                  onChange={(e) => setMaxParallel(parseInt(e.target.value, 10))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.8rem', minWidth: 16, textAlign: 'right' }}>{maxParallel}</span>
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Seiten laden</label>
              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={pagesToLoad}
                  onChange={(e) => setPagesToLoad(parseInt(e.target.value, 10))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.8rem', minWidth: 16, textAlign: 'right' }}>{pagesToLoad}</span>
              </div>
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Stop Loss (USD)</label>
              <input
                type="number"
                step="1"
                value={stopLoss}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setStopLoss(Number.isNaN(v) ? 0 : v)
                }}
                style={STYLES.input}
              />
            </div>
            <div style={STYLES.inputGroup}>
              <label style={STYLES.label}>Stop Profit (USD)</label>
              <input
                type="number"
                step="1"
                value={stopProfit}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setStopProfit(Number.isNaN(v) ? 0 : v)
                }}
                style={STYLES.input}
              />
            </div>
          </div>

          <div style={{...STYLES.card, flex: 1, display: 'flex', flexDirection: 'column'}}>
            <h3 style={{fontSize: '0.9rem', marginBottom: '0.5rem'}}>Warteschlange ({queue.length})</h3>
            <div style={{overflowY: 'auto', flex: 1}}>
              {queue.map(id => {
                const c = challenges.find(ch => ch.id === id)
                return c ? renderChallengeCard(c, true) : null
              })}
              {queue.length === 0 && <div style={{color: 'var(--text-muted)', fontSize: '0.8rem'}}>Leer</div>}
            </div>
          </div>
        </div>

        <div style={STYLES.main}>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
            <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>
              Aktiv: {runningCount} / {maxParallel}
            </div>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <Button onClick={startAllRunners} variant="secondary">Alle starten</Button>
              <Button onClick={stopAllRunners} variant="danger">Alle stoppen</Button>
            </div>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem'}}>
            <div style={STYLES.card}>
              <div style={STYLES.label}>Wagered (USD)</div>
              <div style={{fontSize: '1.1rem'}}>${totalSessionStats.wagered.toFixed(2)}</div>
            </div>
            <div style={STYLES.card}>
              <div style={STYLES.label}>Gewinn (USD)</div>
              <div style={{fontSize: '1.1rem'}}>${totalSessionStats.won.toFixed(2)}</div>
            </div>
            <div style={STYLES.card}>
              <div style={STYLES.label}>Verlust (USD)</div>
              <div style={{fontSize: '1.1rem'}}>${totalSessionStats.lost.toFixed(2)}</div>
            </div>
            <div style={STYLES.card}>
              <div style={STYLES.label}>Netto (USD)</div>
              <div style={{fontSize: '1.1rem', color: netUsd >= 0 ? 'var(--success)' : 'var(--error)'}}>${netUsd.toFixed(2)}</div>
            </div>
          </div>
          <div style={{...STYLES.card, display: 'flex', flexDirection: 'column', gap: '0.35rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
              <span style={{color: 'var(--text-muted)'}}>Laufen</span>
              <span>{runningCount} / {maxParallel}</span>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
              <span style={{color: 'var(--text-muted)'}}>Queue</span>
              <span>{queue.length}</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.35rem'}}>
              {activeRunList.slice(0, 6).map((run) => (
                <span key={run.id} style={{padding: '0.15rem 0.35rem', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.7rem'}}>
                  {run.slotName}
                </span>
              ))}
              {activeRunList.length > 6 && (
                <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>+{activeRunList.length - 6}</span>
              )}
            </div>
          </div>
          {activeRunList.length === 0 ? (
            <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '2rem'}}>
              Keine aktive Challenge. <br/>
              Wähle eine aus der Liste oder aktiviere Auto-Start.
            </div>
          ) : (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem'}}>
              {activeRunList.map((run) => (
                <div key={run.id} style={STYLES.card}>
                  <div style={{fontWeight: 600, marginBottom: '0.4rem'}}>{run.slotName}</div>
                  <div style={STYLES.statRow}><span>Status</span><span>{run.status}</span></div>
                  <div style={STYLES.statRow}><span>Spins</span><span>{run.spins}</span></div>
                  <div style={STYLES.statRow}><span>Wagered</span><span>{formatAmount(run.wagered, targetCurrency)}</span></div>
                  <div style={STYLES.statRow}><span>Won</span><span>{formatAmount(run.won, targetCurrency)}</span></div>
                  <div style={STYLES.statRow}><span>Bet</span><span>{formatAmount(run.currentBet, targetCurrency)}</span></div>
                  <div style={{marginTop: '0.5rem'}}>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <Button onClick={() => stopSingleRunner(run.id)} variant="secondary">Stop</Button>
                      <Button onClick={() => removeRun(run.id)} variant="outline">Entfernen</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div style={STYLES.logBox}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      </div>

      <div style={{height: 200, overflowY: 'auto', background: 'var(--bg-elevated)', padding: '0.5rem', borderRadius: 'var(--radius-md)'}}>
        <h3 style={{fontSize: '0.9rem', marginBottom: '0.5rem', position: 'sticky', top: 0, background: 'var(--bg-elevated)'}}>
          Gefundene Challenges (Passend zum Filter)
        </h3>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
          {challenges.map((c) => {
            const meta = getChallengeMeta(c)
            return renderChallengeCard(c, false, meta, true)
          })}
        </div>
      </div>
    </div>
  )
}
