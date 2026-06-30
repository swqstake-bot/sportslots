import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { buildActiveTargetItems } from './activeTargetItems'

interface ActiveTargetSummaryProps {
  gameSlug: string
  options: OriginalsWorkbenchOptions
  currency: string
}

export default function ActiveTargetSummary({ gameSlug, options, currency }: ActiveTargetSummaryProps) {
  const items = buildActiveTargetItems(gameSlug, options, currency)

  return (
    <div className="originals-active-target" aria-label="Active bet target">
      {items.map((item) => (
        <div key={item.label} className="originals-active-target-item">
          <span className="originals-active-target-label">{item.label}</span>
          <span className="originals-active-target-value tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  )
}
