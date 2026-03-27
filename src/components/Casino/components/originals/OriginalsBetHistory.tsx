/**
 * Chart, Bet-Liste, Statistik und Verzögerung für Originals (Start-Session).
 */

import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export interface OriginalsBetEntry {
  amount: number
  payout: number
  win: boolean
  time?: number
}

const inputCls = 'bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none'

interface OriginalsBetHistoryProps {
  bets: OriginalsBetEntry[]
  maxBets?: number
  autoBetDelayMs?: number
  onAutoBetDelayChange?: (ms: number) => void
}

export default function OriginalsBetHistory({
  bets,
  maxBets = 50,
  autoBetDelayMs = 80,
  onAutoBetDelayChange,
}: OriginalsBetHistoryProps) {
  const limited = useMemo(() => bets.slice(-maxBets), [bets, maxBets])
  const chartData = useMemo(() => {
    const out: { index: number; profit: number }[] = []
    let cum = 0
    for (let i = 0; i < limited.length; i++) {
      const b = limited[i]
      cum += (b.payout || 0) - b.amount
      out.push({ index: i + 1, profit: cum })
    }
    return out
  }, [limited])
  const stats = useMemo(() => {
    const wins = limited.filter((b) => b.win).length
    const total = limited.length
    const totalProfit = limited.reduce((s, b) => s + (b.payout || 0) - b.amount, 0)
    return {
      total,
      wins,
      losses: total - wins,
      winPct: total ? (wins / total) * 100 : 0,
      totalProfit,
    }
  }, [limited])

  return (
    <div className="casino-card space-y-4">
      <h3 className="casino-card-header text-base">
        <span className="casino-card-header-accent" />
        Chart & Statistik
      </h3>

      {chartData.length > 0 && (
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="index" tick={{ fontSize: 10 }} stroke="var(--text-muted)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--text-muted)" tickFormatter={(v) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))} />
              <Tooltip formatter={(v: number | undefined) => [v != null ? (v >= 0 ? `+${v.toFixed(4)}` : v.toFixed(4)) : '—', 'Kum. Profit']} contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }} labelFormatter={(i) => `Bet #${i}`} />
              <Line type="monotone" dataKey="profit" stroke="var(--accent)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)] block text-xs">Bets</span>
          <span className="font-medium text-[var(--text)]">{stats.total}</span>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)] block text-xs">Wins / Losses</span>
          <span className="font-medium text-[var(--text)]">{stats.wins} / {stats.losses}</span>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)] block text-xs">Win-Rate</span>
          <span className="font-medium text-[var(--text)]">{stats.winPct.toFixed(1)}%</span>
        </div>
        <div className="p-2 rounded-lg bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)] block text-xs">Profit</span>
          <span className={`font-medium ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {stats.totalProfit >= 0 ? '+' : ''}{stats.totalProfit.toFixed(4)}
          </span>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Letzte Wetten (max. {maxBets})</div>
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)]/50 divide-y divide-[var(--border-subtle)]">
          {[...limited].reverse().map((b, i) => (
            <li key={i} className="px-2 py-1.5 flex justify-between text-xs">
              <span>Einsatz: {b.amount.toFixed(4)} → Payout: {(b.payout ?? 0).toFixed(4)}</span>
              <span className={b.win ? 'text-emerald-400' : 'text-red-400'}>{b.win ? 'Win' : 'Loss'}</span>
            </li>
          ))}
          {limited.length === 0 && (
            <li className="px-2 py-3 text-[var(--text-muted)] text-xs">Noch keine Wetten.</li>
          )}
        </ul>
      </div>

      {onAutoBetDelayChange && (
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--text-muted)]" title="0 = max. Tempo (5–15 Bets/Sek.)">Verzögerung zwischen Wetten (ms)</label>
            <input
              type="number"
              min="0"
              max="30000"
              step="10"
              value={autoBetDelayMs}
              onChange={(e) => onAutoBetDelayChange(Number(e.target.value) || 0)}
              className={inputCls}
              style={{ width: '5rem' }}
              placeholder="0"
            />
          </div>
        </div>
      )}
    </div>
  )
}
