/**
 * Bot-Oberfläche für Mines (Stake Originals). Start = Session bis Stop-Bedingungen oder Stop-Button.
 */

import { useState, useRef, useEffect } from 'react'
import { placeMinesBet, minesReveal, minesCashout } from '../../api/stakeOriginalsBets'
import { Button } from '../ui/Button'
import { OriginalsSettings } from './OriginalsSettings'
import OriginalsBetHistory, { type OriginalsBetEntry } from './OriginalsBetHistory'
import { shouldStopSession } from './originalsStopConditions'
import type { OriginalsSettingsState } from './OriginalsSettings'

const CURRENCIES = ['usdc', 'btc', 'eth', 'eur', 'usd']
const GRID_SIZE = 25
const MAX_BET_HISTORY = 500
const CASHOUT_LADDER_DEFAULT = [{ gems: 3, multiplier: 2.3 }, { gems: 5, multiplier: 4.2 }, { gems: 8, multiplier: 12 }]

type TileState = 'hidden' | 'gem' | 'mine'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface OriginalsMinesControlProps {
  settings?: OriginalsSettingsState | null
  onSettingsChange?: (s: OriginalsSettingsState) => void
  activeGame?: 'mines'
  onBetPlaced?: (result: { iid?: string; payout?: number; error?: string }) => void
}

export default function OriginalsMinesControl({ settings: propSettings, onSettingsChange, activeGame = 'mines', onBetPlaced }: OriginalsMinesControlProps) {
  const [amount, setAmount] = useState('0.01')
  const [currency, setCurrency] = useState('usdc')
  const [mineCount, setMineCount] = useState(3)
  const [gemsToReveal, setGemsToReveal] = useState(3)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [tiles, setTiles] = useState<TileState[]>(Array(GRID_SIZE).fill('hidden'))
  const [cashoutLadder, setCashoutLadder] = useState(CASHOUT_LADDER_DEFAULT)
  const [betHistory, setBetHistory] = useState<OriginalsBetEntry[]>([])
  const [delayMs, setDelayMs] = useState(80)
  const cancelledRef = useRef(false)
  const settings = propSettings ?? null

  useEffect(() => () => { cancelledRef.current = true }, [])

  const addLadderRow = () => {
    setCashoutLadder((prev) => [...prev, { gems: prev.length + 2, multiplier: 1.5 + prev.length }])
  }
  const removeLadderRow = (i: number) => {
    setCashoutLadder((prev) => prev.filter((_, idx) => idx !== i))
  }

  const runSession = async () => {
    const amt = Number(amount) || Number(settings?.baseBet) || 0.01
    const targetGems = Math.max(1, Math.min(24, gemsToReveal))
    if (!(amt > 0)) {
      setError('Stake must be greater than 0.')
      return
    }
    setError('')
    setRunning(true)
    cancelledRef.current = false
    setBetHistory([])
    setTiles(Array(GRID_SIZE).fill('hidden'))
    const sessionEntries: OriginalsBetEntry[] = []
    const addEntry = (entry: OriginalsBetEntry) => {
      sessionEntries.push(entry)
      setBetHistory((prev) => [...prev.slice(-(MAX_BET_HISTORY - 1)), entry])
    }
    const indices = Array.from({ length: GRID_SIZE }, (_, i) => i)
    try {
      while (!cancelledRef.current) {
        const result = await placeMinesBet({ amount: amt, currency, mineCount })
        if (!result) break
        const identifier = result.id ?? result.iid ?? ''
        let payout = 0
        if (identifier) {
          let gemsRevealed = 0
          for (const idx of indices) {
            if (cancelledRef.current) break
            if (gemsRevealed >= targetGems) break
            const revealRes = await minesReveal({ identifier, fields: [idx] })
            if (!revealRes) break
            if ((revealRes as { active?: boolean }).active === false) break
            gemsRevealed++
          }
          if (gemsRevealed >= targetGems) {
            const cashoutRes = await minesCashout({ identifier })
            payout = cashoutRes?.payout ?? 0
          }
        }
        const win = payout > 0
        const entry: OriginalsBetEntry = { amount: amt, payout, win }
        addEntry(entry)
        onBetPlaced?.({ iid: result.iid, payout })
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
        Mines
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-wrap gap-3 items-end mb-3">
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
            <div className="w-24">
              <label className="block text-xs text-[var(--text-muted)] mb-1">Mines (1-24)</label>
              <input
                type="number"
                min={1}
                max={24}
                value={mineCount}
                onChange={(e) => setMineCount(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-[var(--text-muted)] mb-1">Gems bis Cashout</label>
              <input
                type="number"
                min={1}
                max={24}
                value={gemsToReveal}
                onChange={(e) => setGemsToReveal(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={runSession} disabled={running}>Start</Button>
              {running && <Button onClick={handleStop} variant="secondary">Stop</Button>}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--bg-deep)]">
            <div className="text-xs text-[var(--text-muted)] mb-2">Board (5x5)</div>
            <div className="grid grid-cols-5 gap-1.5">
              {tiles.map((state, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-lg flex items-center justify-center text-lg font-bold transition-all ${
                    state === 'hidden'
                      ? 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)]'
                      : state === 'gem'
                        ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
                        : 'bg-red-500/30 text-red-400 border border-red-500/50'
                  }`}
                >
                  {state === 'hidden' ? '?' : state === 'gem' ? '◆' : '✕'}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--bg-deep)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--text-muted)]">Cashout ladder (after X gems)</span>
              <button
                type="button"
                onClick={addLadderRow}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                + Row
              </button>
            </div>
            <div className="space-y-1.5">
              {cashoutLadder.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    value={row.gems}
                    onChange={(e) =>
                      setCashoutLadder((prev) => {
                        const n = [...prev]
                        n[i] = { ...n[i], gems: Number(e.target.value) }
                        return n
                      })
                    }
                    className="w-14 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                  />
                  <span className="text-xs text-[var(--text-muted)]">Gems →</span>
                  <input
                    type="number"
                    min={1}
                    step="0.1"
                    value={row.multiplier}
                    onChange={(e) =>
                      setCashoutLadder((prev) => {
                        const n = [...prev]
                        n[i] = { ...n[i], multiplier: Number(e.target.value) }
                        return n
                      })
                    }
                    className="w-16 bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                  />
                  <span className="text-xs text-[var(--text-muted)]">×</span>
                  {cashoutLadder.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLadderRow(i)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
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
