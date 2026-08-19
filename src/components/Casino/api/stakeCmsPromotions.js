import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'
import { mapProviderSlugToProviderId } from './stakeSlotsApi'
import { CASINO_STORAGE_KEYS, readStorageJson, writeStorageJson } from '../utils/storageRegistry'

const SANITY_PROJECT = 'tdrhge4k'
const CACHE_VERSION = 3
const STALE_AFTER_MS = 30 * 60 * 1000
const MAX_GROUP_EXPANSION = 12
const CATALOGUE_CONCURRENCY = 4
const LEADERBOARD_CONCURRENCY = 4

const KURATOR_GAME_FIELDS =
  'id name slug type thumbnailUrl isBlocked groupGames { group { id slug type translation } }'

const PROMO_KURATOR_GAME_QUERY = `query PromoKuratorGame($slug: String!) {
  slugKuratorGame(slug: $slug) { ${KURATOR_GAME_FIELDS} }
}`

const PROMO_KURATOR_GROUP_QUERY = `query PromoKuratorGroup($slug: String!, $limit: Int!) {
  slugKuratorGroup(slug: $slug) {
    id
    slug
    gameCount
    groupGamesList(limit: $limit, offset: 0, sort: newest, locale: "en") {
      id
      game { ${KURATOR_GAME_FIELDS} }
    }
  }
}`

const LEADERBOARD_BET_FRAGMENT = `bet {
  iid
  bet {
    ... on ThirdPartyBet { amount currency payout payoutMultiplier updatedAt user { id name } }
    ... on CasinoBet { amount currency payout payoutMultiplier updatedAt user { id name } }
    ... on SoftswissBet { amount currency payout payoutMultiplier updatedAt user { id name } }
  }
}`

const PROMO_GAME_LEADERBOARDS_QUERY = `query PromoGameLeaderboards($slug: String!) {
  slugKuratorGame(slug: $slug) {
    id
    multiplierLeaderboard { position payoutMultiplier ${LEADERBOARD_BET_FRAGMENT} }
    profitLeaderboard { position profitValue ${LEADERBOARD_BET_FRAGMENT} }
  }
}`

const SANITY_PROMO_QUERY =
  '*[_type=="promotionFresh" && language in $langs && (slug.current in $slugs || (dateRange.start <= $now && dateRange.end >= $now && count(overview[].markDefs[].href[@ match "*casino/g*"]) > 0))]{"slug":slug.current,language,title,dateRange,callToAction,image,overview}'

const MULTIPLIER_IN_TEXT = /(\d[\d,]*(?:\.\d+)?)\s*[×x](?![a-z0-9])/i
const GLOBAL_TARGET = /target multiplier\s+(?:of\s+)?([\d,.]+)\s*[×x]/i
const REQUIRED_GAMES =
  /\bon\s+(all\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+((?:of|se[pa]erate|separate|different)\b[^.]{0,40}?)?\bgames?\b/i
const WORD_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const liveCatalogue = new Map()
const liveGroups = new Map()

function siteConfig(site) {
  if (site === 'eu') {
    return {
      site: 'eu',
      origin: 'https://stake.eu',
      dataset: 'stake-eu-production',
      languages: ['en', 'de'],
      hasFixedRegistry: false,
    }
  }
  return {
    site: 'com',
    origin: 'https://stake.com',
    dataset: 'stake-com-production',
    languages: ['en'],
    hasFixedRegistry: true,
  }
}

function sanityApi(dataset) {
  return `https://${SANITY_PROJECT}.apicdn.sanity.io/v2023-03-26/data/query/${dataset}`
}

function blockText(block) {
  return (block?.children || []).map((child) => child?.text || '').join('')
}

function flattenText(blocks) {
  return (blocks || [])
    .filter((block) => block?._type === 'block')
    .map(blockText)
    .join(' ')
}

function parseMultiplier(match) {
  if (!match) return null
  const n = Number.parseFloat(String(match[1] || '').replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseAmount(raw) {
  const token = String(raw || '').replace(/[^\d.]/g, '')
  if (!token) return null
  const n = Number.parseFloat(token)
  return Number.isFinite(n) ? n : null
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function sanityImageUrl(ref, dataset) {
  if (typeof ref !== 'string') return null
  const m = ref.match(/^image-([a-f0-9]+)-(\d+x\d+)-(\w+)$/)
  if (!m) return null
  return `https://cdn.sanity.io/images/${SANITY_PROJECT}/${dataset}/${m[1]}-${m[2]}.${m[3]}?w=800&fm=webp`
}

function gameLinksOfBlock(block) {
  const byKey = new Map()
  for (const mark of block?.markDefs || []) {
    if (mark?._type !== 'link' || !mark.href || !mark._key) continue
    const m = String(mark.href).match(/\/casino\/games\/([a-z0-9-]+)/i)
    if (m) byKey.set(mark._key, m[1])
  }
  if (byKey.size === 0) return []
  const links = []
  for (const child of block?.children || []) {
    for (const mark of child?.marks || []) {
      const slug = byKey.get(mark)
      if (slug) links.push({ slug, label: String(child?.text || '').trim() })
    }
  }
  return links
}

function collectGameLinks(blocks) {
  const bySlug = new Map()
  for (const block of blocks || []) {
    for (const { slug, label } of gameLinksOfBlock(block)) {
      if (!bySlug.has(slug) || (!bySlug.get(slug) && label)) bySlug.set(slug, label)
    }
  }
  return Array.from(bySlug, ([slug, label]) => ({ slug, label }))
}

function collectGroupLinks(blocks, doc) {
  const hrefs = (blocks || []).flatMap((block) => (block?.markDefs || []).map((mark) => mark?.href || ''))
  hrefs.push(doc?.callToAction?.href || '')
  const slugs = new Set()
  for (const href of hrefs) {
    const m = String(href).match(/\/casino\/group\/([a-z0-9-]+)/i)
    if (m) slugs.add(m[1])
  }
  return Array.from(slugs)
}

function bulletsUnderHeading(blocks, headingRe) {
  const out = []
  let active = false
  for (const block of blocks || []) {
    if (block?._type !== 'block') continue
    if (block.style === 'h2') {
      active = headingRe.test(blockText(block))
      continue
    }
    if (!active) continue
    if (block.listItem === 'bullet') {
      const text = blockText(block).trim()
      if (text) out.push(text)
    }
  }
  return out
}

function findTable(blocks, predicate) {
  for (const block of blocks || []) {
    if (block?._type !== 'table' || !Array.isArray(block.rows)) continue
    const rows = block.rows.map((row) => (row?.cells || []).map((cell) => String(cell ?? '')))
    if (rows.length > 0 && predicate(rows[0])) return rows
  }
  return null
}

function parseRequiredGames(text) {
  const m = String(text || '').match(REQUIRED_GAMES)
  if (!m) return null
  const count = WORD_NUMBERS[String(m[2] || '').toLowerCase()] ?? Number.parseInt(m[2], 10)
  return Number.isFinite(count) && count > 1 ? count : null
}

function preferEnglish(docs) {
  const bySlug = new Map()
  for (const doc of docs || []) {
    const slug = doc?.slug || ''
    const prev = bySlug.get(slug)
    if (!prev || (doc.language === 'en' && prev.language !== 'en')) bySlug.set(slug, doc)
  }
  return Array.from(bySlug.values())
}

function providerFromKurator(game) {
  const groups = Array.isArray(game?.groupGames) ? game.groupGames : []
  const providerGroup = groups.find((entry) => entry?.group?.type === 'provider')
  const providerSlug = providerGroup?.group?.slug || ''
  const providerName = providerGroup?.group?.translation || providerSlug || ''
  const providerId = mapProviderSlugToProviderId(providerSlug)
  return {
    provider: providerId,
    providerName: providerName || providerId,
    supported: Boolean(game?.id && game?.slug && game?.isBlocked !== true),
  }
}

function toLiveGame(game) {
  if (!game?.slug || !game?.id) return null
  const resolved = providerFromKurator(game)
  return {
    supported: resolved.supported,
    row: {
      id: String(game.id),
      name: String(game.name || game.slug),
      slug: String(game.slug).toLowerCase(),
      thumbnailUrl: game.thumbnailUrl || '',
      provider: resolved.provider,
      providerName: resolved.providerName,
      type: game.type || '',
    },
  }
}

async function mapWithLimit(items, limit, mapper) {
  const concurrency = Math.max(1, Math.min(limit, items.length || 1))
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const idx = next++
        out[idx] = await mapper(items[idx], idx)
      }
    })
  )
  return out
}

async function fetchKuratorGame(slug) {
  const key = String(slug || '').toLowerCase()
  if (liveCatalogue.has(key)) return liveCatalogue.get(key)
  try {
    const res = await StakeApi.query(PROMO_KURATOR_GAME_QUERY, { slug: key })
    const live = toLiveGame(res?.data?.slugKuratorGame)
    liveCatalogue.set(key, live)
    return live
  } catch {
    liveCatalogue.set(key, null)
    return null
  }
}

async function fetchKuratorGroup(slug) {
  const key = String(slug || '').toLowerCase()
  if (liveGroups.has(key)) return liveGroups.get(key)
  const res = await StakeApi.query(PROMO_KURATOR_GROUP_QUERY, {
    slug: key,
    limit: MAX_GROUP_EXPANSION + 1,
  })
  const group = res?.data?.slugKuratorGroup
  if (!group) {
    const empty = { gameCount: null, games: [] }
    liveGroups.set(key, empty)
    return empty
  }
  const gameCount = typeof group.gameCount === 'number' ? group.gameCount : null
  const games = []
  for (const entry of group.groupGamesList || []) {
    const live = toLiveGame(entry?.game)
    if (!live) continue
    liveCatalogue.set(live.row.slug, live)
    games.push({ slug: live.row.slug, name: live.row.name })
  }
  const payload = {
    gameCount,
    games: (gameCount ?? games.length) > MAX_GROUP_EXPANSION ? [] : games,
  }
  liveGroups.set(key, payload)
  return payload
}

function indexSlots(webSlots) {
  const bySlug = new Map()
  for (const slot of webSlots || []) {
    const slug = String(slot?.slug || '').toLowerCase()
    if (!slug) continue
    bySlug.set(slug, {
      id: slot.id != null ? String(slot.id) : slot.stakeGameId != null ? String(slot.stakeGameId) : undefined,
      name: slot.name || slug,
      slug,
      thumbnailUrl: slot.thumbnailUrl || '',
      provider: slot.providerId || 'stakeEngine',
      providerName: slot.providerName || slot.providerId || '',
    })
  }
  return { bySlug }
}

function buildStakeVsEddieGames(blocks, doc) {
  const target = parseMultiplier(flattenText(blocks).match(GLOBAL_TARGET))
  let links = collectGameLinks(blocks)
  if (links.length === 0) {
    const fromCta = String(doc?.callToAction?.href || '').match(/\/casino\/games\/([a-z0-9-]+)/i)
    if (fromCta) links = [{ slug: fromCta[1], label: '' }]
  }
  return links.map(({ slug, label }) => ({
    slug,
    label,
    targetMultiplier: target ?? undefined,
  }))
}

function buildConquerGames(blocks) {
  const links = collectGameLinks(blocks)
  const table = findTable(
    blocks,
    (header) => header.some((cell) => /user/i.test(cell)) && header.some((cell) => /stat/i.test(cell))
  )
  const byName = new Map()
  for (const row of table?.slice(1) || []) {
    const [rawName, user, amountRaw] = row
    const parsed = String(rawName || '').match(/^\s*(BW|LW)\s*-\s*(.+?)\s*$/i)
    if (!parsed) continue
    const value = parseAmount(amountRaw)
    if (value === null || !user) continue
    const key = normalizeName(parsed[2])
    const current = byName.get(key) || {}
    if (parsed[1].toUpperCase() === 'BW') current.bigWin = { user, valueUsd: value }
    else current.luckyWin = { user, multiplier: value }
    byName.set(key, current)
  }
  return links.map(({ slug, label }) => {
    const stats = byName.get(normalizeName(label)) || {}
    return {
      slug,
      label,
      bigWin: stats.bigWin,
      luckyWin: stats.luckyWin,
      targetMultiplier: stats.luckyWin?.multiplier,
    }
  })
}

async function buildGenericGames(blocks, doc) {
  const globalTarget = parseMultiplier(flattenText(blocks).match(GLOBAL_TARGET))
  const games = []
  const seen = new Set()
  for (const block of blocks || []) {
    const links = gameLinksOfBlock(block)
    if (links.length === 0) continue
    const localTarget = parseMultiplier(blockText(block).match(MULTIPLIER_IN_TEXT)) ?? globalTarget
    for (const { slug, label } of links) {
      if (seen.has(slug)) continue
      seen.add(slug)
      games.push({ slug, label, targetMultiplier: localTarget ?? undefined })
    }
  }
  if (games.length > 0) return games
  for (const groupSlug of collectGroupLinks(blocks, doc)) {
    try {
      const group = await fetchKuratorGroup(groupSlug)
      for (const game of group.games) {
        if (seen.has(game.slug)) continue
        seen.add(game.slug)
        games.push({ slug: game.slug, label: game.name, targetMultiplier: globalTarget ?? undefined })
      }
    } catch (error) {
      logApiCall({
        type: 'promotions/group',
        endpoint: groupSlug,
        request: { groupSlug },
        response: null,
        error: error?.message || String(error),
        durationMs: 0,
      })
    }
  }
  return games
}

const PROMO_REGISTRY = [
  { slug: 'stake-versus-eddie', kind: 'multiplier-target', buildGames: buildStakeVsEddieGames },
  { slug: 'conquer-the-casino', kind: 'leaderboard-race', buildGames: buildConquerGames },
]

function discoverDefinition(doc) {
  if (!doc?.slug) return null
  if (/stakecommunity\.com/i.test(doc?.callToAction?.href || '')) return null
  const overview = Array.isArray(doc.overview) ? doc.overview : []
  const globalTarget = parseMultiplier(flattenText(overview).match(GLOBAL_TARGET))
  const hasTargetLinks = overview.some(
    (block) => gameLinksOfBlock(block).length > 0 && (globalTarget !== null || MULTIPLIER_IN_TEXT.test(blockText(block)))
  )
  if (!hasTargetLinks && !(globalTarget !== null && collectGroupLinks(overview, doc).length > 0)) return null
  return { slug: doc.slug, kind: 'multiplier-target', buildGames: buildGenericGames }
}

async function querySanity(slugs, site) {
  const cfg = siteConfig(site)
  const params = new URLSearchParams({
    query: SANITY_PROMO_QUERY,
    $slugs: JSON.stringify(slugs),
    $langs: JSON.stringify(cfg.languages),
    $now: JSON.stringify(new Date().toISOString()),
  })
  const url = `${sanityApi(cfg.dataset)}?${params.toString()}`
  const t0 = Date.now()
  const res = await window.electronAPI.proxyRequest({
    url,
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Sanity HTTP ${res.status}`)
  }
  const json = typeof res.data === 'string' ? JSON.parse(res.data || '{}') : res.data
  logApiCall({
    type: 'promotions/cms',
    endpoint: cfg.dataset,
    request: { slugs, langs: cfg.languages },
    response: { count: Array.isArray(json?.result) ? json.result.length : 0 },
    error: null,
    durationMs: Date.now() - t0,
  })
  return preferEnglish(Array.isArray(json?.result) ? json.result : [])
}

async function resolveMissingGames(promotions) {
  const missing = new Map()
  for (const promo of promotions) {
    for (const game of promo.games || []) {
      if (game.available) continue
      const list = missing.get(game.slug) || []
      list.push(game)
      missing.set(game.slug, list)
    }
  }
  const slugs = Array.from(missing.keys())
  if (slugs.length === 0) return
  await mapWithLimit(slugs, CATALOGUE_CONCURRENCY, async (slug) => {
    const live = await fetchKuratorGame(slug)
    if (!live) return
    for (const game of missing.get(slug) || []) {
      game.name = live.row.name
      game.thumbnailUrl = live.row.thumbnailUrl || undefined
      game.provider = live.row.provider || undefined
      game.providerName = live.row.providerName || undefined
      if (!live.supported) continue
      game.id = live.row.id
      game.available = true
    }
  })
}

async function normalizePromotion(def, doc, slotIndex, site) {
  const cfg = siteConfig(site)
  const overview = Array.isArray(doc.overview) ? doc.overview : []
  const text = flattenText(overview)
  const summaryBlock = overview.find((block) => block?._type === 'block' && blockText(block).trim())
  const summary = summaryBlock ? blockText(summaryBlock).trim() : ''
  const prizePool = (summary || text).match(/(?:\$|\bSC\s?|\bGC\s?)\d[\d,]*(?:\.\d+)?/)?.[0] || null
  const minBetMatch =
    text.match(/at least\s+\$?([\d.]+)c?\s*USD/i) ||
    text.match(/at least\s+(?:SC|GC)\s?([\d.]+)/i) ||
    text.match(/at least\s+([\d.]+)\s*(?:SC|GC)\b/i)
  const prizeTable = findTable(
    overview,
    (header) => header.some((cell) => /position/i.test(cell)) && header.some((cell) => /prize/i.test(cell))
  )
  const prizes = (prizeTable?.slice(1) || [])
    .filter((row) => row[0])
    .map((row) => ({ label: row[0], value: row[1] || '' }))
  const leaderboardFetchedAt = bulletsUnderHeading(overview, /leader\s*board/i).find((line) => /last fetched/i.test(line)) || null
  const rawGames = await def.buildGames(overview, doc)
  const games = rawGames.map((game) => {
    const catalog = slotIndex.bySlug.get(String(game.slug || '').toLowerCase())
    return {
      slug: game.slug,
      name: catalog?.name || game.label || game.slug,
      id: catalog?.id,
      thumbnailUrl: catalog?.thumbnailUrl,
      provider: catalog?.provider,
      providerName: catalog?.providerName,
      available: Boolean(catalog),
      targetMultiplier: game.targetMultiplier,
      bigWin: game.bigWin,
      luckyWin: game.luckyWin,
      leaderboardSource: def.kind === 'leaderboard-race' ? 'promo-page' : undefined,
    }
  })
  const groupSlug = collectGroupLinks(overview, doc)[0]
  const group = groupSlug ? liveGroups.get(groupSlug) : undefined
  return {
    slug: def.slug,
    kind: def.kind,
    title: String(doc.title || def.slug).trim(),
    summary,
    imageUrl: sanityImageUrl(doc.image?.asset?._ref, cfg.dataset),
    url: `${cfg.origin}/promotions/promotion/${def.slug}`,
    startAt: doc.dateRange?.start || null,
    endAt: doc.dateRange?.end || null,
    prizePool,
    minBetUsd: minBetMatch ? Number.parseFloat(minBetMatch[1]) : null,
    leaderboardFetchedAt,
    prizes,
    terms: bulletsUnderHeading(overview, /terms/i),
    games,
    requiredGames: parseRequiredGames(text),
    gameGroup: groupSlug
      ? {
          slug: groupSlug,
          url: `${cfg.origin}/casino/group/${groupSlug}`,
          gameCount: group?.gameCount ?? null,
        }
      : null,
  }
}

function toUsd(amount, currency, rates) {
  const rate = rates.get(String(currency || '').toLowerCase())
  return typeof rate === 'number' ? amount * rate : null
}

async function fetchGameLeaderboard(slug, rates) {
  const res = await StakeApi.query(PROMO_GAME_LEADERBOARDS_QUERY, { slug })
  const game = res?.data?.slugKuratorGame
  if (!game) return []
  const rows = []
  const seen = new Set()
  for (const entry of [...(game.multiplierLeaderboard || []), ...(game.profitLeaderboard || [])]) {
    const iid = entry?.bet?.iid
    const bet = entry?.bet?.bet
    if (!bet || (iid && seen.has(iid))) continue
    if (iid) seen.add(iid)
    const amount = Number(bet.amount)
    const payout = Number(bet.payout)
    const multiplier = Number(bet.payoutMultiplier)
    const at = Date.parse(String(bet.updatedAt || ''))
    const currency = String(bet.currency || '')
    if (!Number.isFinite(amount) || !Number.isFinite(payout) || !Number.isFinite(at)) continue
    const amountUsd = toUsd(amount, currency, rates)
    const payoutUsd = toUsd(payout, currency, rates)
    if (amountUsd === null || payoutUsd === null) continue
    const user = bet.user?.name
    rows.push({
      user: typeof user === 'string' && user ? user : null,
      amountUsd,
      payoutUsd,
      multiplier: Number.isFinite(multiplier) ? multiplier : 0,
      at,
    })
  }
  return rows
}

async function applyLiveLeaderboards(promo) {
  if (promo.kind !== 'leaderboard-race' || promo.games.length === 0) return
  let rates
  try {
    const map = await window.electronAPI.fetchLoggerCurrencyRates()
    rates = new Map(Object.entries(map || {}))
    if (rates.size === 0) throw new Error('no conversion rates')
  } catch (error) {
    logApiCall({
      type: 'promotions/leaderboard',
      endpoint: promo.slug,
      request: { reason: 'rates' },
      response: null,
      error: error?.message || String(error),
      durationMs: 0,
    })
    return
  }
  const start = promo.startAt ? Date.parse(promo.startAt) : Number.NEGATIVE_INFINITY
  const end = promo.endAt ? Date.parse(promo.endAt) : Number.POSITIVE_INFINITY
  const minBet = (promo.minBetUsd ?? 0.1) * 0.95
  await mapWithLimit(promo.games, LEADERBOARD_CONCURRENCY, async (game) => {
    try {
      const rows = (await fetchGameLeaderboard(game.slug, rates)).filter(
        (row) => row.at >= start && row.at <= end && row.amountUsd >= minBet
      )
      if (rows.length === 0) return
      const bestMulti = rows.reduce((best, row) => (row.multiplier > best.multiplier ? row : best))
      const payoutRows = rows.filter((row) => row.payoutUsd >= row.amountUsd)
      const bestPayout = payoutRows.length
        ? payoutRows.reduce((best, row) => (row.payoutUsd > best.payoutUsd ? row : best))
        : null
      if (bestMulti.multiplier > 0) {
        game.luckyWin = { user: bestMulti.user || 'hidden', multiplier: bestMulti.multiplier }
        game.targetMultiplier = bestMulti.multiplier
      }
      if (bestPayout) {
        game.bigWin = { user: bestPayout.user || 'hidden', valueUsd: bestPayout.payoutUsd }
      }
      game.leaderboardSource = 'live'
    } catch (error) {
      logApiCall({
        type: 'promotions/leaderboard',
        endpoint: game.slug,
        request: { promo: promo.slug },
        response: null,
        error: error?.message || String(error),
        durationMs: 0,
      })
    }
  })
}

function cacheKey(site) {
  return `${CASINO_STORAGE_KEYS.cmsPromotionsCache}:${siteConfig(site).site}`
}

function readCache(site) {
  const raw = readStorageJson(cacheKey(site), null)
  if (!raw || raw.version !== CACHE_VERSION || !Array.isArray(raw.promotions)) {
    return { promotions: [], fetchedAt: 0 }
  }
  return {
    promotions: raw.promotions,
    fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : 0,
  }
}

function writeCache(site, payload) {
  writeStorageJson(cacheKey(site), payload)
}

export function isPromotionLive(promo, now = Date.now()) {
  const start = promo?.startAt ? Date.parse(promo.startAt) : NaN
  const end = promo?.endAt ? Date.parse(promo.endAt) : NaN
  if (Number.isFinite(start) && now < start) return false
  if (Number.isFinite(end) && now > end) return false
  return true
}

export function promotionTimeLeft(promo, now = Date.now()) {
  const end = promo?.endAt ? Date.parse(promo.endAt) : NaN
  return Number.isFinite(end) ? end - now : null
}

export async function loadStakeCmsPromotions({ site = 'com', webSlots = [], force = false } = {}) {
  if (!force) {
    const cached = readCache(site)
    if (cached.promotions.length > 0 && Date.now() - cached.fetchedAt < STALE_AFTER_MS) {
      return { ...cached, cached: true }
    }
    if (cached.promotions.length > 0) {
      // Serve stale immediately; refresh continues below.
    }
  }
  const cfg = siteConfig(site)
  const registry = cfg.hasFixedRegistry ? PROMO_REGISTRY : []
  try {
    const docs = await querySanity(registry.map((entry) => entry.slug), site)
    const bySlug = new Map(docs.map((doc) => [doc.slug || '', doc]))
    const pairs = []
    for (const def of registry) {
      const doc = bySlug.get(def.slug)
      if (!doc) continue
      pairs.push({ def, doc })
    }
    for (const doc of docs) {
      if (registry.some((def) => def.slug === doc.slug)) continue
      const def = discoverDefinition(doc)
      if (def) pairs.push({ def, doc })
    }
    const slotIndex = indexSlots(webSlots)
    const promotions = []
    for (const { def, doc } of pairs) {
      const promo = await normalizePromotion(def, doc, slotIndex, site)
      if (promo.games.length === 0 && !promo.gameGroup) continue
      promotions.push(promo)
    }
    await resolveMissingGames(promotions)
    for (const promo of promotions) {
      if (promo.kind !== 'leaderboard-race') continue
      await applyLiveLeaderboards(promo)
    }
    const payload = { promotions, fetchedAt: Date.now(), version: CACHE_VERSION }
    writeCache(site, payload)
    return { ...payload, cached: false }
  } catch (error) {
    const cached = readCache(site)
    if (cached.promotions.length > 0) return { ...cached, cached: true, error: error?.message || String(error) }
    throw error
  }
}

export function getCachedStakeCmsPromotions(site = 'com') {
  return readCache(site)
}
