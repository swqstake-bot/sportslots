import { StakeApi } from '../../../api/client'

const CREATE_VAULT_DEPOSIT = `
mutation CreateVaultDeposit($currency: CurrencyEnum!, $amount: Float!) {
  createVaultDeposit(currency: $currency, amount: $amount) {
    id
    amount
    currency
    __typename
  }
}
`

export type VaultDepositResult = {
  id: string
  amount: number
  currency: string
  __typename: string
}

export async function createVaultDeposit(
  currency: string,
  amount: number
): Promise<VaultDepositResult> {
  const result = await StakeApi.mutate<{ createVaultDeposit: VaultDepositResult }>(
    CREATE_VAULT_DEPOSIT,
    { currency: currency.toUpperCase(), amount }
  )
  return result.data.createVaultDeposit
}
