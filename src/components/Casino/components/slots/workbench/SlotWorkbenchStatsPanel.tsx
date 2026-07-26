import { useMemo } from 'react'
import StatsDisplay from '../../StatsDisplay'
import OriginalsProfitChart, { profitsToChartData } from '../../OriginalsProfitChart'
import { formatAmount } from '../../../utils/formatAmount'
import {
  aggregateToStatsSnapshot,
  recomputeCasinoAggregate,
} from '../../../utils/casinoStatsEngine'

export type WorkbenchSessionPublish = {
  instanceId: string
  slug: string
  name: string
  sessionStartAt: number | null
  sessionBetsDeduped: any[]
  stats: any
  isRunning?: boolean
}

type InstanceChip = {
  id: string
  label: string
}

type SlotWorkbenchStatsPanelProps = {
  instances: InstanceChip[]
  sessionsById: Record<string, WorkbenchSessionPublish | undefined>
  filterId: string
  onFilterChange: (id: string) => void
  currencyRates?: Record<string, number>
}

function betUsdMajors(b: any): { betUsd: number; winUsd: number } {
  const curr = String(b?.currencyCode || 'usd').toLowerCase()
  const winMinor = b?.isBonus && b?.stoppedBonus ? 0 : Number(b?.winAmount) || 0
  const betMinor = Number(b?.betAmount) || 0
  let betUsd = Number(b?.betUsdSnapshotMajor)
  let winUsd = Number(b?.winUsdSnapshotMajor)
  if (!Number.isFinite(betUsd)) {
    betUsd = curr === 'usd' || curr === 'usdc' || curr === 'usdt' ? betMinor / 100 : 0
  }
  if (!Number.isFinite(winUsd)) {
    winUsd = curr === 'usd' || curr === 'usdc' || curr === 'usdt' ? winMinor / 100 : 0
  }
  return { betUsd, winUsd }
}

function buildCumUsdMajors(bets: any[]): number[] | null {
  if (!bets?.length) return null
  let cum = 0
  const out: number[] = []
  for (const b of bets) {
    const { betUsd, winUsd } = betUsdMajors(b)
    cum += winUsd - betUsd
    out.push(Math.round(cum * 100) / 100)
  }
  return out
}

function enrichBiggestMulti(stats: any, bets: any[]) {
  let biggest = Number(stats?.biggestMultiplier) || 0
  for (const b of bets || []) {
    const bet = Number(b?.betAmount) || 0
    const win = Number(b?.winAmount) || 0
    if (bet > 0 && win > 0) {
      const m = win / bet
      if (m > biggest) biggest = m
    }
  }
  if (biggest > (stats?.biggestMultiplier || 0)) return { ...stats, biggestMultiplier: biggest }
  return (
    stats || {
      spins: 0,
      totalWagered: 0,
      totalWon: 0,
      winCount: 0,
      lossCount: 0,
      breakEvenCount: 0,
      biggestWin: 0,
      biggestMultiplier: 0,
    }
  )
}

export function SlotWorkbenchStatsPanel({
  instances,
  sessionsById,
  filterId,
  onFilterChange,
  currencyRates = {},
}: SlotWorkbenchStatsPanelProps) {
  const activeFilter = filterId === 'all' || instances.some((i) => i.id === filterId) ? filterId : 'all'

  const { stats, chartCum, chartDomainKey, titleSuffix, spinCount } = useMemo(() => {
    if (activeFilter !== 'all') {
      const session = sessionsById[activeFilter]
      const bets = Array.isArray(session?.sessionBetsDeduped) ? session.sessionBetsDeduped : []
      const statsOne = enrichBiggestMulti(session?.stats, bets)
      return {
        stats: statsOne,
        chartCum: buildCumUsdMajors(bets),
        chartDomainKey: session?.sessionStartAt ?? `one:${activeFilter}`,
        titleSuffix: session?.name || instances.find((i) => i.id === activeFilter)?.label || 'Slot',
        spinCount: bets.length,
      }
    }

    const merged: any[] = []
    let earliestStart: number | null = null
    for (const inst of instances) {
      const session = sessionsById[inst.id]
      const bets = Array.isArray(session?.sessionBetsDeduped) ? session.sessionBetsDeduped : []
      for (const b of bets) merged.push(b)
      const start = Number(session?.sessionStartAt)
      if (Number.isFinite(start) && start > 0) {
        earliestStart = earliestStart == null ? start : Math.min(earliestStart, start)
      }
    }
    merged.sort((a, b) => (Number(a?.addedAt) || 0) - (Number(b?.addedAt) || 0))
    // Sessions are already deduped per slot — do not cross-dedupe (same stake/loss on two
    // slots within 2.5s would collapse incorrectly).
    const deduped = merged
    const agg = recomputeCasinoAggregate(deduped, currencyRates)
    const statsAll = enrichBiggestMulti(
      aggregateToStatsSnapshot(agg, { rates: currencyRates, effectiveTarget: 'usd' }),
      deduped
    )
    return {
      stats: statsAll,
      chartCum: buildCumUsdMajors(deduped),
      chartDomainKey: earliestStart ?? `all:${instances.map((i) => i.id).join(',')}`,
      titleSuffix: 'All slots',
      spinCount: deduped.length,
    }
  }, [activeFilter, sessionsById, instances, currencyRates])

  const chartData = useMemo(() => {
    if (!chartCum?.length) return null
    return profitsToChartData([0, ...chartCum])
  }, [chartCum])

  const lastMajor = chartCum?.length ? chartCum[chartCum.length - 1]! : 0
  const lastNetCents = Math.round(lastMajor * 100)
  const hasSpins = (Number(stats?.spins) || 0) > 0 || spinCount > 0

  return (
    <aside className="slot-wb-stats-panel">
      <div className="slot-wb-col-title">Statistics</div>
      <div className="slot-wb-stats-filters" role="tablist" aria-label="Stats scope">
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === 'all'}
          className={`slot-wb-stats-chip${activeFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          All
        </button>
        {instances.map((inst) => (
          <button
            key={inst.id}
            type="button"
            role="tab"
            aria-selected={activeFilter === inst.id}
            className={`slot-wb-stats-chip${activeFilter === inst.id ? ' is-active' : ''}`}
            onClick={() => onFilterChange(inst.id)}
            title={inst.label}
          >
            {inst.label}
          </button>
        ))}
      </div>

      {!hasSpins ? (
        <p className="slot-wb-stats-empty">
          Start a session, then spin — stats for {activeFilter === 'all' ? 'all slots' : 'this slot'} appear here.
        </p>
      ) : (
        <>
          <StatsDisplay stats={stats} currencyCode="usd" compact />
          {chartData && chartData.length >= 2 && (
            <div className="slot-wb-stats-chart">
              <div className="slot-wb-stats-chart-head">
                <span>Session Netto (USD) · {titleSuffix}</span>
                <span className="tabular-nums">
                  {lastMajor >= 0 ? '+' : ''}
                  {formatAmount(lastNetCents, 'usd')} · {spinCount} spins
                </span>
              </div>
              <div className="slot-wb-stats-chart-body">
                <OriginalsProfitChart
                  chartData={chartData}
                  height={100}
                  domainResetKey={chartDomainKey}
                  compact
                />
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  )
}

export default SlotWorkbenchStatsPanel
