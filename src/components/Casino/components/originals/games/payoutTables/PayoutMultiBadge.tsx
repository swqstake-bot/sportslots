import { formatPayoutMulti } from './formatPayoutMulti'

interface PayoutMultiBadgeProps {
  multi: number | null | undefined
  label?: string
  hint?: string
  className?: string
}

export default function PayoutMultiBadge({ multi, label = 'Payout', hint, className }: PayoutMultiBadgeProps) {
  if (multi == null || !Number.isFinite(multi)) return null

  return (
    <div className={`originals-payout-multi${className ? ` ${className}` : ''}`}>
      <span className="originals-payout-multi-label">{label}</span>
      <span className="originals-payout-multi-value">{formatPayoutMulti(multi)}</span>
      {hint ? <span className="originals-payout-multi-hint">{hint}</span> : null}
    </div>
  )
}
