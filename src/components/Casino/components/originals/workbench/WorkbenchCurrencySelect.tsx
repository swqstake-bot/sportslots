import { ALL_CURRENCIES, CURRENCY_GROUPS } from '../../../constants/currencies'

interface WorkbenchCurrencySelectProps {
  value: string
  onChange: (currency: string) => void
  disabled?: boolean
  compact?: boolean
}

export default function WorkbenchCurrencySelect({
  value,
  onChange,
  disabled,
  compact,
}: WorkbenchCurrencySelectProps) {
  return (
    <label className={`originals-currency-select${compact ? ' originals-currency-select--compact' : ''}`}>
      {!compact && <span className="originals-currency-select-label">Currency</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="originals-currency-select-input"
        title="Bet currency"
      >
        <optgroup label="Crypto">
          {CURRENCY_GROUPS.crypto.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Fiat">
          {CURRENCY_GROUPS.fiat.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </optgroup>
        {!ALL_CURRENCIES.some((c) => c.value === value) && (
          <option value={value}>{value.toUpperCase()}</option>
        )}
      </select>
    </label>
  )
}
