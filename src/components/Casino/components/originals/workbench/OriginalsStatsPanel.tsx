import {
  formatScriptSessionDuration,
  type ScriptSessionStats,
} from '../scriptEngine/scriptSessionStats'
import { formatBetUsd } from './betDisplayUtils'

function StatItem({
  label,
  value,
  valueClass = '',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="originals-stat-item" title={`${label}: ${value}`}>
      <div className="originals-stat-item-label">{label}</div>
      <div className={`originals-stat-item-value tabular-nums${valueClass ? ` ${valueClass}` : ''}`}>{value}</div>
    </div>
  )
}

interface OriginalsStatsPanelProps {
  stats: ScriptSessionStats
  compact?: boolean
}

/** Session statistics grid (shared with script mode). */
export default function OriginalsStatsPanel({ stats, compact }: OriginalsStatsPanelProps) {
  const profitCls = stats.profit >= 0 ? 'originals-profit' : 'originals-loss'
  const green = 'originals-profit'
  const items: { label: string; value: string; valueClass?: string }[] = [
    { label: 'Bets', value: String(stats.bets) },
    { label: 'Wagered', value: `$${formatBetUsd(stats.totalWagered)}` },
    { label: 'W / L', value: `${stats.wins} / ${stats.losses}` },
    { label: 'Win%', value: `${stats.bets ? ((stats.wins / stats.bets) * 100).toFixed(1) : '0'}%` },
    {
      label: 'Profit',
      value: `${stats.profit >= 0 ? '+' : ''}$${formatBetUsd(stats.profit)}`,
      valueClass: profitCls,
    },
    { label: 'Max×', value: stats.maxMulti > 0 ? `${stats.maxMulti.toFixed(2)}×` : '—' },
    {
      label: 'B2B×',
      value: stats.maxB2bMulti > 1.001 ? `${stats.maxB2bMulti.toFixed(2)}×` : '—',
      valueClass: stats.maxB2bMulti > 1.001 ? green : undefined,
    },
    {
      label: 'Best',
      value: stats.maxWinUsd > 0 ? `$${formatBetUsd(stats.maxWinUsd)}` : '—',
      valueClass: stats.maxWinUsd > 0 ? green : undefined,
    },
    {
      label: 'Round+',
      value: stats.maxRoundProfitUsd > 0 ? `+$${formatBetUsd(stats.maxRoundProfitUsd)}` : '—',
      valueClass: stats.maxRoundProfitUsd > 0 ? green : undefined,
    },
    { label: 'MaxBet', value: stats.maxBetUsd > 0 ? `$${formatBetUsd(stats.maxBetUsd)}` : '—' },
    { label: 'Bets/s', value: stats.betsPerSec > 0 ? stats.betsPerSec.toFixed(2) : '—' },
    {
      label: 'B2B↑',
      value: stats.longestB2bStreak > 0 ? String(stats.longestB2bStreak) : '—',
      valueClass: stats.longestB2bStreak > 0 ? green : undefined,
    },
    { label: 'B2B', value: stats.currentB2bStreak > 0 ? String(stats.currentB2bStreak) : '—' },
    { label: 'Streak', value: stats.longestWinStreak > 0 ? String(stats.longestWinStreak) : '—' },
    { label: 'Time', value: formatScriptSessionDuration(stats.sessionElapsedMs) },
    { label: 'Peel', value: stats.b2bSecuredUsd > 0 ? `$${stats.b2bSecuredUsd.toFixed(2)}` : '—' },
    {
      label: 'Avg',
      value: stats.bets > 0 ? `$${(stats.totalWagered / stats.bets).toFixed(3)}` : '—',
    },
    {
      label: 'RTP',
      value: stats.rtp > 0 ? `${(stats.rtp * 100).toFixed(2)}%` : '—',
      valueClass: stats.rtp >= 1 ? green : stats.rtp > 0 ? 'originals-loss' : undefined,
    },
  ]

  return (
    <div className={`originals-stats-panel${compact ? ' originals-stats-panel--compact' : ''}`}>
      {items.map((item) => (
        <StatItem key={item.label} label={item.label} value={item.value} valueClass={item.valueClass} />
      ))}
    </div>
  )
}
