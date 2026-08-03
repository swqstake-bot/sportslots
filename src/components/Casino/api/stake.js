/**
 * Startet eine Third-Party Slot-Session (z.B. Le Bandit / Pragmatic / Fat Panda).
 */
import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'
import {
  isStakeGameUnavailableError,
  normalizeStakeSessionCurrency,
  stakeThirdPartySlugCandidates,
} from '../utils/stakeSessionSlug'

/**
 * Testet den Stake Access Token.
 * Im Electron App ist dies nicht nötig, da wir die Session Cookies nutzen.
 */
export async function verifyStakeToken(accessToken) {
  return { connected: true, config: {} }
}

/**
 * Startet eine Third-Party Slot-Session (z.B. Le Bandit).
 */
export async function startThirdPartySession(accessToken, slug = 'hacksaw-le-bandit', source = 'usdc', target = 'eur') {
  const t0 = Date.now()
  let src = normalizeStakeSessionCurrency(source || 'usdc')
  let tgt = normalizeStakeSessionCurrency(target || 'eur')
  // Stake.eu GoldCoins: no crypto→fiat pair — source and target are the same wallet (gold/sweeps).
  if (
    src === 'gold' || src === 'sweeps' ||
    tgt === 'gold' || tgt === 'sweeps'
  ) {
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

  const candidates = stakeThirdPartySlugCandidates(slug)
  let lastError = null

  for (const trySlug of candidates) {
    try {
      const response = await StakeApi.mutate(mutation, { slug: trySlug, source: src, target: tgt })

      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug: trySlug, source: src, target: tgt, requestedSlug: slug },
        response: response.data,
        error: null,
        durationMs: Date.now() - t0,
      })

      return response.data?.startThirdPartySession
    } catch (error) {
      lastError = error
      const retryable = isStakeGameUnavailableError(error) && trySlug !== candidates[candidates.length - 1]
      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug: trySlug, source: src, target: tgt, requestedSlug: slug },
        response: null,
        error: error.message,
        durationMs: Date.now() - t0,
      })
      if (!retryable) break
    }
  }

  throw lastError || new Error('startThirdPartySession failed')
}
