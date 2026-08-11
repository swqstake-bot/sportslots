import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'
import { CASINO_STORAGE_KEYS, readStorageJson, writeStorageJson } from '../utils/storageRegistry'

export const WEEKLY_WRAPPED_GROUP_SLUG = 'weekly-wrapped'

/** HAR fallback when slugKuratorGroup(weekly-wrapped) is empty / fails */
export const WEEKLY_WRAPPED_FALLBACK_SLUGS = [
  'pragmatic-play-sweet-rush-fiesta',
  'knucklehead-drunk-punks',
  'paperclip-lazy-thief',
  'colorfulplay-cursed-100k',
  'hacksaw-le-sortudo',
  'bgaming-mystic-reels',
  'novomatic-25-red-hot-burning-clover-link',
  'nexgenspin-crazy-crash',
  'phantom-crown-upgrade',
  'colorfulplay-wild-storm-2',
]

const CACHE_KEY = CASINO_STORAGE_KEYS.weeklyWrappedCache
const CACHE_TTL_MS = 3 * 60 * 1000
const DEFAULT_CONCURRENCY = 4

const SLUG_KURATOR_GROUP_QUERY = `query SlugKuratorGroup($slug: String!, $limit: Int!, $offset: Int!, $sort: GameKuratorGroupGameSortEnum = popular7d, $filterIds: [String!], $locale: Locale = "en") {
  slugKuratorGroup(slug: $slug) {
    id
    name
    slug
    gameCount(filterIds: $filterIds, locale: $locale)
    groupGamesList(limit: $limit, offset: $offset, sort: $sort, filterIds: $filterIds, locale: $locale) {
      game { id name slug thumbnailUrl }
    }
  }
}`

/** Lean SlugKuratorGameIndex — multiplier + profit leaderboards (Beste / Große Gewinne) */
const LEADERBOARD_BET_USER_FRAGMENT = `
      bet {
        id
        bet {
          ... on CasinoBet {
            user { name preferenceHideBets }
          }
          ... on SoftswissBet {
            user { name preferenceHideBets }
          }
          ... on ThirdPartyBet {
            user { name }
          }
          ... on EvolutionBet {
            user { name preferenceHideBets }
          }
          ... on MultiplayerCrashBet {
            user { name preferenceHideBets }
          }
          ... on MultiplayerSlideBet {
            user { name preferenceHideBets }
          }
          ... on ZooBet {
            user { name preferenceHideBets }
          }
        }
      }`

const SLUG_KURATOR_GAME_INDEX_QUERY = `query SlugKuratorGameIndex($slug: String!) {
  slugKuratorGame(slug: $slug) {
    id
    name
    slug
    showMultiplierLeaderboard
    showProfitLeaderboard
    multiplierLeaderboard {
      id
      position
      payoutMultiplier
      updatedAt
      ${LEADERBOARD_BET_USER_FRAGMENT}
    }
    profitLeaderboard {
      id
      position
      profitValue
      updatedAt
      ${LEADERBOARD_BET_USER_FRAGMENT}
    }
  }
}`

let memoryCache = null

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractLeaderboardUsername(entry) {
  const user = entry?.bet?.bet?.user
  if (!user) return 'hidden'
  if (user.preferenceHideBets) return 'hidden'
  const name = String(user.name || '').trim()
  return name || 'hidden'
}

function normalizeTopMultiplierEntries(rawList, limit = 3) {
  const rows = Array.isArray(rawList) ? rawList.slice() : []
  rows.sort((a, b) => {
    const pa = Number(a?.position)
    const pb = Number(b?.position)
    if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pa - pb
    return Number(b?.payoutMultiplier || 0) - Number(a?.payoutMultiplier || 0)
  })
  return rows.slice(0, limit).map((row, idx) => ({
    position: Number.isFinite(Number(row?.position)) ? Number(row.position) : idx + 1,
    payoutMultiplier: Number(row?.payoutMultiplier) || 0,
    username: extractLeaderboardUsername(row),
    updatedAt: row?.updatedAt || null,
    id: row?.id || null,
  }))
}

function normalizeTopProfitEntries(rawList, limit = 3) {
  const rows = Array.isArray(rawList) ? rawList.slice() : []
  rows.sort((a, b) => {
    const pa = Number(a?.position)
    const pb = Number(b?.position)
    if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pa - pb
    return Number(b?.profitValue || 0) - Number(a?.profitValue || 0)
  })
  return rows.slice(0, limit).map((row, idx) => ({
    position: Number.isFinite(Number(row?.position)) ? Number(row.position) : idx + 1,
    profitValue: Number(row?.profitValue) || 0,
    username: extractLeaderboardUsername(row),
    updatedAt: row?.updatedAt || null,
    id: row?.id || null,
  }))
}

function readPersistedCache() {
  const entry = readStorageJson(CACHE_KEY, null)
  if (!entry || !Array.isArray(entry?.slots)) return null
  const age = Date.now() - Number(entry.ts || 0)
  if (!Number.isFinite(age) || age < 0 || age > CACHE_TTL_MS) return null
  return entry
}

function writePersistedCache(payload) {
  writeStorageJson(CACHE_KEY, { ...payload, ts: Date.now() })
}

/**
 * Load Weekly Wrapped promo slot list via SlugKuratorGroup.
 * Falls back to HAR hardcode when group is missing/empty.
 */
export async function fetchWeeklyWrappedSlots({ locale = 'en', limit = 20 } = {}) {
  const t0 = Date.now()
  try {
    const res = await StakeApi.query(SLUG_KURATOR_GROUP_QUERY, {
      slug: WEEKLY_WRAPPED_GROUP_SLUG,
      limit: Math.max(1, Math.min(40, Number(limit) || 20)),
      offset: 0,
      sort: 'popular7d',
      locale,
    })
    const games = res?.data?.slugKuratorGroup?.groupGamesList || []
    const slots = games
      .map((row) => row?.game)
      .filter((g) => g?.slug)
      .map((g) => ({
        slug: String(g.slug).toLowerCase(),
        name: String(g.name || humanizeSlug(g.slug)).trim(),
        thumbnailUrl: g.thumbnailUrl || null,
        id: g.id != null ? String(g.id) : null,
      }))
    logApiCall({
      type: 'stake/weekly-wrapped/group',
      endpoint: WEEKLY_WRAPPED_GROUP_SLUG,
      request: { locale, limit },
      response: { count: slots.length },
      error: null,
      durationMs: Date.now() - t0,
    })
    if (slots.length > 0) {
      return { slots: slots.slice(0, 10), source: 'group' }
    }
  } catch (error) {
    logApiCall({
      type: 'stake/weekly-wrapped/group',
      endpoint: WEEKLY_WRAPPED_GROUP_SLUG,
      request: { locale, limit },
      response: null,
      error: error?.message || String(error),
      durationMs: Date.now() - t0,
    })
  }

  return {
    slots: WEEKLY_WRAPPED_FALLBACK_SLUGS.map((slug) => ({
      slug,
      name: humanizeSlug(slug),
      thumbnailUrl: null,
      id: null,
    })),
    source: 'fallback',
  }
}

/**
 * Fetch multiplier + profit leaderboards (Beste / Große Gewinne) for a single game slug.
 */
export async function fetchGameMultiplierLeaderboard(slug) {
  const gameSlug = String(slug || '').toLowerCase().trim()
  if (!gameSlug) throw new Error('Missing game slug')
  const t0 = Date.now()
  try {
    const res = await StakeApi.query(SLUG_KURATOR_GAME_INDEX_QUERY, { slug: gameSlug })
    const game = res?.data?.slugKuratorGame
    const top = normalizeTopMultiplierEntries(game?.multiplierLeaderboard, 3)
    const topProfit = normalizeTopProfitEntries(game?.profitLeaderboard, 3)
    logApiCall({
      type: 'stake/weekly-wrapped/leaderboard',
      endpoint: gameSlug,
      request: { slug: gameSlug },
      response: {
        count: top.length,
        profitCount: topProfit.length,
        name: game?.name,
      },
      error: null,
      durationMs: Date.now() - t0,
    })
    return {
      slug: String(game?.slug || gameSlug).toLowerCase(),
      name: String(game?.name || humanizeSlug(gameSlug)).trim(),
      showMultiplierLeaderboard: Boolean(game?.showMultiplierLeaderboard),
      showProfitLeaderboard: Boolean(game?.showProfitLeaderboard),
      top,
      topProfit,
      error: null,
    }
  } catch (error) {
    logApiCall({
      type: 'stake/weekly-wrapped/leaderboard',
      endpoint: gameSlug,
      request: { slug: gameSlug },
      response: null,
      error: error?.message || String(error),
      durationMs: Date.now() - t0,
    })
    return {
      slug: gameSlug,
      name: humanizeSlug(gameSlug),
      showMultiplierLeaderboard: false,
      showProfitLeaderboard: false,
      top: [],
      topProfit: [],
      error: error?.message || String(error),
    }
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const limit = Math.max(1, Math.min(8, Number(concurrency) || DEFAULT_CONCURRENCY))
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const idx = next++
      out[idx] = await mapper(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

/**
 * Full Weekly Wrapped payload: 10 slots + top-3 Beste Gewinne + Große Gewinne each.
 * Light in-memory + localStorage cache (TTL ~3 min).
 */
export async function fetchWeeklyWrappedBoard({
  locale = 'en',
  concurrency = DEFAULT_CONCURRENCY,
  force = false,
} = {}) {
  if (!force) {
    if (memoryCache && Date.now() - memoryCache.ts < CACHE_TTL_MS) {
      return { ...memoryCache.data, cached: true }
    }
    const persisted = readPersistedCache()
    if (persisted) {
      memoryCache = { ts: Number(persisted.ts) || Date.now(), data: persisted }
      return { ...persisted, cached: true }
    }
  }

  const { slots, source } = await fetchWeeklyWrappedSlots({ locale, limit: 20 })
  const boards = await mapWithConcurrency(slots, concurrency, async (slot) => {
    const lb = await fetchGameMultiplierLeaderboard(slot.slug)
    // tiny stagger to ease GraphQL fan-out
    await sleep(40)
    return {
      slug: lb.slug || slot.slug,
      name: lb.name || slot.name,
      thumbnailUrl: slot.thumbnailUrl,
      top: lb.top,
      topProfit: lb.topProfit,
      error: lb.error,
    }
  })

  const payload = {
    groupSlug: WEEKLY_WRAPPED_GROUP_SLUG,
    source,
    slots: boards,
    cached: false,
    fetchedAt: Date.now(),
  }
  memoryCache = { ts: Date.now(), data: payload }
  writePersistedCache(payload)
  return payload
}

export function clearWeeklyWrappedCache() {
  memoryCache = null
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
