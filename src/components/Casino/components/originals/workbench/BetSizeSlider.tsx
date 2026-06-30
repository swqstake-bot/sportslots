import TargetSliderControl from '../games/TargetSliderControl'

interface BetSizeSliderProps {
  value: number
  onChange: (n: number) => void
  currency: string
  disabled?: boolean
}

function clampBet(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0.01
  return Math.min(10_000, Math.max(0.00000001, n))
}

export default function BetSizeSlider({ value, onChange, currency, disabled }: BetSizeSliderProps) {
  const safe = clampBet(value)
  const cur = currency.toUpperCase()

  return (
    <div className="originals-bet-size-slider">
      <div className="originals-target-summary originals-target-summary--bet">
        <div className="originals-target-summary-stat originals-target-summary-stat--hero">
          <span className="originals-target-summary-label">Base bet</span>
          <strong className="originals-target-summary-value originals-target-summary-value--lg tabular-nums">
            {safe >= 1 ? safe.toFixed(2) : safe.toFixed(4)}
            <span className="originals-bet-size-currency"> {cur}</span>
          </strong>
        </div>
        <div className="originals-target-summary-stat">
          <span className="originals-target-summary-label">USD ref.</span>
          <strong className="originals-target-summary-value tabular-nums">${safe.toFixed(safe < 0.1 ? 4 : 2)}</strong>
        </div>
      </div>

      <TargetSliderControl
        label={`Stake (${cur})`}
        value={safe}
        onChange={(n) => onChange(clampBet(n))}
        min={0.01}
        max={10}
        inputMax={10_000}
        step={0.01}
        disabled={disabled}
        prominent={false}
        hint="Slider 0.01–10 · type larger amounts in the field"
      />
    </div>
  )
}
