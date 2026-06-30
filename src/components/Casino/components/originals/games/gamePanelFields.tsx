import type { ReactNode } from 'react'

export const fieldInputCls =
  'w-full min-w-0 bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-sm disabled:opacity-60 tabular-nums focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]'

export function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="originals-field-group">
      <div className="originals-field-group-head">
        <span className="originals-field-group-title">{title}</span>
        {hint && <span className="originals-field-group-hint">{hint}</span>}
      </div>
      <div className="originals-field-group-body">{children}</div>
    </div>
  )
}

export function NumField({
  label,
  value,
  onChange,
  readOnly,
  min,
  max,
  step,
  suffix,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  readOnly?: boolean
  min?: number
  max?: number
  step?: number | 'any'
  suffix?: string
}) {
  return (
    <label className="originals-field">
      <span className="originals-field-label">{label}</span>
      <div className="originals-field-input-wrap">
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          disabled={readOnly}
          className={fieldInputCls}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        {suffix && <span className="originals-field-suffix">{suffix}</span>}
      </div>
    </label>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  readOnly,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  options: { value: string; label: string }[]
}) {
  return (
    <label className="originals-field">
      <span className="originals-field-label">{label}</span>
      <select disabled={readOnly} className={fieldInputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SegToggle({
  label,
  value,
  onChange,
  readOnly,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  options: { value: string; label: string }[]
}) {
  return (
    <div className="originals-field">
      <span className="originals-field-label">{label}</span>
      <div className="originals-seg-row">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={readOnly}
            className={`originals-seg-btn${value === o.value ? ' is-active' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
  onBlur,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
  placeholder?: string
  onBlur?: (v: string) => void
}) {
  return (
    <label className="originals-field originals-field--full">
      <span className="originals-field-label">{label}</span>
      <input
        type="text"
        disabled={readOnly}
        className={fieldInputCls}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      />
    </label>
  )
}

export function parseCsvNumbers(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
}

const DIFF_OPTS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
  { value: 'master', label: 'Master' },
]

export function DifficultyField({
  value,
  onChange,
  readOnly,
}: {
  value: string
  onChange: (d: string) => void
  readOnly?: boolean
}) {
  return (
    <SelectField label="Difficulty" value={value} readOnly={readOnly} onChange={onChange} options={DIFF_OPTS} />
  )
}
