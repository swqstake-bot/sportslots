import { useCallback, useId } from 'react'
import { fieldInputCls } from './gamePanelFields'

export interface TargetSliderControlProps {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Max for number input (can exceed slider max) */
  inputMax?: number
  step?: number
  readOnly?: boolean
  disabled?: boolean
  suffix?: string
  hint?: string
  /** Show large value readout above slider */
  prominent?: boolean
}

export default function TargetSliderControl({
  label,
  value,
  onChange,
  min = 1.01,
  max = 100,
  inputMax,
  step = 0.01,
  readOnly,
  disabled,
  suffix,
  hint,
  prominent = true,
}: TargetSliderControlProps) {
  const id = useId()
  const isDisabled = disabled || readOnly
  const numMax = inputMax ?? max
  const safe = Math.min(numMax, Math.max(min, value))
  const sliderVal = Math.min(max, safe)

  const fromSlider = useCallback(
    (raw: string) => {
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      onChange(Math.min(numMax, Math.max(min, n)))
    },
    [max, min, numMax, onChange]
  )

  return (
    <div className="originals-target-slider">
      <div className="originals-target-slider-head">
        <label htmlFor={id} className="originals-field-label">
          {label}
        </label>
        {prominent && (
          <span className="originals-target-slider-hero tabular-nums">
            {safe.toFixed(step >= 1 ? 0 : 2)}
            {suffix && <span className="originals-target-slider-suffix">{suffix}</span>}
          </span>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        value={sliderVal}
        onChange={(e) => fromSlider(e.target.value)}
        className="originals-range"
      />
      <div className="originals-target-slider-foot">
        <input
          type="number"
          min={min}
          max={numMax}
          step={step}
          disabled={isDisabled}
          className={`${fieldInputCls} originals-target-slider-input`}
          value={safe}
          onChange={(e) => fromSlider(e.target.value)}
        />
        {suffix && <span className="originals-field-suffix">{suffix}</span>}
      </div>
      {hint && <p className="originals-target-slider-hint">{hint}</p>}
    </div>
  )
}
