/**
 * Forum-Scraper: Lädt Stake-Community-Topic-URLs, extrahiert Bet-IIDs und holt Details via BetLookup.
 * Analog zum SSP – zum Prüfen/Verifizieren von Forum-Challenges.
 */

import { StakeApi } from '../../../api/client'

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

/** Basis-URL ohne /page/N/ – für Paginierung */
function getTopicBaseUrl(url) {
  return url.replace(/\/page\/\d+\/?(\#.*)?$/i, '').replace(/\/?$/, '')
}

/** Liest Gesamtseitenanzahl aus Forum-HTML (Invision/Stake Community) */
function parseTotalPages(html) {
  const m = html.match(/page\s+1\s+of\s+(\d+)/i)
    || html.match(/data-ipspages="(\d+)"/)
    || html.match(/\/page\/(\d+)\/[^>]*>.*?last/i)
  if (m) return parseInt(m[1], 10)
  const pageRefs = html.match(/\/page\/(\d+)\//g)
  if (pageRefs) {
    const nums = pageRefs.map((s) => parseInt(s.replace(/\D/g, ''), 10)).filter((n) => n > 0)
    return nums.length ? Math.max(...nums) : null
  }
  return null
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
    throw new Error('Bitte eine gültige Stake-Community-Topic-URL eingeben (https://stakecommunity.com/topic/...)')
  }

  const baseUrl = getTopicBaseUrl(url)
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }

  if (!window.electronAPI?.proxyRequest) {
    throw new Error('Electron Proxy nicht verfügbar.')
  }

  const allIds = new Set()
  let totalPagesHint = 1
  let page = 1
  const maxPages = 100

  while (page <= maxPages) {
    const pageUrl = page === 1 ? baseUrl + '/' : `${baseUrl}/page/${page}/`
    try {
      const res = await window.electronAPI.proxyRequest({ url: pageUrl, method: 'GET', headers })
      if (res.status === 404 || res.status >= 500) break
      const html = res.data
      if (page === 1) {
        const parsed = parseTotalPages(html)
        if (parsed) totalPagesHint = Math.min(parsed, maxPages)
      }
      const pageIds = extractBetIds(html)
      for (const id of pageIds) allIds.add(id)
      if (onProgress) onProgress(0, 0, `Seite ${page}${totalPagesHint > 1 ? `/${totalPagesHint}` : ''}`)
      if (page > 1 && pageIds.length === 0) break
      if (totalPagesHint > 1 && page >= totalPagesHint) break
      page++
      await new Promise((r) => setTimeout(r, 150))
    } catch (e) {
      console.error('Forum page fetch failed', page, e)
      break
    }
  }

  const ids = Array.from(allIds)
  if (ids.length === 0) {
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

  return {
    bets,
    totalScraped: ids.length,
    totalWithDetails: bets.length,
    totalPages: page,
  }
}
