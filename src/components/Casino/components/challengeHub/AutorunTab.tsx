import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useUserStore } from '../../../../store/userStore'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import { getProvider } from '../../api/providers'
import { parseBetResponse } from '../../utils/parseBetResponse'
import { convertToUsd } from '../../../../utils/monetaryContract'
import { notify } from '../../utils/notifications'
import type { HubStatsPayload } from './hubTypes'
import { computeBetFromMinBetAndSession } from './autorunBetSizing'
import {
  createDefaultAutorunConfig,
  createEmptyRule,
  normalizeAutorunConfig,
  type AutorunConfig,
  type AutorunRule,
} from './autorunTypes'
import { loadAutorunConfigFromStorage, saveAutorunConfigToStorage } from './autorunPersistence'

const MAX_LOG_LINES = 20
const SPIN_GAP_MS = 180

type ParsedBet = {
  success: boolean
  error?: string
  netResult: number
  multiplier?: number
}

type SpinContext = {
  rule: AutorunRule
  session: unknown
  betAmount: number
  usdAt: number
  slot: { slug: string; name?: string; providerId: string }
  slotName: string
}

function getRateForCurrency(rates: Record<string, number>, code: string) {
  const c = (code || '').toLowerCase()
  if (c === 'usd' || c === 'usdc' || c === 'usdt') return 1
  return rates[c] || 0
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

export interface AutorunTabProps {
  accessToken: string
  webSlots: { slug: string; name?: string; providerId: string }[]
  onHubStatsChange?: (payload: HubStatsPayload) => void
}

export const AutorunTab = memo(function AutorunTab({ accessToken, webSlots, onHubStatsChange }: AutorunTabProps) {
  const balances = useUserStore((s) => s.balances)
  const selectedCurrency = useUserStore((s) => s.selectedCurrency)

  const [config, setConfig] = useState<AutorunConfig>(() => loadAutorunConfigFromStorage() ?? createDefaultAutorunConfig())
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [liveBalanceUsd, setLiveBalanceUsd] = useState<number | null>(null)
  const [activeRuleLabel, setActiveRuleLabel] = useState('—')
  const [activeSlotLabel, setActiveSlotLabel] = useState('—')
  const [activeBetLabel, setActiveBetLabel] = useState('—')
  const [spinsToday, setSpinsToday] = useState(0)
  const [sessionSpinCount, setSessionSpinCount] = useState(0)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [slotFilter, setSlotFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const configRef = useRef(config)
  const accessTokenRef = useRef(accessToken)
  const webSlotsRef = useRef(webSlots)
  const runningRef = useRef(false)
  const sessionRef = useRef<unknown>(null)
  const activeSlugRef = useRef<string | null>(null)
  const activeRuleIdRef = useRef<string | null>(null)
  const totalSpinsRef = useRef(0)
  const ruleSpinCountsRef = useRef<Record<string, number>>({})
  const losingStreakRef = useRef(0)
  const startTimeRef = useRef<number | null>(null)
  const spinsDayKeyRef = useRef<string>('')
  const ratesRef = useRef<Record<string, number> | null>(null)
  const spinContextRef = useRef<SpinContext | null>(null)
  const lastRuleScanAtRef = useRef(0)

  useEffect(() => {
    configRef.current = config
    accessTokenRef.current = accessToken
    webSlotsRef.current = webSlots
  }, [config, accessToken, webSlots])

  const pushLog = useCallback((msg: string) => {
    const line = `${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${msg}`
    setLogs((prev) => [...prev.slice(-(MAX_LOG_LINES - 1)), line])
  }, [])

  const stopAll = useCallback(
    (reason: string) => {
      runningRef.current = false
      setIsRunning(false)
      sessionRef.current = null
      activeSlugRef.current = null
      activeRuleIdRef.current = null
      spinContextRef.current = null
      ratesRef.current = null
      setRunStartedAt(null)
      pushLog(`Gestoppt: ${reason}`)
      notify('Autorun', reason)
      onHubStatsChange?.({
        source: 'autorun',
        queued: 0,
        running: 0,
        completed: 0,
        bestMulti: 0,
        ts: Date.now(),
      })
    },
    [onHubStatsChange, pushLog]
  )

  const walletUsd = useCallback((rates: Record<string, number>) => {
    const st = useUserStore.getState()
    const balCur = (st.selectedCurrency || 'btc').toLowerCase()
    const raw = Number(st.balances[balCur] ?? 0)
    const conv = convertToUsd(raw, balCur, 'major', rates)
    return conv.usdAmount != null && Number.isFinite(conv.usdAmount) ? conv.usdAmount : 0
  }, [])

  const checkGlobalStops = useCallback(
    (cfg: AutorunConfig, balanceUsd: number): boolean => {
      const started = startTimeRef.current
      if (started != null && cfg.stops.maxRuntimeMinutes != null) {
        const mins = (Date.now() - started) / 60000
        if (mins >= cfg.stops.maxRuntimeMinutes) {
          stopAll('Max. Laufzeit erreicht')
          return true
        }
      }
      if (cfg.stops.stopLossUsd != null && balanceUsd < cfg.stops.stopLossUsd) {
        stopAll(`Stop-Loss (< $${cfg.stops.stopLossUsd})`)
        return true
      }
      if (cfg.stops.takeProfitUsd != null && balanceUsd >= cfg.stops.takeProfitUsd) {
        stopAll(`Take-Profit (≥ $${cfg.stops.takeProfitUsd})`)
        return true
      }
      if (cfg.stops.maxTotalSpins != null && totalSpinsRef.current >= cfg.stops.maxTotalSpins) {
        stopAll('Maximale Gesamt-Spins erreicht')
        return true
      }
      if (cfg.stops.maxLosingStreak != null && losingStreakRef.current >= cfg.stops.maxLosingStreak) {
        stopAll(`Max. Verlustserie (${cfg.stops.maxLosingStreak})`)
        return true
      }
      return false
    },
    [stopAll]
  )

  /** Regeln + Session neu wählen. `true` = Autorun komplett beendet (Stop-Bedingung). */
  const runRuleScan = useCallback(async (): Promise<boolean> => {
    const cfg = configRef.current
    const token = accessTokenRef.current
    if (!token) {
      pushLog('Kein Access Token.')
      spinContextRef.current = null
      return false
    }

    let rates: Record<string, number> | null = null
    try {
      rates = await fetchCurrencyRates(token)
    } catch {
      pushLog('Währungskurse: Abruf fehlgeschlagen — erneuter Versuch…')
      spinContextRef.current = null
      return false
    }
    if (!rates || typeof rates !== 'object') {
      pushLog('Währungskurse ungültig.')
      spinContextRef.current = null
      return false
    }
    ratesRef.current = rates

    const balanceUsd = walletUsd(rates)
    setLiveBalanceUsd(balanceUsd)

    if (checkGlobalStops(cfg, balanceUsd)) return true

    const tCurr = cfg.targetCurrency
    const sCurr = cfg.sourceCurrency
    const rate = getRateForCurrency(rates, tCurr)
    if (!rate || rate <= 0) {
      pushLog(`Kein Kurs für Zielwährung ${tCurr}`)
      spinContextRef.current = null
      return false
    }

    const sortedRules = [...cfg.rules].sort((a, b) => b.thresholdUsd - a.thresholdUsd)
    let chosen: SpinContext | null = null

    for (const rule of sortedRules) {
      if (balanceUsd + 1e-9 < rule.thresholdUsd) continue
      const max = rule.maxSpins
      const done = ruleSpinCountsRef.current[rule.id] || 0
      if (max != null && done >= max) continue

      const slug = String(rule.slotSlug || '').toLowerCase()
      const slot = webSlotsRef.current.find((s) => String(s.slug).toLowerCase() === slug)
      if (!slot) {
        pushLog(`Unbekannter Slot: "${rule.slotSlug}"`)
        continue
      }

      const provider = getProvider(slot.providerId) as {
        startSession?: (t: string, sl: string, src: string, tgt: string) => Promise<unknown>
        placeBet?: (...args: unknown[]) => Promise<unknown>
      }
      if (!provider?.startSession || !provider?.placeBet) continue

      let sess = sessionRef.current
      const sameSlot = activeSlugRef.current === slug && sess != null
      if (!sameSlot) {
        try {
          sess = await provider.startSession(token, slot.slug, sCurr, tCurr)
          sessionRef.current = sess
          activeSlugRef.current = slug
          pushLog(`Session: ${slot.name || slot.slug}`)
        } catch (e) {
          pushLog(`Session ${slot.slug}: ${e instanceof Error ? e.message : String(e)}`)
          continue
        }
      }

      const { betAmount, usdAt } = computeBetFromMinBetAndSession(
        sess as { betLevels?: number[] },
        tCurr,
        rate,
        rule.betUsd
      )
      if (balanceUsd + 1e-6 < usdAt) {
        pushLog(`Zu wenig Balance für ~$${usdAt.toFixed(3)} auf ${slug} — nächste Regel`)
        continue
      }
      chosen = {
        rule,
        session: sess,
        betAmount,
        usdAt,
        slot,
        slotName: slot.name || slot.slug,
      }
      break
    }

    if (!chosen) {
      spinContextRef.current = null
      setActiveRuleLabel('Keine passende Regel')
      setActiveSlotLabel('—')
      setActiveBetLabel('—')
      return false
    }

    spinContextRef.current = chosen
    if (activeRuleIdRef.current !== chosen.rule.id) {
      activeRuleIdRef.current = chosen.rule.id
      setActiveRuleLabel(`≥ $${chosen.rule.thresholdUsd.toFixed(2)}`)
      setActiveSlotLabel(chosen.slotName)
      setActiveBetLabel(`~$${chosen.rule.betUsd.toFixed(2)}`)
    }
    return false
  }, [pushLog, walletUsd, checkGlobalStops])

  useEffect(() => {
    if (!isRunning) return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isRunning])

  useEffect(() => {
    if (!isRunning) return
    runningRef.current = true
    let cancelled = false

    const engine = async () => {
      while (!cancelled && runningRef.current) {
        const cfg = configRef.current
        const scanMs = Math.max(2000, Math.min(120_000, cfg.scanIntervalSec * 1000))
        const needRuleScan =
          spinContextRef.current == null || Date.now() - lastRuleScanAtRef.current >= scanMs

        if (needRuleScan) {
          const stopped = await runRuleScan()
          lastRuleScanAtRef.current = Date.now()
          if (stopped || !runningRef.current) return
          if (!spinContextRef.current) {
            await sleep(400)
            continue
          }
        }

        const rates = ratesRef.current
        if (!rates) {
          await sleep(500)
          continue
        }

        const ctx = spinContextRef.current!
        const balanceUsd = walletUsd(rates)
        setLiveBalanceUsd(balanceUsd)

        if (checkGlobalStops(configRef.current, balanceUsd)) return

        if (balanceUsd + 1e-9 < ctx.rule.thresholdUsd) {
          spinContextRef.current = null
          continue
        }

        const maxSp = ctx.rule.maxSpins
        const doneRule = ruleSpinCountsRef.current[ctx.rule.id] || 0
        if (maxSp != null && doneRule >= maxSp) {
          spinContextRef.current = null
          continue
        }

        const tCurr = cfg.targetCurrency
        const tgtRate = getRateForCurrency(rates, tCurr)
        if (!tgtRate || tgtRate <= 0) {
          spinContextRef.current = null
          await sleep(500)
          continue
        }

        const sized = computeBetFromMinBetAndSession(
          ctx.session as { betLevels?: number[] },
          tCurr,
          tgtRate,
          ctx.rule.betUsd
        )
        ctx.betAmount = sized.betAmount
        ctx.usdAt = sized.usdAt

        if (balanceUsd + 1e-6 < ctx.usdAt) {
          spinContextRef.current = null
          continue
        }

        const provider = getProvider(ctx.slot.providerId) as {
          placeBet?: (s: unknown, a: number, ...rest: unknown[]) => Promise<unknown>
        }

        try {
          const raw = await provider.placeBet!(ctx.session, ctx.betAmount, false, false, { slotSlug: ctx.slot.slug })
          const parsed = parseBetResponse(raw as object, ctx.betAmount) as unknown as ParsedBet
          totalSpinsRef.current += 1
          setSessionSpinCount(totalSpinsRef.current)
          ruleSpinCountsRef.current[ctx.rule.id] = (ruleSpinCountsRef.current[ctx.rule.id] || 0) + 1

          const dayKey = new Date().toDateString()
          if (spinsDayKeyRef.current !== dayKey) {
            spinsDayKeyRef.current = dayKey
            setSpinsToday(0)
          }
          setSpinsToday((prev) => prev + 1)

          if (!parsed.success) {
            pushLog(`Spin-Fehler: ${parsed.error || 'unknown'}`)
            spinContextRef.current = null
            await sleep(2000)
            continue
          }
          if (parsed.netResult < 0) losingStreakRef.current += 1
          else losingStreakRef.current = 0

          const mult =
            parsed.multiplier != null && Number.isFinite(parsed.multiplier)
              ? ` ${parsed.multiplier.toFixed(2)}x`
              : ''
          pushLog(`${ctx.slotName}  net ${parsed.netResult}${mult}`)

          if (cfg.stops.maxTotalSpins != null && totalSpinsRef.current >= cfg.stops.maxTotalSpins) {
            stopAll('Maximale Gesamt-Spins erreicht')
            return
          }
          if (cfg.stops.maxLosingStreak != null && losingStreakRef.current >= cfg.stops.maxLosingStreak) {
            stopAll(`Max. Verlustserie (${cfg.stops.maxLosingStreak})`)
            return
          }
        } catch (e) {
          pushLog(`placeBet: ${e instanceof Error ? e.message : String(e)}`)
          spinContextRef.current = null
          await sleep(2000)
          continue
        }

        await sleep(SPIN_GAP_MS)
      }
    }

    void engine()
    return () => {
      cancelled = true
    }
  }, [isRunning, runRuleScan, pushLog, stopAll, walletUsd, checkGlobalStops])

  useEffect(() => {
    const t = window.setTimeout(() => saveAutorunConfigToStorage(config), 400)
    return () => clearTimeout(t)
  }, [config])

  const runtimeLabel = useMemo(() => {
    if (!isRunning || runStartedAt == null) return '—'
    const s = Math.floor((nowTick - runStartedAt) / 1000)
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}m ${r}s`
  }, [isRunning, nowTick, runStartedAt])

  const sortedSlots = useMemo(() => {
    const q = slotFilter.trim().toLowerCase()
    const list = [...webSlots]
    list.sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug), 'de'))
    if (!q) return list
    return list.filter(
      (s) => String(s.slug).toLowerCase().includes(q) || String(s.name || '').toLowerCase().includes(q)
    )
  }, [webSlots, slotFilter])

  const handleStart = () => {
    if (!accessToken) {
      pushLog('Nicht angemeldet / kein Token.')
      return
    }
    if (!config.rules.length) {
      pushLog('Mindestens eine Regel anlegen.')
      return
    }
    const bad = config.rules.some((r) => !String(r.slotSlug || '').trim())
    if (bad) {
      pushLog('Jede Regel braucht einen Slot.')
      return
    }
    totalSpinsRef.current = 0
    ruleSpinCountsRef.current = {}
    losingStreakRef.current = 0
    sessionRef.current = null
    activeSlugRef.current = null
    activeRuleIdRef.current = null
    spinContextRef.current = null
    ratesRef.current = null
    lastRuleScanAtRef.current = 0
    const t0 = Date.now()
    startTimeRef.current = t0
    setRunStartedAt(t0)
    runningRef.current = true
    setIsRunning(true)
    setSessionSpinCount(0)
    pushLog('Autorun gestartet')
    onHubStatsChange?.({
      source: 'autorun',
      queued: 0,
      running: 1,
      completed: 0,
      bestMulti: 0,
      ts: Date.now(),
    })
  }

  const handleStop = () => {
    runningRef.current = false
    spinContextRef.current = null
    setIsRunning(false)
    setRunStartedAt(null)
    pushLog('Autorun manuell gestoppt')
    onHubStatsChange?.({
      source: 'autorun',
      queued: 0,
      running: 0,
      completed: 0,
      bestMulti: 0,
      ts: Date.now(),
    })
  }

  const updateRule = (id: string, patch: Partial<AutorunRule>) => {
    setConfig((c) => ({
      ...c,
      rules: c.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }))
  }

  const addRule = () => {
    setConfig((c) => ({ ...c, rules: [...c.rules, createEmptyRule()] }))
  }

  const deleteRule = (id: string) => {
    setConfig((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) }))
    setEditingId((e) => (e === id ? null : e))
  }

  const moveRule = (id: string, dir: -1 | 1) => {
    setConfig((c) => {
      const idx = c.rules.findIndex((r) => r.id === id)
      const j = idx + dir
      if (idx < 0 || j < 0 || j >= c.rules.length) return c
      const next = c.rules.slice()
      const t = next[idx]
      next[idx] = next[j]!
      next[j] = t!
      return { ...c, rules: next }
    })
  }

  const onDropRule = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    setConfig((c) => {
      const rules = c.rules.filter((r) => r.id !== dragId)
      const insertAt = rules.findIndex((r) => r.id === targetId)
      const dragged = c.rules.find((r) => r.id === dragId)
      if (!dragged) return c
      if (insertAt < 0) return { ...c, rules: [...rules, dragged] }
      const next = rules.slice()
      next.splice(insertAt, 0, dragged)
      return { ...c, rules: next }
    })
    setDragId(null)
  }

  const testBalanceScan = async () => {
    if (!accessToken) {
      pushLog('Kein Token für Kurs-Scan.')
      return
    }
    try {
      const rates = await fetchCurrencyRates(accessToken, { force: true })
      const balCur = selectedCurrency.toLowerCase()
      const raw = Number(balances[balCur] || 0)
      const conv = convertToUsd(raw, balCur, 'major', rates)
      const usd = conv.usdAmount != null && Number.isFinite(conv.usdAmount) ? conv.usdAmount : 0
      setLiveBalanceUsd(usd)
      pushLog(`Test: ${balCur.toUpperCase()} → ~$${usd.toFixed(4)} (Kurs ok)`)
    } catch (e) {
      pushLog(`Test fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const saveJsonFile = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'autorun-config.json'
    a.click()
    URL.revokeObjectURL(url)
    pushLog('Config exportiert.')
  }

  const onPickJsonFile = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'))
        setConfig(normalizeAutorunConfig(parsed))
        pushLog(`Config geladen: ${file.name}`)
      } catch {
        pushLog('JSON konnte nicht gelesen werden.')
      }
    }
    reader.readAsText(file)
  }

  const resetToDemo = () => {
    setConfig(createDefaultAutorunConfig())
    pushLog('Demo-Config wiederhergestellt.')
  }

  const chip = 'challenge-hub-kpi text-[11px] font-semibold tabular-nums'

  return (
    <div className="space-y-4 min-w-0">
      <div
        className="rounded-xl border p-3 flex flex-wrap gap-2 items-center"
        style={{ borderColor: 'var(--border-subtle)', background: 'color-mix(in srgb, var(--bg-deep) 88%, var(--accent) 4%)' }}
      >
        <span className={chip}>Balance ~${liveBalanceUsd != null ? liveBalanceUsd.toFixed(2) : '—'}</span>
        <span className={chip}>Regel: {activeRuleLabel}</span>
        <span className={chip}>Slot: {activeSlotLabel}</span>
        <span className={chip}>Einsatz: {activeBetLabel}</span>
        <span className={chip}>Laufzeit: {runtimeLabel}</span>
        <span className={chip}>Spins (heute): {spinsToday}</span>
        <span className={chip}>Gesamt (Lauf): {isRunning ? sessionSpinCount : 0}</span>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Regeln (Reihenfolge = Priorität bei gleichem Match)</h3>
          <button type="button" className="challenge-hub-action" onClick={addRule} disabled={isRunning}>
            + Regel
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Höchster passender Schwellenwert gewinnt. Per Drag &amp; Drop sortieren. Unbekannte Slugs werden übersprungen.
        </p>

        <div className="space-y-2">
          {config.rules.map((rule, index) => {
            const expanded = editingId === rule.id
            return (
              <div
                key={rule.id}
                draggable={!isRunning}
                onDragStart={() => setDragId(rule.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropRule(rule.id)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] p-2 flex flex-col gap-2"
                style={{ opacity: dragId === rule.id ? 0.55 : 1 }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cursor-grab text-[var(--text-muted)] select-none" title="Ziehen zum Sortieren">
                    ⋮⋮
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">#{index + 1}</span>
                  <span className="text-xs font-semibold">
                    ≥ ${rule.thresholdUsd.toFixed(2)} → {rule.slotSlug || '?'} @ ~${rule.betUsd.toFixed(2)}
                    {rule.maxSpins != null ? `  (max ${rule.maxSpins} Spins)` : ''}
                  </span>
                  <div className="flex flex-wrap gap-1 ml-auto">
                    <button type="button" className="challenge-hub-action" disabled={isRunning} onClick={() => moveRule(rule.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="challenge-hub-action" disabled={isRunning} onClick={() => moveRule(rule.id, 1)}>
                      ↓
                    </button>
                    <button type="button" className="challenge-hub-action" onClick={() => setEditingId(expanded ? null : rule.id)}>
                      {expanded ? 'Fertig' : 'Bearbeiten'}
                    </button>
                    <button type="button" className="challenge-hub-action" disabled={isRunning} onClick={() => deleteRule(rule.id)}>
                      Löschen
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <label className="text-[11px] text-[var(--text-muted)]">
                      Schwellenwert (USD)
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                        value={rule.thresholdUsd}
                        onChange={(e) => updateRule(rule.id, { thresholdUsd: Number(e.target.value) || 0 })}
                        disabled={isRunning}
                      />
                    </label>
                    <label className="text-[11px] text-[var(--text-muted)]">
                      Einsatz (USD, Ziel)
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                        value={rule.betUsd}
                        onChange={(e) => updateRule(rule.id, { betUsd: Number(e.target.value) || 0 })}
                        disabled={isRunning}
                      />
                    </label>
                    <label className="text-[11px] text-[var(--text-muted)] sm:col-span-2">
                      Slot (Katalog)
                      <select
                        className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                        value={sortedSlots.some((s) => String(s.slug).toLowerCase() === rule.slotSlug) ? rule.slotSlug : ''}
                        onChange={(e) => updateRule(rule.id, { slotSlug: e.target.value.toLowerCase() })}
                        disabled={isRunning}
                      >
                        <option value="">— wählen —</option>
                        {sortedSlots.map((s) => (
                          <option key={s.slug} value={String(s.slug).toLowerCase()}>
                            {s.name || s.slug}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] text-[var(--text-muted)] sm:col-span-2">
                      Slug (manuell, z. B. wenn nicht in der Liste)
                      <input
                        type="text"
                        className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm font-mono"
                        value={rule.slotSlug}
                        onChange={(e) => updateRule(rule.id, { slotSlug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                        disabled={isRunning}
                        placeholder="z. B. sweet-bonanza"
                      />
                    </label>
                    <label className="text-[11px] text-[var(--text-muted)] sm:col-span-2">
                      Slot-Suche (Filter Liste)
                      <input
                        type="search"
                        className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                        value={slotFilter}
                        onChange={(e) => setSlotFilter(e.target.value)}
                        placeholder="Name oder Slug…"
                        disabled={isRunning}
                      />
                    </label>
                    <label className="text-[11px] text-[var(--text-muted)]">
                      Max Spins in dieser Regel (leer = ∞)
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-sm"
                        value={rule.maxSpins ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          updateRule(rule.id, { maxSpins: v === '' ? null : Math.max(0, Math.floor(Number(v))) })
                        }}
                        disabled={isRunning}
                      />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/80 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Globale Stops</h3>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Stop-Loss: Balance &lt; USD (leer = aus)
            <input
              type="number"
              step="0.01"
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.stops.stopLossUsd ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setConfig((c) => ({ ...c, stops: { ...c.stops, stopLossUsd: v === '' ? null : Number(v) } }))
              }}
              disabled={isRunning}
            />
          </label>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Take-Profit: Balance ≥ USD (leer = aus)
            <input
              type="number"
              step="0.01"
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.stops.takeProfitUsd ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setConfig((c) => ({ ...c, stops: { ...c.stops, takeProfitUsd: v === '' ? null : Number(v) } }))
              }}
              disabled={isRunning}
            />
          </label>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Max. Gesamt-Spins (leer = aus)
            <input
              type="number"
              min={0}
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.stops.maxTotalSpins ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setConfig((c) => ({ ...c, stops: { ...c.stops, maxTotalSpins: v === '' ? null : Math.max(0, Math.floor(Number(v))) } }))
              }}
              disabled={isRunning}
            />
          </label>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Max. Laufzeit (Minuten, leer = aus)
            <input
              type="number"
              min={0}
              step={1}
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.stops.maxRuntimeMinutes ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setConfig((c) => ({ ...c, stops: { ...c.stops, maxRuntimeMinutes: v === '' ? null : Math.max(0, Math.floor(Number(v))) } }))
              }}
              disabled={isRunning}
            />
          </label>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Stop nach X Verlust-Spins in Folge (leer = aus)
            <input
              type="number"
              min={1}
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.stops.maxLosingStreak ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setConfig((c) => ({ ...c, stops: { ...c.stops, maxLosingStreak: v === '' ? null : Math.max(1, Math.floor(Number(v))) } }))
              }}
              disabled={isRunning}
            />
          </label>
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Session &amp; Timing</h3>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Source-Währung (Wallet)
            <input
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.sourceCurrency}
              onChange={(e) => setConfig((c) => ({ ...c, sourceCurrency: e.target.value.toLowerCase() }))}
              disabled={isRunning}
            />
          </label>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Ziel-Währung (Slot)
            <input
              className="mt-0.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1 text-sm"
              value={config.targetCurrency}
              onChange={(e) => setConfig((c) => ({ ...c, targetCurrency: e.target.value.toLowerCase() }))}
              disabled={isRunning}
            />
          </label>
          <label className="text-[11px] text-[var(--text-muted)] block">
            Regel-Check alle {config.scanIntervalSec}s (2–120)
            <input
              type="range"
              min={2}
              max={120}
              value={config.scanIntervalSec}
              onChange={(e) => setConfig((c) => ({ ...c, scanIntervalSec: Number(e.target.value) }))}
              disabled={isRunning}
              className="w-full mt-1"
            />
          </label>
          <p className="text-[10px] text-[var(--text-muted)] leading-snug m-0">
            Dazwischen wird durchgehend gesponnen (kurze Pause zwischen Spins). Der Intervall steuert nur Slot-/Regelwechsel und
            frische Kurse.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={isRunning || !accessToken}
          onClick={handleStart}
          className="rounded-full px-8 py-3 text-sm font-bold uppercase tracking-wide shadow-lg border-0"
          style={{
            background: isRunning ? 'var(--border)' : 'linear-gradient(135deg, #16a34a, #22c55e)',
            color: '#052e16',
            cursor: isRunning || !accessToken ? 'not-allowed' : 'pointer',
            opacity: isRunning || !accessToken ? 0.45 : 1,
          }}
        >
          Start
        </button>
        <button
          type="button"
          disabled={!isRunning}
          onClick={handleStop}
          className="rounded-full px-8 py-3 text-sm font-bold uppercase tracking-wide shadow-lg border-0"
          style={{
            background: !isRunning ? 'var(--border)' : 'linear-gradient(135deg, #b91c1c, #ef4444)',
            color: '#fff',
            cursor: !isRunning ? 'not-allowed' : 'pointer',
            opacity: !isRunning ? 0.45 : 1,
          }}
        >
          Stop
        </button>
        <button type="button" className="challenge-hub-action" onClick={testBalanceScan}>
          Test Balance Scan
        </button>
        <button type="button" className="challenge-hub-action" onClick={saveJsonFile}>
          Config speichern (JSON)
        </button>
        <button type="button" className="challenge-hub-action" onClick={() => fileInputRef.current?.click()}>
          Config laden (JSON)
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onPickJsonFile} />
        <button type="button" className="challenge-hub-action" onClick={resetToDemo} disabled={isRunning}>
          Demo-Defaults
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-deep)] p-3">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Live-Log (letzte {MAX_LOG_LINES})</div>
        <pre className="text-[11px] font-mono text-[var(--text)] whitespace-pre-wrap max-h-48 overflow-y-auto m-0">
          {logs.length ? logs.join('\n') : 'Noch keine Einträge.'}
        </pre>
      </div>
    </div>
  )
})
