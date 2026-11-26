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
  // Fat Panda studio provider group only — never pragmatic-play-fat-panda (that slug is a GAME).
  { slug: 'fat-panda', pages: 4 },
  { slug: 'lk7-com', pages: 3 },
]
/**
 * Stake-Kuratorgruppen mit Neuerscheinungen (stake.com/casino/group/new-releases).
 * Werden mit popular7d geladen — unabhängig vom „newest“-Sort, damit neue Slots
 * auch dann gefunden werden, wenn ein Sort-Wert von der API abgelehnt wird.
 */
const NEW_RELEASE_GROUPS = [
  { slug: 'new-releases', pages: 14 },
]
/**
 * Globale Kategorien für Quick-Load (sort „newest“). Stake-Engine-Spiele stehen teils NUR in
 * „engine“ und nicht in „slots“ (z. B. swaqstudios-hushbough) — ohne diese Quelle fehlten sie.
 */
const QUICK_LOAD_NEWEST_CATEGORIES = [
  { slug: 'slots', pages: NEWEST_PAGES_MAX },
  { slug: 'engine', pages: NEWEST_PAGES_MAX },
]
/** Vollscan: diese Gruppen werden komplett paginiert (keine Offset-Grenze bei Stake). */
const FULL_SCAN_GLOBAL_GROUPS = ['slots', 'engine', 'new-releases']
const FULL_SCAN_PAGE_DELAY_MS = 80
const FULL_SCAN_PROVIDER_CONCURRENCY = 4
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000 // 10 min – kein Refetch beim Tab-Wechsel
/** Hintergrund-Reload für neue Slots (useSlots), damit lange laufende Sessions Neuerscheinungen sehen. */
export const NEW_SLOTS_REFRESH_INTERVAL_MS = 15 * 60 * 1000

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
  // Fat Panda studio provider group (NOT the game pragmatic-play-fat-panda).
  'fat-panda': 'pragmatic',
  fatpanda: 'pragmatic',
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
  'b-gaming': 'bgaming',
  bgmng: 'bgaming',
  'endorphina': 'endorphina',
  'gamomat': 'gamomat',
  'avatarux': 'avatarux',
  'toucan-royale': 'toucanroyale',
  toucanroyale: 'toucanroyale',
  'toucan-royale-gaming': 'toucanroyale',
  toucanroyalegaming: 'toucanroyale',
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
  'meta-gaming': 'stakeEngine',
  metagaming: 'stakeEngine',
  'print-studios': 'stakeEngine',
  printstudios: 'stakeEngine',
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
  // Swaq Studios (Stake Engine). Stake-Gruppen-Slug ist „swaqstudios“ (ohne Bindestrich).
  swaqstudios: 'stakeEngine',
  'swaq-studios': 'stakeEngine',
  // LK7 / Flower Poker (HAR: lk7.live.stake-engine.com, mode "base", no play currency)
  lk7: 'stakeEngine',
  'lk7-com': 'stakeEngine',
  'lk7-gaming': 'stakeEngine',
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

/**
 * Provider-Kuratoren für den Vollscan: PROVIDER_MAP plus alle Provider-Gruppen-Slugs, die in
 * geladenen Spielen (groupGames) gesehen wurden — neue Studios brauchen so keinen manuellen Eintrag.
 */
function collectProviderKuratorSlugs(...slotLists) {
  const set = new Set(getProviderKuratorSlugs())
  for (const list of slotLists) {
    for (const s of list || []) {
      const ps = String(s?.providerSlug || '').trim().toLowerCase()
      if (ps) set.add(ps)
    }
  }
  return [...set].sort()
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
    /** Stake Provider-Gruppen-Slug (z. B. „swaqstudios“) — für dynamische Provider im Vollscan. */
    providerSlug: String(providerSlug).toLowerCase(),
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

/**
 * Find another catalog slug with the same display name (e.g. stale cache vs live Stake slug).
 * Never invents prefixes — only returns slugs already present in the Stake slots cache.
 */
export function findCachedSlotSlugByName(gameName, { excludeSlug } = {}) {
  const key = String(gameName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  if (!key) return null
  const exclude = String(excludeSlug || '').toLowerCase()
  const slots = sessionSlotsCache?.length ? sessionSlotsCache : loadCachedSlots() || []
  const hit = slots.find((s) => {
    const slug = String(s?.slug || '').toLowerCase()
    if (!slug || (exclude && slug === exclude)) return false
    const nameKey = String(s?.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
    return nameKey === key
  })
  return hit?.slug || null
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

/** Mehrere Seiten „newest“ (oder anderer Sort) für einen Kurator (z. B. hacksaw-gaming). */
async function fetchNewestPagesForCuratorSlug(curatorSlug, maxPages, sort = 'newest') {
  const out = []
  for (let page = 0; page < maxPages; page++) {
    const offset = page * PAGE_SIZE
    const variables = { slug: curatorSlug, limit: PAGE_SIZE, offset, sort }
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

/**
 * Eine Kurator-Gruppe komplett paginieren und gameCount mitliefern.
 * `isComplete(gameCount, collected)`: bricht nach einer Seite ab, wenn die Gruppe schon bekannt ist
 * (spart beim Provider-Durchlauf fast alle Folgeseiten).
 */
async function fetchCuratorWithCount(curatorSlug, { sort = 'popular7d', onPage, isComplete } = {}) {
  const collected = []
  let offset = 0
  let gameCount = null
  let exists = true
  while (true) {
    let response
    try {
      response = await fetchPage({ slug: curatorSlug, limit: PAGE_SIZE, offset, sort }, 2)
    } catch (error) {
      if (isRetryableSlotError(error)) break
      throw error
    }
    const group = response?.data?.slugKuratorGroup
    if (!group) {
      exists = false
      break
    }
    if (gameCount == null && Number.isFinite(Number(group.gameCount))) gameCount = Number(group.gameCount)
    const rawCount = group.groupGamesList?.length ?? 0
    const batch = parseGamesFromResponse(response)
    collected.push(...batch)
    onPage?.({ fetched: offset + rawCount, gameCount })
    if (rawCount < PAGE_SIZE) break
    if (isComplete?.(gameCount, collected)) break
    offset += PAGE_SIZE
    await new Promise((r) => setTimeout(r, FULL_SCAN_PAGE_DELAY_MS))
  }
  return { slots: collected, gameCount, exists }
}

/**
 * Vollständiger Katalog:
 *  1. globale Gruppen „slots“, „engine“ (Stake-Engine-Spiele ohne slots-Kategorie!) und
 *     „new-releases“ komplett paginiert,
 *  2. alle Provider-Kuratoren aus PROVIDER_MAP + dynamisch entdeckte Provider-Slugs.
 * @param {object[]} [cached] bisheriger Katalog (liefert zusätzlich bekannte Provider-Slugs)
 * @param {(p: SlotReloadProgress) => void} [onProgress]
 */
async function fetchFullSlotCatalogByProviders(cached = [], onProgress) {
  const bySlug = new Map()
  const failures = []
  const addAll = (list) => {
    let added = 0
    for (const slot of list) {
      if (!bySlug.has(slot.slug)) added++
      bySlug.set(slot.slug, slot)
    }
    return added
  }

  const groups = FULL_SCAN_GLOBAL_GROUPS
  let providerSlugs = collectProviderKuratorSlugs(cached)
  let done = 0
  const emit = (patch) => {
    const total = groups.length + providerSlugs.length
    onProgress?.({
      phase: 'groups',
      done,
      total,
      current: '',
      slots: bySlug.size,
      percent: 0,
      ...patch,
    })
  }

  console.log(`[Slots] Vollscan: ${groups.length} globale Gruppen + Provider-Kuratoren…`)
  for (let gi = 0; gi < groups.length; gi++) {
    const slug = groups[gi]
    try {
      const res = await fetchCuratorWithCount(slug, {
        sort: 'popular7d',
        onPage: ({ fetched, gameCount }) => {
          const frac = gameCount ? Math.min(1, fetched / gameCount) : 0
          emit({
            phase: 'groups',
            current: gameCount ? `${slug} · ${Math.min(fetched, gameCount)}/${gameCount}` : slug,
            percent: Math.round(((gi + frac) / groups.length) * 50),
          })
        },
      })
      const added = addAll(res.slots)
      console.log(`[Slots] Gruppe „${slug}“: ${res.slots.length} Spiele (${added} neu) · gesamt ${bySlug.size}`)
    } catch (error) {
      failures.push(slug)
      console.warn(`[Slots] Gruppe „${slug}“:`, error?.message || error)
    }
    done++
    emit({ phase: 'groups', current: slug, percent: Math.round(((gi + 1) / groups.length) * 50) })
  }

  // Provider-Slugs aus den gerade geladenen Spielen ergänzen (neue Studios automatisch).
  providerSlugs = collectProviderKuratorSlugs(cached, Array.from(bySlug.values()))
  const countByProvider = new Map()
  for (const s of bySlug.values()) {
    if (s.providerSlug) countByProvider.set(s.providerSlug, (countByProvider.get(s.providerSlug) || 0) + 1)
  }
  console.log(`[Slots] Vollscan über ${providerSlugs.length} Provider-Kuratoren…`)

  let providersDone = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < providerSlugs.length) {
      const curatorSlug = providerSlugs[cursor++]
      try {
        const res = await fetchCuratorWithCount(curatorSlug, {
          sort: 'popular7d',
          // Schon alle Spiele des Providers aus den globalen Gruppen bekannt → keine Folgeseiten.
          isComplete: (gameCount) =>
            gameCount != null && (countByProvider.get(curatorSlug) || 0) >= gameCount,
        })
        const added = addAll(res.slots)
        if (added > 0) {
          console.log(`[Slots] Provider „${curatorSlug}“: +${added} neu · gesamt ${bySlug.size}`)
        }
      } catch (error) {
        failures.push(curatorSlug)
        console.warn(`[Slots] Kurator „${curatorSlug}“:`, error?.message || error)
      }
      providersDone++
      done++
      emit({
        phase: 'providers',
        current: curatorSlug,
        percent: 50 + Math.round((providersDone / Math.max(1, providerSlugs.length)) * 50),
      })
      await new Promise((r) => setTimeout(r, FULL_SCAN_PAGE_DELAY_MS))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(FULL_SCAN_PROVIDER_CONCURRENCY, providerSlugs.length) }, () => worker())
  )

  return { slots: Array.from(bySlug.values()), failures, providerCount: providerSlugs.length }
}

/**
 * @typedef {object} SlotReloadProgress
 * @property {'groups'|'providers'|'done'|'error'} phase
 * @property {number} done   erledigte Kuratoren (globale Gruppen + Provider)
 * @property {number} total  Kuratoren gesamt (wächst, wenn neue Provider entdeckt werden)
 * @property {string} current aktueller Kurator
 * @property {number} slots  bisher gefundene Slots
 * @property {number} percent 0–100
 * @property {number} [added] neue Slots ggü. vorherigem Katalog (nur bei phase 'done')
 * @property {string} [error]
 */

let reloadAllPromise = null
let reloadState = { running: false, progress: null, lastResult: null }
const reloadListeners = new Set()
const catalogListeners = new Set()

function setReloadState(patch) {
  reloadState = { ...reloadState, ...patch }
  for (const fn of reloadListeners) {
    try {
      fn(reloadState)
    } catch (_) {}
  }
}

/** Aktueller Status des manuellen Vollreloads (für UI außerhalb von useSlots). */
export function getSlotReloadState() {
  return reloadState
}

/** @returns {() => void} unsubscribe */
export function subscribeSlotReload(listener) {
  reloadListeners.add(listener)
  return () => reloadListeners.delete(listener)
}

/** Benachrichtigt, wenn ein Vollreload einen neuen Katalog geschrieben hat. @returns {() => void} */
export function subscribeSlotCatalog(listener) {
  catalogListeners.add(listener)
  return () => catalogListeners.delete(listener)
}

/**
 * „Slots aktualisieren“: kompletter Katalog-Scan (globale Gruppen + alle Provider inkl. dynamisch
 * entdeckter), Merge mit dem Cache, Session- und localStorage-Cache aktualisieren.
 * Läuft bereits ein Reload, wird dessen Promise zurückgegeben.
 * @param {{ onProgress?: (p: SlotReloadProgress) => void }} [options]
 * @returns {Promise<{ slots: object[], added: number, total: number, failures: string[] }>}
 */
export function reloadAllSlots(options = {}) {
  const { onProgress } = options
  let unsubscribe = null
  if (onProgress) unsubscribe = subscribeSlotReload((st) => st.progress && onProgress(st.progress))
  if (reloadAllPromise) return reloadAllPromise.finally(() => unsubscribe?.())

  const t0 = Date.now()
  const cached = sessionSlotsCache?.length ? sessionSlotsCache : loadCachedSlots() || []
  setReloadState({
    running: true,
    progress: { phase: 'groups', done: 0, total: 0, current: '', slots: 0, percent: 0 },
  })

  reloadAllPromise = (async () => {
    try {
      const { slots: fetched, failures, providerCount } = await fetchFullSlotCatalogByProviders(cached, (p) =>
        setReloadState({ progress: p })
      )
      if (!fetched.length) throw new Error('Keine Slots von der Stake-API erhalten')
      const knownBefore = new Set(cached.map((s) => s.slug))
      const merged = mergeSlotsInto(cached, fetched)
      const added = merged.filter((s) => !knownBefore.has(s.slug)).length
      saveCachedSlots(merged)
      sessionSlotsCache = merged
      sessionCacheTime = Date.now()
      const sec = Math.round((Date.now() - t0) / 1000)
      console.log(
        `[Slots] Vollreload: ${merged.length} Slots · +${added} neu · ${providerCount} Provider in ${sec}s` +
          (failures.length ? ` · Fehler: ${failures.slice(0, 10).join(', ')}` : '')
      )
      logApiCall({
        type: 'stake/slugKuratorGroup',
        endpoint: 'graphql',
        request: { mode: 'manual_full_reload', globalGroups: FULL_SCAN_GLOBAL_GROUPS, providerCount },
        response: { count: merged.length, fetched: fetched.length, added, failures },
        error: null,
        durationMs: Date.now() - t0,
      })
      const result = { slots: merged, added, total: merged.length, failures }
      const prev = reloadState.progress || {}
      setReloadState({
        running: false,
        progress: { ...prev, phase: 'done', percent: 100, slots: merged.length, added, current: '' },
        lastResult: { added, total: merged.length, failures: failures.length, at: Date.now() },
      })
      for (const fn of catalogListeners) {
        try {
          fn(merged)
        } catch (_) {}
      }
      return result
    } catch (error) {
      const msg = error?.message || String(error)
      logApiCall({
        type: 'stake/slugKuratorGroup',
        endpoint: 'graphql',
        request: { mode: 'manual_full_reload' },
        response: null,
        error: msg,
        durationMs: Date.now() - t0,
      })
      setReloadState({
        running: false,
        progress: { ...(reloadState.progress || {}), phase: 'error', error: msg },
      })
      throw error
    } finally {
      reloadAllPromise = null
    }
  })()
  return reloadAllPromise.finally(() => unsubscribe?.())
}

/**
 * Neuerscheinungen laden und in den Cache mergen. Jede Quelle ist einzeln abgesichert:
 * ein Fehler (z. B. abgelehnter Sort, Rate-Limit) verwirft nicht mehr alle anderen Quellen.
 * Früher führte ein einziger Fehler im globalen „newest“-Scan dazu, dass nur noch der alte
 * Cache benutzt wurde — neue Slots kamen dann nur noch über Challenges rein.
 */
async function quickLoadNewSlots(cached) {
  const t0 = Date.now()
  const newest = []
  const failures = []
  let sourcesOk = 0

  const runSource = async (label, task) => {
    try {
      const rows = await task()
      sourcesOk++
      if (rows.length) {
        newest.push(...rows)
        console.log(`[Slots] Quick-Load: +${rows.length} Einträge von „${label}“`)
      }
    } catch (e) {
      failures.push(label)
      console.warn(`[Slots] Quick-Load „${label}“ fehlgeschlagen:`, e?.message || e)
    }
  }

  for (const g of QUICK_LOAD_NEWEST_CATEGORIES) {
    await runSource(`${g.slug} (newest)`, () => fetchNewestPagesForCuratorSlug(g.slug, g.pages, 'newest'))
  }
  for (const g of NEW_RELEASE_GROUPS) {
    await runSource(`${g.slug}`, () => fetchNewestPagesForCuratorSlug(g.slug, g.pages, 'popular7d'))
  }
  for (const g of QUICK_LOAD_EXTRA_GROUPS) {
    await runSource(`${g.slug} (newest)`, () => fetchNewestPagesForCuratorSlug(g.slug, g.pages, 'newest'))
  }

  if (sourcesOk === 0) {
    throw new Error(`Alle Quick-Load-Quellen fehlgeschlagen (${failures.join(', ')})`)
  }

  const knownBefore = new Set(cached.map((s) => s.slug))
  const merged = mergeSlotsInto(cached, newest)
  const newlyAdded = merged.filter((s) => !knownBefore.has(s.slug))
  saveCachedSlots(merged)
  sessionSlotsCache = merged
  sessionCacheTime = Date.now()
  const sec = Math.round((Date.now() - t0) / 1000)
  console.log(
    `[Slots] Quick-Load: ${merged.length} Slots gesamt · ${newest.length} Einträge von API zusammengeführt · ${newlyAdded.length} neue Slugs (vorher ${cached.length}) in ${sec}s` +
      (failures.length ? ` · Fehler: ${failures.join(', ')}` : '')
  )
  if (newlyAdded.length) {
    console.log('[Slots] Neu:', newlyAdded.slice(0, 20).map((s) => s.slug).join(', '))
  }
  logApiCall({
    type: 'stake/slugKuratorGroup',
    endpoint: 'graphql',
    request: {
      quickLoad: true,
      newestPages: NEWEST_PAGES_MAX,
      newestCategories: QUICK_LOAD_NEWEST_CATEGORIES,
      newReleaseGroups: NEW_RELEASE_GROUPS,
      extraGroups: QUICK_LOAD_EXTRA_GROUPS,
    },
    response: { count: merged.length, mergedRows: newest.length, newlyAddedSlugs: newlyAdded.length, failures },
    error: null,
    durationMs: Date.now() - t0,
  })
  return merged
}

/**
 * @param {string} accessToken
 * @param {{ force?: boolean }} [options] force: Session-Cache ignorieren (Hintergrund-Reload neuer Slots)
 */
export async function fetchStakeSlots(accessToken, options = {}) {
  const force = Boolean(options?.force)
  if (!force && sessionSlotsCache && Date.now() - sessionCacheTime < SESSION_CACHE_TTL_MS) {
    console.log(`[Slots] Session-Cache (${sessionSlotsCache.length} Slots), kein API-Call`)
    return sessionSlotsCache
  }

  const cached = sessionSlotsCache?.length ? sessionSlotsCache : loadCachedSlots()
  const t0 = Date.now()

  if (cached && cached.length > 0) {
    console.log(`[Slots] Cache: ${cached.length} Slots, lade Neuerscheinungen (newest + new-releases + Kuratoren)…`)
    try {
      return await quickLoadNewSlots(cached)
    } catch (err) {
      console.warn('[Slots] Quick-Load fehlgeschlagen, nutze Cache:', err?.message)
      logApiCall({
        type: 'stake/slugKuratorGroup',
        endpoint: 'graphql',
        request: { quickLoad: true },
        response: null,
        error: err?.message || String(err),
        durationMs: Date.now() - t0,
      })
      sessionSlotsCache = cached
      // Kurz cachen, damit der nächste Versuch nicht sofort erneut fehlschlägt, aber bald wieder probiert wird.
      sessionCacheTime = Date.now() - SESSION_CACHE_TTL_MS + 60 * 1000
      return cached
    }
  }

  console.log('[Slots] Kein Cache, vollständiger Ladevorgang (Provider-Kuratoren)…')

  try {
    const { slots: all } = await fetchFullSlotCatalogByProviders([])
    if (!all.length) throw new Error('Keine Slots von der Stake-API erhalten')

    saveCachedSlots(all)
    sessionSlotsCache = all
    sessionCacheTime = Date.now()
    console.log(`[Slots] Fertig: ${all.length} Slots in ${Math.round((Date.now() - t0) / 1000)}s`)
    logApiCall({
      type: 'stake/slugKuratorGroup',
      endpoint: 'graphql',
      request: { mode: 'provider_kurators', globalGroups: FULL_SCAN_GLOBAL_GROUPS },
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
