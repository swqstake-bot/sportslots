import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'
import { CASINO_STORAGE_KEYS } from '../utils/storageRegistry'

const PAGE_SIZE = 39
const SLOTS_CACHE_KEY = CASINO_STORAGE_KEYS.stakeSlotsCache
const NEWEST_PAGES_MAX = 10
const KURATOR_PAGE_DELAY_MS = 200
const KURATOR_SWITCH_DELAY_MS = 150
/**
 * Zusätzliche slugKuratorGroup-Slugs für Quick-Load: sort „newest“ nur innerhalb der Gruppe.
 * Global `slug: 'slots'` + newest deckt nicht alle Provider-Neuerscheinungen ab (z. B. Hacksaw).
 */
const QUICK_LOAD_EXTRA_GROUPS = [
  { slug: 'hacksaw-gaming', pages: 10 },
  { slug: 'mascot', pages: 6 },
]
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000 // 10 min – kein Refetch beim Tab-Wechsel

let sessionSlotsCache = null
let sessionCacheTime = 0

const PROVIDER_MAP = {
  'hacksaw-gaming': 'hacksaw',
  'hacksaw-openrgs': 'hacksaw',
  'backseat-gaming': 'hacksaw',
  backseatgaming: 'hacksaw',
  'bullshark-games': 'hacksaw',
  bullsharkgames: 'hacksaw',
  'pragmatic-play': 'pragmatic',
  'fat-panda': 'pragmatic',
  'blueprint-gaming': 'blueprint',
  'play-n-go': 'playngo',
  playngo: 'playngo',
  'no-limit-city': 'nolimit',
  'no-limit': 'nolimit',
  'nolimit-city': 'nolimit',
  'nolimit': 'nolimit',
  nlc: 'nolimit',
  'one-touch': 'onetouch',
  'one-touch-games': 'onetouch',
  onetouch: 'onetouch',
  gamomat: 'gamomat',
  'massive-studios': 'massive',
  massive: 'massive',
  truelab: 'truelab',
  truelabs: 'truelab',
  'true-lab': 'truelab',
  'true-labs': 'truelab',
  'games-global': 'gamesglobal',
  gamesglobal: 'gamesglobal',
  'jade-rabbit': 'jaderabbit',
  jaderabbit: 'jaderabbit',
  'penguin-king': 'octoplay',
  slotmill: 'slotmill',
  'peter-sons': 'peterandsons',
  petersons: 'peterandsons',
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
  mascot: 'mascot',
  hub88: 'mascot',
  'octoplay': 'octoplay',
  'one-touch': 'onetouch',
  'one-touch-games': 'onetouch',
  'popiplay': 'popiplay',
  'peter-and-sons': 'peter-sons',
  'playn-go': 'playngo',
  'justslots': 'justslots',
  'stake-originals': 'stakeEngine',
  'twist-gaming': 'stakeEngine',
  'titan-gaming': 'twist',
  valkyrie: 'twist',
  'paperclip-gaming': 'stakeEngine',
  'uppercut-gaming': 'stakeEngine',
  'sidequest-studios': 'stakeEngine',
  'backseat-gaming': 'stakeEngine',
  'titan-gaming': 'stakeEngine',
  'donut-gaming': 'stakeEngine',
  'pocket-gaming': 'stakeEngine',
  pocketgaming: 'stakeEngine',
  'massive-studios': 'stakeEngine',
  'knucklehead-gaming': 'stakeEngine',
  'blackcoffeestudios': 'stakeEngine',
  'evoslot': 'stakeEngine',
  'creativecity': 'stakeEngine',
  // Some Creative City provider groups use a hyphenated slug.
  'creative-city': 'stakeEngine',
  'valkyrie': 'stakeEngine',
  '1000lakes': 'stakeEngine',
  'd-bush-gaming': 'stakeEngine',
  'colorful-play': 'stakeEngine',
  'colorful-play-gaming': 'stakeEngine',
  'colorfulplay': 'stakeEngine',
  'colorfulplaygaming': 'stakeEngine',
  'sexy-rabbit': 'pragmatic', // Rabbit Heist – gleiches gs2c/html5Game.do-Protokoll wie Pragmatic
  'sexyrabbit': 'pragmatic',
  'videoslots': 'pragmatic',
  'clawbuster': 'clawbuster',
  'clawbuster-gaming': 'clawbuster',
  playnetic: 'playnetic',
  'playnetic-gaming': 'playnetic',
}

/**
 * Spiel-Slug-Präfixe für Stake Engine / RGS, abgeleitet aus PROVIDER_MAP (value === 'stakeEngine').
 * Neue Studios: nur Eintrag in PROVIDER_MAP — inferProviderId (discoveredSlots) bleibt synchron.
 * Längste Präfixe zuerst, damit z. B. titan-gaming- vor titan- gewinnt.
 */
let cachedStakeEngineGameSlugPrefixes = null
export function getStakeEngineGameSlugPrefixes() {
  if (cachedStakeEngineGameSlugPrefixes) return cachedStakeEngineGameSlugPrefixes
  const prefixes = new Set()
  for (const [key, value] of Object.entries(PROVIDER_MAP)) {
    if (value !== 'stakeEngine') continue
    const k = String(key).toLowerCase()
    prefixes.add(`${k}-`)
    const compact = k.replace(/-/g, '')
    if (compact && compact !== k) prefixes.add(`${compact}-`)
    if (k === 'd-bush-gaming') {
      prefixes.add('dbushgaming-')
    }
    if (k === 'pocket-gaming' || k === 'pocketgaming') {
      prefixes.add('pocket-')
    }
  }
  cachedStakeEngineGameSlugPrefixes = Array.from(prefixes).sort((a, b) => b.length - a.length)
  return cachedStakeEngineGameSlugPrefixes
}

/** Stake-Kurator-Slugs pro Provider (wie SSP reloadSlots). */
function getProviderKuratorSlugs() {
  return [...new Set(Object.keys(PROVIDER_MAP))].sort()
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

/**
 * Gleiche Logik wie mapGameToSlot – Provider-Gruppen-Slug von Stake → interne providerId.
 * Bekannte Drittanbieter über PROVIDER_MAP; alles Unbekannte → stakeEngine (Stake RGS),
 * damit Challenges / neue Studios ohne manuelle Liste meist lauffähig sind.
 */
export function mapProviderSlugToProviderId(providerSlug) {
  if (!providerSlug) return 'stakeEngine'
  const providerSlugKey = String(providerSlug).toLowerCase()
  const normalizedProviderSlug = providerSlugKey.replace(/[^a-z0-9]/g, '')
  const mapped =
    PROVIDER_MAP[providerSlugKey] ||
    PROVIDER_MAP[normalizedProviderSlug] ||
    PROVIDER_MAP[providerSlugKey.replace(/-/g, '')]
  if (mapped) return mapped
  return 'stakeEngine'
}

function mapGameToSlot(game) {
  if (!game?.slug || game.isBlocked) return null
  const providerGroup = game.groupGames?.find((g) => g?.group?.type === 'provider')
  const providerSlug = providerGroup?.group?.slug
  if (!providerSlug) return null
  let providerId = mapProviderSlugToProviderId(providerSlug)
  if (game.slug?.toLowerCase().startsWith('playnetic-')) providerId = 'playnetic'
  return {
    slug: game.slug,
    name: game.name,
    providerId,
    thumbnailUrl: game.thumbnailUrl,
    /** Stake Kurator `game.id` — für RGS-Fairness (`RotateSeed` / `userGameFair`), nicht Slug. */
    stakeGameId: game.id != null ? String(game.id) : undefined,
  }
}

function clampSlotsOffset(offset) {
  return Math.max(0, Number(offset) || 0)
}

function clampSlotsLimit(limit) {
  const n = Number(limit) || PAGE_SIZE
  return Math.max(1, Math.min(PAGE_SIZE, n))
}

function isRetryableSlotError(error) {
  const msg = String(error?.message || '').toLowerCase()
  const errType = String(error?.errorType || '')
  return (
    msg.includes('number_less_equal') ||
    msg.includes('numberlessequal') ||
    errType === 'numberLessEqual' ||
    (msg.includes('less') && msg.includes('equal'))
  )
}

function normalizePageVariables(variables) {
  return {
    ...variables,
    limit: clampSlotsLimit(variables?.limit),
    offset: clampSlotsOffset(variables?.offset),
  }
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
  const safeVariables = normalizePageVariables(variables)
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await StakeApi.query(SLUG_KURATOR_QUERY, safeVariables)
    } catch (error) {
      if (isRetryableSlotError(error) && attempt < maxRetries - 1) {
        const delayMs = 5000
        console.warn(`[Slots] number_less_equal bei offset ${safeVariables.offset}, Retry ${attempt + 1}/${maxRetries} in 5s`)
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

/** Mehrere Seiten „newest“ für einen Kurator (z. B. hacksaw-gaming). */
async function fetchNewestPagesForCuratorSlug(curatorSlug, maxPages) {
  const out = []
  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE_SIZE
    const variables = { slug: curatorSlug, limit: PAGE_SIZE, offset, sort: 'newest' }
    try {
      const response = await fetchPage(variables, 2)
      const slots = parseGamesFromResponse(response)
      if (slots.length === 0) break
      out.push(...slots)
      if (slots.length < PAGE_SIZE) break
    } catch (error) {
      if (isRetryableSlotError(error)) break
      throw error
    }
  }
  return out
}

/** Ein Provider-Kurator komplett paginieren (limit 39, Offset pro Gruppe — nicht global). */
async function fetchSlotsForKuratorSlug(curatorSlug, sort = 'popular7d') {
  const collected = []
  let offset = 0
  while (true) {
    try {
      const response = await fetchPage({ slug: curatorSlug, limit: PAGE_SIZE, offset, sort }, 2)
      const batch = parseGamesFromResponse(response)
      if (!batch.length) break
      collected.push(...batch)
      if (batch.length < PAGE_SIZE) break
      offset += PAGE_SIZE
      await new Promise((r) => setTimeout(r, KURATOR_PAGE_DELAY_MS))
    } catch (error) {
      if (isRetryableSlotError(error)) break
      throw error
    }
  }
  return collected
}

/** Vollständiger Katalog: alle Provider-Kuratoren + global „slots“ (SSP reloadSlots-Pattern). */
async function fetchFullSlotCatalogByProviders() {
  const bySlug = new Map()
  const kuratorSlugs = getProviderKuratorSlugs()
  console.log(`[Slots] Vollscan über ${kuratorSlugs.length} Provider-Kuratoren…`)

  for (let i = 0; i < kuratorSlugs.length; i++) {
    const curatorSlug = kuratorSlugs[i]
    try {
      const batch = await fetchSlotsForKuratorSlug(curatorSlug, 'popular7d')
      let added = 0
      for (const slot of batch) {
        if (!bySlug.has(slot.slug)) added++
        bySlug.set(slot.slug, slot)
      }
      if (batch.length > 0) {
        console.log(
          `[Slots] ${i + 1}/${kuratorSlugs.length} „${curatorSlug}“: +${batch.length} (${added} neu) · gesamt ${bySlug.size}`
        )
      }
    } catch (error) {
      console.warn(`[Slots] Kurator „${curatorSlug}“:`, error?.message || error)
    }
    if (i + 1 < kuratorSlugs.length) {
      await new Promise((r) => setTimeout(r, KURATOR_SWITCH_DELAY_MS))
    }
  }

  try {
    const globalBatch = await fetchSlotsForKuratorSlug('slots', 'popular7d')
    for (const slot of globalBatch) bySlug.set(slot.slug, slot)
    if (globalBatch.length) {
      console.log(`[Slots] Global „slots“: +${globalBatch.length} · gesamt ${bySlug.size}`)
    }
  } catch (error) {
    if (!isRetryableSlotError(error)) {
      console.warn('[Slots] Global „slots“:', error?.message || error)
    }
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
    console.log(`[Slots] Cache: ${cached.length} Slots, lade ${NEWEST_PAGES_MAX} Seiten newest (global slots) + Kuratoren…`)
    try {
      const newest = []
      for (let page = 0; page < NEWEST_PAGES_MAX; page++) {
        const offset = page * PAGE_SIZE
        const variables = { slug: 'slots', limit: PAGE_SIZE, offset, sort: 'newest' }
        try {
          const response = await fetchPage(variables, 2)
          const slots = parseGamesFromResponse(response)
          if (slots.length === 0) break
          newest.push(...slots)
          if (slots.length < PAGE_SIZE) break
        } catch (error) {
          if (isRetryableSlotError(error)) break
          throw error
        }
      }
      for (const g of QUICK_LOAD_EXTRA_GROUPS) {
        try {
          const extra = await fetchNewestPagesForCuratorSlug(g.slug, g.pages)
          if (extra.length) {
            newest.push(...extra)
            console.log(`[Slots] Quick-Load: +${extra.length} Einträge von Kurator „${g.slug}“ (newest)`)
          }
        } catch (e) {
          console.warn(`[Slots] Quick-Load Kurator ${g.slug}:`, e?.message || e)
        }
      }
      const knownBefore = new Set(cached.map((s) => s.slug))
      const merged = mergeSlotsInto(cached, newest)
      let newlyAddedSlugs = 0
      for (const s of merged) {
        if (!knownBefore.has(s.slug)) newlyAddedSlugs++
      }
      saveCachedSlots(merged)
      sessionSlotsCache = merged
      sessionCacheTime = Date.now()
      const sec = Math.round((Date.now() - t0) / 1000)
      console.log(
        `[Slots] Quick-Load: ${merged.length} Slots gesamt · ${newest.length} Einträge von API zusammengeführt · ca. ${newlyAddedSlugs} neue Slugs (vorher ${cached.length}) in ${sec}s`
      )
      logApiCall({
        type: 'stake/slugKuratorGroup',
        endpoint: 'graphql',
        request: { quickLoad: true, newestPages: NEWEST_PAGES_MAX, extraGroups: QUICK_LOAD_EXTRA_GROUPS },
        response: { count: merged.length, mergedRows: newest.length, newlyAddedSlugs },
        error: null,
        durationMs: Date.now() - t0,
      })
      return merged
    } catch (err) {
      console.warn('[Slots] Quick-Load fehlgeschlag, nutze Cache:', err?.message)
      sessionSlotsCache = cached
      sessionCacheTime = Date.now()
      return cached
    }
  }

  console.log('[Slots] Kein Cache, vollständiger Ladevorgang (Provider-Kuratoren)…')

  try {
    const all = await fetchFullSlotCatalogByProviders()
    if (!all.length) throw new Error('Keine Slots von der Stake-API erhalten')

    saveCachedSlots(all)
    sessionSlotsCache = all
    sessionCacheTime = Date.now()
    console.log(`[Slots] Fertig: ${all.length} Slots in ${Math.round((Date.now() - t0) / 1000)}s`)
    logApiCall({
      type: 'stake/slugKuratorGroup',
      endpoint: 'graphql',
      request: { mode: 'provider_kurators', kuratorCount: getProviderKuratorSlugs().length },
      response: { count: all.length },
      error: null,
      durationMs: Date.now() - t0,
    })
    return all
  } catch (error) {
    const partial = loadCachedSlots()
    if (partial?.length) {
      console.warn(`[Slots] Vollscan fehlgeschlagen, nutze Cache (${partial.length} Slots):`, error?.message || error)
      sessionSlotsCache = partial
      sessionCacheTime = Date.now()
      return partial
    }
    console.error('[Slots] Fehler:', error?.message || error)
    logApiCall({
      type: 'stake/slugKuratorGroup',
      endpoint: 'graphql',
      request: { mode: 'provider_kurators' },
      response: null,
      error: error.message,
      durationMs: Date.now() - t0,
    })
    throw error
  }
}
