import { createClient } from 'graphql-ws'
import { CASINO_STORAGE_KEYS } from '../utils/storageRegistry'
import { toMinor } from '../utils/formatAmount'

const BALANCE_UPDATED_SUBSCRIPTION = `
  subscription BalanceUpdated {
    balanceUpdated {
      currency
      amount
      __typename
    }
  }
`

/** GraphQL subscription für houseBets. Bet ist Union – Felder via Inline-Fragments.
 * Hinweis: Stake sendet houseBets oft in Batches (mehrere auf einmal) – kein Delay auf unserer Seite. */
const HOUSEBETS_SUBSCRIPTION = `
  subscription HouseBets {
    houseBets {
      id
      iid
      game {
        name
        icon
        slug
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

/** Optional: auf `true` setzen = immer detaillierte houseBets-Logs (sehr laut). */
const DEBUG_HOUSEBETS_FORCE = false

/** In DevTools: `localStorage.setItem('slotbot_debug_housebets','1'); location.reload()` — dann RAW/compact Logs. */
const LS_DEBUG_HOUSEBETS = CASINO_STORAGE_KEYS.debugHouseBets

/**
 * @returns {boolean} Roh-Payload (`[houseBets] RAW`), compact OK/SKIP, SlotControl-Multi-Debug
 */
export function isDebugHouseBetsEnabled() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_DEBUG_HOUSEBETS) === '1') return true
  } catch (_) {}
  return DEBUG_HOUSEBETS_FORCE
}

/** @deprecated Nutze isDebugHouseBetsEnabled() — berücksichtigt localStorage nicht. */
export const DEBUG_HOUSEBETS = false

/** Gleiche Origin wie die eingeloggte Stake-Session (Electron), sonst keine/ falsche houseBets-Events. */
async function resolveStakeWebSocketUrl() {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.invoke) {
      const u = await window.electronAPI.invoke('get-stake-ws-url')
      if (typeof u === 'string' && /^wss:\/\//.test(u)) return u
    }
  } catch (_) {}
  return 'wss://stake.com/_api/websockets'
}

/** Union-Member, die wir in der Subscription abfragen (Felder müssen passen). */
const HOUSE_BETS_ALLOWED_TYPEN = new Set([
  'CasinoBet',
  'SoftswissBet',
  'ThirdPartyBet',
  'EvolutionBet',
  'MultiplayerCrashBet',
  'MultiplayerSlideBet',
  'RacingBet',
  'SportsBet',
  'SportBet',
  'SportsbookBet',
])

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
export async function subscribeToBetUpdates(accessToken, onUpdate) {
  if (!accessToken?.trim()) {
    return { disconnect() {} }
  }

  const wsUrl = await resolveStakeWebSocketUrl()

  let unsubscribe = null
  let client = null
  let debugNextCount = 0
  // Init-Log: hilft zu erkennen, ob die Subscription überhaupt startet
  try {
    const dbg = isDebugHouseBetsEnabled()
    console.warn('[StakeBetWS] subscribeToBetUpdates init', {
      hasToken: !!accessToken,
      tokenLen: accessToken?.length,
      wsUrl,
      debug: dbg,
      houseBetsDebugHint: dbg
        ? 'aus (localStorage slotbot_debug_housebets löschen oder !=1, dann Reload)'
        : 'ein: localStorage.setItem("slotbot_debug_housebets","1"); location.reload()',
    })
  } catch (_) {}

  try {
    client = createClient({
      url: wsUrl,
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
          debugNextCount += 1
          const doRawLog = isDebugHouseBetsEnabled() && debugNextCount <= 3
          const doCompactLog = isDebugHouseBetsEnabled() && debugNextCount <= 20

          if (doRawLog) {
            console.warn('[houseBets] RAW:', JSON.stringify(result?.data?.houseBets ?? result, null, 2))
          }
          const hb = result?.data?.houseBets
          if (!hb?.bet) {
            if (doCompactLog) console.warn('[houseBets] SKIP: kein bet')
            return
          }
          const { bet, game } = hb
          const tn = bet?.__typename || ''
          const isSportsType = /sport/i.test(tn)
          // Ohne passendes Inline-Fragment fehlen Felder — Typ muss zur GraphQL-Query passen.
          if (!HOUSE_BETS_ALLOWED_TYPEN.has(tn)) {
            if (doCompactLog) console.warn('[houseBets] SKIP: __typename=', tn)
            return
          }
          const amountRaw = Number(bet?.amount)
          const hasValidAmount = Number.isFinite(amountRaw) && amountRaw > 0
          if (!hasValidAmount && !isSportsType) {
            if (doCompactLog) console.warn('[houseBets] SKIP: amount<=0', { amount: amountRaw, bet })
            return
          }
          const payoutRaw = Number(bet?.payout)
          const payout = Number.isFinite(payoutRaw) && payoutRaw >= 0 ? payoutRaw : (isSportsType ? null : 0)
          const directPayoutMultiplier = Number(bet?.payoutMultiplier)
          const payoutMultiplier = Number.isFinite(directPayoutMultiplier) && directPayoutMultiplier > 0
            ? directPayoutMultiplier
            : (hasValidAmount && Number.isFinite(payout) ? payout / amountRaw : null)
          const houseId = hb?.iid ?? bet?.id ?? hb?.id
          const gameSlug = game?.slug || gameNameToSlug(game?.name) || ''
          const name = (game?.name || '').toLowerCase()
          const icon = (game?.icon || '').toLowerCase()
          // Heuristik: "Vault" in echten Slot-Games (z.B. "Lokis Vault") darf NICHT rausgefiltert werden.
          // Wir filtern nur echte "wallet/transfer/deposit/withdraw"-Systeme oder "vault"-UIs, die NICHT nach Slots aussehen.
          const looksLikeSlotGame = icon.includes('provider-slots') || icon.includes('slots')
          const isWalletLike = /wallet|transfer|deposit|withdraw/.test(name)
          const isVaultUiButNotSlots = name.includes('vault') && !looksLikeSlotGame
          if (isWalletLike || isVaultUiButNotSlots) {
            if (doCompactLog) console.warn('[houseBets] SKIP: gefiltert (wallet/transfer/deposit/withdraw + vault-non-slots)', { name, icon })
            return
          }
          const payload = {
            receivedAt: new Date().toISOString(),
            /** House-ID analog Logger: bevorzugt `houseBets.iid`, dann bet.id, dann houseBets.id */
            houseId,
            /** Bet-ID des Union-Objekts (provider-/bet-spezifisch) */
            betId: bet?.id ?? hb?.id ?? null,
            /** Raw `houseBets.iid` */
            iid: hb?.iid ?? null,
            betType: tn,
            gameName: game?.name || null,
            /** Union `bet.id` (oft RGS-/Provider-intern, z. B. 527… bei Third-Party) — nicht mit Share-`house:460…` verwechseln. */
            id: houseId,
            /** GraphQL `houseBets.iid` — Share-Identifier (z. B. house:… / casino:…), für Links wie FRIDA/Bet-Modal */
            shareIid: hb?.iid != null && String(hb.iid).trim() !== '' ? String(hb.iid).trim() : null,
            /** Top-Level `houseBets.id` — Fallback wenn `iid` fehlt */
            houseTopId: hb?.id != null && String(hb.id).trim() !== '' ? String(hb.id).trim() : null,
            gameSlug,
            amount: hasValidAmount ? amountRaw : null,
            payout,
            currency: (bet?.currency || '').toLowerCase(),
            payoutMultiplier,
            amountMultiplier: Number(bet?.amountMultiplier) || 0,
          }
          if (doCompactLog) console.warn('[houseBets] OK → onUpdate:', payload)
          onUpdate(payload)
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
 * @param {function} onUpdate - callback({
 *   currency: string,
 *   // Contract: GraphQL balanceUpdated is treated as major units.
 *   amount: number,        // alias for amountMajor (backward compatible)
 *   amountMajor: number,   // major units, e.g. USD / BTC
 *   amountMinor: number,   // normalized app minor units (cents/sats/zero-decimal integer)
 *   unit: 'major',
 * })
 */
export async function subscribeToBalanceUpdates(accessToken, onUpdate) {
  if (!accessToken?.trim()) {
    return { disconnect() {} }
  }

  const wsUrl = await resolveStakeWebSocketUrl()

  let unsubscribe = null
  let client = null

  try {
    client = createClient({
      url: wsUrl,
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
          const currency = (bu.currency || '').toLowerCase()
          const amountMajor = bu.amount != null ? Number(bu.amount) : 0
          const amountMinor = Number.isFinite(amountMajor) ? toMinor(amountMajor, currency) : 0
          onUpdate({
            currency,
            amount: amountMajor,
            amountMajor,
            amountMinor,
            unit: 'major',
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
