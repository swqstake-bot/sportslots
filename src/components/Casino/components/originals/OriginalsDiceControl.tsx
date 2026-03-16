/**
 * Bot-Oberfläche für Dice (Stake Originals). Start = Session bis Stop-Bedingungen oder Stop-Button.
 */

import { useState, useRef, useEffect } from 'react'
import { placeDiceBet } from '../../api/stakeOriginalsBets'
import { Button } from '../ui/Button'
import { OriginalsSettings } from './OriginalsSettings'
import OriginalsBetHistory, { type OriginalsBetEntry } from './OriginalsBetHistory'
import { shouldStopSession } from './originalsStopConditions'
import type { OriginalsSettingsState } from './OriginalsSettings'

const CURRENCIES = ['usdc', 'btc', 'eth', 'eur', 'usd']
const MAX_BET_HISTORY = 500

interface OriginalsDiceControlProps {
  settings?: OriginalsSettingsState | null
  onSettingsChange?: (s: OriginalsSettingsState) => void
  activeGame?: 'dice'
  onBetPlaced?: (result: { iid?: string; payout?: number; error?: string }) => void
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function OriginalsDiceControl({ settings: propSettings, onSettingsChange, activeGame = 'dice', onBetPlaced }: OriginalsDiceControlProps) {
  const [amount, setAmount] = useState('0.01')
  const [currency, setCurrency] = useState('usdc')
  const [multiplier, setMultiplier] = useState('2')
  const [rollOver, setRollOver] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [betHistory, setBetHistory] = useState<OriginalsBetEntry[]>([])
  const [delayMs, setDelayMs] = useState(80)
  const cancelledRef = useRef(false)
  const settings = propSettings ?? null

  useEffect(() => () => { cancelledRef.current = true }, [])

  const mult = Number(multiplier) || 2
  const rollUnder = mult >= 1.01 ? 99 / mult : 49.5
  const chance = rollOver ? (100 - rollUnder) : rollUnder

  const runSession = async () => {
    const amt = Number(amount) || Number(settings?.baseBet) || 0.01
    if (!(amt > 0 && mult >= 1.01)) {
      setError('Einsatz > 0 und Multiplikator ≥ 1.01.')
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
        const result = await placeDiceBet({ amount: amt, currency, rollUnder, rollOver })
        const payout = result?.payout ?? 0
        const win = payout > 0
        const entry: OriginalsBetEntry = { amount: amt, payout, win }
        addEntry(entry)
        onBetPlaced?.(result ? { iid: result.iid, payout } : { error: 'Keine Antwort' })
        if (!result) break
        if (shouldStopSession(sessionEntries, settings ?? {})) break
        await delay(delayMs)
      }
    } catch (e: any) {
      setError(e?.message || 'Wette fehlgeschlagen')
      onBetPlaced?.({ error: e?.message })
    } finally {
      setRunning(false)
    }
  }

  const handleStop = () => {
    cancelledRef.current = true
  }

  return (
    <div className="casino-card space-y-4">
      <h3 className="casino-card-header text-base">
        <span className="casino-card-header-accent" />
        Dice
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">Einsatz</label>
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
          <label className="block text-xs text-[var(--text-muted)] mb-1">Währung</label>
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
          <label className="block text-xs text-[var(--text-muted)] mb-1">Multiplikator (×)</label>
          <input
            type="number"
            min="1.01"
            max="9900"
            step="0.01"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rollOver}
              onChange={(e) => setRollOver(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text)]">Roll Over</span>
          </label>
        </div>
      </div>
      <div className="text-sm text-[var(--text-muted)]">
        Chance: {chance.toFixed(2)}% · Auszahlung: {mult.toFixed(2)}×
      </div>
      {error && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={runSession} disabled={running}>
          Start
        </Button>
        {running && (
          <Button onClick={handleStop} variant="secondary">
            Stop
          </Button>
        )}
      </div>
      <OriginalsBetHistory
        bets={betHistory}
        maxBets={MAX_BET_HISTORY}
        autoBetDelayMs={delayMs}
        onAutoBetDelayChange={setDelayMs}
      />
      <OriginalsSettings
        showChance={true}
        showMultiplier={false}
        value={settings ?? undefined}
        onChange={onSettingsChange ?? (() => {})}
        activeGame={activeGame}
      />
    </div>
  )
}
