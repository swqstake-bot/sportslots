import { buildActiveTargetItems } from '../workbench/activeTargetItems'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

interface GameTargetSummaryProps {
  gameSlug: string
  options: OriginalsWorkbenchOptions
  currency?: string
  /** Omit currency + base bet (shown in profile summary) */
  gameOnly?: boolean
}

export default function GameTargetSummary({ gameSlug, options, currency = 'usdc', gameOnly }: GameTargetSummaryProps) {
  const items = buildActiveTargetItems(gameSlug, options, currency).filter((item) => {
    if (!gameOnly) return true
    return !['Currency', 'Base bet'].includes(item.label)
  })

  if (items.length === 0) return null

  return (
    <div className="originals-target-summary originals-target-summary--inline">
      {items.map((item) => (
        <div key={item.label} className="originals-target-summary-stat">
          <span className="originals-target-summary-label">{item.label}</span>
          <strong className="originals-target-summary-value tabular-nums">{item.value}</strong>
        </div>
      ))}
    </div>
  )
}
