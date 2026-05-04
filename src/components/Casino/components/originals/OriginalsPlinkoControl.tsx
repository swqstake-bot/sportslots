/**
 * Bot-Oberfläche für Plinko (Stake Originals). Start = Session bis Stop-Bedingungen oder Stop-Button.
 */

import { useState, useRef, useEffect } from 'react'
import { placePlinkoBet } from '../../api/stakeOriginalsBets'
import { Button } from '../ui/Button'
import { OriginalsSettings } from './OriginalsSettings'
import OriginalsBetHistory, { type OriginalsBetEntry } from './OriginalsBetHistory'
import { shouldStopSession } from './originalsStopConditions'
import type { OriginalsSettingsState } from './OriginalsSettings'

const CURRENCIES = ['usdc', 'btc', 'eth', 'eur', 'usd']
const RISK_OPTIONS = ['low', 'medium', 'high'] as const
const ROWS_OPTIONS = [8, 10, 12, 14, 16]
const MAX_BET_HISTORY = 500

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface OriginalsPlinkoControlProps {
  settings?: OriginalsSettingsState | null
  onSettingsChange?: (s: OriginalsSettingsState) => void
  activeGame?: 'plinko'
  onBetPlaced?: (result: { iid?: string; payout?: number; error?: string }) => void
}

export default function OriginalsPlinkoControl({ settings: propSettings, onSettingsChange, activeGame = 'plinko', onBetPlaced }: OriginalsPlinkoControlProps) {
  const [amount, setAmount] = useState('0.01')
  const [currency, setCurrency] = useState('usdc')
  const [rows, setRows] = useState(16)
  const [risk, setRisk] = useState<'low' | 'medium' | 'high'>('low')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [betHistory, setBetHistory] = useState<OriginalsBetEntry[]>([])
  const [delayMs, setDelayMs] = useState(80)
  const cancelledRef = useRef(false)
  const settings = propSettings ?? null

  useEffect(() => () => { cancelledRef.current = true }, [])

  const runSession = async () => {
    const amt = Number(amount) || Number(settings?.baseBet) || 0.01
    if (!(amt > 0)) {
      setError('Stake must be > 0.')
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
        const result = await placePlinkoBet({ amount: amt, currency, rows, risk })
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
        Plinko
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Stake</label>
          <input
            type="number"
            min="0.00000001"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Rows</label>
          <select
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          >
            {ROWS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Risk</label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as typeof risk)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          >
            {RISK_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={runSession} disabled={running}>Start</Button>
        {running && <Button onClick={handleStop} variant="secondary">Stop</Button>}
      </div>
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
