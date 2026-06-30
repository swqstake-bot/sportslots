/**
 * Dice Runner — Originals dice bot (USD stake, target multi, roll over default, seed rotation, spins/s).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import { Button } from '../ui/Button'
import OriginalsProfitChart, { profitsToChartData } from '../OriginalsProfitChart'
import { runDiceRunner, type DiceRunnerConfig } from './diceRunner/runDiceRunner'
import { loadDiceRunnerConfig, saveDiceRunnerConfig } from './diceRunner/diceRunnerPersistence'
import { useCasinoBetListReset } from '../../utils/casinoBetSession'
import {
  DICE_RUNNER_BALANCE_POLL_MS,
  balanceMajor,
  hasSufficientBalanceForBet,
  refreshWalletBalances,
  requiredBetMajor,
} from './diceRunner/diceRunnerBalance'
import { ALL_CURRENCIES, CURRENCY_GROUPS } from '../../constants/currencies'

interface BetRow {
  spin: number
  betUsd: number
  payoutUsd: number
  multi: number
  win: boolean
  profitUsd: number
  phase?: 'hunt' | 'moonshot'
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function DiceRunnerTab() {
  const saved = loadDiceRunnerConfig()
  const [betUsd, setBetUsd] = useState(String(saved.betUsd))
  const [targetMultiplier, setTargetMultiplier] = useState(String(saved.targetMultiplier))
  const [rollOver, setRollOver] = useState(saved.rollOver)
  const [currency, setCurrency] = useState(saved.currency)
  const [spinsPerSec, setSpinsPerSec] = useState(String(saved.spinsPerSec))
  const [seedChangeEverySpins, setSeedChangeEverySpins] = useState(String(saved.seedChangeEverySpins || ''))
  const [seedChangeOnTargetHit, setSeedChangeOnTargetHit] = useState(saved.seedChangeOnTargetHit)
  const [stopOnTargetHit, setStopOnTargetHit] = useState(saved.stopOnTargetHit)
  const [autoRerun, setAutoRerun] = useState(saved.autoRerun)
  const [twoPhaseHunt, setTwoPhaseHunt] = useState(saved.twoPhaseHunt)
  const [huntMultiplier, setHuntMultiplier] = useState(String(saved.huntMultiplier))
  const [endHuntMultiplier, setEndHuntMultiplier] = useState(String(saved.endHuntMultiplier))
  const [repeatAfterMoonshot, setRepeatAfterMoonshot] = useState(saved.repeatAfterMoonshot)
  const [running, setRunning] = useState(false)
  const [waitingForBalance, setWaitingForBalance] = useState(false)
  const [error, setError] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const [betList, setBetList] = useState<BetRow[]>([])
  const [stats, setStats] = useState<{ spins: number; profitUsd: number; betsPerSec: number; lastMulti: number } | null>(null)
  const [chartData, setChartData] = useState<{ index: number; profit: number }[]>([])
  const signalRef = useRef({ cancelled: false })
  const manualStopRef = useRef(false)
  const sessionSpinRef = useRef(0)

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveDiceRunnerConfig({
        betUsd: Number(betUsd) || 0.01,
        targetMultiplier: Number(targetMultiplier) || 2,
        rollOver,
        currency,
        spinsPerSec: Number(spinsPerSec) || 8,
        seedChangeEverySpins: Math.max(0, Math.floor(Number(seedChangeEverySpins) || 0)),
        seedChangeOnTargetHit,
        stopOnTargetHit,
        autoRerun,
        twoPhaseHunt,
        huntMultiplier: Number(huntMultiplier) || 30,
        endHuntMultiplier: Number(endHuntMultiplier) || 9900,
        repeatAfterMoonshot,
      })
    }, 400)
    return () => clearTimeout(t)
  }, [
    betUsd,
    targetMultiplier,
    rollOver,
    currency,
    spinsPerSec,
    seedChangeEverySpins,
    seedChangeOnTargetHit,
    stopOnTargetHit,
    autoRerun,
    twoPhaseHunt,
    huntMultiplier,
    endHuntMultiplier,
    repeatAfterMoonshot,
  ])

  const addLog = useCallback((msg: string) => {
    setLogLines((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const clearDiceRunSession = useCallback(() => {
    manualStopRef.current = true
    signalRef.current.cancelled = true
    setRunning(false)
    setBetList([])
    setChartData([])
    setStats(null)
    setLogLines([])
  }, [])

  useCasinoBetListReset(clearDiceRunSession)

  const buildConfig = useCallback((): DiceRunnerConfig | null => {
    const cfg: DiceRunnerConfig = {
      betUsd: Number(betUsd) || 0,
      targetMultiplier: Number(targetMultiplier) || 0,
      rollOver,
      currency,
      spinsPerSec: Number(spinsPerSec) || 0,
      seedChangeEverySpins: Math.max(0, Math.floor(Number(seedChangeEverySpins) || 0)),
      seedChangeOnTargetHit,
      stopOnTargetHit,
      autoRerun,
      twoPhaseHunt,
      huntMultiplier: Number(huntMultiplier) || 30,
      endHuntMultiplier: Number(endHuntMultiplier) || 9900,
      repeatAfterMoonshot,
    }
    if (!(cfg.betUsd > 0)) {
      setError('Bet ($) must be greater than 0.')
      return null
    }
    if (cfg.twoPhaseHunt) {
      if (!(cfg.huntMultiplier >= 1.01)) {
        setError('Hunt multiplier must be at least 1.01.')
        return null
      }
      if (!(cfg.endHuntMultiplier >= 1.01)) {
        setError('End-hunt multiplier must be at least 1.01.')
        return null
      }
    } else if (!(cfg.targetMultiplier >= 1.01)) {
      setError('Target multiplier must be at least 1.01.')
      return null
    }
    return cfg
  }, [
    betUsd,
    targetMultiplier,
    rollOver,
    currency,
    spinsPerSec,
    seedChangeEverySpins,
    seedChangeOnTargetHit,
    stopOnTargetHit,
    autoRerun,
    twoPhaseHunt,
    huntMultiplier,
    endHuntMultiplier,
    repeatAfterMoonshot,
  ])

  const handleStart = useCallback(async () => {
    const cfg = buildConfig()
    if (!cfg) return

    setError('')
    setRunning(true)
    setWaitingForBalance(false)
    manualStopRef.current = false
    signalRef.current = { cancelled: false }
    setBetList([])
    setChartData([])
    setStats(null)
    sessionSpinRef.current = 0

    addLog('Loading exchange rates…')
    let usdRates: Record<string, number> = {}
    try {
      usdRates = (await fetchCurrencyRates('')) ?? {}
      if (Object.keys(usdRates).length > 0) addLog('FX loaded — stake size in USD.')
    } catch {
      addLog('FX not loaded — using 1:1 fallback.')
    }

    try {
      await refreshWalletBalances()
    } catch {
      addLog('Wallet refresh failed — using cached balances.')
    }

    let sessionIndex = 0

    try {
      while (!manualStopRef.current) {
      if (sessionIndex > 0) {
        addLog(`Starting session #${sessionIndex + 1}…`)
      }

      signalRef.current = { cancelled: false }
      const reason = await runDiceRunner(
        cfg,
        {
          onLog: addLog,
          onBetPlaced: (r) => {
            sessionSpinRef.current = r.spin
            const payoutUsdFixed = r.win ? r.betUsd * (r.payoutMultiplier || 1) : 0
            setBetList((prev) => [
              ...prev.slice(-49),
              {
                spin: r.spin,
                betUsd: r.betUsd,
                payoutUsd: payoutUsdFixed,
                multi: r.payoutMultiplier,
                win: r.win,
                profitUsd: r.profitUsd,
                phase: r.phase,
              },
            ])
            setChartData((prev) => [...prev.slice(-299), { index: r.spin, profit: r.profitUsd }])
          },
          onStats: (s) => {
            setStats({ spins: s.spins, profitUsd: s.profitUsd, betsPerSec: s.betsPerSec, lastMulti: s.lastMulti })
          },
        },
        signalRef.current,
        usdRates
      )

      if (manualStopRef.current) {
        addLog('Session stopped manually.')
        break
      }

      if (reason === 'hit') {
        addLog('Session ended — target multiplier hit.')
        if (cfg.autoRerun && cfg.stopOnTargetHit) {
          addLog('Auto rerun stopped — target hit.')
        }
        break
      }

      if (reason === 'moonshot_win') {
        addLog(`Session ended — End-Hunt ${cfg.endHuntMultiplier}× getroffen!`)
        break
      }

      if (reason === 'balance') addLog('Session ended — insufficient balance.')
      else if (reason === 'error') addLog('Session ended — error.')
      else if (reason === 'stopped') addLog('Session stopped.')

      if (reason === 'stopped' || !cfg.autoRerun || reason !== 'balance') break

      setWaitingForBalance(true)
      addLog('Auto rerun: waiting for sufficient balance…')

      let ready = false
      let pollCount = 0
      while (!manualStopRef.current && !ready) {
        pollCount++
        try {
          await refreshWalletBalances()
        } catch (e) {
          addLog(`Balance refresh failed: ${e instanceof Error ? e.message : String(e)}`)
        }

        try {
          const freshRates = (await fetchCurrencyRates('')) ?? {}
          if (Object.keys(freshRates).length > 0) usdRates = freshRates
        } catch {
          /* keep previous rates */
        }

        const have = balanceMajor(cfg.currency)
        const need = requiredBetMajor(cfg.currency, cfg.betUsd, usdRates)
        if (hasSufficientBalanceForBet(cfg.currency, cfg.betUsd, usdRates)) {
          ready = true
          addLog(`Balance available (${have.toFixed(8)} ≥ ${need.toFixed(8)} ${cfg.currency.toUpperCase()}) — restarting.`)
        } else if (pollCount === 1 || pollCount % 5 === 0) {
          addLog(`Balance poll #${pollCount}: ${have.toFixed(8)} / need ${need.toFixed(8)} ${cfg.currency.toUpperCase()}`)
        }

        if (!ready && !manualStopRef.current) {
          await sleep(DICE_RUNNER_BALANCE_POLL_MS)
        }
      }

      setWaitingForBalance(false)
      if (manualStopRef.current || !ready) break

      sessionIndex++
      }
    } finally {
      setRunning(false)
      setWaitingForBalance(false)
    }
  }, [addLog, buildConfig])

  const handleStop = () => {
    manualStopRef.current = true
    signalRef.current.cancelled = true
  }

  const inputCls =
    'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none'

  const controlsLocked = running

  return (
    <div className="space-y-4">
      <div className="casino-card space-y-4">
        <h3 className="casino-card-header text-base">
          <span className="casino-card-header-accent" />
          Dice Runner
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Bet ($)</label>
            <input type="number" min="0.00000001" step="any" value={betUsd} onChange={(e) => setBetUsd(e.target.value)} className={inputCls} disabled={controlsLocked} />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">
              {twoPhaseHunt ? 'Target multiplier (×) — nur ohne Hunt→Moonshot' : 'Target multiplier (×)'}
            </label>
            <input
              type="number"
              min="1.01"
              step="any"
              value={targetMultiplier}
              onChange={(e) => setTargetMultiplier(e.target.value)}
              className={inputCls}
              disabled={controlsLocked || twoPhaseHunt}
            />
          </div>
          {twoPhaseHunt && (
            <>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Hunt multiplier (×)</label>
                <input
                  type="number"
                  min="1.01"
                  step="any"
                  value={huntMultiplier}
                  onChange={(e) => setHuntMultiplier(e.target.value)}
                  className={inputCls}
                  disabled={controlsLocked}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">End-hunt multiplier (×)</label>
                <input
                  type="number"
                  min="1.01"
                  step="any"
                  value={endHuntMultiplier}
                  onChange={(e) => setEndHuntMultiplier(e.target.value)}
                  className={inputCls}
                  disabled={controlsLocked}
                  title="Eine Wette mit vollem Hunt-Gewinn"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls} disabled={controlsLocked}>
              <optgroup label="Crypto">
                {CURRENCY_GROUPS.crypto.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Fiat">
                {CURRENCY_GROUPS.fiat.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              {!ALL_CURRENCIES.some((c) => c.value === currency) && (
                <option value={currency}>{currency.toUpperCase()}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Spins per second</label>
            <input type="number" min="0.5" max="30" step="0.5" value={spinsPerSec} onChange={(e) => setSpinsPerSec(e.target.value)} className={inputCls} disabled={controlsLocked} />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Rotate seed every N spins</label>
            <input type="number" min="0" step="1" value={seedChangeEverySpins} onChange={(e) => setSeedChangeEverySpins(e.target.value)} className={inputCls} disabled={controlsLocked} />
          </div>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={rollOver} onChange={(e) => setRollOver(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" disabled={controlsLocked} />
              <span className="text-sm text-[var(--text)]">Roll over</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={seedChangeOnTargetHit} onChange={(e) => setSeedChangeOnTargetHit(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" disabled={controlsLocked} />
              <span className="text-sm text-[var(--text)]">Rotate seed on target hit</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={stopOnTargetHit} onChange={(e) => setStopOnTargetHit(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" disabled={controlsLocked} />
              <span className="text-sm text-[var(--text)]">Stop on target hit</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={autoRerun} onChange={(e) => setAutoRerun(e.target.checked)} className="w-4 h-4 rounded accent-[var(--accent)]" disabled={controlsLocked} />
              <span className="text-sm text-[var(--text)]">Auto rerun</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={twoPhaseHunt}
                onChange={(e) => setTwoPhaseHunt(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--accent)]"
                disabled={controlsLocked}
              />
              <span className="text-sm text-[var(--text)]">Hunt → Moonshot</span>
            </label>
            {twoPhaseHunt && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeatAfterMoonshot}
                  onChange={(e) => setRepeatAfterMoonshot(e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--accent)]"
                  disabled={controlsLocked}
                />
                <span className="text-sm text-[var(--text)]">Repeat hunt after moonshot win</span>
              </label>
            )}
          </div>
        </div>

        {twoPhaseHunt && (
          <p className="text-xs text-[var(--text-muted)]">
            Hunt mit Bet ($) bis Hunt-Multi — bei Treffer 1× Moonshot mit vollem Gewinn auf End-Hunt-Multi. Verfehlt → Hunt läuft weiter. Nur echter End-Hunt-Treffer stoppt.
          </p>
        )}

        {waitingForBalance && (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
            Waiting for balance…
          </div>
        )}

        {error && (
          <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleStart} disabled={running}>Start</Button>
          {running && (
            <Button onClick={handleStop} variant="secondary">Stop</Button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] block text-xs">Spins</span>
            <span className="font-medium">{stats.spins}</span>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] block text-xs">Profit ($)</span>
            <span className={`font-medium ${stats.profitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.profitUsd.toFixed(4)}</span>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] block text-xs">Spins / sec</span>
            <span className="font-medium">{stats.betsPerSec.toFixed(2)}</span>
          </div>
          <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] block text-xs">Last multiplier</span>
            <span className="font-medium">{stats.lastMulti > 0 ? `${stats.lastMulti.toFixed(2)}×` : '—'}</span>
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="casino-card h-36">
          <OriginalsProfitChart
            chartData={profitsToChartData(chartData.map((d) => d.profit))}
            height={140}
          />
        </div>
      )}

      {betList.length > 0 && (
        <div className="casino-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-muted)] text-left border-b border-[var(--border-subtle)]">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Phase</th>
                <th className="py-2 pr-2">Bet $</th>
                <th className="py-2 pr-2">Multi</th>
                <th className="py-2 pr-2">Profit $</th>
              </tr>
            </thead>
            <tbody>
              {[...betList].reverse().slice(0, 15).map((b) => (
                <tr key={b.spin} className="border-b border-[var(--border-subtle)]/50">
                  <td className="py-1 pr-2">{b.spin}</td>
                  <td className="py-1 pr-2 text-[var(--text-muted)]">
                    {b.phase === 'moonshot' ? '🎯' : '·'}
                  </td>
                  <td className="py-1 pr-2">{b.betUsd.toFixed(4)}</td>
                  <td className={`py-1 pr-2 ${b.win ? 'text-emerald-400' : ''}`}>{b.multi > 0 ? `${b.multi.toFixed(2)}×` : '—'}</td>
                  <td className={`py-1 pr-2 ${b.profitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{b.profitUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logLines.length > 0 && (
        <div className="casino-card max-h-40 overflow-y-auto font-mono text-xs text-[var(--text-muted)] space-y-0.5">
          {logLines.map((line, i) => (
            <div key={`${i}-${line}`}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
