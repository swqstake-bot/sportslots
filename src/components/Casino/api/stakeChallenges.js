import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

const CURRENCY_CONFIG_QUERY = `query CurrencyConfiguration($isAcp: Boolean!) {
  currencyConfiguration(isAcp: $isAcp) {
    baseRates { currency baseRate }
  }
}`

/**
 * Holt Wechselkurse (Währung → USD). Gibt Map zurück: { usdt: 1, eur: 0.84, ... }
 * @param {string} accessToken - unused in Electron
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchCurrencyRates(accessToken) {
  try {
    const raw = localStorage.getItem('slotbot_currency_rates_cache')
    if (raw) {
      const { ts, map } = JSON.parse(raw)
      if (map && ts && Date.now() - ts < 30 * 60 * 1000) {
        return map
      }
    }
  } catch (_) {}

  const t0 = Date.now()
  const variables = { isAcp: false }

  try {
    const response = await StakeApi.query(CURRENCY_CONFIG_QUERY, variables)
    const json = response.data

    logApiCall({
      type: 'stake/currencyConfiguration',
      endpoint: 'graphql',
      request: variables,
      response: json,
      error: null,
      durationMs: Date.now() - t0,
    })

    const cfg = json?.currencyConfiguration
    if (!cfg) {
      return {}
    }

    const map = {}
    for (const r of cfg.baseRates || []) {
      const code = String(r?.currency || '').toLowerCase()
      const usdRate = Number(r?.baseRate)
      if (code && Number.isFinite(usdRate) && usdRate > 0) map[code] = usdRate
    }

    try {
      localStorage.setItem('slotbot_currency_rates_cache', JSON.stringify({ ts: Date.now(), map }))
    } catch (_) {}
    return map
  } catch (error) {
    logApiCall({
      type: 'stake/currencyConfiguration',
      endpoint: 'graphql',
      request: variables,
      response: null,
      error: error.message,
      durationMs: Date.now() - t0,
    })
    return {}
  }
}

const SUPPORTED_CURRENCIES_CACHE_KEY = 'slotbot_supported_currencies_cache'
const SUPPORTED_CURRENCIES_CACHE_TTL_MS = 60 * 60 * 1000

export async function fetchSupportedCurrencies(accessToken) {
  try {
    const raw = localStorage.getItem(SUPPORTED_CURRENCIES_CACHE_KEY)
    if (raw) {
      const { ts, list } = JSON.parse(raw)
      if (Array.isArray(list) && ts && Date.now() - ts < SUPPORTED_CURRENCIES_CACHE_TTL_MS) {
        return list
      }
    }
  } catch (_) {}

  const t0 = Date.now()
  const variables = { isAcp: false }

  try {
    const response = await StakeApi.query(CURRENCY_CONFIG_QUERY, variables)
    const json = response.data

    logApiCall({
      type: 'stake/currencyConfiguration',
      endpoint: 'graphql',
      request: variables,
      response: json,
      error: null,
      durationMs: Date.now() - t0,
    })

    const list = (json?.currencyConfiguration?.currencies || [])
      .map((c) => String(c?.name || '').toLowerCase())
      .filter(Boolean)

    try {
      localStorage.setItem(SUPPORTED_CURRENCIES_CACHE_KEY, JSON.stringify({ ts: Date.now(), list }))
    } catch (_) {}
    return list
  } catch (error) {
    return []
  }
}

// Vollständige Query inkl. Fragmente – exakt wie in docs/stake-graphql-apis.md (Stake API erwartet diese Struktur)
const CHALLENGE_LIST_QUERY = `query ChallengeList($limit: Int!, $offset: Int!, $sort: ChallengeSort!, $type: ChallengeFilterType!, $count: ChallengeCountType!, $includeAffiliateData: Boolean = true) {
  user {
    id
    challengeCount(type: $count)
    challengeList(limit: $limit, offset: $offset, sort: $sort, type: $type) {
      ...Challenge
    }
  }
}

fragment Challenge on Challenge {
  id
  type
  active
  adminCreated
  completedAt
  award
  claimCount
  claimMax
  currency
  isRefunded
  minBetUsd
  betCurrency
  startAt
  expireAt
  updatedAt
  createdAt
  targetMultiplier
  game {
    id
    name
    slug
    thumbnailUrl
    groupGames { group { id slug type } }
  }
  creatorUser { ...UserTags }
  affiliateUser @include(if: $includeAffiliateData) { ...UserTags }
  wins { id claimedBy { ...UserTags } }
}

fragment UserTags on User {
  id
  name
  isMuted
  isHighroller
  flags { flag rank createdAt }
  roles { name expireAt message }
  createdAt
  preferenceHideBets
}`

/** Stake-API erlaubt max. 24 pro Request (number_less_equal sonst). */
const PAGE_SIZE = 24

/** Provider-Gruppen-Slug (z. B. paperclip-gaming) aus Challenge.game — für Hunter-Filter. */
export function extractProviderGroupSlug(game) {
  if (!game?.groupGames?.length) return undefined
  const providerGroup = game.groupGames.find((g) => g?.group?.type === 'provider')
  return providerGroup?.group?.slug || undefined
}

/**
 * Fetch active Stake challenges (casino/slot challenges).
 * @param {string} accessToken - Stake session token (unused in Electron IPC)
 * @param {{ limit?: number, offset?: number }} options - limit/offset pro Request (max 24)
 * @returns {Promise<{ challenges: Array, totalCount: number }>}
 */
export async function fetchChallengeList(accessToken, options = {}) {
  const { limit = PAGE_SIZE, offset = 0, sort = 'startAt', type = 'available', count = 'available' } = options
  const t0 = Date.now()
  const variables = {
      sort,
      type,
      count,
      limit,
      offset,
      includeAffiliateData: true,
  }

  try {
    const response = await StakeApi.query(CHALLENGE_LIST_QUERY, variables)
    const json = response.data

    logApiCall({
      type: 'stake/challengeList',
      endpoint: 'graphql',
      request: variables,
      response: json,
      error: null,
      durationMs: Date.now() - t0,
    })

    if (!json?.user) {
        throw new Error('Invalid response structure')
    }
    
    const challenges = json.user.challengeList || []
    const totalCount = json.user.challengeCount || 0

    return { challenges, totalCount }

  } catch (error) {
    console.error('Fetch challenges error', error)
    logApiCall({
      type: 'stake/challengeList',
      endpoint: 'graphql',
      request: variables,
      response: null,
      error: error.message,
      durationMs: Date.now() - t0,
    })
    return { challenges: [], totalCount: 0 }
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Lädt alle aktiven Challenges seitenweise.
 */
export async function fetchAllChallenges(accessToken) {
  const all = []
  let offset = 0
  let totalCount = 0
  while (true) {
    let result
    try {
      result = await fetchChallengeList(accessToken, { limit: PAGE_SIZE, offset, type: 'available', count: 'available' })
    } catch (err) {
      await delay(2500)
      try {
        result = await fetchChallengeList(accessToken, { limit: PAGE_SIZE, offset, type: 'available', count: 'available' })
      } catch (retryErr) {
        throw retryErr
      }
    }
    const { challenges, totalCount: total } = result
    totalCount = total
    
    // Filter & map consistent with original SwaqSlotbot logic
    const mapped = challenges
      .filter((c) => c.type === 'casino' && c.game?.slug)
      .map((c) => ({
        id: c.id,
        type: c.type,
        active: c.active,
        completedAt: c.completedAt,
        targetMultiplier: c.targetMultiplier,
        award: c.award,
        currency: c.currency,
        minBetUsd: c.minBetUsd,
        gameSlug: c.game.slug,
        gameName: c.game.name,
        thumbnailUrl: c.game.thumbnailUrl,
        providerGroupSlug: extractProviderGroupSlug(c.game),
      }))
      
    all.push(...mapped)
    if (challenges.length < PAGE_SIZE || all.length >= totalCount) break
    offset += PAGE_SIZE
    await delay(500)
  }
  return { challenges: all, totalCount }
}

/**
 * Lädt abgeschlossene Challenges (type: completed).
 */
export async function fetchCompletedChallenges(accessToken) {
  const all = []
  let offset = 0
  while (true) {
    const result = await fetchChallengeList(accessToken, { 
        limit: PAGE_SIZE, 
        offset, 
        sort: 'completedAt', 
        type: 'completed', 
        count: 'completed' 
    })
    
    const { challenges } = result
    
    if (!challenges || challenges.length === 0) break
    
    const mapped = challenges
      .filter((c) => c.type === 'casino' && c.game?.slug)
      .map((c) => ({
        id: c.id,
        type: c.type,
        active: c.active,
        targetMultiplier: c.targetMultiplier,
        award: c.award,
        currency: c.currency,
        minBetUsd: c.minBetUsd,
        gameSlug: c.game.slug,
        gameName: c.game.name,
        thumbnailUrl: c.game.thumbnailUrl,
        completedAt: c.completedAt,
        providerGroupSlug: extractProviderGroupSlug(c.game),
      }))

    all.push(...mapped)
    if (challenges.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    await delay(500)
  }
  return { challenges: all }
}
