import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

const USER_BALANCES_QUERY = `query UserBalances {
  user {
    id
    balances {
      available {
        amount
        currency
      }
      vault {
        amount
        currency
      }
    }
  }
}`

export async function fetchUserBalances(accessToken) {
  try {
    // Use Electron Bridge via StakeApi
    const result = await StakeApi.query(USER_BALANCES_QUERY, {})

    if (result.errors) {
       console.error('Stake Wallet Error:', result.errors)
       throw new Error(result.errors[0]?.message || 'GraphQL Error')
    }

    const user = result.data?.user
    if (!user) return { available: [], vault: [] }

    const balances = user.balances || []
    const available = []
    const vault = []

    for (const bal of balances) {
        if (bal.available && bal.available.amount > 0) {
            available.push({
                currency: bal.available.currency,
                amount: bal.available.amount
            })
        }
        if (bal.vault && bal.vault.amount > 0) {
            vault.push({
                currency: bal.vault.currency,
                amount: bal.vault.amount
            })
        }
    }

    return { available, vault }

  } catch (error) {
    console.error('fetchUserBalances failed:', error)
    throw error
  }
}
