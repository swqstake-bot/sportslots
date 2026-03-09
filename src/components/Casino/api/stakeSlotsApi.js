import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

const PAGE_SIZE = 31
const SLOTS_CACHE_KEY = 'slotbot_stake_slots_cache'
const NEWEST_PAGES_MAX = 3
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000 // 10 min – kein Refetch beim Tab-Wechsel

let sessionSlotsCache = null
let sessionCacheTime = 0

const PROVIDER_MAP = {
  'hacksaw-gaming': 'hacksaw',
  'pragmatic-play': 'pragmatic',
  'blueprint-gaming': 'blueprint',
  'play-n-go': 'playngo',
  'no-limit-city': 'nolimit',
  'push-gaming': 'push',
  'relax-gaming': 'relax',
  'red-tiger': 'redtiger',
  'red-tiger-gaming': 'redtiger',
  'slotmill': 'slotmill',
  'thunderkick': 'thunderkick',
  'bgaming': 'bgaming',
  'endorphina': 'endorphina',
  'gamomat': 'gamomat',
  'avatarux': 'avatarux',
  'octoplay': 'octoplay',
  'one-touch': 'onetouch',
  'one-touch-games': 'onetouch',
  'popiplay': 'popiplay',
  'peter-and-sons': 'peter-sons',
  'playn-go': 'playngo',
  'justslots': 'justslots',
  'stake-originals': 'stakeEngine',
  'twist-gaming': 'stakeEngine',
  'paperclip-gaming': 'stakeEngine',
  'uppercut-gaming': 'stakeEngine',
  'sidequest-studios': 'stakeEngine',
  'backseat-gaming': 'stakeEngine',
  'titan-gaming': 'stakeEngine',
  'donut-gaming': 'stakeEngine',
  'massive-studios': 'stakeEngine',
  'knucklehead-gaming': 'stakeEngine',
  'blackcoffeestudios': 'stakeEngine',
  'evoslot': 'stakeEngine',
  'creativecity': 'stakeEngine',
  'valkyrie': 'stakeEngine',
  'd-bush-gaming': 'stakeEngine',
  'sexy-rabbit': 'pragmatic', // Rabbit Heist – gleiches gs2c/html5Game.do-Protokoll wie Pragmatic
  'sexyrabbit': 'pragmatic',
  'videoslots': 'pragmatic',
}

const SLUG_KURATOR_QUERY = `query SlugKuratorGroup($slug: String!, $limit: Int!, $offset: Int!, $sort: GameKuratorGroupGameSortEnum = popular7d, $filterIds: [String!], $locale: Locale = "en") {
  slugKuratorGroup(slug: $slug) {
    id name slug
    gameCount(filterIds: $filterIds, locale: $locale)
    groupGamesList(limit: $limit, offset: $offset, sort: $sort, filterIds: $filterIds, locale: $locale) {
      game { id name slug thumbnailUrl isBlocked isWidgetEnabled groupGames { group { id slug type } } }
    }
  }
}`

function mapGameToSlot(game) {
  if (!game?.slug || game.isBlocked) return null
  const providerGroup = game.groupGames?.find((g) => g?.group?.type === 'provider')
  const providerSlug = providerGroup?.group?.slug
  if (!providerSlug) return null
  const providerId = PROVIDER_MAP[providerSlug] || providerSlug
  return { slug: game.slug, name: game.name, providerId, thumbnailUrl: game.thumbnailUrl }
}

function isRetryableSlotError(error) {
  const msg = String(error?.message || '')
  const errType = error?.errorType || ''
  return msg.includes('number_less_equal') || errType === 'numberLessEqual'
}

function loadCachedSlots() {
  try {
    const raw = localStorage.getItem(SLOTS_CACHE_KEY)
    if (!raw) return null
    const { slots, ts } = JSON.parse(raw)
    if (!Array.isArray(slots) || slots.length === 0) return null
    return slots
  } catch {
    return null
  }
}

function saveCachedSlots(slots) {
  try {
    localStorage.setItem(SLOTS_CACHE_KEY, JSON.stringify({ slots, ts: Date.now() }))
  } catch (_) {}
}

async function fetchPage(variables, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await StakeApi.query(SLUG_KURATOR_QUERY, variables)
    } catch (error) {
      if (isRetryableSlotError(error) && attempt < maxRetries - 1) {
        const delayMs = 5000
        console.warn(`[Slots] number_less_equal bei offset ${variables.offset}, Retry ${attempt + 1}/${maxRetries} in 5s`)
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      throw error
    }
  }
}

function parseGamesFromResponse(response) {
  const data = response?.data
  if (!data?.slugKuratorGroup) return []
  const games = data.slugKuratorGroup.groupGamesList?.map((g) => g.game) ?? []
  const slots = []
  for (const game of games) {
    const slot = mapGameToSlot(game)
    if (slot) slots.push(slot)
  }
  return slots
}

function mergeSlotsInto(base, incoming) {
  const bySlug = new Map(base.map((s) => [s.slug, { ...s }]))
  for (const s of incoming) {
    bySlug.set(s.slug, { ...s })
  }
  return Array.from(bySlug.values())
}

export async function fetchStakeSlots(accessToken) {
  if (sessionSlotsCache && Date.now() - sessionCacheTime < SESSION_CACHE_TTL_MS) {
    console.log(`[Slots] Session-Cache (${sessionSlotsCache.length} Slots), kein API-Call`)
    return sessionSlotsCache
  }

  const cached = loadCachedSlots()
  const t0 = Date.now()

  if (cached && cached.length > 0) {
    console.log(`[Slots] Cache: ${cached.length} Slots, lade nur ${NEWEST_PAGES_MAX} Seiten newest...`)
    try {
      const newest = []
      for (let page = 0; page < NEWEST_PAGES_MAX; page++) {
        const offset = page * PAGE_SIZE
        const variables = { slug: 'slots', limit: PAGE_SIZE, offset, sort: 'newest' }
        const response = await StakeApi.query(SLUG_KURATOR_QUERY, variables)
        const slots = parseGamesFromResponse(response)
        if (slots.length === 0) break
        newest.push(...slots)
        if (slots.length < PAGE_SIZE) break
      }
      const merged = mergeSlotsInto(cached, newest)
      saveCachedSlots(merged)
      sessionSlotsCache = merged
      sessionCacheTime = Date.now()
      console.log(`[Slots] Quick-Load: ${merged.length} Slots (${newest.length} newest) in ${Math.round((Date.now() - t0) / 1000)}s`)
      logApiCall({ type: 'stake/slugKuratorGroup', endpoint: 'graphql', request: { quickLoad: true, newestPages: NEWEST_PAGES_MAX }, response: { count: merged.length }, error: null, durationMs: Date.now() - t0 })
      return merged
    } catch (err) {
      console.warn('[Slots] Quick-Load fehlgeschlag, nutze Cache:', err?.message)
      sessionSlotsCache = cached
      sessionCacheTime = Date.now()
      return cached
    }
  }

  const all = []
  let offset = 0
  console.log('[Slots] Kein Cache, vollständiger Ladevorgang...')

  try {
    while (true) {
      const variables = { slug: 'slots', limit: PAGE_SIZE, offset, sort: 'popular7d' }
      const response = await fetchPage(variables)
      const data = response?.data
      if (!data?.slugKuratorGroup) throw new Error('Invalid response structure')
      const games = data.slugKuratorGroup.groupGamesList ?? []

      for (const g of games) {
        const slot = mapGameToSlot(g?.game ?? g)
        if (slot) all.push(slot)
      }

      if (offset > 0 && all.length % 100 < PAGE_SIZE) {
        console.log(`[Slots] Seite ${Math.floor(offset / PAGE_SIZE) + 1}, ${all.length} Slots bisher`)
      }
      if (games.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      await new Promise((r) => setTimeout(r, 350))
    }

    saveCachedSlots(all)
    sessionSlotsCache = all
    sessionCacheTime = Date.now()
    console.log(`[Slots] Fertig: ${all.length} Slots in ${Math.round((Date.now() - t0) / 1000)}s`)
    logApiCall({ type: 'stake/slugKuratorGroup', endpoint: 'graphql', request: { offset }, response: { count: all.length }, error: null, durationMs: Date.now() - t0 })
    return all
  } catch (error) {
    if (isRetryableSlotError(error) && all.length > 0) {
      console.warn(`[Slots] API-Limit bei offset ${offset}, behalte ${all.length} geladene Slots`)
      saveCachedSlots(all)
      sessionSlotsCache = all
      sessionCacheTime = Date.now()
      logApiCall({ type: 'stake/slugKuratorGroup', endpoint: 'graphql', request: { offset }, response: { count: all.length, partial: true }, error: null, durationMs: Date.now() - t0 })
      return all
    }
    console.error('[Slots] Fehler:', error?.message || error)
    logApiCall({ type: 'stake/slugKuratorGroup', endpoint: 'graphql', request: { offset }, response: null, error: error.message, durationMs: Date.now() - t0 })
    throw error
  }
}
