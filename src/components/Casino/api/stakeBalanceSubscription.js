import { createClient } from 'graphql-ws'
import { CASINO_STORAGE_KEYS } from '../utils/storageRegistry'
import {
  convertMinorToUsdCents,
  normalizeHouseBetAmount,
  normalizeMajorAmount,
} from '../utils/monetaryContract'

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
          payoutMultiplier
          amount
          payout
          currency
        }
      }
      __typename
    }
  }
`

/** Fallback für Share-IDs wenn houseBets verzögert/fehlt (myBetUpdated.id oft schon house:…). */
const MY_BET_UPDATED_SUBSCRIPTION = `
  subscription MyBetUpdated {
    myBetUpdated {
      id
      currency
      amount
      payout
      multiplier
      game {
        id
        name
        slug
        __typename
      }
      __typename
    }
  }
`

const PROCESSED_HOUSEBET_KEYS_MAX = 2000

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
 * @param {Set<string>} processedKeys
 * @param {string|null|undefined} dedupeKey
 * @returns {boolean} true wenn Event neu (nicht Duplikat)
 */
function markHouseBetKeyProcessed(processedKeys, dedupeKey) {
  if (!dedupeKey) return true
  return markHouseBetKeysProcessed(processedKeys, [dedupeKey])
}

/**
 * houseBets (iid) und myBetUpdated (numerische id) können dasselbe Event sein —
 * alle bekannten IDs gemeinsam deduplizieren.
 * @param {Set<string>} processedKeys
 * @param {Array<string|null|undefined>} dedupeKeys
 * @returns {boolean} true wenn Event neu (nicht Duplikat)
 */
function markHouseBetKeysProcessed(processedKeys, dedupeKeys) {
  const unique = [...new Set((dedupeKeys || []).map((k) => (k != null ? String(k).trim() : '')).filter(Boolean))]
  if (unique.length === 0) return true
  if (unique.some((k) => processedKeys.has(k))) return false
  for (const k of unique) {
    processedKeys.add(k)
    if (processedKeys.size > PROCESSED_HOUSEBET_KEYS_MAX) {
      const first = processedKeys.values().next().value
      processedKeys.delete(first)
    }
  }
  return true
}

/**
 * @param {object} game
 * @param {boolean} doCompactLog
 */
function shouldSkipWalletLikeGame(game, doCompactLog) {
  const name = (game?.name || '').toLowerCase()
  const icon = (game?.icon || '').toLowerCase()
  const looksLikeSlotGame = icon.includes('provider-slots') || icon.includes('slots')
  const isWalletLike = /wallet|transfer|deposit|withdraw/.test(name)
  const isVaultUiButNotSlots = name.includes('vault') && !looksLikeSlotGame
  if (isWalletLike || isVaultUiButNotSlots) {
    if (doCompactLog) console.warn('[StakeBetWS] SKIP: gefiltert (wallet/vault)', { name, icon })
    return true
  }
  return false
}

/**
 * Normalisiert myBetUpdated (flaches Bet-Objekt) → gleiches Callback-Format wie houseBets.
 * @returns {object|null}
 */
function payloadFromMyBetUpdated(mb) {
  const rawId = mb?.id != null && String(mb.id).trim() !== '' ? String(mb.id).trim() : null
  if (!rawId) return null

  const isPrefixedShare = /^(house|casino):/i.test(rawId)
  const shareIid = isPrefixedShare ? rawId : null
  const providerBetId = /^\d+$/.test(rawId) ? rawId : null
  const dedupeKey = shareIid || rawId

  const game = mb?.game
  const currency = (mb?.currency || '').toLowerCase()
  const amountRaw = Number(mb?.amount)
  const amountCanonical = normalizeHouseBetAmount(amountRaw, currency)
  const hasValidAmount = Number.isFinite(amountCanonical.amountMajor) && amountCanonical.amountMajor > 0
  const payoutRaw = Number(mb?.payout)
  const payoutCanonical = normalizeHouseBetAmount(payoutRaw, currency)
  const payoutMajor = Number.isFinite(payoutCanonical.amountMajor) && payoutCanonical.amountMajor >= 0
    ? payoutCanonical.amountMajor
    : 0
  const directMultiplier = Number(mb?.multiplier)
  const payoutMultiplier = Number.isFinite(directMultiplier) && directMultiplier > 0
    ? directMultiplier
    : (hasValidAmount && Number.isFinite(payoutMajor) ? payoutMajor / amountCanonical.amountMajor : null)
  const houseId = shareIid ?? providerBetId ?? rawId

  return {
    dedupeKeys: [shareIid, providerBetId, rawId].filter(Boolean),
    dedupeKey: shareIid || rawId,
    payload: {
      receivedAt: new Date().toISOString(),
      houseId,
      betId: providerBetId,
      iid: shareIid,
      betType: mb?.__typename || 'Bet',
      gameName: game?.name || null,
      id: shareIid ?? rawId,
      shareIid,
      houseTopId: null,
      gameSlug: game?.slug || gameNameToSlug(game?.name) || '',
      amount: hasValidAmount ? amountCanonical.amountMajor : null,
      amountMajor: hasValidAmount ? amountCanonical.amountMajor : null,
      amountMinor: hasValidAmount ? amountCanonical.amountMinor : null,
      payout: payoutMajor,
      payoutMajor: Number.isFinite(payoutCanonical.amountMajor) ? payoutCanonical.amountMajor : null,
      payoutMinor: Number.isFinite(payoutCanonical.amountMinor) ? payoutCanonical.amountMinor : null,
      currency,
      payoutMultiplier,
      amountMultiplier: 0,
      unit: 'major',
      source: 'myBetUpdated',
    },
  }
}

/**
 * Subscribes to bet updates via Stake GraphQL WebSocket (graphql-transport-ws).
 * Liefert Bets direkt mit amount/payout in lesbarem Format (keine RGS-Skalierung nötig).
 * Abonniert houseBets und myBetUpdated (Fallback für Share-IDs).
 *
 * @param {string} accessToken - Session token (von getSessionToken)
 * @param {function} onUpdate - callback(bet) mit { gameSlug, amount, payout, currency, id, ... }
 */
export async function subscribeToBetUpdates(accessToken, onUpdate) {
  if (!accessToken?.trim()) {
    return { disconnect() {} }
  }

  const wsUrl = await resolveStakeWebSocketUrl()

  let unsubscribeHouseBets = null
  let unsubscribeMyBetUpdated = null
  let client = null
  let debugNextCount = 0
  let debugMyBetCount = 0
  const processedHouseBetKeys = new Set()
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

    unsubscribeHouseBets = client.subscribe(
      { query: HOUSEBETS_SUBSCRIPTION },
      {
        next: (result) => {
          debugNextCount += 1
          const doRawLog = isDebugHouseBetsEnabled() && debugNextCount <= 3
          const doCompactLog = isDebugHouseBetsEnabled() && debugNextCount <= 20

          if (doRawLog) {
            console.warn('[houseBets] RAW:', JSON.stringify(result?.data?.houseBets ?? result, null, 2))
          }
          const rawHouseBets = result?.data?.houseBets
          const houseBetItems = Array.isArray(rawHouseBets)
            ? rawHouseBets
            : rawHouseBets
              ? [rawHouseBets]
              : []
          if (houseBetItems.length === 0) {
            if (doCompactLog) console.warn('[houseBets] SKIP: keine houseBets im payload')
            return
          }

          for (const hb of houseBetItems) {
            const bet = hb?.bet
            if (!bet) {
              if (doCompactLog) console.warn('[houseBets] SKIP: kein bet')
              continue
            }
            const tn = bet?.__typename || ''
            const isSportsType = /sport/i.test(tn)
            // Ohne passendes Inline-Fragment fehlen Felder — Typ muss zur GraphQL-Query passen.
            if (!HOUSE_BETS_ALLOWED_TYPEN.has(tn)) {
              if (doCompactLog) console.warn('[houseBets] SKIP: __typename=', tn)
              continue
            }
            const game = hb?.game
            const shareIid = hb?.iid != null && String(hb.iid).trim() !== '' ? String(hb.iid).trim() : null
            const houseTopId = hb?.id != null && String(hb.id).trim() !== '' ? String(hb.id).trim() : null
            const providerBetId = bet?.id != null && String(bet.id).trim() !== '' ? String(bet.id).trim() : null
            const dedupeKey = shareIid || houseTopId || providerBetId
            if (!markHouseBetKeysProcessed(processedHouseBetKeys, [shareIid, houseTopId, providerBetId])) {
              if (doCompactLog) console.warn('[houseBets] SKIP: duplicate iid/id', dedupeKey)
              continue
            }

            const amountRaw = Number(bet?.amount)
            const amountCanonical = normalizeHouseBetAmount(amountRaw, bet?.currency)
            const hasValidAmount = Number.isFinite(amountCanonical.amountMajor) && amountCanonical.amountMajor > 0
            if (!hasValidAmount && !isSportsType && !dedupeKey) {
              if (doCompactLog) console.warn('[houseBets] SKIP: amount<=0 ohne iid/id', { amount: amountRaw, bet })
              continue
            }
            const payoutRaw = Number(bet?.payout)
            const payoutCanonical = normalizeHouseBetAmount(payoutRaw, bet?.currency)
            const payoutMajor = Number.isFinite(payoutCanonical.amountMajor) && payoutCanonical.amountMajor >= 0
              ? payoutCanonical.amountMajor
              : (isSportsType ? null : 0)
            const directPayoutMultiplier = Number(bet?.payoutMultiplier)
            const payoutMultiplier = Number.isFinite(directPayoutMultiplier) && directPayoutMultiplier > 0
              ? directPayoutMultiplier
              : (hasValidAmount && Number.isFinite(payoutMajor) ? payoutMajor / amountCanonical.amountMajor : null)
            const houseId = shareIid ?? providerBetId ?? houseTopId
            const gameSlug = game?.slug || gameNameToSlug(game?.name) || ''
            if (shouldSkipWalletLikeGame(game, doCompactLog)) continue
            const payload = {
              receivedAt: new Date().toISOString(),
              /** House-ID analog Logger: bevorzugt `houseBets.iid`, dann bet.id, dann houseBets.id */
              houseId,
              /** Bet-ID des Union-Objekts (provider-/bet-spezifisch) */
              betId: providerBetId ?? houseTopId ?? null,
              /** Raw `houseBets.iid` */
              iid: shareIid,
              betType: tn,
              gameName: game?.name || null,
              /** Union `bet.id` (oft RGS-/Provider-intern, z. B. 527… bei Third-Party) — nicht mit Share-`house:460…` verwechseln. */
              id: houseId,
              /** GraphQL `houseBets.iid` — Share-Identifier (z. B. house:… / casino:…), für Links wie FRIDA/Bet-Modal */
              shareIid,
              /** Top-Level `houseBets.id` — Fallback wenn `iid` fehlt */
              houseTopId,
              gameSlug,
              amount: hasValidAmount ? amountCanonical.amountMajor : null,
              amountMajor: hasValidAmount ? amountCanonical.amountMajor : null,
              amountMinor: hasValidAmount ? amountCanonical.amountMinor : null,
              payout: payoutMajor,
              payoutMajor: Number.isFinite(payoutCanonical.amountMajor) ? payoutCanonical.amountMajor : null,
              payoutMinor: Number.isFinite(payoutCanonical.amountMinor) ? payoutCanonical.amountMinor : null,
              currency: (bet?.currency || '').toLowerCase(),
              payoutMultiplier,
              amountMultiplier: Number(bet?.amountMultiplier) || 0,
              unit: 'major',
              source: 'houseBets',
            }
            if (doCompactLog) console.warn('[houseBets] OK → onUpdate:', payload)
            onUpdate(payload)
          }
        },
        error: (err) => {
          console.warn('[StakeBetWS] houseBets subscription error:', err?.message || err)
        },
        complete: () => {},
      }
    )

    unsubscribeMyBetUpdated = client.subscribe(
      { query: MY_BET_UPDATED_SUBSCRIPTION },
      {
        next: (result) => {
          debugMyBetCount += 1
          const doRawLog = isDebugHouseBetsEnabled() && debugMyBetCount <= 3
          const doCompactLog = isDebugHouseBetsEnabled() && debugMyBetCount <= 20

          if (doRawLog) {
            console.warn('[myBetUpdated] RAW:', JSON.stringify(result?.data?.myBetUpdated ?? result, null, 2))
          }
          const rawMyBet = result?.data?.myBetUpdated
          const myBetItems = Array.isArray(rawMyBet) ? rawMyBet : rawMyBet ? [rawMyBet] : []
          if (myBetItems.length === 0) {
            if (doCompactLog) console.warn('[myBetUpdated] SKIP: kein myBetUpdated im payload')
            return
          }

          for (const mb of myBetItems) {
            const parsed = payloadFromMyBetUpdated(mb)
            if (!parsed) {
              if (doCompactLog) console.warn('[myBetUpdated] SKIP: kein id')
              continue
            }
            if (shouldSkipWalletLikeGame(mb?.game, doCompactLog)) continue
            if (!markHouseBetKeysProcessed(processedHouseBetKeys, parsed.dedupeKeys || [parsed.dedupeKey])) {
              if (doCompactLog) console.warn('[myBetUpdated] SKIP: duplicate id', parsed.dedupeKey)
              continue
            }
            if (doCompactLog) console.warn('[myBetUpdated] OK → onUpdate:', parsed.payload)
            onUpdate(parsed.payload)
          }
        },
        error: (err) => {
          console.warn('[StakeBetWS] myBetUpdated subscription error:', err?.message || err)
        },
        complete: () => {},
      }
    )
  } catch (err) {
    console.warn('[StakeBetWS] Failed to create client:', err?.message || err)
  }

  return {
    disconnect() {
      try {
        if (typeof unsubscribeHouseBets === 'function') unsubscribeHouseBets()
        if (typeof unsubscribeMyBetUpdated === 'function') unsubscribeMyBetUpdated()
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
          const amountCanonical = normalizeMajorAmount(bu.amount != null ? Number(bu.amount) : 0, currency)
          const usd = convertMinorToUsdCents(amountCanonical.amountMinor, currency, {})
          onUpdate({
            currency,
            amount: amountCanonical.amountMajor,
            amountMajor: amountCanonical.amountMajor,
            amountMinor: amountCanonical.amountMinor,
            unit: 'major',
            source: 'balanceUpdated',
            fxStatus: usd.fxStatus,
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
