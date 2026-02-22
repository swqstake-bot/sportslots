/**
 * Forum-Scraper: Lädt Stake-Community-Topic-URLs, extrahiert Bet-IIDs und holt Details via BetLookup.
 * Analog zum SSP – zum Prüfen/Verifizieren von Forum-Challenges.
 */

import { StakeApi } from '../../../api/client'

const BET_ID_REGEX = /(casino|house):([a-f0-9-]+)/gi

function extractBetIds(html) {
  const seen = new Set()
  const ids = []
  let m
  while ((m = BET_ID_REGEX.exec(html)) !== null) {
    const id = `casino:${m[2]}`
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

async function fetchBetDetails(accessToken, iid) {
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
  
  try {
    const res = await StakeApi.query(query, { iid })
    const bet = res.data?.bet
    if (!bet?.bet) return null
    const b = bet.bet
    const game = bet.game
    return {
      id: bet.id,
      iid: bet.iid || iid,
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
    console.error('BetLookup failed', e)
    return null
  }
}

/**
 * Lädt Forum-Thread, extrahiert Bet-IIDs und holt Details via Stake GraphQL.
 * @param {string} forumUrl - https://stakecommunity.com/topic/...
 * @param {string} accessToken - Unused in Electron
 * @param {Object} opts - { onProgress?: (done, total) => void, maxBets?: number }
 */
export async function scrapeForumBets(forumUrl, accessToken, opts = {}) {
  const { onProgress, maxBets = 200 } = opts
  const url = (forumUrl || '').trim()
  if (!url || !url.includes('stakecommunity.com/topic/')) {
    throw new Error('Bitte eine gültige Stake-Community-Topic-URL eingeben (https://stakecommunity.com/topic/...)')
  }

  let html = ''
  
  if (window.electronAPI?.proxyRequest) {
    try {
      const res = await window.electronAPI.proxyRequest({
        url,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      if (res.status !== 200) {
        throw new Error(`Forum request failed with status ${res.status}`)
      }
      html = res.data
    } catch (e) {
      console.error('Forum scraping via proxy failed', e)
      throw new Error('Forum-Scraping fehlgeschlagen. Prüfe deine Verbindung oder die URL.')
    }
  } else {
    throw new Error('Electron Proxy nicht verfügbar.')
  }

  const ids = extractBetIds(html)
  if (ids.length === 0) {
    return { bets: [], totalScraped: 0, totalWithDetails: 0, totalPages: 1 }
  }

  const toFetch = ids.slice(0, maxBets)
  const bets = []
  for (let i = 0; i < toFetch.length; i++) {
    if (onProgress) onProgress(i + 1, toFetch.length)
    const bet = await fetchBetDetails(accessToken, toFetch[i])
    if (bet) bets.push(bet)
    if (i < toFetch.length - 1) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  return {
    bets,
    totalScraped: ids.length,
    totalWithDetails: bets.length,
    totalPages: 1,
  }
}
