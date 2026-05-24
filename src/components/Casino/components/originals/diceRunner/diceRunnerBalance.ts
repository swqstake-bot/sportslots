import { StakeApi } from '../../../../../api/client'
import { Queries } from '../../../../../api/queries'
import { useUserStore, type UserBalance } from '../../../../../store/userStore'
import { usdToCurrencyAmount } from './runDiceRunner'

export const DICE_RUNNER_BALANCE_POLL_MS = 3000

export async function refreshWalletBalances(): Promise<void> {
  const res = await StakeApi.query<{ user?: { balances?: UserBalance[] } }>(Queries.FetchBalances)
  const list = res.data?.user?.balances
  if (Array.isArray(list)) {
    useUserStore.getState().setBalancesFromApi(list)
  }
}

/** Store balances are already major units (see WalletSelector / setBalancesFromApi). */
export function balanceMajor(currency: string): number {
  const cur = (currency || 'usdc').toLowerCase()
  return Number(useUserStore.getState().balances[cur] ?? 0)
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
