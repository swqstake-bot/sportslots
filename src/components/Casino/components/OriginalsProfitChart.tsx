import { SvgCumulativeProfitLineChart } from '../../charts/SvgCumulativeCharts'
import { formatBetUsd } from './originals/workbench/betDisplayUtils'
import './OriginalsProfitChart.css'

export type ProfitChartPoint = { index: number; profit: number }

/** Cumulative profit series → chart points (prepends 0 baseline when missing). */
export function profitsToChartData(profits: number[]): ProfitChartPoint[] {
  if (!profits.length) return []
  if (profits[0] === 0) {
    return profits.map((profit, index) => ({ index, profit }))
  }
  return [{ index: 0, profit: 0 }, ...profits.map((profit, i) => ({ index: i + 1, profit }))]
}

interface OriginalsProfitChartProps {
  chartData: ProfitChartPoint[]
  height?: number
  domainResetKey?: number | string
  compact?: boolean
  title?: string
  className?: string
  fillArea?: boolean
  betIndexStart?: number
  betIndexEnd?: number
}

/** Session profit/loss chart — cumulative USD, stable Y scale. */
export default function OriginalsProfitChart({
  chartData,
  height = 220,
  domainResetKey,
  compact,
  title = 'Profit / Loss',
  className,
  fillArea = true,
  betIndexStart,
  betIndexEnd,
}: OriginalsProfitChartProps) {
  const profits = chartData.map((d) => d.profit)
  const lastProfit = profits.length ? profits[profits.length - 1]! : 0
  const betCount = Math.max(0, chartData.length - 1)
  const stroke = lastProfit >= 0 ? 'rgb(52, 211, 153)' : 'rgb(248, 113, 113)'

  if (profits.length < 2) return null

  return (
    <div className={`casino-profit-chart${compact ? ' casino-profit-chart--compact' : ''}${className ? ` ${className}` : ''}`}>
      {!compact && (
        <div className="casino-profit-chart-header">
          <span className="casino-profit-chart-title">{title}</span>
          <span
            className={`casino-profit-chart-value tabular-nums${
              lastProfit >= 0 ? ' casino-profit-chart-value--profit' : ' casino-profit-chart-value--loss'
            }`}
          >
            {lastProfit >= 0 ? '+' : ''}${formatBetUsd(lastProfit)}
          </span>
        </div>
      )}
      <SvgCumulativeProfitLineChart
        profits={profits}
        height={height}
        stroke={stroke}
        fillArea={fillArea}
        stableYDomain
        domainResetKey={domainResetKey}
        betIndexStart={betIndexStart ?? 0}
        betIndexEnd={betIndexEnd ?? betCount}
      />
    </div>
  )
}
