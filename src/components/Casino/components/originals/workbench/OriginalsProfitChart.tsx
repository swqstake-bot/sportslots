import { SvgCumulativeProfitLineChart } from '../../../../charts/SvgCumulativeCharts'
import { formatBetUsd } from './betDisplayUtils'

interface OriginalsProfitChartProps {
  chartData: { index: number; profit: number }[]
  height?: number
  domainResetKey?: number | string
  compact?: boolean
}

/** Session profit/loss chart — cumulative USD, filled area, stable Y scale. */
export default function OriginalsProfitChart({
  chartData,
  height = 220,
  domainResetKey,
  compact,
}: OriginalsProfitChartProps) {
  const profits = chartData.map((d) => d.profit)
  const lastProfit = profits.length ? profits[profits.length - 1]! : 0
  const betCount = Math.max(0, chartData.length - 1)
  const stroke = lastProfit >= 0 ? 'rgb(52, 211, 153)' : 'rgb(248, 113, 113)'

  if (profits.length < 2) return null

  return (
    <div className={`originals-profit-chart${compact ? ' originals-profit-chart--compact' : ''}`}>
      {!compact && (
        <div className="originals-profit-chart-header">
          <span className="originals-profit-chart-title">Profit / Loss</span>
          <span className={`originals-profit-chart-value tabular-nums${lastProfit >= 0 ? ' originals-profit' : ' originals-loss'}`}>
            {lastProfit >= 0 ? '+' : ''}${formatBetUsd(lastProfit)}
          </span>
        </div>
      )}
      <SvgCumulativeProfitLineChart
        profits={profits}
        height={height}
        stroke={stroke}
        fillArea
        stableYDomain
        domainResetKey={domainResetKey}
        betIndexStart={0}
        betIndexEnd={betCount}
      />
    </div>
  )
}
