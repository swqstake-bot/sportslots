import { useStakeAccountMeta } from '../../hooks/useStakeAccountMeta'

function formatUsd(value: number) {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function formatVipPercent(progress: number) {
  return (progress * 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatRemainingWager(value: number) {
  return Math.round(value).toLocaleString('de-DE')
}

function abbreviateRank(name: string) {
  if (name === 'Max') return name
  return name
    .replace(/^Platinum\s+/i, 'Plat ')
    .replace(/^Diamond\s+/i, 'Dia ')
    .replace(/^Obsidian\s+/i, 'Obs ')
}

interface HeaderAccountMetaProps {
  enabled: boolean
}

export function HeaderAccountMeta({ enabled }: HeaderAccountMetaProps) {
  const { meta } = useStakeAccountMeta(enabled)
  const { weeklyWagerUsd, vip } = meta

  if (!enabled || (weeklyWagerUsd == null && !vip)) return null

  const vipPctLabel = vip ? formatVipPercent(vip.progress) : '0,00'
  const vipPctWidth = vip ? Math.min(100, Math.max(0, vip.progress * 100)) : 0

  return (
    <div className="app-header-account-meta">
      {weeklyWagerUsd != null && (
        <div
          className="app-header-meta-pill"
          title="Weekly wager (active raffle progress)"
        >
          <span className="app-header-meta-label">Weekly</span>
          <span className="app-header-meta-value">${formatUsd(weeklyWagerUsd)}</span>
        </div>
      )}

      {vip && (
        <div
          className="app-header-vip"
          title={
            vip.nextRank === 'Max'
              ? `${vip.currentRank} — max rank`
              : `${vip.currentRank} → ${vip.nextRank} · ${vipPctLabel}% · $${formatRemainingWager(vip.remainingWager)} left`
          }
        >
          <div className="app-header-vip-head">
            <div className="app-header-vip-ranks">
              <span className="app-header-vip-rank">{abbreviateRank(vip.currentRank)}</span>
              <span className="app-header-vip-arrow" aria-hidden="true">
                →
              </span>
              <span className="app-header-vip-rank">{abbreviateRank(vip.nextRank)}</span>
            </div>
            <span className="app-header-vip-pct">{vipPctLabel}%</span>
          </div>
          <div className="app-header-vip-track" aria-hidden="true">
            <div className="app-header-vip-fill" style={{ width: `${vipPctWidth}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
