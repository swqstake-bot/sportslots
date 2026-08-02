import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'
import { executeWithReliability } from '../../../utils/reliabilityRuntime'

const CURRENCY_CONFIG_QUERY = `query CurrencyConfiguration($isAcp: Boolean!) {
  currencyConfiguration(isAcp: $isAcp) {
    baseRates { currency baseRate }
  }
}`

/**
 * Holt Wechselkurse (Währung → USD). Gibt Map zurück: { usdt: 1, eur: 0.84, ... }
 * @param {string} accessToken - unused in Electron
 * @param {{ force?: boolean }} options
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchCurrencyRates(accessToken, options = {}) {
  const force = !!options?.force
  const withPegs = (map) => {
    const out = { ...(map || {}) }
    for (const peg of ['usd', 'usdc', 'usdt']) {
      if (!out[peg] || !(Number(out[peg]) > 0)) out[peg] = 1
    }
    return out
  }
  try {
    const raw = force ? null : localStorage.getItem('slotbot_currency_rates_cache')
    if (raw && !force) {
      const { ts, map } = JSON.parse(raw)
      if (map && ts && Date.now() - ts < 30 * 60 * 1000) {
        return withPegs(map)
      }
    }
  } catch (_) {}

  const t0 = Date.now()
  const variables = { isAcp: false }

  try {
    const { result: response, attempts } = await executeWithReliability({
      domain: 'casino',
      action: 'stake/currencyConfiguration',
      maxAttempts: 3,
      baseDelayMs: 300,
      task: () => StakeApi.query(CURRENCY_CONFIG_QUERY, variables),
    })
    const json = response.data

    logApiCall({
      type: 'stake/currencyConfiguration',
      endpoint: 'graphql',
      request: variables,
      response: { ...(json || {}), _reliabilityAttempts: attempts },
      error: null,
      durationMs: Date.now() - t0,
    })

    const cfg = json?.currencyConfiguration
    if (!cfg) {
      return withPegs({})
    }

    const map = {}
    for (const r of cfg.baseRates || []) {
      const code = String(r?.currency || '').toLowerCase()
      const usdRate = Number(r?.baseRate)
      if (code && Number.isFinite(usdRate) && usdRate > 0) map[code] = usdRate
    }
    const finalMap = withPegs(map)

    try {
      localStorage.setItem('slotbot_currency_rates_cache', JSON.stringify({ ts: Date.now(), map: finalMap }))
    } catch (_) {}
    return finalMap
  } catch (error) {
    logApiCall({
      type: 'stake/currencyConfiguration',
      endpoint: 'graphql',
      request: variables,
      response: null,
      error: error.message,
      durationMs: Date.now() - t0,
    })
    return withPegs({})
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
    const { result: response, attempts } = await executeWithReliability({
      domain: 'casino',
      action: 'stake/supportedCurrencies',
      maxAttempts: 3,
      baseDelayMs: 300,
      task: () => StakeApi.query(CURRENCY_CONFIG_QUERY, variables),
    })
    const json = response.data

    logApiCall({
      type: 'stake/currencyConfiguration',
      endpoint: 'graphql',
      request: variables,
      response: { ...(json || {}), _reliabilityAttempts: attempts },
      error: null,
      durationMs: Date.now() - t0,
    })

    // Keep parser aligned with CURRENCY_CONFIG_QUERY (baseRates only).
    // Stake returns one entry per currency in baseRates, which is enough
    // to derive the supported currency code list.
    const list = (json?.currencyConfiguration?.baseRates || [])
      .map((c) => String(c?.currency || '').toLowerCase())
      .filter(Boolean)

    try {
      localStorage.setItem(SUPPORTED_CURRENCIES_CACHE_KEY, JSON.stringify({ ts: Date.now(), list }))
    } catch (_) {}
    return list
  } catch (error) {
    return []
  }
}

// Abgestimmt auf Stake Web (challenges.har): direction + groupIds, Sort-Enum prize/wager/multiplier/startAt
const CHALLENGE_LIST_QUERY = `query ChallengeList($limit: Int!, $offset: Int!, $sort: ChallengeSort!, $direction: ChallengeSortDirection, $type: ChallengeFilterType!, $count: ChallengeCountType!, $groupIds: [String!], $includeAffiliateData: Boolean = true) {
  user {
    id
    challengeCount(type: $count, groupIds: $groupIds)
    challengeList(limit: $limit, offset: $offset, sort: $sort, direction: $direction, type: $type, groupIds: $groupIds) {
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
    groupGames { group { id slug type name } }
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

/** Wie Stake Web (limit 24 pro Request). */
export const STAKE_CHALLENGE_PAGE_SIZE = 24
const PAGE_SIZE = STAKE_CHALLENGE_PAGE_SIZE
/** GraphQL `numberLessEqual` — offset > 1000 schlägt fehl. */
export const STAKE_CHALLENGE_MAX_OFFSET = 1000
export const STAKE_CHALLENGE_MAX_PAGES =
  Math.floor(STAKE_CHALLENGE_MAX_OFFSET / STAKE_CHALLENGE_PAGE_SIZE) + 1

/** ChallengeSort laut Stake UI / challenges.har */
const CHALLENGE_SCAN_SORTS = ['startAt', 'prize', 'wager', 'multiplier']

export function isChallengeOffsetLimitError(error) {
  const msg = String(error?.message || '')
  return msg.includes('numberLessEqual') || msg.includes('number_less_equal')
}

export function isChallengeGraphqlValidationError(error) {
  const msg = String(error?.message || '')
  return (
    msg.includes('ChallengeSort') ||
    msg.includes('ChallengeFilterType') ||
    msg.includes('got invalid value')
  )
}

function clampChallengeOffset(offset) {
  const n = Math.max(0, Number(offset) || 0)
  return Math.min(STAKE_CHALLENGE_MAX_OFFSET, n)
}

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
  const {
    limit = PAGE_SIZE,
    offset = 0,
    sort = 'startAt',
    direction = 'asc',
    type = 'available',
    count = 'available',
    groupIds = null,
    throwOnError = false,
    suppressErrorLog = false,
  } = options
  const safeLimit = Math.max(1, Math.min(PAGE_SIZE, Number(limit) || PAGE_SIZE))
  const safeOffset = clampChallengeOffset(offset)
  const t0 = Date.now()
  const variables = {
      sort,
      direction,
      type,
      count,
      limit: safeLimit,
      offset: safeOffset,
      groupIds,
      includeAffiliateData: true,
  }

  try {
    const { result: response, attempts } = await executeWithReliability({
      domain: 'casino',
      action: 'stake/challengeList',
      maxAttempts: 3,
      baseDelayMs: 350,
      task: () => StakeApi.query(CHALLENGE_LIST_QUERY, variables),
    })
    const json = response.data

    logApiCall({
      type: 'stake/challengeList',
      endpoint: 'graphql',
      request: variables,
      response: { ...(json || {}), _reliabilityAttempts: attempts },
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
    const quiet =
      suppressErrorLog ||
      isChallengeOffsetLimitError(error) ||
      isChallengeGraphqlValidationError(error)
    if (!quiet) {
      console.error('Fetch challenges error', error)
    }
    logApiCall({
      type: 'stake/challengeList',
      endpoint: 'graphql',
      request: variables,
      response: null,
      error: quiet ? null : error.message,
      durationMs: Date.now() - t0,
    })
    if (throwOnError) throw error
    return { challenges: [], totalCount: 0 }
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Seitenweise Challenge-Liste (kleine Batches, kein 50× Parallel-Spam).
 * @returns {{ challenges: object[], totalCount: number, truncated: boolean, loadedCount: number, stoppedReason: string|null }}
 */
export async function fetchChallengeListPages(accessToken, options = {}) {
  const {
    maxPages = STAKE_CHALLENGE_MAX_PAGES,
    sort = 'startAt',
    direction = 'asc',
    type = 'available',
    count = 'available',
    groupIds = null,
    concurrency = 4,
    delayMs = 120,
  } = options

  const pageCap = Math.min(Math.max(1, Number(maxPages) || 1), STAKE_CHALLENGE_MAX_PAGES)
  const offsets = Array.from({ length: pageCap }, (_, i) => i * STAKE_CHALLENGE_PAGE_SIZE)

  const all = []
  const seen = new Set()
  let totalCount = 0
  let stoppedReason = null

  for (let i = 0; i < offsets.length; i += concurrency) {
    const batch = offsets.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (offset) => {
        try {
          return await fetchChallengeList(accessToken, {
            limit: STAKE_CHALLENGE_PAGE_SIZE,
            offset,
            sort,
            direction,
            type,
            count,
            groupIds,
            throwOnError: true,
            suppressErrorLog: true,
          })
        } catch (err) {
          if (isChallengeOffsetLimitError(err) || isChallengeGraphqlValidationError(err)) {
            return { challenges: [], totalCount: 0, _limit: true }
          }
          return { challenges: [], totalCount: 0, _error: err }
        }
      })
    )

    let limitHit = false
    let emptyInBatch = 0
    for (const result of batchResults) {
      if (result._limit) {
        limitHit = true
        break
      }
      if (result._error) continue
      totalCount = Math.max(totalCount, result.totalCount || 0)
      const list = result.challenges || []
      if (list.length === 0) emptyInBatch++
      for (const c of list) {
        if (!c?.id || seen.has(c.id)) continue
        seen.add(c.id)
        all.push(c)
      }
    }

    if (limitHit) {
      stoppedReason = 'offset_limit'
      break
    }
    if (emptyInBatch === batchResults.length) {
      stoppedReason = 'empty'
      break
    }
    if (totalCount > 0 && all.length >= totalCount) {
      stoppedReason = 'complete'
      break
    }
    if (i + concurrency < offsets.length) await delay(delayMs)
  }

  return {
    challenges: all,
    totalCount,
    truncated: stoppedReason === 'offset_limit' || (totalCount > 0 && all.length < totalCount),
    loadedCount: all.length,
    stoppedReason,
  }
}

/**
 * Mehrere Sortierungen mergen — umgeht das Offset-Limit pro Sort (~1008) teilweise.
 */
export async function fetchChallengeListMerged(accessToken, options = {}) {
  const {
    maxPagesPerSort = STAKE_CHALLENGE_MAX_PAGES,
    sorts = CHALLENGE_SCAN_SORTS,
    direction = 'asc',
    type = 'available',
    count = 'available',
    groupIds = null,
    concurrency = 4,
    delayMs = 120,
  } = options

  const seen = new Set()
  const merged = []
  let totalCount = 0
  let sortsUsed = 0

  for (const sort of sorts) {
    let result
    try {
      result = await fetchChallengeListPages(accessToken, {
        maxPages: maxPagesPerSort,
        sort,
        direction,
        type,
        count,
        groupIds,
        concurrency,
        delayMs,
      })
    } catch {
      continue
    }
    if (!result?.challenges?.length) continue
    sortsUsed++
    totalCount = Math.max(totalCount, result.totalCount || 0)
    for (const c of result.challenges) {
      if (!c?.id || seen.has(c.id)) continue
      seen.add(c.id)
      merged.push(c)
    }
    if (totalCount > 0 && merged.length >= totalCount) break
  }

  return {
    challenges: merged,
    totalCount,
    truncated: totalCount > 0 && merged.length < totalCount,
    loadedCount: merged.length,
    sortsUsed,
  }
}

/**
 * Lädt alle aktiven Challenges seitenweise.
 */
function mapChallengeRow(c) {
  return {
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
    startAt: c.startAt,
    expireAt: c.expireAt,
    adminCreated: !!c.adminCreated,
    updatedAt: c.updatedAt,
  }
}

function isWeeklyChallenge(row) {
  const startMs = row?.startAt ? Date.parse(row.startAt) : NaN
  const endMs = row?.expireAt ? Date.parse(row.expireAt) : NaN
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return !!row?.adminCreated
  }
  const days = (endMs - startMs) / (24 * 60 * 60 * 1000)
  return days >= 5.5 && days <= 8.5
}

export async function fetchAllChallenges(accessToken, options = {}) {
  const { segment = 'all' } = options
  const { challenges: raw, totalCount, truncated, loadedCount } = await fetchChallengeListMerged(
    accessToken,
    { maxPagesPerSort: STAKE_CHALLENGE_MAX_PAGES }
  )
  const mapped = raw
    .filter((c) => c.type === 'casino' && c.game?.slug)
    .map(mapChallengeRow)
  const filtered = segment === 'weekly' ? mapped.filter(isWeeklyChallenge) : mapped
  if (truncated && totalCount > loadedCount) {
    console.warn(
      `[stakeChallenges] Loaded ${loadedCount} of ${totalCount} challenges (Stake offset cap ~${STAKE_CHALLENGE_MAX_OFFSET}).`
    )
  }
  return { challenges: filtered, totalCount: filtered.length || totalCount }
}

const CLAIMED_LIST_CANDIDATES = [
  { type: 'claimed', count: 'claimed', sort: 'startAt', direction: 'desc' },
  { type: 'claimed', count: 'claimed', sort: 'prize', direction: 'desc' },
  { type: 'completed', count: 'completed', sort: 'startAt', direction: 'desc' },
]

function isChallengeClaimedRow(c) {
  if (!c) return false
  if (c.completedAt) return true
  if (c.active === false) return true
  if (Array.isArray(c.wins) && c.wins.some((w) => w?.claimedBy)) return true
  return false
}

/**
 * Erste Seite der Stake „All Claimed“-Liste (casino/challenges/all-claimed).
 * Reicht zum Abgleich laufender Hunter-Runs — neueste Claims stehen oben.
 */
export async function fetchClaimedChallengesFirstPage(accessToken) {
  for (const cand of CLAIMED_LIST_CANDIDATES) {
    try {
      const { challenges, totalCount } = await fetchChallengeList(accessToken, {
        limit: PAGE_SIZE,
        offset: 0,
        sort: cand.sort,
        direction: cand.direction || 'desc',
        type: cand.type,
        count: cand.count,
        throwOnError: true,
      })
      const rows = challenges
        .filter((c) => c.type === 'casino' && c.game?.slug && isChallengeClaimedRow(c))
        .map(mapChallengeRow)
      return { challenges: rows, totalCount, filter: cand }
    } catch (err) {
      console.warn('[stakeChallenges] claimed list candidate failed:', cand.type, err?.message || err)
    }
  }
  return { challenges: [], totalCount: 0, filter: null }
}

/**
 * Lädt abgeschlossene Challenges (type: completed).
 */
export async function fetchCompletedChallenges(accessToken, options = {}) {
  const { segment = 'all' } = options
  // Stake enum variants for "completed" differ between environments and can trigger HTTP 400.
  // Keep this function non-breaking by deriving completion from the safe available feed.
  const { challenges: safeRows = [] } = await fetchAllChallenges(accessToken, { segment })
  const all = safeRows.filter((row) => !!row?.completedAt || row?.active === false)
  const filtered = segment === 'weekly' ? all.filter(isWeeklyChallenge) : all
  return { challenges: filtered }
}
