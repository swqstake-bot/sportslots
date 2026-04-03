/**
 * Bot-Oberfläche für Keno (Stake Originals). Start = Session bis Stop-Bedingungen oder Stop-Button.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { placeKenoBet } from '../../api/stakeOriginalsBets'
import { Button } from '../ui/Button'
import { OriginalsSettings } from './OriginalsSettings'
import OriginalsBetHistory, { type OriginalsBetEntry } from './OriginalsBetHistory'
import { shouldStopSession } from './originalsStopConditions'
import type { OriginalsSettingsState } from './OriginalsSettings'

const CURRENCIES = ['usdc', 'btc', 'eth', 'eur', 'usd']
const RISK_OPTIONS = ['low', 'medium', 'high', 'extreme'] as const
const KENO_NUMBERS = Array.from({ length: 39 }, (_, i) => i + 1)
const MAX_BET_HISTORY = 500

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface OriginalsKenoControlProps {
  settings?: OriginalsSettingsState | null
  onSettingsChange?: (s: OriginalsSettingsState) => void
  activeGame?: 'keno'
  onBetPlaced?: (result: { iid?: string; payout?: number; error?: string }) => void
}

export default function OriginalsKenoControl({ settings: propSettings, onSettingsChange, activeGame = 'keno', onBetPlaced }: OriginalsKenoControlProps) {
  const [picks, setPicks] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6, 7, 8]))
  const [currency, setCurrency] = useState('usdc')
  const [risk, setRisk] = useState<'low' | 'medium' | 'high' | 'extreme'>('low')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('0.01')
  const [betHistory, setBetHistory] = useState<OriginalsBetEntry[]>([])
  const [delayMs, setDelayMs] = useState(80)
  const cancelledRef = useRef(false)
  const settings = propSettings ?? null

  useEffect(() => () => { cancelledRef.current = true }, [])

  const togglePick = useCallback((n: number) => {
    setPicks((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else if (next.size < 10) next.add(n)
      return next
    })
  }, [])

  const runSession = async () => {
    const amt = Number(amount) || Number(settings?.baseBet) || 0.01
    const pickArr = Array.from(picks).sort((a, b) => a - b)
    if (!(amt > 0 && pickArr.length >= 1)) {
      setError('Stake must be > 0 and at least 1 pick.')
      return
    }
    setError('')
    setRunning(true)
    cancelledRef.current = false
    setBetHistory([])
    const sessionEntries: OriginalsBetEntry[] = []
    const addEntry = (entry: OriginalsBetEntry) => {
      sessionEntries.push(entry)
      setBetHistory((prev) => [...prev.slice(-(MAX_BET_HISTORY - 1)), entry])
    }
    try {
      while (!cancelledRef.current) {
        const result = await placeKenoBet({
          amount: amt,
          currency,
          picks: pickArr,
          risk: risk === 'extreme' ? 'high' : risk,
        })
        const payout = result?.payout ?? 0
        const win = payout > 0
        const entry: OriginalsBetEntry = { amount: amt, payout, win }
        addEntry(entry)
        onBetPlaced?.(result ? { iid: result.iid, payout } : { error: 'No response' })
        if (!result) break
        if (shouldStopSession(sessionEntries, settings ?? {})) break
        await delay(delayMs)
      }
    } catch (e: any) {
      setError(e?.message || 'Bet failed')
      onBetPlaced?.({ error: e?.message })
    } finally {
      setRunning(false)
    }
  }

  const handleStop = () => { cancelledRef.current = true }

  return (
    <div className="casino-card space-y-4">
      <h3 className="casino-card-header text-base">
        <span className="casino-card-header-accent" />
        Keno
      </h3>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="w-24">
          <label className="block text-xs text-[var(--text-muted)] mb-1">Stake</label>
          <input
            type="number"
            min="0.00000001"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          />
        </div>
        <div className="w-24">
          <label className="block text-xs text-[var(--text-muted)] mb-1">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label className="block text-xs text-[var(--text-muted)] mb-1">Risk</label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as typeof risk)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          >
            {RISK_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button onClick={runSession} disabled={running || picks.size === 0}>Start</Button>
          {running && <Button onClick={handleStop} variant="secondary">Stop</Button>}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4 bg-[var(--bg-deep)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[var(--text-muted)]">Numbers 1-39, max. 10 picks</span>
          <span className="text-sm font-medium text-[var(--text)]">{picks.size} selected</span>
        </div>
        <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
          {KENO_NUMBERS.map((n) => {
            const selected = picks.has(n)
            return (
              <button
                key={n}
                type="button"
                onClick={() => togglePick(n)}
                className={`aspect-square rounded-lg text-sm font-semibold transition-all ${
                  selected
                    ? 'bg-[var(--accent)] text-[#0A0A0F] ring-2 ring-[var(--accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:border-[var(--accent)]/50 hover:text-[var(--text)]'
                }`}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <OriginalsBetHistory bets={betHistory} maxBets={MAX_BET_HISTORY} autoBetDelayMs={delayMs} onAutoBetDelayChange={setDelayMs} />
      <OriginalsSettings
        showChance={false}
        showMultiplier={false}
        value={settings ?? undefined}
        onChange={onSettingsChange ?? (() => {})}
        activeGame={activeGame}
      />
    </div>
  )
}
