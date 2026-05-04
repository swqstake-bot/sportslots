import { logApiCall } from '../utils/apiLogger'

const PROMO_LINK_RE = /href="\/([a-z]{2}(?:-[a-z]{2})?)\/promotions\/promotion\/([a-z0-9-]+)"/gi
const CASINO_GAME_RE = /\/(?:([a-z]{2}(?:-[a-z]{2})?)\/)?casino\/games\/([a-z0-9-]+)/gi
const SPORTS_PATH_RE = /\/(?:([a-z]{2}(?:-[a-z]{2})?)\/)?sports(?:\/[^"'?#<\s]*)?/gi
const STAKE_VS_EDDIE_SLUG = 'stake-versus-eddie'
const SAFE_PROMO_LOCALES = new Set(['de', 'en'])
const PROVIDER_PRIORITY = ['stakeEngine', 'pragmatic', 'hacksaw', 'nolimit', 'pushgaming', 'netent', 'relax']
const PROMO_HTML_CACHE_KEY = 'slotbot_promotions_html_cache_v1'
const PROMO_HTML_CACHE_MAX_AGE_MS = 10 * 60 * 1000
const PROMO_HTML_STALE_OK_MS = 12 * 60 * 60 * 1000
let promoRateLimitedUntilTs = 0

function ensureElectronProxy() {
  if (!window.electronAPI?.proxyRequest) {
    throw new Error('Electron proxy is not available')
  }
}

function humanizeSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)))
}

function getPromoHtmlCache() {
  try {
    const raw = localStorage.getItem(PROMO_HTML_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function setPromoHtmlCacheEntry(url, html) {
  try {
    const cache = getPromoHtmlCache()
    cache[String(url)] = { ts: Date.now(), html: String(html || '') }
    localStorage.setItem(PROMO_HTML_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore cache write issues
  }
}

function getPromoHtmlCacheEntry(url, allowStale = false) {
  const cache = getPromoHtmlCache()
  const entry = cache[String(url)]
  if (!entry || typeof entry.html !== 'string') return null
  const age = Date.now() - Number(entry.ts || 0)
  const maxAge = allowStale ? PROMO_HTML_STALE_OK_MS : PROMO_HTML_CACHE_MAX_AGE_MS
  if (!Number.isFinite(age) || age < 0 || age > maxAge) return null
  return entry.html
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitterMs(baseMs) {
  const base = Number(baseMs) || 0
  if (base <= 0) return 0
  const jitter = Math.floor(Math.random() * Math.min(350, Math.max(80, Math.floor(base * 0.25))))
  return base + jitter
}

function normalizeSportSlug(raw) {
  const slug = String(raw || '').toLowerCase().trim()
  if (!slug) return ''
  if (slug === 'esports') return 'esport'
  return slug
}

function parseSportsTargetMeta(sportsTargets) {
  const urls = Array.isArray(sportsTargets) ? sportsTargets : []
  const sportVotes = new Map()
  const categoryVotes = new Map()
  const tournamentVotes = new Map()
  let hasLiveHint = false
  const eventHints = []
  for (const rawUrl of urls) {
    const m = /\/sports\/([^/?#]+)(?:\/([^/?#]+))?(?:\/([^/?#]+))?/i.exec(String(rawUrl || ''))
    if (!m) continue
    const sportSlug = normalizeSportSlug(m[1])
    const categorySlug = String(m[2] || '').toLowerCase()
    const eventSlug = String(m[3] || '').toLowerCase()
    if (/\/sports\/live\b/i.test(String(rawUrl || ''))) hasLiveHint = true
    if (sportSlug) sportVotes.set(sportSlug, (sportVotes.get(sportSlug) || 0) + 1)
    if (categorySlug) categoryVotes.set(categorySlug, (categoryVotes.get(categorySlug) || 0) + 1)
    if (eventSlug) tournamentVotes.set(eventSlug, (tournamentVotes.get(eventSlug) || 0) + 1)
    if (eventSlug) {
      eventHints.push(eventSlug.replace(/-/g, ' '))
    } else if (categorySlug) {
      eventHints.push(categorySlug.replace(/-/g, ' '))
    }
  }
  const pickMostFrequent = (map) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || ''
  const sportSlug = pickMostFrequent(sportVotes) || 'all'
  const categorySlug = pickMostFrequent(categoryVotes)
  const tournamentSlug = pickMostFrequent(tournamentVotes)
  return {
    sportsSportSlug: sportSlug,
    sportsCategorySlug: categorySlug || '',
    sportsTournamentSlug: tournamentSlug || '',
    sportsGameType: hasLiveHint ? 'live' : 'upcoming',
    sportsTargetCount: urls.length,
    sportsEventFilterHint: uniqueStrings(eventHints).slice(0, 3).join(' | '),
  }
}

function looksLikeRealSportsTarget(url) {
  try {
    const u = new URL(String(url))
    const parts = u.pathname.split('/').filter(Boolean).map((p) => p.toLowerCase())
    if (!parts.length) return false
    const localeAdjusted = SAFE_PROMO_LOCALES.has(parts[0]) ? parts.slice(1) : parts
    if (!localeAdjusted.length || localeAdjusted[0] !== 'sports') return false
    // Drop generic nav/landing targets.
    if (localeAdjusted.length <= 1) return false
    const second = localeAdjusted[1] || ''
    if (!second || second === 'live' || second === 'upcoming' || second === 'my-bets' || second === 'all') {
      return false
    }
    // Require deeper scope than plain category landing.
    return localeAdjusted.length >= 3
  } catch {
    return false
  }
}

function normalizePromoLocale(raw, preferredLocale = 'de') {
  const token = String(raw || '').trim().toLowerCase()
  if (SAFE_PROMO_LOCALES.has(token)) return token
  return SAFE_PROMO_LOCALES.has(preferredLocale) ? preferredLocale : 'en'
}

function parsePromotionLinks(html, preferredLocale = 'de') {
  const rows = []
  const seen = new Set()
  const preferred = normalizePromoLocale(preferredLocale, 'de')
  let m
  const re = new RegExp(PROMO_LINK_RE.source, 'gi')
  while ((m = re.exec(html || '')) !== null) {
    const locale = normalizePromoLocale(m[1], preferred)
    const slug = String(m[2] || '').toLowerCase()
    if (!slug) continue
    const key = `${slug}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      locale,
      slug,
      title: humanizeSlug(slug),
      url: `https://stake.com/${locale}/promotions/promotion/${slug}`,
    })
  }
  return rows
}

function parseTitle(html, fallback) {
  const og = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i.exec(html || '')
  if (og?.[1]) return og[1].trim()
  const t = /<title>([^<]+)<\/title>/i.exec(html || '')
  if (t?.[1]) return t[1].trim()
  return fallback
}

function normalizeNumericToken(raw) {
  const token = String(raw || '').replace(',', '.').trim()
  const n = Number(token)
  return Number.isFinite(n) ? n : null
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePromotionRequirements(html) {
  const text = htmlToText(html)
  if (!text) {
    return { targetMultiplier: null, requiredLegs: null, minOdds: null, minStakeUsd: null, gameNames: [], sportsHintText: '', taskText: '' }
  }

  const targetPatterns = [
    /target multiplier(?:\s+of)?\s+([0-9]+(?:[.,][0-9]+)?)\s*[x×]/i,
    /hit the target multiplier(?:\s+of)?\s+([0-9]+(?:[.,][0-9]+)?)\s*[x×]/i,
    /multiplikator(?:\s+von)?\s+([0-9]+(?:[.,][0-9]+)?)\s*[x×]/i,
    /multiplicateur(?:\s+de)?\s+([0-9]+(?:[.,][0-9]+)?)\s*[x×]/i,
  ]
  const legsPatterns = [
    /(?:at least|min(?:imum)?)\s+([0-9]+)\s+(?:legs?|selections?)/i,
    /([0-9]+)\s+(?:legs?|selections?)\s+(?:or more|minimum|required)/i,
    /mindestens\s+([0-9]+)\s+(?:legs?|auswahlen|tipps?)/i,
  ]
  const oddsPatterns = [
    /minimum odds(?:\s+of)?\s+([0-9]+(?:[.,][0-9]+)?)/i,
    /min odds(?:\s+of)?\s+([0-9]+(?:[.,][0-9]+)?)/i,
    /gesamtquote(?:\s+von)?\s+([0-9]+(?:[.,][0-9]+)?)/i,
  ]
  const minStakePatterns = [
    /(?:minimum|min\.?)\s*(?:stake|bet|einsatz)\s*(?:of|von)?\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /\$\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:minimum|min\.?)\s*(?:stake|bet|einsatz)/i,
  ]
  const gameListPatterns = [
    /(?:on|in)\s+((?:[A-Z][A-Za-z0-9'&!:+\-\s]{2,})(?:\s*(?:,|or|oder|\/)\s*[A-Z][A-Za-z0-9'&!:+\-\s]{2,}){0,8})\s*(?:to|for|with|while|and)\s+(?:a\s+)?(?:target\s+)?mult/i,
    /(?:eligible|valid)\s+games?\s*:\s*([A-Z][A-Za-z0-9'&!:+\-\s,\/]{4,180})/i,
  ]
  const sportsHintPatterns = [
    /(?:bet|wette|place)\s+(?:on|auf)\s+([A-Za-z0-9'&:+\-\s]{6,100})\s+(?:with|min|odds|quote|for|to)/i,
    /(?:match|fixture|event)\s*:\s*([A-Za-z0-9'&:+\-\s]{6,120})/i,
  ]

  let targetMultiplier = null
  for (const re of targetPatterns) {
    const m = re.exec(text)
    if (!m?.[1]) continue
    targetMultiplier = normalizeNumericToken(m[1])
    if (targetMultiplier != null) break
  }
  let requiredLegs = null
  for (const re of legsPatterns) {
    const m = re.exec(text)
    if (!m?.[1]) continue
    const n = Number.parseInt(String(m[1]), 10)
    if (Number.isFinite(n) && n > 0) {
      requiredLegs = n
      break
    }
  }
  let minOdds = null
  for (const re of oddsPatterns) {
    const m = re.exec(text)
    if (!m?.[1]) continue
    minOdds = normalizeNumericToken(m[1])
    if (minOdds != null) break
  }
  let minStakeUsd = null
  for (const re of minStakePatterns) {
    const m = re.exec(text)
    if (!m?.[1]) continue
    minStakeUsd = normalizeNumericToken(m[1])
    if (minStakeUsd != null) break
  }
  const gameNames = []
  for (const re of gameListPatterns) {
    const m = re.exec(text)
    const raw = String(m?.[1] || '')
    if (!raw) continue
    raw
      .split(/\s*(?:,|\/|\bor\b|\border\b)\s*/i)
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter((part) => part.length >= 3 && /[a-zA-Z]/.test(part))
      .forEach((part) => gameNames.push(part))
    if (gameNames.length > 0) break
  }
  let sportsHintText = ''
  for (const re of sportsHintPatterns) {
    const m = re.exec(text)
    const raw = String(m?.[1] || '').replace(/\s+/g, ' ').trim()
    if (!raw) continue
    sportsHintText = raw
    break
  }

  const sentenceHint =
    /((?:hit|reach|complete|place|wette|spiele|atteignez)[^.?!]{20,220}[.?!])/i.exec(text)?.[1] ||
    text.slice(0, 220)

  return {
    targetMultiplier,
    requiredLegs,
    minOdds,
    minStakeUsd,
    gameNames: uniqueStrings(gameNames).slice(0, 8),
    sportsHintText,
    taskText: sentenceHint,
  }
}

function parsePromotionTargets(html) {
  const gameSlugs = []
  const sportsTargets = []
  let m
  const gameRe = new RegExp(CASINO_GAME_RE.source, 'gi')
  while ((m = gameRe.exec(html || '')) !== null) {
    if (m[2]) gameSlugs.push(String(m[2]).toLowerCase())
  }
  const sportsRe = new RegExp(SPORTS_PATH_RE.source, 'gi')
  while ((m = sportsRe.exec(html || '')) !== null) {
    if (m[0]) {
      const candidate = `https://stake.com${String(m[0]).toLowerCase()}`
      if (looksLikeRealSportsTarget(candidate)) {
        sportsTargets.push(candidate)
      }
    }
  }
  const quotedSlugRe = /"(?:slug|gameSlug|game_slug)"\s*:\s*"([a-z0-9-]{3,})"/gi
  while ((m = quotedSlugRe.exec(html || '')) !== null) {
    const slug = String(m[1] || '').toLowerCase()
    if (!slug) continue
    if (
      slug.includes('promotion') ||
      slug.includes('sports') ||
      slug.includes('challenge') ||
      slug.includes('forum')
    ) {
      continue
    }
    gameSlugs.push(slug)
  }
  return {
    gameSlugs: uniqueStrings(gameSlugs),
    sportsTargets: uniqueStrings(sportsTargets),
  }
}

async function fetchHtml(url) {
  ensureElectronProxy()
  const freshCached = getPromoHtmlCacheEntry(url, false)
  if (freshCached) return freshCached

  const now = Date.now()
  if (promoRateLimitedUntilTs > now) {
    await sleep(jitterMs(promoRateLimitedUntilTs - now))
  }

  const t0 = Date.now()
  let lastErr = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await window.electronAPI.proxyRequest({
        url,
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      logApiCall({
        type: 'stake/promotions/html',
        endpoint: url,
        request: { attempt },
        response: { status: res?.status, finalUrl: res?.finalUrl },
        error: null,
        durationMs: Date.now() - t0,
      })
      if (!res || res.status < 200 || res.status >= 400) {
        if (res?.status === 429 && attempt < 3) {
          const retryAfter = Number(res?.headers?.['retry-after'] || res?.headers?.RetryAfter || 0)
          const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0
          const waitMs = Math.max(retryAfterMs, 900 + attempt * 1200)
          promoRateLimitedUntilTs = Date.now() + waitMs
          await sleep(waitMs)
          continue
        }
        throw new Error(`HTTP ${res?.status || 'unknown'} while loading promotions`)
      }
      const html = String(res.data || '')
      setPromoHtmlCacheEntry(url, html)
      return html
    } catch (error) {
      lastErr = error
      const msg = String(error?.message || error || '')
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate')
      if (isRateLimit && attempt < 3) {
        const waitMs = 900 + attempt * 1200
        promoRateLimitedUntilTs = Date.now() + waitMs
        await sleep(waitMs)
        continue
      }
      break
    }
  }

  const staleCached = getPromoHtmlCacheEntry(url, true)
  if (staleCached) {
    logApiCall({
      type: 'stake/promotions/html',
      endpoint: url,
      request: { fallback: 'stale-cache' },
      response: { status: 200, cached: true },
      error: null,
      durationMs: Date.now() - t0,
    })
    return staleCached
  }

  logApiCall({
    type: 'stake/promotions/html',
    endpoint: url,
    request: null,
    response: null,
    error: lastErr?.message || String(lastErr || 'unknown'),
    durationMs: Date.now() - t0,
  })
  throw lastErr || new Error('Failed to load promotions html')
}

async function enrichPromotionItem(item) {
  try {
    const html = await fetchHtml(item.url)
    const { gameSlugs, sportsTargets } = parsePromotionTargets(html)
    const requirements = parsePromotionRequirements(html)
    const sportsMeta = parseSportsTargetMeta(sportsTargets)
    const hasCasinoSignals = gameSlugs.length > 0 || (requirements.gameNames || []).length > 0
    const hasSportsRules = Number.isFinite(Number(requirements.requiredLegs)) || Number.isFinite(Number(requirements.minOdds))
    const sourceSports = String(item.sourceCategory || '').toLowerCase() === 'sports'
    const hasSportsSignals = sportsMeta.sportsTargetCount > 0 || hasSportsRules || sourceSports || /sports/i.test(String(item.slug || ''))
    const isStakeVsEddie = String(item.slug || '').toLowerCase() === STAKE_VS_EDDIE_SLUG
    return {
      ...item,
      title: parseTitle(html, item.title),
      gameSlugs,
      sportsTargets,
      targetMultiplier: requirements.targetMultiplier,
      requiredLegs: requirements.requiredLegs,
      minOdds: requirements.minOdds,
      minStakeUsd: requirements.minStakeUsd,
      gameNames: requirements.gameNames,
      sportsHintText: requirements.sportsHintText,
      sportsSportSlug: sportsMeta.sportsSportSlug,
      sportsCategorySlug: sportsMeta.sportsCategorySlug,
      sportsTournamentSlug: sportsMeta.sportsTournamentSlug,
      sportsGameType: sportsMeta.sportsGameType,
      sportsTargetCount: sportsMeta.sportsTargetCount,
      sportsEventFilterHint: sportsMeta.sportsEventFilterHint,
      taskText: requirements.taskText,
      isSportsPromotion: isStakeVsEddie ? false : (hasSportsSignals && !hasCasinoSignals),
    }
  } catch {
    const sourceSports = String(item.sourceCategory || '').toLowerCase() === 'sports'
    const isStakeVsEddie = String(item.slug || '').toLowerCase() === STAKE_VS_EDDIE_SLUG
    return {
      ...item,
      gameSlugs: [],
      sportsTargets: [],
      targetMultiplier: null,
      requiredLegs: null,
      minOdds: null,
      minStakeUsd: null,
      gameNames: [],
      sportsHintText: '',
      sportsSportSlug: 'all',
      sportsCategorySlug: '',
      sportsTournamentSlug: '',
      sportsGameType: 'upcoming',
      sportsTargetCount: 0,
      sportsEventFilterHint: '',
      taskText: '',
      isSportsPromotion: isStakeVsEddie ? false : (sourceSports || /sports/i.test(String(item.slug || ''))),
    }
  }
}

function normalizeForMatch(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function providerRank(providerId) {
  const idx = PROVIDER_PRIORITY.indexOf(String(providerId || ''))
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

export function resolvePromotionGameSlots(promo, webSlots = []) {
  const slugSet = new Set((promo?.gameSlugs || []).map((s) => String(s).toLowerCase()))
  const hasStrictSlugTargets = slugSet.size > 0
  const rawNames = Array.isArray(promo?.gameNames) ? promo.gameNames : []
  const nameTokens = rawNames.map(normalizeForMatch).filter(Boolean)
  const rows = []
  for (const slot of webSlots || []) {
    const slotSlug = String(slot?.slug || '').toLowerCase()
    if (!slotSlug) continue
    if (hasStrictSlugTargets && !slugSet.has(slotSlug)) continue
    const slotName = String(slot?.name || '')
    const nameKey = normalizeForMatch(slotName)
    let score = 0
    if (slugSet.has(slotSlug)) score += 1000
    for (const token of nameTokens) {
      if (token && (nameKey === token || nameKey.includes(token) || token.includes(nameKey))) {
        score += Math.max(120, token.length)
      }
    }
    if (score <= 0) continue
    rows.push({ slot, score })
  }
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const providerDelta = providerRank(a.slot?.providerId) - providerRank(b.slot?.providerId)
    if (providerDelta !== 0) return providerDelta
    const nameDelta = String(a.slot?.name || '').localeCompare(String(b.slot?.name || ''))
    if (nameDelta !== 0) return nameDelta
    return String(a.slot?.slug || '').localeCompare(String(b.slot?.slug || ''))
  })
  return rows.map((row) => row.slot)
}

export async function fetchStakeVsEddiePromotion({ locale = 'de', withDetails = true } = {}) {
  const rows = await fetchStakePromotions({
    locale,
    maxItems: 64,
    withDetails,
    detailLimit: withDetails ? 20 : 1,
  })
  const found = (rows || []).find((row) => String(row?.slug || '').toLowerCase() === STAKE_VS_EDDIE_SLUG)
  if (found) return found
  const safeLocale = normalizePromoLocale(locale, 'de')
  const base = {
    locale: safeLocale,
    slug: STAKE_VS_EDDIE_SLUG,
    title: 'Stake Versus Eddie',
    url: `https://stake.com/${safeLocale}/promotions/promotion/${STAKE_VS_EDDIE_SLUG}`,
  }
  if (!withDetails) {
    return {
      ...base,
      gameSlugs: [],
      sportsTargets: [],
      targetMultiplier: null,
      requiredLegs: null,
      minOdds: null,
      minStakeUsd: null,
      gameNames: [],
      sportsHintText: '',
      sportsSportSlug: 'all',
      sportsCategorySlug: '',
      sportsTournamentSlug: '',
      sportsGameType: 'upcoming',
      sportsEventFilterHint: '',
      taskText: '',
      isSportsPromotion: false,
    }
  }
  return enrichPromotionItem(base)
}

/**
 * Scrapes Stake promotions pages via Electron session-aware proxy.
 * This keeps behavior close to SSP approach (web-sourced promo data, not challenge feed).
 */
export async function fetchStakePromotions({ locale = 'de', category, maxItems = 16, withDetails = true, detailLimit = 8 } = {}) {
  const safeLocale = normalizePromoLocale(locale, 'de')
  const url = category
    ? `https://stake.com/${safeLocale}/promotions/category/${encodeURIComponent(String(category).toLowerCase())}`
    : `https://stake.com/${safeLocale}/promotions`

  const html = await fetchHtml(url)
  let items = parsePromotionLinks(html, safeLocale)

  if (!items.length && safeLocale !== 'en') {
    // Fallback locale when localized page differs in structure.
    const fallbackHtml = await fetchHtml('https://stake.com/en/promotions')
    items = parsePromotionLinks(fallbackHtml, 'en')
  }

  const trimmed = items.slice(0, Math.max(1, maxItems))
  if (!withDetails) {
    return trimmed.map((item) => ({
      ...item,
      sourceCategory: category || '',
      gameSlugs: [],
      sportsTargets: [],
      targetMultiplier: null,
      requiredLegs: null,
      minOdds: null,
      minStakeUsd: null,
      gameNames: [],
      sportsHintText: '',
      sportsSportSlug: 'all',
      sportsCategorySlug: '',
      sportsTournamentSlug: '',
      sportsGameType: 'upcoming',
      sportsTargetCount: 0,
      sportsEventFilterHint: '',
      taskText: '',
      isSportsPromotion: String(category || '').toLowerCase() === 'sports' || /sports/i.test(item.slug),
    }))
  }

  const withCategory = trimmed.map((item) => ({ ...item, sourceCategory: category || '' }))
  const limit = Math.max(1, Math.min(Number(detailLimit) || 8, withCategory.length))
  const detailSubset = withCategory.slice(0, limit)
  const noDetailSubset = trimmed.slice(limit).map((item) => ({
    ...item,
    sourceCategory: category || '',
    gameSlugs: [],
    sportsTargets: [],
    targetMultiplier: null,
    requiredLegs: null,
    minOdds: null,
    minStakeUsd: null,
    gameNames: [],
    sportsHintText: '',
    sportsSportSlug: 'all',
    sportsCategorySlug: '',
    sportsTournamentSlug: '',
    sportsGameType: 'upcoming',
    sportsTargetCount: 0,
    sportsEventFilterHint: '',
    taskText: '',
    isSportsPromotion: String(category || '').toLowerCase() === 'sports' || /sports/i.test(item.slug),
  }))

  const detailed = []
  let batchSize = 2
  for (let i = 0; i < detailSubset.length; i += batchSize) {
    const batch = detailSubset.slice(i, i + batchSize)
    try {
      const rows = await Promise.all(batch.map((item) => enrichPromotionItem(item)))
      detailed.push(...rows)
      await sleep(jitterMs(140))
    } catch {
      // degrade gracefully under temporary provider pressure by reducing request fanout
      batchSize = 1
      const singleRows = []
      for (const item of batch) {
        singleRows.push(await enrichPromotionItem(item))
        await sleep(jitterMs(260))
      }
      detailed.push(...singleRows)
      await sleep(jitterMs(260))
      batchSize = 1
      i += batch.length - 1
      continue
    }
  }
  return [...detailed, ...noDetailSubset]
}

export async function fetchStakeSportsPromotions({ locale = 'de', maxItems = 16, withDetails = true, detailLimit = 6 } = {}) {
  return fetchStakePromotions({ locale, category: 'sports', maxItems, withDetails, detailLimit })
}

export const STAKE_PROMOTION_KEYS = {
  stakeVsEddie: STAKE_VS_EDDIE_SLUG,
}
