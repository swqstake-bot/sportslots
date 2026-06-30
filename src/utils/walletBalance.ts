import { StakeApi } from '../api/client'
import { Queries } from '../api/queries'
import { useUserStore, type UserBalance } from '../store/userStore'
import { convertToUsd, getMinorFactor, normalizeCurrencyCode } from './monetaryContract'

export const WALLET_BALANCE_POLL_MS = 5000

export async function refreshWalletBalances(): Promise<void> {
  const res = await StakeApi.query<{ user?: { balances?: UserBalance[] } }>(Queries.FetchBalances)
  const list = res.data?.user?.balances
  if (Array.isArray(list)) {
    useUserStore.getState().setBalancesFromApi(list)
  }
}

export function walletBalanceMajor(currency: string): number {
  const cur = (currency || 'usdc').toLowerCase()
  return Number(useUserStore.getState().balances[cur] ?? 0)
}

export function formatWalletBalanceAmount(amount: number, currency: string): string {
  const curr = normalizeCurrencyCode(currency)
  const factor = getMinorFactor(curr)
  const digits = factor === 1 ? 0 : factor === 100 ? 2 : 8
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatWalletBalanceUsdLine(
  amount: number,
  currency: string,
  usdRates?: Record<string, number>
): string {
  const usdConv = convertToUsd(amount, currency, 'major', usdRates)
  if (usdConv.usdAmount != null && Number.isFinite(usdConv.usdAmount)) {
    return `≈ $${usdConv.usdAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }
  return '≈ $—'
}
