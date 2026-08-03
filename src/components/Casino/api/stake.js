import { StakeApi } from '../../../api/client'
import { logApiCall } from '../utils/apiLogger'

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
  let src = String(source || 'usdc').toLowerCase().trim()
  let tgt = String(target || 'eur').toLowerCase().trim()
  // Stake.eu GoldCoins: no crypto→fiat pair — source and target are the same wallet (gold/sweeps / XGC/XSC/XSWP).
  if (
    src === 'gold' || src === 'sweeps' || src === 'xgc' || src === 'xsc' || src === 'xswp' || src === 'gc' || src === 'sc' ||
    tgt === 'gold' || tgt === 'sweeps' || tgt === 'xgc' || tgt === 'xsc' || tgt === 'xswp' || tgt === 'gc' || tgt === 'sc'
  ) {
    const coin =
      src === 'gold' || src === 'sweeps' || src === 'xgc' || src === 'xsc' || src === 'xswp' || src === 'gc' || src === 'sc'
        ? src
        : tgt
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
  try {
      const response = await StakeApi.mutate(mutation, { slug, source: src, target: tgt })
      
      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug, source: src, target: tgt },
        response: response.data,
        error: null,
        durationMs: Date.now() - t0,
      })
      
      return response.data?.startThirdPartySession
  } catch (error) {
      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug, source: src, target: tgt },
        response: null,
        error: error.message,
        durationMs: Date.now() - t0,
      })
      throw error
  }
}
