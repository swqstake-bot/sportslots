import { StakeApi } from '../../../../../api/client'
import { Queries } from '../../../../../api/queries'
import { type UserBalance } from '../../../../../store/userStore'
import { usdToCurrencyAmount } from './runDiceRunner'
import {
  refreshWalletBalances,
  walletBalanceMajor,
  WALLET_BALANCE_POLL_MS,
} from '../../../../../utils/walletBalance'

export const DICE_RUNNER_BALANCE_POLL_MS = WALLET_BALANCE_POLL_MS

export { refreshWalletBalances }

/** Store balances are already major units (see WalletSelector / setBalancesFromApi). */
export function balanceMajor(currency: string): number {
  return walletBalanceMajor(currency)
}

export function requiredBetMajor(currency: string, betUsd: number, usdRates?: Record<string, number>): number {
  return usdToCurrencyAmount(betUsd, currency, usdRates)
}

export function hasSufficientBalanceForBet(
  currency: string,
  betUsd: number,
  usdRates?: Record<string, number>
): boolean {
  const need = requiredBetMajor(currency, betUsd, usdRates)
  if (!(need > 0)) return false
  return balanceMajor(currency) >= need * 0.999
}

// Re-export for any legacy imports expecting FetchBalances path
export async function fetchBalancesFromApi(): Promise<UserBalance[] | undefined> {
  const res = await StakeApi.query<{ user?: { balances?: UserBalance[] } }>(Queries.FetchBalances)
  return res.data?.user?.balances
}
