import { useEffect, useState } from 'react'
import { useUserStore } from '../store/userStore'
import {
  formatWalletBalanceAmount,
  formatWalletBalanceUsdLine,
} from '../utils/walletBalance'
import {
  acquireWalletBalanceSync,
  subscribeWalletBalanceSync,
} from './walletBalanceSync'

type SyncSnapshot = {
  usdRates: Record<string, number>
  lastPollAt: number | null
  lastLiveAt: number | null
}

type UseLiveWalletBalanceOptions = {
  accessToken?: string
  /** Poll GraphQL balances (default true). Set false when another view already syncs. */
  poll?: boolean
  /** Subscribe to balanceUpdated WS (default true). */
  live?: boolean
  /** Join global sync without starting poll/WS (read-only consumer). */
  syncOnly?: boolean
}

/**
 * Single source for wallet balance display — reads userStore + shared sync (poll/WS).
 */
export function useLiveWalletBalance(
  currency: string,
  options: UseLiveWalletBalanceOptions = {}
) {
  const cur = (currency || 'usdc').toLowerCase()
  const balance = useUserStore((s) => s.balances[cur] ?? 0)
  const { accessToken, poll = true, live = true, syncOnly = false } = options

  const [syncSnap, setSyncSnap] = useState<SyncSnapshot>(() => ({
    usdRates: {},
    lastPollAt: null,
    lastLiveAt: null,
  }))

  useEffect(() => subscribeWalletBalanceSync(setSyncSnap), [])

  useEffect(() => {
    if (syncOnly) return undefined
    return acquireWalletBalanceSync({ accessToken, poll, live })
  }, [accessToken, poll, live, syncOnly])

  const { usdRates, lastLiveAt, lastPollAt } = syncSnap
  const formattedNative = `${formatWalletBalanceAmount(balance, cur)} ${cur.toUpperCase()}`
  const formattedUsd = formatWalletBalanceUsdLine(balance, cur, usdRates)

  return {
    balance,
    formattedNative,
    formattedUsd,
    usdRates,
    lastLiveAt,
    lastPollAt,
    isLive: lastLiveAt != null && (lastPollAt == null || lastLiveAt >= lastPollAt - 1000),
  }
}

/** Start shared wallet sync without binding to a currency (e.g. WalletView, SlotControl). */
export function useWalletBalanceSync(options: Omit<UseLiveWalletBalanceOptions, 'syncOnly'> = {}) {
  const { accessToken, poll = true, live = true } = options
  const [syncSnap, setSyncSnap] = useState<SyncSnapshot>(() => ({
    usdRates: {},
    lastPollAt: null,
    lastLiveAt: null,
  }))

  useEffect(() => subscribeWalletBalanceSync(setSyncSnap), [])
  useEffect(() => acquireWalletBalanceSync({ accessToken, poll, live }), [accessToken, poll, live])

  return syncSnap
}
