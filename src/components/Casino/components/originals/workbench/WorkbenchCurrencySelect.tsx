import { ALL_CURRENCIES, CURRENCY_GROUPS } from '../../../constants/currencies'
import { useUserStore } from '../../../../../store/userStore'
import { formatWalletBalanceAmount } from '../../../../../utils/walletBalance'

interface WorkbenchCurrencySelectProps {
  value: string
  onChange: (currency: string) => void
  disabled?: boolean
  compact?: boolean
  /** Show balance next to each currency (Antebot-style). */
  showBalances?: boolean
}

function optionLabel(value: string, label: string, showBalances: boolean, balances: Record<string, number>) {
  if (!showBalances) return label
  const bal = balances[value.toLowerCase()]
  if (bal == null || !Number.isFinite(bal)) return label
  return `${label} · ${formatWalletBalanceAmount(bal, value)}`
}

export default function WorkbenchCurrencySelect({
  value,
  onChange,
  disabled,
  compact,
  showBalances = false,
}: WorkbenchCurrencySelectProps) {
  const balances = useUserStore((s) => s.balances)

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
              {optionLabel(c.value, c.label, showBalances, balances)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Fiat">
          {CURRENCY_GROUPS.fiat.map((c) => (
            <option key={c.value} value={c.value}>
              {optionLabel(c.value, c.label, showBalances, balances)}
            </option>
          ))}
        </optgroup>
        {!ALL_CURRENCIES.some((c) => c.value === value) && (
          <option value={value}>{optionLabel(value, value.toUpperCase(), showBalances, balances)}</option>
        )}
      </select>
    </label>
  )
}
