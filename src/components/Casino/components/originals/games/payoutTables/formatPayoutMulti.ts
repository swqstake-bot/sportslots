/** Format payout multiplier for display (modhub-style). */
export function formatPayoutMulti(multi: number): string {
  if (!Number.isFinite(multi)) return '—'
  if (multi >= 1_000_000) {
    return `${multi.toLocaleString('en-US', { maximumFractionDigits: 0 })}×`
  }
  if (multi >= 10_000) {
    return `${multi.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`
  }
  if (multi >= 1000) {
    return `${multi.toLocaleString('en-US', { maximumFractionDigits: 1 })}×`
  }
  if (multi >= 100) return `${multi.toFixed(0)}×`
  if (multi >= 10) return `${multi.toFixed(1)}×`
  return `${multi.toFixed(2)}×`
}
