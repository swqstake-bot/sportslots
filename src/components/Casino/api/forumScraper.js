/**
 * Forum-Scraper: Lädt Stake-Community-Topic-URLs, extrahiert Bet-IIDs und holt Details via BetLookup.
 * Analog zum SSP – zum Prüfen/Verifizieren von Forum-Challenges.
 */

import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

// Stake Bet-IDs: casino:uuid (hex+hyphen) oder house:numeric
const BET_ID_REGEX = /(casino|house):([a-f0-9-]+)/gi

function normalizeBetId(prefix, rawId) {
  const p = String(prefix || '').toLowerCase()
  const r = String(rawId || '').trim()
  if (!r || r.length < 6) return null
  // Offensichtlich ungültig: nur Bindestriche oder zu kurz
  if (/^-+$/.test(r) || r.length > 100) return null
  return `${p}:${r}`
}

function extractBetIds(html) {
  const seen = new Set()
  const ids = []
  const decoded = html.replace(/&amp;/g, '&').replace(/&#x3A;/g, ':')
  let m
  const re = new RegExp(BET_ID_REGEX.source, 'gi')
  while ((m = re.exec(decoded)) !== null) {
    const id = normalizeBetId(m[1], m[2])
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** REST Bet-Preview (docs.stake.com) – Fallback wenn GraphQL scheitert */
async function fetchBetPreviewRest(iid, sessionToken) {
  if (!window.electronAPI?.proxyRequest) return null
  const urls = ['https://stake.com/api/bet/preview', 'https://stake.com/bet/preview']
  const headers = { 'Content-Type': 'application/json' }
  if (sessionToken) headers['x-access-token'] = sessionToken
  const bodies = [{ iid }, { betId: iid }]
  for (const apiUrl of urls) {
    for (const body of bodies) {
      try {
        const res = await window.electronAPI.proxyRequest({
          url: apiUrl,
          method: 'POST',
          headers,
          body,
        })
        if (res.status !== 200) continue
        const data = typeof res.data === 'string' ? JSON.parse(res.data || '{}') : res.data
        const bet = data?.bet
        if (!bet?.game) continue
        const g = bet.game
        return {
          id: bet.id,
          iid: bet.iid || iid,
          gameName: g?.name || 'Unknown',
          gameSlug: g?.slug || '',
          payoutMultiplier: g?.payoutMultiplier ?? 0,
          amount: g?.amount ?? 0,
          payout: g?.payout ?? 0,
          currency: (g?.currency || 'usd').toLowerCase(),
          updatedAt: bet.updatedAt || '',
          userName: bet.userId ? String(bet.userId).slice(0, 8) + '…' : 'Unknown',
          url: '',
        }
      } catch (_) {}
    }
  }
  return null
}

async function fetchBetDetails(accessToken, betIdentifier) {
  // accessToken is unused in Electron as StakeApi uses main process session
  const query = `
      query BetLookup($iid: String, $betId: String) {
        bet(iid: $iid, betId: $betId) {
          id
          iid
          type
          game {
            name
            slug
            __typename
          }
          bet {
            ... on CasinoBet {
              payoutMultiplier
              amount
              payout
              updatedAt
              currency
              user {
                name
                __typename
              }
              __typename
            }
            ... on ThirdPartyBet {
              payoutMultiplier
              amount
              payout
              updatedAt
              currency
              user {
                name
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `
  if (!betIdentifier || typeof betIdentifier !== 'string') return null

  // iid = Share-Identifier (house:123 oder casino:uuid). betId erwartet internes GUID – nur iid nutzen
  const match = /^(casino|house):(.+)$/i.exec(betIdentifier)
  const rawId = match ? match[2] : betIdentifier
  const houseId = /^\d+$/.test(rawId) ? `house:${rawId}` : betIdentifier
  const variants = [houseId, betIdentifier].filter((v, i, a) => v && a.indexOf(v) === i)

  const attempts = variants.map((v) => ({ iid: v }))

  for (const vars of attempts) {
    try {
      const res = await StakeApi.query(query, vars)
      const bet = res.data?.bet
      if (!bet?.bet) continue
      const b = bet.bet
      const game = bet.game
      return {
        id: bet.id,
        iid: bet.iid || betIdentifier,
        gameName: game?.name || 'Unknown',
        gameSlug: game?.slug || '',
        payoutMultiplier: b.payoutMultiplier ?? 0,
        amount: b.amount ?? 0,
        payout: b.payout ?? 0,
        currency: (b.currency || 'usd').toLowerCase(),
        updatedAt: b.updatedAt || '',
        userName: b.user?.name || 'Unknown',
        url: '',
      }
    } catch (e) {
      const msg = (e?.message || String(e)).toLowerCase()
      const skip = msg.includes('incorrect input') || msg.includes('not found') || msg.includes('valid unique id') || msg.includes('stringpattern')
      if (skip) continue
      console.warn('BetLookup', betIdentifier, e?.message || e)
      return null
    }
  }

  // GraphQL gescheitert → REST Bet-Preview (docs.stake.com) mit iid probieren
  let sessionToken = accessToken || null
  try {
    if (window.electronAPI?.getSessionToken) sessionToken = sessionToken || (await window.electronAPI.getSessionToken())
  } catch (_) {}
  return fetchBetPreviewRest(variants[0] || betIdentifier, sessionToken)
}

/** Basis-URL ohne /page/N/ und ohne ?page= – für Paginierung */
function getTopicBaseUrl(url) {
  try {
    const u = new URL(url.trim())
    u.hash = ''
    u.search = ''
    let path = u.pathname.replace(/\/page\/\d+\/?$/i, '')
    if (path.endsWith('/')) path = path.slice(0, -1)
    u.pathname = path || '/'
    return u.toString().replace(/\/$/, '')
  } catch {
    return url.replace(/\/page\/\d+\/?(\#.*)?$/i, '').replace(/\/?$/, '').split('?')[0].split('#')[0].trim()
  }
}

/** Nächste Seite aus <link rel="next"> / <a rel="next"> (IPS / Stake Community zuverlässiger als blind /page/N/) */
function extractRelNextHref(html) {
  if (!html || typeof html !== 'string') return null
  const patterns = [
    /<link[^>]*\brel=["']next["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i,
    /<link[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']next["'][^>]*>/i,
    /<a[^>]*\brel=["']next["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i,
    /<a[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']next["'][^>]*>/i,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].replace(/&amp;/g, '&').trim()
  }
  return null
}

function absolutizeForumUrl(href, baseHref) {
  if (!href) return null
  try {
    return new URL(href, baseHref).href
  } catch {
    return null
  }
}

/** Liest Gesamtseitenanzahl aus Forum-HTML (Invision/Stake Community) */
function parseTotalPages(html) {
  if (!html || typeof html !== 'string') return null
  const m =
    html.match(/page\s+1\s+of\s+(\d+)/i)
    || html.match(/\bPage\s+1\s+of\s+(\d+)/i)
    || html.match(/data-ipspages=["'](\d+)["']/i)
    || html.match(/data-pages=["'](\d+)["']/i)
    || html.match(/class="[^"]*ipsPagination[^"]*"[^>]*data-pages=["'](\d+)["']/i)
    || html.match(/\/page\/(\d+)\/[^>]*>[\s\S]*?\blast\b/i)
  if (m) {
    const n = parseInt(m[1], 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const topicPageMatches = html.match(/\/topic\/[^"'\s]*\/page\/(\d+)\//gi)
  if (topicPageMatches) {
    const nums = topicPageMatches
      .map((s) => {
        const x = /\/page\/(\d+)\//i.exec(s)
        return x ? parseInt(x[1], 10) : 0
      })
      .filter((n) => n > 0)
    if (nums.length) return Math.max(...nums)
  }
  const pageRefs = html.match(/\/page\/(\d+)\//g)
  if (pageRefs) {
    const nums = pageRefs
      .map((s) => parseInt(s.replace(/\D/g, ''), 10))
      .filter((n) => n > 0 && n <= 5000)
    return nums.length ? Math.max(...nums) : null
  }
  return null
}

function buildForumBrowserHeaders(referer) {
  const ref = referer && referer.startsWith('http') ? referer : 'https://stakecommunity.com/'
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
    Referer: ref,
    Origin: 'https://stakecommunity.com',
    DNT: '1',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
  }
}

async function fetchForumPageViaSession(pageUrl, referer) {
  if (!window.electronAPI?.forumFetchTopicHtml) return null
  const r = await window.electronAPI.forumFetchTopicHtml({ url: pageUrl, referer })
  if (!r.ok || r.skipped) return null
  return {
    status: r.status,
    statusText: r.statusText || '',
    headers: {},
    data: r.data,
    finalUrl: r.finalUrl || pageUrl,
  }
}

/**
 * GET forum HTML; bei 404 auf /topic/slug/page/N/ alternativ ?page=N versuchen (IPS-Konfigurationen).
 */
async function fetchForumPage(proxyRequest, pageUrl, headers) {
  let res = await proxyRequest({ url: pageUrl, method: 'GET', headers })
  if (res.status === 404 && /\/page\/\d+\/?(\?.*)?$/.test(pageUrl)) {
    const alt = pageUrl.replace(/\/page\/(\d+)\/?(\?.*)?$/i, (_, n) => `/?page=${n}`)
    const res2 = await proxyRequest({ url: alt, method: 'GET', headers })
    if (res2.status === 200) return { ...res2, finalUrl: res2.finalUrl || alt }
  }
  return res
}

async function tryForumPageSessionThen404Fallback(pageUrl, referer) {
  let res = await fetchForumPageViaSession(pageUrl, referer)
  if (res && res.status === 404 && /\/page\/\d+\/?(\?.*)?$/.test(pageUrl)) {
    const alt = pageUrl.replace(/\/page\/(\d+)\/?(\?.*)?$/i, (_, n) => `/?page=${n}`)
    const res2 = await fetchForumPageViaSession(alt, referer)
    if (res2 && res2.status === 200) return { ...res2, finalUrl: res2.finalUrl || alt }
  }
  return res
}

async function fetchForumPageSmart(proxyRequest, pageUrl, referer, useForumSession) {
  if (useForumSession) {
    const res = await tryForumPageSessionThen404Fallback(pageUrl, referer)
    if (res && res.status === 200) return res
  }
  const headers = buildForumBrowserHeaders(referer)
  return fetchForumPage(proxyRequest, pageUrl, headers)
}

/**
 * Lädt Forum-Thread (alle Seiten), extrahiert Bet-IIDs und holt Details.
 * @param {string} forumUrl - https://stakecommunity.com/topic/...
 * @param {string} accessToken - Unused in Electron
 * @param {Object} opts - { onProgress?: (done, total, page?) => void, maxBets?: number } – maxBets nur für Notfall-Limit (default: alle)
 */
export async function scrapeForumBets(forumUrl, accessToken, opts = {}) {
  const { onProgress, maxBets = 9999 } = opts
  const url = (forumUrl || '').trim()
  if (!url || !url.includes('stakecommunity.com/topic/')) {
    throw new Error('Please enter a valid Stake Community topic URL (https://stakecommunity.com/topic/...)')
  }

  const baseUrl = getTopicBaseUrl(url)

  if (!window.electronAPI?.proxyRequest) {
    throw new Error('Electron proxy is not available.')
  }

  const proxyRequest = (opts) => window.electronAPI.proxyRequest(opts)

  let forumUseSession = false
  try {
    if (window.electronAPI?.forumSessionStatus) {
      const st = await window.electronAPI.forumSessionStatus()
      forumUseSession = Boolean(st?.hasCookies)
    }
  } catch (_) {}

  let referer = 'https://stakecommunity.com/'

  const allIds = new Set()
  let totalPagesHint = 1
  let page = 0
  let currentUrl = `${baseUrl.replace(/\/$/, '')}/`
  const visited = new Set()
  const maxPages = 100
  const startedAt = Date.now()
  let forum403Logged = false

  while (page < maxPages && currentUrl) {
    if (visited.has(currentUrl)) break
    visited.add(currentUrl)
    page += 1

    try {
      const res = await fetchForumPageSmart(proxyRequest, currentUrl, referer, forumUseSession)
      if (res.status === 404 || res.status >= 500) {
        logApiCall({
          type: 'forum/scrape/page',
          endpoint: currentUrl,
          request: { page, totalPagesHint },
          response: { status: res.status, statusText: res.statusText || '', finalUrl: res.finalUrl || '' },
          error: `Forum page HTTP ${res.status} — pagination stopped`,
          durationMs: null,
        })
        break
      }

      if (res.status === 403 && !forum403Logged) {
        forum403Logged = true
        logApiCall({
          type: 'forum/scrape/page',
          endpoint: currentUrl,
          request: { page, totalPagesHint },
          response: {
            status: res.status,
            finalUrl: res.finalUrl || '',
            htmlPreview: (typeof res.data === 'string' ? res.data : '').slice(0, 400),
          },
          error: 'Forum page HTTP 403 (blocked / Cloudflare / login wall?)',
          durationMs: null,
        })
      }

      const html = typeof res.data === 'string' ? res.data : String(res.data ?? '')
      const resolvedBase = res.finalUrl || currentUrl
      referer = resolvedBase

      if (page === 1) {
        const parsed = parseTotalPages(html)
        if (parsed) totalPagesHint = Math.min(parsed, maxPages)
      }

      const pageIds = extractBetIds(html)
      for (const id of pageIds) allIds.add(id)

      if (onProgress) {
        onProgress(0, 0, `Page ${page}${totalPagesHint > 1 ? `/${totalPagesHint}` : ''}`)
      }

      const relNextRaw = extractRelNextHref(html)
      const relNext = relNextRaw ? absolutizeForumUrl(relNextRaw, resolvedBase) : null

      if (page > 1 && pageIds.length === 0 && !relNext) {
        if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
          console.warn('[forum/scrape] Stopping: no bet IDs on page', page, currentUrl)
        }
        logApiCall({
          type: 'forum/scrape/page',
          endpoint: currentUrl,
          request: { page, totalPagesHint, reason: 'pagination_end_empty_page' },
          response: { idsOnPage: 0 },
          error: null,
          level: 'info',
          durationMs: null,
        })
        break
      }

      let nextUrl = null
      if (relNext && relNext !== currentUrl) {
        nextUrl = relNext
      } else if (totalPagesHint > 1 && page >= totalPagesHint) {
        nextUrl = null
      } else {
        const nextNum = page + 1
        if (nextNum > maxPages) nextUrl = null
        else nextUrl = `${baseUrl.replace(/\/$/, '')}/page/${nextNum}/`
      }

      currentUrl = nextUrl
      if (currentUrl) await new Promise((r) => setTimeout(r, 150))
    } catch (e) {
      console.error('Forum page fetch failed', page, currentUrl, e)
      logApiCall({
        type: 'forum/scrape/page',
        endpoint: currentUrl,
        request: { page, totalPagesHint },
        response: null,
        error: e?.message || String(e),
        durationMs: null,
      })
      break
    }
  }

  const ids = Array.from(allIds)
  if (ids.length === 0) {
    logApiCall({
      type: 'forum/scrape',
      endpoint: baseUrl,
      request: { maxBets },
      response: { totalScraped: 0, totalWithDetails: 0, totalPages: page },
      error: null,
      durationMs: Date.now() - startedAt,
    })
    return { bets: [], totalScraped: 0, totalWithDetails: 0, totalPages: page }
  }

  const toFetch = ids.slice(0, maxBets)
  const CONCURRENCY = 3
  const bets = []
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(batch.map((id) => fetchBetDetails(accessToken, id)))
    for (const b of batchResults) if (b) bets.push(b)
    if (onProgress) onProgress(Math.min(i + CONCURRENCY, toFetch.length), toFetch.length, `Bet ${Math.min(i + CONCURRENCY, toFetch.length)}/${toFetch.length}`)
    if (i + CONCURRENCY < toFetch.length) await new Promise((r) => setTimeout(r, 80))
  }

  const out = {
    bets,
    totalScraped: ids.length,
    totalWithDetails: bets.length,
    totalPages: page,
  }
  logApiCall({
    type: 'forum/scrape',
    endpoint: baseUrl,
    request: { maxBets },
    response: {
      totalScraped: out.totalScraped,
      totalWithDetails: out.totalWithDetails,
      totalPages: out.totalPages,
    },
    error: null,
    durationMs: Date.now() - startedAt,
  })
  return out
}
