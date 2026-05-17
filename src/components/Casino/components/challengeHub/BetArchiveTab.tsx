import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadRecentBets } from '../../utils/betHistoryDb'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import {
  applyCasinoSpinToAggregate,
  aggregateToStatsSnapshot,
  createEmptyCasinoAggregate,
} from '../../utils/casinoStatsEngine'
import { deriveTopSlots, deriveTopWins, mergeTopEntries } from '../../utils/topDomain'
import { SvgCumulativeProfitLineChart } from '../../../charts/SvgCumulativeCharts'

type BetArchiveTabProps = {
  accessToken: string
}

const ARCHIVE_LIMITS = [
  { value: 5_000, label: '5k' },
  { value: 50_000, label: '50k' },
  { value: 250_000, label: '250k' },
  { value: 1_000_000, label: '1m' },
  { value: 0, label: 'ALL' },
]
const ARCHIVE_LIMIT_STORAGE_KEY = 'slotbot_archive_limit_v1'

function fmtUsdCents(cents: number) {
  const n = Number(cents || 0) / 100
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`
}

export function BetArchiveTab({ accessToken }: BetArchiveTabProps) {
  const [rows, setRows] = useState<any[]>([])
  const [rates, setRates] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [archiveLimit, setArchiveLimit] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(ARCHIVE_LIMIT_STORAGE_KEY) || 50_000)
      return Number.isFinite(stored) ? stored : 50_000
    } catch {
      return 50_000
    }
  })

  const loadArchive = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [recent, fx] = await Promise.all([
        loadRecentBets(archiveLimit),
        fetchCurrencyRates(accessToken),
      ])
      setRows(Array.isArray(recent) ? recent : [])
      setRates(fx || {})
    } catch (err: any) {
      setError(String(err?.message || err || 'Failed to load archive'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, archiveLimit])

  useEffect(() => {
    void loadArchive()
  }, [loadArchive])

  useEffect(() => {
    try {
      localStorage.setItem(ARCHIVE_LIMIT_STORAGE_KEY, String(archiveLimit))
    } catch {
      // ignore
    }
  }, [archiveLimit])

  const view = useMemo(() => {
    const chrono = [...rows].sort((a, b) => Number(a?.addedAt || 0) - Number(b?.addedAt || 0))
    let agg = createEmptyCasinoAggregate()
    const cumulative: number[] = []
    for (const row of chrono) {
      agg = applyCasinoSpinToAggregate(agg, row, rates)
      cumulative.push((agg.totalWonUsdMajor || 0) - (agg.totalWageredUsdMajor || 0))
    }
    const snapshot = aggregateToStatsSnapshot(agg, { rates, effectiveTarget: 'usd' })
    const mergedTop = mergeTopEntries([], rows)
    const topWins = deriveTopWins(mergedTop, 8)
    const topSlots = deriveTopSlots(mergedTop, 8)
    return { snapshot, cumulative, topWins, topSlots, rowCount: rows.length, rawRows: rows }
  }, [rows, rates])

  const handleExport = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            rows: view.rawRows,
            snapshot: view.snapshot,
            topWins: view.topWins,
            topSlots: view.topSlots,
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bet-archive-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [view])

  return (
    <div className="challenge-hub-archive">
      <div className="challenge-hub-archive-toolbar">
        <div className="challenge-hub-archive-meta">
          Archive spins: <b>{view.rowCount}</b> ({archiveLimit > 0 ? `latest ${archiveLimit}` : 'all available'})
          <span className="ml-1">· KPI source: persisted casino spins (USD snapshots)</span>
        </div>
        <div className="challenge-hub-archive-actions">
          <label className="challenge-hub-archive-limit-wrap">
            <span className="challenge-hub-archive-limit-label">Range</span>
            <select
              className="challenge-hub-archive-limit-select"
              value={String(archiveLimit)}
              onChange={(e) => setArchiveLimit(Number(e.target.value))}
              disabled={loading}
            >
              {ARCHIVE_LIMITS.map((opt) => (
                <option key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="challenge-hub-action" onClick={() => void loadArchive()} disabled={loading}>
            {loading ? 'Loading...' : 'Reload'}
          </button>
          <button type="button" className="challenge-hub-action" onClick={handleExport} disabled={view.rowCount === 0}>
            Export JSON
          </button>
        </div>
      </div>

      {error ? <div className="challenge-hub-archive-error">{error}</div> : null}

      <div className="challenge-hub-archive-kpis">
        <span className="challenge-hub-kpi">Archive Wagered (casino): {fmtUsdCents(view.snapshot.totalWagered)}</span>
        <span className="challenge-hub-kpi">Archive Won (casino): {fmtUsdCents(view.snapshot.totalWon)}</span>
        <span className="challenge-hub-kpi">Archive Net (casino): {fmtUsdCents(view.snapshot.totalWon - view.snapshot.totalWagered)}</span>
        <span className="challenge-hub-kpi">Archive Best Multi (casino): {(Number(view.snapshot.biggestMultiplier) || 0).toFixed(2)}x</span>
      </div>

      <div className="challenge-hub-archive-card">
        <div className="challenge-hub-archive-title">Profit trend</div>
        <SvgCumulativeProfitLineChart profits={view.cumulative} height={140} />
      </div>

      <div className="challenge-hub-archive-grid">
        <div className="challenge-hub-archive-card">
          <div className="challenge-hub-archive-title">Top Wins</div>
          <div className="challenge-hub-archive-list">
            {view.topWins.map((row) => (
              <div key={row.key} className="challenge-hub-archive-row">
                <span className="challenge-hub-archive-row-name">{row.slotName}</span>
                <span className="challenge-hub-archive-row-value">{row.multiplier.toFixed(2)}x</span>
              </div>
            ))}
            {view.topWins.length === 0 ? <div className="challenge-hub-archive-empty">No wins yet.</div> : null}
          </div>
        </div>

        <div className="challenge-hub-archive-card">
          <div className="challenge-hub-archive-title">Top Games</div>
          <div className="challenge-hub-archive-list">
            {view.topSlots.map((row) => (
              <div key={row.slotName} className="challenge-hub-archive-row">
                <span className="challenge-hub-archive-row-name">{row.slotName}</span>
                <span className="challenge-hub-archive-row-value">{row.bestMulti.toFixed(2)}x</span>
              </div>
            ))}
            {view.topSlots.length === 0 ? <div className="challenge-hub-archive-empty">No slots yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
