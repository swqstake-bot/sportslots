import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCurrencyRates } from '../../../api/stakeChallenges'
import { useCasinoBetListReset } from '../../../utils/casinoBetSession'
import { runOriginalsSession } from '../engine/runOriginalsSession'
import { createSignal, type SessionSignal } from '../engine/sessionSignal'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import type { WorkbenchSettings } from '../workbench/workbenchStorage'
import {
  emptyScriptSessionStats,
  formatScriptSessionDuration,
  type ScriptSessionStats,
} from '../scriptEngine/scriptSessionStats'

export type OriginalsBetRow = {
  betIndex: number
  game: string
  betSizeUsd: number
  payoutUsd: number
  roundProfitUsd: number
  multi: number
  b2bMulti: number
  win: boolean
  betId?: string | null
  timestamp?: number
  nonce?: string
}

/** Cooldown in ms after stop before Start is re-enabled. */
const START_COOLDOWN_MS = 2000

function upsertSessionChartPoint(
  prev: { index: number; profit: number }[],
  betIndex: number,
  profit: number
): { index: number; profit: number }[] {
  const next = prev.length ? [...prev] : [{ index: 0, profit: 0 }]
  if (next[0]?.index !== 0) next.unshift({ index: 0, profit: 0 })
  const idx = Math.max(0, betIndex)
  const existing = next.findIndex((p) => p.index === idx)
  const point = { index: idx, profit }
  if (existing >= 0) next[existing] = point
  else next.push(point)
  next.sort((a, b) => a.index - b.index)
  return next
}

function playBetSound(kind: 'win' | 'loss') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = kind === 'win' ? 880 : 220
    gain.gain.value = 0.08
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    osc.stop(ctx.currentTime + 0.15)
  } catch {
    /* audio unavailable */
  }
}

export function useOriginalsSession(accessToken?: string, wbSettings?: WorkbenchSettings) {
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [startCooldownSecs, setStartCooldownSecs] = useState(0)
  const [logLines, setLogLines] = useState<string[]>([])
  const [betList, setBetList] = useState<OriginalsBetRow[]>([])
  const [stats, setStats] = useState<ScriptSessionStats | null>(null)
  const [chartData, setChartData] = useState<{ index: number; profit: number }[]>([])
  const [chartSessionKey, setChartSessionKey] = useState(0)
  const signalRef = useRef<SessionSignal>(createSignal())
  const settingsRef = useRef(wbSettings)
  settingsRef.current = wbSettings
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addLog = useCallback((msg: string) => {
    setLogLines((prev) => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const startCooldown = useCallback(() => {
    setStartCooldownSecs(Math.ceil(START_COOLDOWN_MS / 1000))
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    cooldownTimerRef.current = setInterval(() => {
      setStartCooldownSecs((s) => {
        if (s <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current)
            cooldownTimerRef.current = null
          }
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    }
  }, [])

  const clearSession = useCallback(() => {
    signalRef.current.cancelled = true
    setRunning(false)
    setPaused(false)
    setBetList([])
    setChartData([])
    setStats(null)
    setLogLines([])
  }, [])

  const resetStats = useCallback(() => {
    if (running) return
    setBetList([])
    setChartData([])
    setStats(null)
    addLog('Statistics cleared.')
  }, [running, addLog])

  useCasinoBetListReset(clearSession)

  const stop = useCallback(() => {
    signalRef.current.cancelled = true
    signalRef.current.paused = false
    setRunning(false)
    setPaused(false)
    startCooldown()
    addLog('Stopped.')
  }, [addLog, startCooldown])

  const pause = useCallback(() => {
    if (!running) return
    signalRef.current.paused = true
    setPaused(true)
    addLog('Paused.')
  }, [running, addLog])

  const resume = useCallback(() => {
    if (!running) return
    signalRef.current.paused = false
    setPaused(false)
    addLog('Resumed.')
  }, [running, addLog])

  const armStopOnNextWin = useCallback(() => {
    if (!running) return
    signalRef.current.stopOnNextWin = true
    addLog('Stop-on-next-win armed.')
  }, [running, addLog])

  const disarmStopOnNextWin = useCallback(() => {
    signalRef.current.stopOnNextWin = false
    addLog('Stop-on-next-win disarmed.')
  }, [addLog])

  const start = useCallback(
    async (options: OriginalsWorkbenchOptions, currency: string) => {
      if (running || startCooldownSecs > 0) return
      const sig = createSignal()
      signalRef.current = sig
      setChartSessionKey((k) => k + 1)
      setChartData([{ index: 0, profit: 0 }])
      setRunning(true)
      setPaused(false)

      let usdRates: Record<string, number> = {}
      try {
        usdRates = (await fetchCurrencyRates(accessToken ?? '')) ?? {}
        if (Object.keys(usdRates).length > 0) addLog('Exchange rates loaded.')
      } catch {
        addLog('Exchange rates unavailable — using 1:1 stake units.')
      }

      let token = accessToken
      if (!token?.trim()) {
        try {
          token = (await window.electronAPI?.getSessionToken?.()) ?? undefined
        } catch {
          token = undefined
        }
      }

      addLog(`Starting ${options.game ?? 'dice'} (${currency.toUpperCase()}).`)

      const runOnce = async () => {
        const wb = settingsRef.current
        await runOriginalsSession(
          {
            ...options,
            asyncMode: wb?.asyncMode,
            requestInterval: wb?.requestInterval ?? options.requestInterval,
            _workbenchSettings: wb
              ? {
                  clientSeed: wb.clientSeed,
                  maxFiatBetSize: wb.maxFiatBetSize,
                  turboMode: wb.turboMode,
                  turboFireIntervalMs: wb.turboFireIntervalMs,
                  turboMaxInFlight: wb.turboMaxInFlight,
                  requestInterval: wb.requestInterval,
                  forceRestartDelaySeconds: wb.forceRestartDelaySeconds,
                  requestIntervalRateLimitIncrement: wb.requestIntervalRateLimitIncrement,
                }
              : undefined,
          },
          currency,
          {
            onLog: addLog,
            onBetPlaced: (r) => {
              if (r.error) {
                addLog(r.error)
                return
              }
              const betSizeUsd = Number(r.betSizeUsd ?? 0)
              const payoutUsd = Number(r.payoutUsd ?? 0)
              const win = payoutUsd > betSizeUsd + 1e-12
              const roundProfitUsd =
                r.roundProfitUsd != null ? Number(r.roundProfitUsd) : payoutUsd - betSizeUsd
              const multi =
                r.multi != null && Number(r.multi) > 0
                  ? Number(r.multi)
                  : win && betSizeUsd > 0
                    ? payoutUsd / betSizeUsd
                    : 0
              if (settingsRef.current?.soundOnWin && win) playBetSound('win')
              if (settingsRef.current?.soundOnLoss && !win) playBetSound('loss')
              const row: OriginalsBetRow = {
                betIndex: Number(r.betIndex ?? 0),
                game: (r.game || options.game || 'dice').toUpperCase(),
                betSizeUsd,
                payoutUsd,
                roundProfitUsd,
                multi,
                b2bMulti: win ? Number(r.b2bMulti ?? 0) : 0,
                win,
                betId: r.betId ?? null,
                timestamp: r.timestamp,
                nonce: r.nonce,
              }
              setBetList((prev) => {
                const idx = prev.findIndex((b) => b.betIndex === row.betIndex)
                if (idx >= 0) {
                  const next = [...prev]
                  next[idx] = { ...next[idx], ...row }
                  return next
                }
                return [row, ...prev].slice(0, 500)
              })
            },
            onStats: (s) => {
              setStats(s)
              setChartData((prev) => upsertSessionChartPoint(prev, s.bets, s.profit))
            },
            onBetShareId: (betIndex, betId) => {
              setBetList((prev) =>
                prev.map((row) => (row.betIndex === betIndex ? { ...row, betId } : row))
              )
            },
            onConditionStop: stop,
            onResetStats: () => {
              setBetList([])
              setChartData([])
              setStats(null)
              addLog('Stats reset by condition.')
            },
            onVaultDeposit: (amount, cur) => {
              addLog(`Vault: deposited ${amount.toFixed(4)} ${cur.toUpperCase()}`)
            },
            onTurboChange: (enabled) => {
              addLog(`Condition: turbo ${enabled ? 'enabled' : 'disabled'} (settings change requires restart)`)
            },
          },
          sig,
          usdRates,
          token
        )
      }

      await runOnce()

      setRunning(false)
      setPaused(false)
      startCooldown()
      addLog('Finished.')

      const wb = settingsRef.current
      if (wb?.forceRestartBetting && !sig.cancelled) {
        const delayMs = Math.max(500, (wb.forceRestartDelaySeconds ?? 15) * 1000)
        addLog(`Force restart in ${Math.round(delayMs / 1000)}s…`)
        await new Promise<void>((resolve) => {
          let remaining = delayMs
          const tick = () => {
            if (sig.cancelled || remaining <= 0) { resolve(); return }
            remaining -= 500
            setTimeout(tick, 500)
          }
          tick()
        })
        if (!sig.cancelled) {
          void start(options, currency)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessToken, addLog, running, startCooldownSecs, stop, startCooldown]
  )

  return {
    running,
    paused,
    startCooldownSecs,
    start,
    stop,
    pause,
    resume,
    armStopOnNextWin,
    disarmStopOnNextWin,
    clearSession,
    resetStats,
    logLines,
    betList,
    stats,
    chartData,
    chartSessionKey,
    formatDuration: formatScriptSessionDuration,
    emptyStats: emptyScriptSessionStats,
  }
}
