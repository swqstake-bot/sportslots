import TargetSliderControl from '../games/TargetSliderControl'
import { isGoldCoinCurrency } from '../../../utils/currencyMeta'

interface BetSizeSliderProps {
  value: number
  onChange: (n: number) => void
  currency: string
  disabled?: boolean
}

/** Crypto/fiat soft cap. EU gold/sweeps: high ceiling for large GC stakes. */
function betInputMax(currency: string): number {
  return isGoldCoinCurrency(currency) ? 1_000_000 : 10_000
}

function betSliderMax(currency: string): number {
  return isGoldCoinCurrency(currency) ? 100_000 : 10
}

/** Allow 0 (free / probe bets). Negative → 0. Unset/NaN → 0. */
function clampBet(n: number, currency: string): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(betInputMax(currency), n)
}

export default function BetSizeSlider({ value, onChange, currency, disabled }: BetSizeSliderProps) {
  const safe = clampBet(value, currency)
  const cur = currency.toUpperCase()
  const inputMax = betInputMax(currency)
  const sliderMax = betSliderMax(currency)
  const euGold = isGoldCoinCurrency(currency)

  return (
    <div className="originals-bet-size-slider">
      <div className="originals-target-summary originals-target-summary--bet">
        <div className="originals-target-summary-stat originals-target-summary-stat--hero">
          <span className="originals-target-summary-label">Base bet</span>
          <strong className="originals-target-summary-value originals-target-summary-value--lg tabular-nums">
            {safe === 0 ? '0' : safe >= 1 ? safe.toFixed(2) : safe.toFixed(4)}
            <span className="originals-bet-size-currency"> {cur}</span>
          </strong>
        </div>
        <div className="originals-target-summary-stat">
          <span className="originals-target-summary-label">USD ref.</span>
          <strong className="originals-target-summary-value tabular-nums">
            ${safe === 0 ? '0' : safe.toFixed(safe < 0.1 ? 4 : 2)}
          </strong>
        </div>
      </div>

      <TargetSliderControl
        label={`Stake (${cur})`}
        value={safe}
        onChange={(n) => onChange(clampBet(n, currency))}
        min={0}
        max={sliderMax}
        inputMax={inputMax}
        step={euGold ? 1 : 0.01}
        disabled={disabled}
        prominent={false}
        hint={
          euGold
            ? '0 = no stake · slider 0–100000 · type up to 1M in the field'
            : '0 = no stake · slider 0–10 · type larger amounts in the field'
        }
      />
    </div>
  )
}
