import { useLiveWalletBalance } from '../../../../../hooks/useLiveWalletBalance'
import WorkbenchCurrencySelect from './WorkbenchCurrencySelect'

interface OriginalsWalletBalanceProps {
  currency: string
  onChange: (currency: string) => void
  disabled?: boolean
  accessToken?: string
}

export default function OriginalsWalletBalance({
  currency,
  onChange,
  disabled,
  accessToken,
}: OriginalsWalletBalanceProps) {
  const { formattedNative, formattedUsd, isLive, lastLiveAt, lastPollAt } = useLiveWalletBalance(currency, {
    accessToken,
    syncOnly: true,
  })

  const liveHint =
    isLive && lastLiveAt
      ? 'Live balance (WebSocket)'
      : lastPollAt
        ? 'Balance synced'
        : 'Balance'

  return (
    <div className="originals-wallet-balance" title={liveHint}>
      <div className="originals-wallet-balance-amounts">
        <span className="originals-wallet-balance-native">{formattedNative}</span>
        <span className="originals-wallet-balance-usd">{formattedUsd}</span>
      </div>
      {isLive && <span className="originals-wallet-balance-live" aria-hidden title="Live" />}
      <WorkbenchCurrencySelect
        value={currency}
        onChange={onChange}
        disabled={disabled}
        compact
        showBalances
      />
    </div>
  )
}
