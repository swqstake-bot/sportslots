/**
 * Stake Originals API – komplett unabhängig von Slots.
 * Lädt Spiele aus der Gruppe stake-originals (https://stake.com/de/casino/group/stake-originals).
 */

import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

const ORIGINALS_GROUP_SLUG = 'stake-originals'
const PAGE_SIZE = 31
const ORIGINALS_CACHE_KEY = 'stake_originals_cache'
const NEWEST_PAGES_MAX = 2
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000

let sessionOriginalsCache = null
let sessionCacheTime = 0

const SLUG_KURATOR_QUERY = `query SlugKuratorGroup($slug: String!, $limit: Int!, $offset: Int!, $sort: GameKuratorGroupGameSortEnum = popular7d, $filterIds: [String!], $locale: Locale = "en") {
  slugKuratorGroup(slug: $slug) {
    id name slug
    gameCount(filterIds: $filterIds, locale: $locale)
    groupGamesList(limit: $limit, offset: $offset, sort: $sort, filterIds: $filterIds, locale: $locale) {
      game { id name slug thumbnailUrl isBlocked isWidgetEnabled }
    }
  }
}`

function mapGameToOriginal(game) {
  if (!game?.slug || game.isBlocked) return null
  return {
    slug: game.slug,
    name: game.name,
    thumbnailUrl: game.thumbnailUrl,
  }
}

function isRetryableError(error) {
  const msg = String(error?.message || '')
  const errType = error?.errorType || ''
  return msg.includes('number_less_equal') || errType === 'numberLessEqual'
}

function loadCachedOriginals() {
  try {
    const raw = localStorage.getItem(ORIGINALS_CACHE_KEY)
    if (!raw) return null
    const { games, ts } = JSON.parse(raw)
    if (!Array.isArray(games) || games.length === 0) return null
    return games
  } catch {
    return null
  }
}

function saveCachedOriginals(games) {
  try {
    localStorage.setItem(ORIGINALS_CACHE_KEY, JSON.stringify({ games, ts: Date.now() }))
  } catch (_) {}
}

async function fetchPage(variables, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await StakeApi.query(SLUG_KURATOR_QUERY, variables)
    } catch (error) {
      if (isRetryableError(error) && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 5000))
        continue
      }
      throw error
    }
  }
}

function parseGamesFromResponse(response) {
  const data = response?.data
  if (!data?.slugKuratorGroup) return []
  const list = data.slugKuratorGroup.groupGamesList ?? []
  const games = []
  for (const g of list) {
    const item = mapGameToOriginal(g?.game ?? g)
    if (item) games.push(item)
  }
  return games
}

function mergeInto(base, incoming) {
  const bySlug = new Map(base.map((s) => [s.slug, { ...s }]))
  for (const s of incoming) bySlug.set(s.slug, { ...s })
  return Array.from(bySlug.values())
}

export async function fetchStakeOriginals(accessToken) {
  if (sessionOriginalsCache && Date.now() - sessionCacheTime < SESSION_CACHE_TTL_MS) {
    return sessionOriginalsCache
  }

  const cached = loadCachedOriginals()
  const t0 = Date.now()

  if (cached?.length > 0) {
    try {
      const newest = []
      for (let page = 0; page < NEWEST_PAGES_MAX; page++) {
        const offset = page * PAGE_SIZE
        const variables = { slug: ORIGINALS_GROUP_SLUG, limit: PAGE_SIZE, offset, sort: 'newest' }
        const response = await StakeApi.query(SLUG_KURATOR_QUERY, variables)
        const pageGames = parseGamesFromResponse(response)
        if (pageGames.length === 0) break
        newest.push(...pageGames)
        if (pageGames.length < PAGE_SIZE) break
      }
      const merged = mergeInto(cached, newest)
      saveCachedOriginals(merged)
      sessionOriginalsCache = merged
      sessionCacheTime = Date.now()
      logApiCall({
        type: 'stake/originals-slugKuratorGroup',
        endpoint: 'graphql',
        request: { quickLoad: true },
        response: { count: merged.length },
        error: null,
        durationMs: Date.now() - t0,
      })
      return merged
    } catch (err) {
      sessionOriginalsCache = cached
      sessionCacheTime = Date.now()
      return cached
    }
  }

  const all = []
  let offset = 0

  try {
    while (true) {
      const variables = { slug: ORIGINALS_GROUP_SLUG, limit: PAGE_SIZE, offset, sort: 'popular7d' }
      const response = await fetchPage(variables)
      const games = parseGamesFromResponse(response)
      for (const g of games) all.push(g)
      if (games.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      await new Promise((r) => setTimeout(r, 350))
    }

    saveCachedOriginals(all)
    sessionOriginalsCache = all
    sessionCacheTime = Date.now()
    logApiCall({
      type: 'stake/originals-slugKuratorGroup',
      endpoint: 'graphql',
      request: { offset },
      response: { count: all.length },
      error: null,
      durationMs: Date.now() - t0,
    })
    return all
  } catch (error) {
    if (isRetryableError(error) && all.length > 0) {
      saveCachedOriginals(all)
      sessionOriginalsCache = all
      sessionCacheTime = Date.now()
      return all
    }
    logApiCall({
      type: 'stake/originals-slugKuratorGroup',
      endpoint: 'graphql',
      request: { offset },
      response: null,
      error: error?.message,
      durationMs: Date.now() - t0,
    })
    throw error
  }
}
