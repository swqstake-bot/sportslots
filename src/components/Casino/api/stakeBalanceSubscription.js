import { createClient } from 'graphql-ws'

const BALANCE_UPDATED_SUBSCRIPTION = `
  subscription BalanceUpdated {
    balanceUpdated {
      currency
      amount
      __typename
    }
  }
`

/** GraphQL subscription für houseBets. Bet ist Union – Felder via Inline-Fragments. */
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
        ... on ThirdPartyBet {
          id
          active
          amount
          payout
          currency
        }
      }
      __typename
    }
  }
`

/** Edge-Cases wo API-Name von slug-Konvention abweicht */
const GAME_NAME_SLUG_OVERRIDES = {
  "rogue's riches": 'rogues-riches',
  "raga's rock": 'ragas-rock',
  "ragna's rock": 'ragnas-rock',
  "ali baba's riches": 'ali-babas-riches',
  "aladdin's quest": 'aladdins-quest',
  "naughty nick's book": 'naughty-nicks-book',
  'great buffalo hold\'n win': 'great-buffalo-hold-n-win',
  'great buffalo hold’n win': 'great-buffalo-hold-n-win',
  'rosh immortality cube megaways': 'rosh-immortality-cube-megaways',
  'the sword and the grail excalibur': 'the-sword-and-the-grail-excalibur',
  'cat wilde and the incan quest': 'cat-wilde-and-the-incan-quest',
  'rich wilde and the tome of insanity': 'rich-wilde-and-the-tome-of-insanity',
  'rich wilde and the pearls of vishnu': 'rich-wilde-and-the-pearls-of-vishnu',
}

/**
 * Mappt game name zu slug für Filterung (Fallback wenn API keinen slug liefert)
 */
function gameNameToSlug(name) {
  if (!name || typeof name !== 'string') return ''
  const key = name.toLowerCase().trim()
  if (GAME_NAME_SLUG_OVERRIDES[key]) return GAME_NAME_SLUG_OVERRIDES[key]
  return key
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
          const tn = bet?.__typename || ''
          // CasinoBet, SoftswissBet, ThirdPartyBet (Hacksaw etc.)
          if (tn !== 'CasinoBet' && tn !== 'SoftswissBet' && tn !== 'ThirdPartyBet') return
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
 * Subscribes to balance updates via Stake GraphQL WebSocket.
 *
 * @param {string} accessToken - Session token (von getSessionToken)
 * @param {function} onUpdate - callback({ currency, amount })
 */
export function subscribeToBalanceUpdates(accessToken, onUpdate) {
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
          console.warn('[StakeBalanceWS] Connection error:', err?.message || err)
        },
      },
    })

    unsubscribe = client.subscribe(
      { query: BALANCE_UPDATED_SUBSCRIPTION },
      {
        next: (result) => {
          const bu = result?.data?.balanceUpdated
          if (!bu?.currency) return
          const amount = bu.amount != null ? Number(bu.amount) : 0
          onUpdate({
            currency: (bu.currency || '').toLowerCase(),
            amount,
          })
        },
        error: (err) => {
          console.warn('[StakeBalanceWS] Subscription error:', err?.message || err)
        },
        complete: () => {},
      }
    )
  } catch (err) {
    console.warn('[StakeBalanceWS] Failed to create client:', err?.message || err)
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
