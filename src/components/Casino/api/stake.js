/**
 * Startet eine Third-Party Slot-Session (z.B. Le Bandit / Pragmatic).
 * Slugs come from Stake only — never invent game titles by swapping provider prefixes
 * (Fat Panda the game ≠ 777 Rush).
 */
import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'
import { findCachedSlotSlugByName } from './stakeSlotsApi'
import {
  isStakeGameUnavailableError,
  normalizeStakeSessionCurrency,
  stakeThirdPartySlugCandidates,
} from '../utils/stakeSessionSlug'

const SLUG_KURATOR_GAME_QUERY = `query SlugKuratorGame($slug: String!) {
  slugKuratorGame(slug: $slug) {
    id
    name
    slug
    active
    isBlocked
  }
}`

/**
 * Testet den Stake Access Token.
 * Im Electron App ist dies nicht nötig, da wir die Session Cookies nutzen.
 */
export async function verifyStakeToken(accessToken) {
  return { connected: true, config: {} }
}

async function lookupSlugKuratorGame(slug) {
  try {
    const res = await StakeApi.query(SLUG_KURATOR_GAME_QUERY, { slug })
    return res?.data?.slugKuratorGame || null
  } catch {
    return null
  }
}

/**
 * @param {string} accessToken
 * @param {string} slug
 * @param {string} source
 * @param {string} target
 * @param {{ gameName?: string }} [opts]
 */
export async function startThirdPartySession(accessToken, slug = 'hacksaw-le-bandit', source = 'usdc', target = 'eur', opts = {}) {
  const t0 = Date.now()
  let src = normalizeStakeSessionCurrency(source || 'usdc')
  let tgt = normalizeStakeSessionCurrency(target || 'eur')
  // Stake.eu GoldCoins: no crypto→fiat pair — source and target are the same wallet (gold/sweeps).
  if (src === 'gold' || src === 'sweeps' || tgt === 'gold' || tgt === 'sweeps') {
    const coin = src === 'gold' || src === 'sweeps' ? src : tgt
    src = coin
    tgt = coin
  }

  const mutation = `
        mutation StartThirdPartySession($slug: String!, $source: CurrencyEnum!, $target: CurrencyEnum!) {
          startThirdPartySession(slug: $slug, source: $source, target: $target) {
            config
          }
        }
      `

  const gameName = opts?.gameName || opts?.name || ''
  const candidates = stakeThirdPartySlugCandidates(slug)
  // If cache has another slug for the same display name, try that too (no invented prefixes).
  if (gameName) {
    const byName = findCachedSlotSlugByName(gameName, { excludeSlug: slug })
    if (byName) {
      for (const alt of stakeThirdPartySlugCandidates(byName)) {
        if (!candidates.some((c) => c.toLowerCase() === alt.toLowerCase())) candidates.push(alt)
      }
    }
  }

  let lastError = null

  for (const trySlug of candidates) {
    try {
      const response = await StakeApi.mutate(mutation, { slug: trySlug, source: src, target: tgt })

      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug: trySlug, source: src, target: tgt, requestedSlug: slug, gameName: gameName || undefined },
        response: response.data,
        error: null,
        durationMs: Date.now() - t0,
      })

      return response.data?.startThirdPartySession
    } catch (error) {
      lastError = error
      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug: trySlug, source: src, target: tgt, requestedSlug: slug, gameName: gameName || undefined },
        response: null,
        error: error.message,
        durationMs: Date.now() - t0,
      })
      const retryable =
        isStakeGameUnavailableError(error) && trySlug !== candidates[candidates.length - 1]
      if (!retryable) break
    }
  }

  if (isStakeGameUnavailableError(lastError)) {
    const meta = await lookupSlugKuratorGame(slug)
    if (!meta) {
      throw new Error(
        `Game not found on this Stake site (slug "${slug}"${gameName ? `, name "${gameName}"` : ''}). Reload slots or pick another title — Fat Panda ≠ 777 Rush.`
      )
    }
    if (meta.isBlocked || meta.active === false) {
      throw new Error(`Game unavailable/blocked: ${meta.name || slug}`)
    }
  }

  throw lastError || new Error('startThirdPartySession failed')
}
