import { useEffect, useMemo } from 'react'
import {
  ALL_CURRENCIES,
  buildSelectableCurrencyOptions,
  groupSelectableCurrencyOptions,
  pickDefaultCurrency,
} from '../../../constants/currencies'
import { useUserStore } from '../../../../../store/userStore'
import { useStakeSiteStore } from '../../../../../store/stakeSiteStore'
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
  const availableCurrencies = useUserStore((s) => s.availableCurrencies)
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)

  const options = useMemo(() => {
    const owned = availableCurrencies?.length ? availableCurrencies : Object.keys(balances || {})
    return buildSelectableCurrencyOptions({
      site: preferredSite,
      ownedCodes: owned,
    })
  }, [preferredSite, availableCurrencies, balances])
  const groups = useMemo(() => groupSelectableCurrencyOptions(options), [options])

  useEffect(() => {
    const next = pickDefaultCurrency(options, value, preferredSite)
    if (next && next !== value) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-pick when site/options change
  }, [preferredSite, options])

  const selectValue = options.some((c: { value: string }) => c.value === value)
    ? value
    : pickDefaultCurrency(options, value, preferredSite)

  return (
    <label className={`originals-currency-select${compact ? ' originals-currency-select--compact' : ''}`}>
      {!compact && <span className="originals-currency-select-label">Currency</span>}
      <select
        value={selectValue}
        disabled={disabled || options.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="originals-currency-select-input"
        title="Bet currency"
      >
        {groups.crypto.length > 0 && (
          <optgroup label="Crypto">
            {groups.crypto.map((c) => (
              <option key={c.value} value={c.value}>
                {optionLabel(c.value, c.label, showBalances, balances)}
              </option>
            ))}
          </optgroup>
        )}
        {groups.fiat.length > 0 && (
          <optgroup label="Fiat">
            {groups.fiat.map((c) => (
              <option key={c.value} value={c.value}>
                {optionLabel(c.value, c.label, showBalances, balances)}
              </option>
            ))}
          </optgroup>
        )}
        {groups.goldCoins.length > 0 && (
          <optgroup label="GoldCoins">
            {groups.goldCoins.map((c) => (
              <option key={c.value} value={c.value}>
                {optionLabel(c.value, c.label, showBalances, balances)}
              </option>
            ))}
          </optgroup>
        )}
        {options.length === 0 && <option value="">No wallet</option>}
        {selectValue && !options.some((c: { value: string }) => c.value === selectValue) && !ALL_CURRENCIES.some((c) => c.value === selectValue) && (
          <option value={selectValue}>{optionLabel(selectValue, selectValue.toUpperCase(), showBalances, balances)}</option>
        )}
      </select>
    </label>
  )
}
