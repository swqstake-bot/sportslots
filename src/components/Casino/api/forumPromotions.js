import { logApiCall } from '../utils/apiLogger'
import { CASINO_STORAGE_KEYS, readStorageJson, writeStorageJson } from '../utils/storageRegistry'

const FORUM_ORIGIN = 'https://stakecommunity.com'
const ROOT_BOARDS = ['30-promotions', '387-seasonal-events']
const ARCHIVE_BOARD_PATTERN = /(past-events|promotion-results|results)/i
const MAX_BOARDS = 30
const BOARD_CONCURRENCY = 3
const CACHE_VERSION = 7

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_SRC = `(?:${MONTHS.join('|')})`
const DATE_FRAGMENT = `(?:\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}\\.?|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_SRC}[a-z]*\\.?\\s+\\d{1,2}|${MONTH_SRC}[a-z]*\\s+\\d{1,2})`
const TIME_FRAGMENT =
  '(?:\\s*(?:@|at|[·•,])?\\s*\\(?\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(AM|PM)?\\s*\\)?)?'
const TIME_GROUPS = TIME_FRAGMENT
const ENDS_PATTERN = new RegExp(
  `(?:Competition ends|Entries close|Promotion ends|Ends)\\s*[:.]?\\s*${DATE_FRAGMENT}${TIME_FRAGMENT}`,
  'i'
)
const MONTH_RANGE_PATTERN = new RegExp(
  `\\b(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–—→]|to)\\s*(?:(${MONTHS.join('|')})[a-z]*\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*\\(\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*(?:GMT|UTC)?\\s*\\))?`,
  'i'
)

const SELECTORS = {
  endsLabel: ['.ends-label', '[class*="timer-end"]', '.center.muted', '[class*="countdown-label"]'],
  description: ['.header-desc', '.sf-sub', '[class*="subtitle"]', '.lead', '[class*="-lead"]'],
  prizeAmount: ['.prize-amount', '.prize-card, .prize-amount', '.prize-shiny'],
  prizeLabel: ['.prize-label', '.prize-title'],
  prizeSub: ['.prize-sub'],
  prizeRows: ['.prize-row'],
  steps: ['.step'],
  rules: ['.rules-list li', '[class*="rules"] li', '.info-box li', '.how-to-enter-bar li'],
  games: ['.slot-card', '.cta-btn-title'],
  requirement: ['.sf-topbar', '.how-to-enter-title', '.sf-sub', '.lead'],
  badge: ['.stake-badge', '.pill'],
  image: ['.hero-img-wrap img', '.sf-hero img', '.vip-banner img', '[class*="hero"] img'],
}

const FACTS = [
  {
    key: 'game',
    label: /^(?:featured\s+)?(?:game|slot)\s*:?$/i,
    accepts: (value) =>
      /^[\p{L}][\p{L}\d '’:!.&-]{2,39}$/u.test(value) &&
      !/\$|\d{3}/.test(value) &&
      !/^(?:eligible|featured|all|any|the)\b/i.test(value) &&
      !/\b(?:slots|games)$/i.test(value),
  },
  {
    key: 'minBet',
    label: /^min(?:imum)?\.?\s*bet\b/i,
    accepts: (value) => /\d/.test(value) && !looksLikeDate(value),
    pick: /\$?\s?\d+(?:[.,]\d+)?(?:\s*USD)?/i,
  },
  {
    key: 'target',
    label: /^(?:target|min(?:imum)?\.?\s*multiplier|multiplier|goal)\b/i,
    accepts: (value) => /\d\s*x\b|x\s*\d/i.test(value),
    pick: /\d+(?:[.,]\d+)?\s*x|x\s*\d+(?:[.,]\d+)?/i,
  },
  {
    key: 'ends',
    label: /^(?:promotion\s+)?end(?:s|ing|\s+date)?\b|^dates?\b|^time\s+frame\b/i,
    accepts: looksLikeDate,
  },
  {
    key: 'prize',
    label: /^(?:total\s+)?prize(?:\s+pool)?\b/i,
    accepts: (value) => /\$\s?\d/.test(value),
    pick: /\$\s?[\d,]+(?:\.\d+)?(?:\s*(?:USD|K))?/i,
  },
]

const shortLinkCache = new Map()

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function looksLikeDate(value) {
  return new RegExp(`${DATE_FRAGMENT}|${MONTH_SRC}[a-z]*\\s+\\d{1,2}`, 'i').test(value || '')
}

function parseHtml(html) {
  return new DOMParser().parseFromString(String(html || ''), 'text/html')
}

function parseXml(xml) {
  return new DOMParser().parseFromString(String(xml || ''), 'text/xml')
}

function looksLikeRss(body) {
  return /<rss[\s>]|<item[\s>]/i.test(String(body || ''))
}

function textOf(root, selector) {
  const el = root.querySelector(selector)
  const value = clean(el?.textContent)
  return value || null
}

function allTextOf(root, selector) {
  return Array.from(root.querySelectorAll(selector))
    .map((el) => clean(el.textContent))
    .filter(Boolean)
}

function collectText(root, selectors) {
  const values = new Set()
  for (const selector of selectors) {
    for (const value of allTextOf(root, selector)) values.add(value)
  }
  return Array.from(values)
}

function firstText(root, selectors) {
  for (const selector of selectors) {
    const value = textOf(root, selector)
    if (value) return value
  }
  return null
}

function monthIndex(token) {
  return MONTHS.indexOf(String(token || '').slice(0, 3).toLowerCase())
}

function buildUtcDate(year, month, day, hour, minute, ampm) {
  if (month < 0 || !Number.isFinite(year) || !Number.isFinite(day)) return null
  if (year < 100) year += 2000
  let hours = hour ? Number.parseInt(hour, 10) : 0
  if (ampm) {
    const flag = String(ampm).toUpperCase()
    if (flag === 'PM' && hours < 12) hours += 12
    if (flag === 'AM' && hours === 12) hours = 0
  }
  const ts = Date.UTC(year, month, day, hours, minute ? Number.parseInt(minute, 10) : 0)
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null
}

function parseEndsLabel(label) {
  if (!label) return null
  const numeric = label.match(new RegExp(`(\\d{1,2})[./](\\d{1,2})[./](\\d{2,4})\\.?${TIME_GROUPS}`, 'i'))
  if (numeric) {
    return buildUtcDate(+numeric[3], +numeric[2] - 1, +numeric[1], numeric[4], numeric[5], numeric[6])
  }
  const dayMonth = label.match(
    new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_SRC})[a-z]*\\.?,?\\s+(\\d{4})${TIME_GROUPS}`, 'i')
  )
  if (dayMonth) {
    return buildUtcDate(+dayMonth[3], monthIndex(dayMonth[2]), +dayMonth[1], dayMonth[4], dayMonth[5], dayMonth[6])
  }
  const monthDay = label.match(
    new RegExp(`(${MONTH_SRC})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})${TIME_GROUPS}`, 'i')
  )
  if (monthDay) {
    return buildUtcDate(+monthDay[3], monthIndex(monthDay[1]), +monthDay[2], monthDay[4], monthDay[5], monthDay[6])
  }
  return null
}

function parseMonthRange(text, publishedAt) {
  const m = String(text || '').match(MONTH_RANGE_PATTERN)
  if (!m) return null
  const startMonth = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
  const endMonth = m[3] ? MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) : startMonth
  if (startMonth < 0 || endMonth < 0) return null
  const base = publishedAt ? new Date(publishedAt) : new Date()
  const year = base.getUTCFullYear() + (endMonth < startMonth ? 1 : 0)
  let hours = m[5] ? Number.parseInt(m[5], 10) : 23
  let minutes = m[6] ? Number.parseInt(m[6], 10) : m[5] ? 0 : 59
  if (m[7]) {
    const flag = m[7].toUpperCase()
    if (flag === 'PM' && hours < 12) hours += 12
    if (flag === 'AM' && hours === 12) hours = 0
  }
  if (!Number.isFinite(minutes)) minutes = 0
  const ts = Date.UTC(year, endMonth, Number.parseInt(m[4], 10), hours, minutes)
  if (!Number.isFinite(ts)) return null
  return { label: clean(m[0]), iso: new Date(ts).toISOString() }
}

function parseAmount(raw) {
  if (!raw) return null
  const n = Number.parseFloat(
    String(raw)
      .replace(/[^\d.,]/g, '')
      .replace(/,(\d{3})\b/g, '$1')
      .replace(',', '.')
  )
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseMultiplier(raw) {
  const m = String(raw || '').match(/(?:(\d+(?:[.,]\d+)?)\s*x|x\s*(\d+(?:[.,]\d+)?))/i)
  if (!m) return null
  const n = Number.parseFloat((m[1] || m[2]).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function stripDecoration(value) {
  return clean(String(value || '').replace(new RegExp('\\p{Extended_Pictographic}|‍|️', 'gu'), ''))
}

function readFacts(root) {
  const facts = new Map()
  for (const el of Array.from(root.querySelectorAll('div, span, strong, b, p, td, th, h2, h3, h4, li'))) {
    const text = clean(el.textContent)
    if (!text || text.length > 70) continue
    for (const fact of FACTS) {
      if (facts.has(fact.key)) continue
      const match = text.match(fact.label)
      if (!match || match.index !== 0) continue
      const candidates = [
        text.slice(match[0].length).replace(/^[\s:·•→\-–—]+/, ''),
        clean(el.nextElementSibling?.textContent),
        clean(el.parentElement?.textContent),
      ].map(stripDecoration)
      const picked = candidates.find((candidate) => candidate && candidate.length <= 60 && fact.accepts(candidate))
      if (!picked) continue
      facts.set(fact.key, fact.pick ? clean(picked.match(fact.pick)?.[0]) || picked : picked)
    }
  }
  return facts
}

function customClassCount(root) {
  const names = new Set()
  for (const el of Array.from(root.querySelectorAll('[class]'))) {
    for (const name of Array.from(el.classList)) {
      if (!name.startsWith('ips')) names.add(name)
    }
  }
  return names.size
}

async function forumGet(url, extraHeaders = {}) {
  if (!window.electronAPI?.forumFetchTopicHtml) {
    throw new Error('Forum fetch is not available')
  }
  const res = await window.electronAPI.forumFetchTopicHtml({
    url,
    referer: FORUM_ORIGIN,
    allowChallenge: true,
  })
  logApiCall({
    type: 'forum/promotions/fetch',
    endpoint: url,
    request: { extraHeaders },
    response: { status: res?.status, cloudflare: Boolean(res?.cloudflare), bytes: String(res?.data || '').length },
    error: res?.ok ? null : res?.error || null,
    durationMs: 0,
  })
  return {
    statusCode: Number(res?.status) || 0,
    body: String(res?.data || ''),
    cloudflare: Boolean(res?.cloudflare),
    finalUrl: res?.finalUrl || url,
  }
}

async function resolveShortLink(url) {
  if (shortLinkCache.has(url)) return shortLinkCache.get(url) ?? null
  let slug = null
  try {
    const res = await window.electronAPI.proxyRequest({
      url,
      method: 'GET',
      headers: { Accept: 'text/html' },
      followRedirects: true,
    })
    const target = String(res?.finalUrl || res?.headers?.location || '')
    slug = target.match(/\/casino\/games\/([a-z0-9-]+)/i)?.[1] || null
  } catch {
    slug = null
  }
  shortLinkCache.set(url, slug)
  return slug
}

function findSlotByName(webSlots, name) {
  const key = clean(name).toLowerCase()
  if (!key) return null
  return (
    (webSlots || []).find((slot) => String(slot?.name || '').toLowerCase() === key) ||
    (webSlots || []).find((slot) => String(slot?.name || '').toLowerCase().includes(key)) ||
    null
  )
}

async function resolveGames(root, webSlots, facts) {
  const slugs = []
  const shortLinks = []
  for (const link of Array.from(root.querySelectorAll('a[href]'))) {
    const href = link.getAttribute('href') || ''
    const game = href.match(/\/casino\/games\/([a-z0-9-]+)/i)
    if (game) slugs.push(game[1])
    else if (/(^|\/\/)sta\.ke\//i.test(href)) shortLinks.push(href)
  }
  for (const href of shortLinks.slice(0, 8)) {
    const slug = await resolveShortLink(href)
    if (slug) slugs.push(slug)
  }
  const games = []
  const seen = new Set()
  const bySlug = new Map((webSlots || []).map((slot) => [String(slot?.slug || '').toLowerCase(), slot]))
  for (const slug of slugs) {
    const slot = bySlug.get(String(slug).toLowerCase())
    if (!slot || seen.has(slug)) continue
    seen.add(slug)
    games.push({
      slug,
      name: slot.name,
      id: slot.id != null ? String(slot.id) : slot.stakeGameId != null ? String(slot.stakeGameId) : undefined,
      thumbnailUrl: slot.thumbnailUrl,
      provider: slot.providerId,
      providerName: slot.providerName || slot.providerId,
      available: true,
    })
  }
  const playLine = clean(root.body?.textContent).match(/\bPlay\s+(.+?)\s+on\s+Stake\.com/i)
  const named = playLine
    ? playLine[1]
        .split(/,|\band\b/i)
        .map((part) => part.trim())
        .filter((part) => part.length > 2 && part.length < 60)
    : []
  const pushName = (name, force) => {
    const slot = findSlotByName(webSlots, name)
    const slug = slot?.slug || clean(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (!slug || seen.has(slug)) return
    if (!slot && !force) return
    seen.add(slug)
    games.push(
      slot
        ? {
            slug: slot.slug,
            name: slot.name,
            id: slot.id != null ? String(slot.id) : undefined,
            thumbnailUrl: slot.thumbnailUrl,
            provider: slot.providerId,
            providerName: slot.providerName || slot.providerId,
            available: true,
          }
        : { slug: null, name, available: false }
    )
  }
  for (const name of collectText(root, SELECTORS.games)) pushName(name, true)
  for (const name of named) pushName(name, false)
  const featured = facts.get('game')
  if (featured) {
    const before = games.length
    pushName(featured, false)
    pushName(featured.replace(/\s+slot$/i, ''), false)
    if (games.length === before) pushName(featured, true)
  }
  return games
}

function extractEnds(root, facts) {
  const labels = [facts.get('ends') || '', ...collectText(root, SELECTORS.endsLabel)]
  for (const label of labels) {
    const match = label.match(ENDS_PATTERN)
    if (match) return clean(match[0])
    if (label.length <= 70 && parseEndsLabel(label)) return label
  }
  const body = clean(root.body?.textContent).match(ENDS_PATTERN)
  return body ? clean(body[0]) : null
}

function extractPrizeRows(root) {
  const rows = Array.from(root.querySelectorAll('.prize-row'))
    .filter((el) => !el.querySelector('.lb-place'))
    .map((el) => clean(el.textContent))
    .filter(Boolean)
  if (rows.length > 0) return rows
  return Array.from(root.querySelectorAll('.lb-row'))
    .map((el) => {
      const place = clean(el.querySelector('.lb-place')?.textContent)
      const prize = clean(el.querySelector('.lb-prize')?.textContent)
      const match = place.match(/^\d+(?:st|nd|rd|th)?\s*(?:[-–—]\s*\d+(?:st|nd|rd|th)?)?\s*Place/i)
      return match && prize ? `${match[0]}${prize}` : ''
    })
    .filter(Boolean)
}

function parsePrizeTiers(rows) {
  const tiers = []
  for (const row of rows) {
    const m = row.match(/^(\d+)(?:st|nd|rd|th)?\s*(?:[-–—]\s*(\d+)(?:st|nd|rd|th)?)?\s*Place\s*[:\s]*(.+)$/i)
    if (!m) continue
    const from = Number.parseInt(m[1], 10)
    const to = m[2] ? Number.parseInt(m[2], 10) : from
    const amount = m[3].trim()
    if (Number.isFinite(from) && Number.isFinite(to) && amount) tiers.push({ from, to, amount })
  }
  return tiers
}

function extractMinBetUsd(root) {
  const text = clean(root.body?.textContent)
  const m = text.match(
    /(?:minimum bet(?:\s+amount)?(?:\s+is set)?(?:\s+at)?\s*:?\s*|minimum of\s+|at least\s+|with an?\s+)\$\s?(\d+(?:[.,]\d+)?)\s*c?\s*(?:USD)?/i
  )
  if (!m) return null
  const n = Number.parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function extractTargetMultiplier(root) {
  const text = clean(root.body?.textContent)
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*x\s*(?:or\s+(?:above|higher|more))/i)
  if (!m) return null
  const n = Number.parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function extractRequirement(root) {
  const challenge = Array.from(root.querySelectorAll('.section-title')).find((el) =>
    /challenge/i.test(el.textContent || '')
  )
  const candidates = [
    clean(challenge?.nextElementSibling?.textContent) || null,
    ...SELECTORS.requirement.map((selector) => textOf(root, selector)),
    ...allTextOf(root, '.header-desc').filter((line) => /^target\s*:/i.test(line)),
  ].filter(Boolean)
  for (const raw of candidates) {
    const value = raw.replace(/^[^\p{L}\p{N}]+/u, '').replace(/^How to (Win|Enter)\s*:\s*/i, '').trim()
    if (value.length < 8) continue
    const first = value.split(/(?<=\.)\s+/)[0]
    return first.length > 12 ? first : value
  }
  return null
}

function extractEligibleFrom(root) {
  const text = clean(root.body?.textContent)
  const m = text.match(
    /(?:made|placed|been made)\s+after\b[^.]{0,60}?(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*[-–—@]?\s*\(?\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*\)?)?/i
  )
  if (!m) return null
  let year = Number.parseInt(m[3], 10)
  if (year < 100) year += 2000
  let hours = m[4] ? Number.parseInt(m[4], 10) : 0
  if (m[6]) {
    const flag = m[6].toUpperCase()
    if (flag === 'PM' && hours < 12) hours += 12
    if (flag === 'AM' && hours === 12) hours = 0
  }
  const ts = Date.UTC(year, Number.parseInt(m[2], 10) - 1, Number.parseInt(m[1], 10), hours, m[5] ? Number.parseInt(m[5], 10) : 0)
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null
}

function parseSteps(root) {
  const stepText = Array.from(root.querySelectorAll('[class*="step-text"]'))
    .map((el, idx) => ({
      num: clean(el.parentElement?.querySelector('.step-num')?.textContent) || String(idx + 1),
      text: clean(el.textContent),
    }))
    .filter((row) => row.text)
  if (stepText.length > 0) return stepText
  const steps = Array.from(root.querySelectorAll('.step'))
    .map((el, idx) => ({
      num: textOf(el, '.step-num') || String(idx + 1),
      text: clean(el.querySelector('.step-text')?.textContent || el.textContent),
    }))
    .filter((row) => row.text)
  if (steps.length > 0) return steps
  const rules = collectText(root, SELECTORS.rules)
  if (rules.length > 0) return rules.map((text, idx) => ({ num: String(idx + 1), text }))
  const heading = Array.from(root.querySelectorAll('h1, h2, h3, h4, strong, div')).find((el) => {
    const text = clean(el.textContent)
    return text.length <= 40 && /^how to (?:enter|participate|join|play)\b/i.test(text)
  })
  const list =
    heading?.nextElementSibling?.matches('ul, ol') ? heading.nextElementSibling : heading?.parentElement?.querySelector('ul, ol')
  return list ? allTextOf(list, 'li').map((text, idx) => ({ num: String(idx + 1), text })) : []
}

function parseTerms(root) {
  const body = root.querySelector('.terms-body') || root.querySelector('.dropdown-card')
  if (!body) return []
  const sections = []
  let current = null
  for (const child of Array.from(body.children)) {
    const tag = child.tagName.toLowerCase()
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      current = { heading: clean(child.textContent), items: [] }
      sections.push(current)
      continue
    }
    const lists = tag === 'ul' || tag === 'ol' ? [child] : Array.from(child.querySelectorAll('ul, ol'))
    for (const list of lists) {
      const items = allTextOf(list, 'li')
      if (items.length === 0) continue
      if (!current) {
        current = { heading: '', items: [] }
        sections.push(current)
      }
      current.items.push(...items)
    }
  }
  return sections.filter((section) => section.items.length > 0)
}

async function parseTopic(item, board, webSlots) {
  const doc = parseHtml(item.description)
  const styled = /<style[\s>]/i.test(item.description)
  doc.querySelectorAll('style, script, iframe').forEach((el) => el.remove())
  const facts = readFacts(doc)
  const steps = parseSteps(doc)
  const prizeAmount =
    firstText(doc, SELECTORS.prizeAmount) ||
    clean(item.title.match(/\$\s?[\d,]+(?:\.\d+)?/)?.[0]) ||
    facts.get('prize') ||
    null
  const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null
  let endsLabel = extractEnds(doc, facts)
  let endsAt = parseEndsLabel(endsLabel)
  if (!endsAt) {
    const range = parseMonthRange(clean(doc.body?.textContent), publishedAt)
    if (range) {
      endsLabel = endsLabel || range.label
      endsAt = range.iso
    }
  }
  const image = SELECTORS.image.reduce((found, selector) => found || doc.querySelector(selector), null)
  const topicId = item.link.match(/\/topic\/(\d+)/)
  const prizeRows = extractPrizeRows(doc)
  const prizeTiers = parsePrizeTiers(prizeRows)
  const games = await resolveGames(doc, webSlots, facts)
  const targetMultiplier = extractTargetMultiplier(doc) ?? parseMultiplier(facts.get('target')) ?? null
  const minBetUsd = extractMinBetUsd(doc) ?? parseAmount(facts.get('minBet')) ?? null
  const requirement = extractRequirement(doc)
  const paidPlaces = prizeTiers.reduce((max, tier) => Math.max(max, tier.to), 0)
  const ranking =
    paidPlaces > 0
      ? {
          paidPlaces,
          byMultiplier: /highest multiplier|top \d+ multipliers?/i.test(clean(doc.body?.textContent)),
        }
      : null
  const onEachGame =
    games.length > 1 &&
    /\b(?:each|all(?:\s+\w+)?)\s+(?:of\s+the\s+)?(?:\w+\s+)?(?:games?|slots?)\b/i.test(
      [requirement || '', ...steps.map((step) => step.text)].join(' ')
    )
  const betBased = /bet\s*id/i.test(clean(doc.body?.textContent)) || targetMultiplier !== null || games.length > 0
  const customLayout = styled && customClassCount(doc) >= 6
  const score = [betBased, targetMultiplier !== null, minBetUsd !== null, customLayout, games.length > 0, endsAt !== null].filter(
    Boolean
  ).length
  if (steps.length === 0 && !prizeAmount && score < 2) return null
  return {
    id: topicId ? topicId[1] : item.link,
    boardSlug: board.slug,
    boardName: board.name,
    title: clean(item.title),
    url: item.link,
    publishedAt,
    endsLabel,
    endsAt,
    imageUrl: image?.getAttribute('src') || null,
    description: collectText(doc, SELECTORS.description),
    prize: {
      amount: prizeAmount,
      label: firstText(doc, SELECTORS.prizeLabel),
      sub: firstText(doc, SELECTORS.prizeSub),
    },
    prizeRows,
    prizeTiers,
    games,
    targetMultiplier,
    requirement,
    onEachGame,
    ranking,
    eligibleFrom: extractEligibleFrom(doc),
    minBetUsd,
    betBased,
    steps,
    badge: firstText(doc, SELECTORS.badge),
    terms: parseTerms(doc),
  }
}

async function discoverBoards(rootSlug) {
  const res = await forumGet(`${FORUM_ORIGIN}/board/${rootSlug}/`)
  if (res.statusCode !== 200) return []
  const doc = parseHtml(res.body)
  const boards = new Map()
  for (const link of Array.from(doc.querySelectorAll('a[href*="/board/"]'))) {
    const href = link.getAttribute('href') || ''
    const m = href.match(/\/board\/(\d+-[a-z0-9-]+)\/?$/i)
    if (!m) continue
    const slug = m[1]
    const name = clean(link.textContent)
    if (name && (!boards.has(slug) || !boards.get(slug))) boards.set(slug, name)
    else if (!boards.has(slug)) boards.set(slug, '')
  }
  return Array.from(boards, ([slug, name]) => ({ slug, name: name || slug }))
}

async function fetchBoardPromotions(board, webSlots) {
  const rssUrl = `${FORUM_ORIGIN}/board/${board.slug}.xml/`
  let res = await forumGet(rssUrl)
  if (res.statusCode === 200 && !looksLikeRss(res.body)) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    res = await forumGet(rssUrl)
  }
  if (res.statusCode !== 200 || !looksLikeRss(res.body)) return []
  const xml = parseXml(res.body)
  const promotions = []
  for (const item of Array.from(xml.querySelectorAll('item'))) {
    const link = clean(item.querySelector('link')?.textContent)
    const description = item.querySelector('description')?.textContent || ''
    if (!link || !description) continue
    try {
      const promo = await parseTopic(
        {
          title: item.querySelector('title')?.textContent || '',
          link,
          description,
          pubDate: item.querySelector('pubDate')?.textContent || null,
        },
        board,
        webSlots
      )
      if (promo) promotions.push(promo)
    } catch (error) {
      logApiCall({
        type: 'forum/promotions/topic',
        endpoint: link,
        request: { board: board.slug },
        response: null,
        error: error?.message || String(error),
        durationMs: 0,
      })
    }
  }
  return promotions
}

async function mapWithLimit(items, limit, mapper) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const idx = next++
        out[idx] = await mapper(items[idx], idx)
      }
    })
  )
  return out
}

function readCache() {
  const raw = readStorageJson(CASINO_STORAGE_KEYS.forumPromotionsCache, null)
  if (!raw || raw.version !== CACHE_VERSION || !Array.isArray(raw.promotions)) {
    return { promotions: [], fetchedAt: 0 }
  }
  return {
    promotions: raw.promotions,
    fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : 0,
  }
}

function writeCache(payload) {
  writeStorageJson(CASINO_STORAGE_KEYS.forumPromotionsCache, payload)
}

export function isForumPromoLive(promo, now = Date.now()) {
  if (!promo?.endsAt) return true
  const end = Date.parse(promo.endsAt)
  return !Number.isFinite(end) || end > now
}

export function getCachedForumPromotions() {
  return readCache()
}

export async function loadForumPromotions({ webSlots = [], force = false } = {}) {
  if (!force) {
    const cached = readCache()
    if (cached.promotions.length > 0) return { ...cached, cached: true }
  }
  try {
    const discovered = new Map()
    for (const root of ROOT_BOARDS) {
      try {
        for (const board of await discoverBoards(root)) {
          if (!discovered.has(board.slug)) discovered.set(board.slug, board)
        }
      } catch (error) {
        logApiCall({
          type: 'forum/promotions/boards',
          endpoint: root,
          request: {},
          response: null,
          error: error?.message || String(error),
          durationMs: 0,
        })
      }
    }
    const boards = Array.from(discovered.values())
      .filter((board) => !ARCHIVE_BOARD_PATTERN.test(board.slug))
      .slice(0, MAX_BOARDS)
    if (boards.length === 0) {
      const cached = readCache()
      if (cached.promotions.length > 0) return { ...cached, cached: true }
      throw new Error('No promotion boards available')
    }
    const batches = await mapWithLimit(boards, BOARD_CONCURRENCY, async (board) => {
      try {
        return await fetchBoardPromotions(board, webSlots)
      } catch {
        return []
      }
    })
    const byId = new Map()
    for (const promo of batches.flat()) {
      if (!byId.has(promo.id)) byId.set(promo.id, promo)
    }
    const promotions = Array.from(byId.values()).sort((a, b) => {
      const aEnd = a.endsAt ? Date.parse(a.endsAt) : Infinity
      const bEnd = b.endsAt ? Date.parse(b.endsAt) : Infinity
      if (aEnd !== bEnd) return aEnd - bEnd
      return String(b.publishedAt || '').localeCompare(a.publishedAt || '')
    })
    const payload = { promotions, fetchedAt: Date.now(), version: CACHE_VERSION }
    writeCache(payload)
    return { ...payload, cached: false }
  } catch (error) {
    const cached = readCache()
    if (cached.promotions.length > 0) return { ...cached, cached: true, error: error?.message || String(error) }
    throw error
  }
}

export function getHiddenForumPromoIds() {
  const raw = readStorageJson(CASINO_STORAGE_KEYS.forumPromoHidden, {})
  return raw && typeof raw === 'object' ? raw : {}
}

export function setHiddenForumPromoId(id, hidden) {
  const next = { ...getHiddenForumPromoIds() }
  if (hidden) next[id] = true
  else delete next[id]
  writeStorageJson(CASINO_STORAGE_KEYS.forumPromoHidden, next)
  return next
}
