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
  const mutation = `
        mutation StartThirdPartySession($slug: String!, $source: CurrencyEnum!, $target: CurrencyEnum!) {
          startThirdPartySession(slug: $slug, source: $source, target: $target) {
            config
          }
        }
      `
  try {
      const response = await StakeApi.mutate(mutation, { slug, source, target })
      
      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug, source, target },
        response: response.data,
        error: null,
        durationMs: Date.now() - t0,
      })
      
      return response.data?.startThirdPartySession
  } catch (error) {
      logApiCall({
        type: 'stake/startThirdPartySession',
        endpoint: 'graphql',
        request: { slug, source, target },
        response: null,
        error: error.message,
        durationMs: Date.now() - t0,
      })
      throw error
  }
}
