import { createClient } from 'graphql-ws'
import { fetchUserBalances } from './stakeWallet'

/** GraphQL subscription für houseBets (Stake WebSocket).
 *  BetBet ist Union/Interface – Felder nur via Inline-Fragments auf konkrete Typen. */
const HOUSEBETS_SUBSCRIPTION = `
  subscription HouseBets {
    houseBets {
      id
      iid
      game {
        name
        icon
        __typename
      }
      bet {
        __typename
        ... on CasinoBet {
          id
          active
          payoutMultiplier
          amountMultiplier
          amount
          payout
          updatedAt
          currency
        }
        ... on SoftswissBet {
          id
          active
          payoutMultiplier
          amount
          payout
          updatedAt
          currency
        }
        ... on EvolutionBet {
          id
          active
          payoutMultiplier
          amount
          payout
          createdAt
          currency
        }
        ... on MultiplayerCrashBet {
          id
          active
          payoutMultiplier
          amount
          payout
          updatedAt
          currency
        }
        ... on MultiplayerSlideBet {
          id
          active
          payoutMultiplier
          amount
          payout
          updatedAt
          currency
        }
        ... on RacingBet {
          id
          active
          payoutMultiplier
          amount
          payout
          updatedAt
          currency
        }
      }
      __typename
    }
  }
`

/**
 * Mappt game name zu slug für Filterung (Fallback wenn API keinen slug liefert)
 */
function gameNameToSlug(name) {
  if (!name || typeof name !== 'string') return ''
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Subscribes to bet updates via Stake GraphQL WebSocket (graphql-transport-ws).
 * Liefert Bets direkt mit amount/payout in lesbarem Format (keine RGS-Skalierung nötig).
 *
 * @param {string} accessToken - Session token (von getSessionToken)
 * @param {function} onUpdate - callback(bet) mit { gameSlug, amount, payout, currency, id, ... }
 */
export function subscribeToBetUpdates(accessToken, onUpdate) {
  if (!accessToken?.trim()) {
    return { disconnect() {} }
  }

  let unsubscribe = null
  let client = null

  try {
    client = createClient({
      url: 'wss://stake.com/_api/websockets',
      connectionParams: {
        accessToken,
        language: 'de',
        lockdownToken: `sl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      lazy: true,
      retryAttempts: 3,
      on: {
        error: (err) => {
          console.warn('[StakeBetWS] Connection error:', err?.message || err)
        },
      },
    })

    unsubscribe = client.subscribe(
      { query: HOUSEBETS_SUBSCRIPTION },
      {
        next: (result) => {
          const hb = result?.data?.houseBets
          if (!hb?.bet) return
          const { bet, game } = hb
          // Nur echte Slot-Bets: CasinoBet (Stake-Slots), SoftswissBet (Stake Engine)
          // Vault/Withdrawal/Transfer etc. ignorieren
          const tn = bet?.__typename || ''
          if (tn !== 'CasinoBet' && tn !== 'SoftswissBet') return
          const amount = Number(bet?.amount) ?? 0
          if (amount <= 0) return
          const gameSlug = game?.slug || gameNameToSlug(game?.name) || ''
          const name = (game?.name || '').toLowerCase()
          if (/vault|wallet|transfer|deposit|withdraw/.test(name)) return
          onUpdate({
            id: bet?.id || hb?.iid || hb?.id,
            gameSlug,
            amount,
            payout: Number(bet?.payout) ?? 0,
            currency: (bet?.currency || '').toLowerCase(),
            payoutMultiplier: Number(bet?.payoutMultiplier) ?? 0,
            amountMultiplier: Number(bet?.amountMultiplier) ?? 0,
          })
        },
        error: (err) => {
          console.warn('[StakeBetWS] Subscription error:', err?.message || err)
        },
        complete: () => {
          // Subscription beendet (z.B. bei disconnect)
        },
      }
    )
  } catch (err) {
    console.warn('[StakeBetWS] Failed to create client:', err?.message || err)
  }

  return {
    disconnect() {
      try {
        if (typeof unsubscribe === 'function') unsubscribe()
        if (client?.dispose) client.dispose()
      } catch (_) {}
    },
  }
}

/**
 * Fetch user balance (Polling helper)
 * Can be used by components to keep balance in sync
 * Polls every 5 seconds.
 */
export function subscribeToBalanceUpdates(accessToken, onUpdate) {
   if (!accessToken) return { disconnect() {} }

   let active = true
   let intervalId = null

   const poll = async () => {
     if (!active) return
     try {
       const { available } = await fetchUserBalances(accessToken)
       if (!active) return
       
       // Emit updates for each currency found
       for (const bal of available) {
         onUpdate({
           currency: bal.currency,
           amount: bal.amount
         })
       }
     } catch (err) {
       // Silent fail on poll error
       // console.error("Balance poll error", err)
     }
   }

   // Initial poll
   poll()

   // Set interval
   intervalId = setInterval(poll, 5000)

   return { 
     disconnect() {
       active = false
       if (intervalId) clearInterval(intervalId)
     } 
   }
}
