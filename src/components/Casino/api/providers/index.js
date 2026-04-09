import * as hacksaw from './hacksaw'
import * as pragmatic from './pragmatic'
import * as stakeEngine from './stakeEngine'
import * as clawbuster from './clawbuster'
import * as avatarux from './avatarux'
import * as nolimit from './nolimit'
import * as genericProviders from './genericProviders'
import { parseConfig } from './genericProviders'
import { getEffectiveBetAmount } from '../../constants/bet'
import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'
import { executeProviderMethod } from './providerRuntime'
import { normalizeProviderError } from './providerErrors'
import { getProviderCapabilities } from '../../constants/providers'

function getWebviewBridge() {
  if (typeof window === 'undefined') return null
  const w = window
  return w && typeof w === 'object' && 'slotbotBridge' in w ? w.slotbotBridge : null
}

const THUNDERKICK_WEBVIEW_PROVIDER = {
  async startSession(accessToken, slug, sourceCurrency, targetCurrency) {
    const source = (sourceCurrency || 'usdc').toLowerCase()
    const target = (targetCurrency || 'eur').toLowerCase()
    const t0 = performance.now()
    const stakeSession = await startThirdPartySession(accessToken, slug, source, target)
    const cfgUrl = typeof stakeSession?.config === 'string' ? stakeSession.config : stakeSession?.config?.url
    const cfg = parseConfig(cfgUrl, target)
    const bridge = getWebviewBridge()
    if (!bridge || typeof bridge.requestWebviewSession !== 'function') {
      logApiCall({
        type: 'thunderkick/webview/init',
        endpoint: cfgUrl || null,
        request: { slug, sourceCurrency: source, targetCurrency: target },
        response: null,
        error: 'Webview-Bridge nicht verfügbar',
        durationMs: Math.round(performance.now() - t0),
      })
      throw new Error('Webview-Bridge nicht verfügbar')
    }
    const res = await bridge.requestWebviewSession({
      providerId: 'thunderkick',
      slug,
      sourceCurrency: source,
      targetCurrency: target,
      configUrl: cfgUrl || null,
      token: cfg?.token || null,
      gameId: cfg?.gameId || null,
      host: cfg?.host || null,
      base: cfg?.base || null,
      gamesessionid: cfg?.gamesessionid || null,
      playerid: cfg?.playerid || null,
      playersessionid: cfg?.playersessionid || null,
      gameinstanceid: cfg?.gameinstanceid || null,
    })
    const betLevels = Array.isArray(res?.betLevels) ? res.betLevels.map((v) => Number(v)).filter((v) => v > 0) : []
    const currencyCode = (res?.currencyCode || target || 'eur').toUpperCase()
    const initialBalance = typeof res?.initialBalance === 'number' ? res.initialBalance : null
    const session = {
      provider: 'webview',
      providerId: 'thunderkick',
      slug,
      seq: 0,
      webviewSessionId: res?.sessionId || null,
      configUrl: cfgUrl || null,
      betLevels,
      currencyCode,
      initialBalance,
    }
    logApiCall({
      type: 'thunderkick/webview/init',
      endpoint: cfgUrl || null,
      request: { slug, sourceCurrency: source, targetCurrency: target },
      response: { ok: true, sessionId: session.webviewSessionId, betLevels: session.betLevels, currencyCode: session.currencyCode, initialBalance: session.initialBalance },
      error: null,
      durationMs: Math.round(performance.now() - t0),
    })
    return session
  },
  async placeBet(session, betAmount, extraBet, _autoplay = false) {
    const bridge = getWebviewBridge()
    if (!bridge || typeof bridge.requestWebviewSpin !== 'function') {
      throw new Error('Webview-Bridge nicht verfügbar')
    }
    const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
    const t0 = performance.now()
    const payload = {
      providerId: 'thunderkick',
      sessionId: session?.webviewSessionId || null,
      slug: session?.slug || null,
      betAmount: Number(effectiveBet),
      currencyCode: session?.currencyCode || null,
    }
    const res = await bridge.requestWebviewSpin(payload)
    const currencyCode = (session?.currencyCode || 'EUR').toUpperCase()
    const winAmount = typeof res?.winAmount === 'number' ? res.winAmount : 0
    const balance = typeof res?.balance === 'number' ? res.balance : null
    const data = {
      statusCode: 0,
      accountBalance: { balance, currencyCode },
      round: {
        status: 'complete',
        roundId: res?.roundId || null,
        events: [{ awa: winAmount }],
        winAmountDisplay: winAmount,
      },
      raw: res?.raw ?? null,
    }
    const nextSeq = (session?.seq || 0) + 1
    const nextSession = { ...session, seq: nextSeq }
    logApiCall({
      type: 'thunderkick/webview/bet',
      endpoint: 'webview:monolith',
      request: payload,
      response: { winAmount, balance, roundId: res?.roundId || null },
      error: null,
      durationMs: Math.round(performance.now() - t0),
    })
    return {
      data,
      nextSeq,
      session: nextSession,
    }
  },
  async sendContinue() {
    return { ok: true }
  },
  async sendKeepAlive() {
    return { ok: true }
  },
}

// 1000 Lakes Studios läuft über die Stake Engine
// Wir registrieren es als Alias oder eigenständigen Key, der auf stakeEngine verweist.
const WEB_PROVIDERS = {
  hacksaw,
  pragmatic,
  prag: pragmatic,
  'fat-panda': pragmatic,
  'sexy-rabbit': pragmatic, // Rabbit Heist – gs2c wie Pragmatic
  sexyrabbit: pragmatic,
  stakeEngine,
  'hacksaw-gaming': hacksaw,
  'hacksaw-openrgs': hacksaw,
  'backseat-gaming': hacksaw,
  backseatgaming: hacksaw,
  'bullshark-games': hacksaw,
  bullsharkgames: hacksaw,
  clawbuster,
  nolimit,
  avatarux,
  '1000lakes': stakeEngine, // Alias für 1000 Lakes Studios
  relax: genericProviders.relax,
  blueprint: genericProviders.blueprint,
  bg: genericProviders.blueprint,
  endorphina: genericProviders.endorphina,
  thunderkick: THUNDERKICK_WEBVIEW_PROVIDER,
  netent: genericProviders.netent,
  gameart: genericProviders.gameart,
  push: genericProviders.push,
  btg: genericProviders.btg,
  oak: genericProviders.oak,
  redtiger: genericProviders.redtiger,
  'b-gaming': genericProviders.bgaming,
  playngo: genericProviders.playngo,
  'playn-go': genericProviders.playngo,
  'print-studios': genericProviders.relax,
  printstudios: genericProviders.relax,
  octoplay: genericProviders.octoplay,
  'penguin-king': genericProviders.octoplay,
  peterandsons: genericProviders.peterandsons,
  'peter-and-sons': genericProviders.peterandsons,
  shady: genericProviders.shady,
  shuffle: genericProviders.shuffle,
  titan: genericProviders.titan,
  'titan-gaming': genericProviders.twist,
  twist: genericProviders.twist,
  valkyrie: genericProviders.twist,
  popiplay: genericProviders.popiplay,
  helio: genericProviders.helio,
  samurai: genericProviders.samurai,
  bgaming: genericProviders.bgaming,
  gamomat: genericProviders.gamomat,
  justslots: genericProviders.justslots,
  massive: genericProviders.massive,
  onetouch: genericProviders.onetouch,
  truelab: genericProviders.truelab,
  slotmill: genericProviders.slotmill,
  petersons: genericProviders.petersons,
  'jade-rabbit': genericProviders.jaderabbit,
  jaderabbit: genericProviders.jaderabbit,
  'games-global': genericProviders.gamesglobal,
  gamesglobal: genericProviders.gamesglobal,
  'peter-sons': genericProviders.peterandsons,
  'one-touch': genericProviders.onetouch,
  'one-touch-games': genericProviders.onetouch,
  'play-n-go': genericProviders.playngo,
  'red-tiger-gaming': genericProviders.redtiger,
  'no-limit-city': nolimit,
  'no-limit': nolimit,
  nlc: nolimit,
}

const GENERIC_BACKEND_PROVIDER = genericProviders.genericUniversal

const AUTO_FALLBACK_IMPLS = {
  stakeEngine,
  nolimit,
  pragmatic,
  hacksaw,
  generic: GENERIC_BACKEND_PROVIDER,
}

function buildUnknownProviderFallbackOrder(providerId, slotSlug) {
  const pid = String(providerId || '').toLowerCase()
  const slug = String(slotSlug || '').toLowerCase()
  const order = []
  const push = (id) => {
    if (!order.includes(id)) order.push(id)
  }

  if (pid.includes('nolimit') || pid === 'nlc' || slug.startsWith('nolimit-') || slug.includes('nolimit')) {
    push('nolimit')
  }
  if (
    pid.includes('prag') ||
    pid.includes('fat-panda') ||
    pid.includes('sexyrabbit') ||
    slug.includes('pragmatic') ||
    slug.includes('fatpanda') ||
    slug.includes('sexyrabbit')
  ) {
    push('pragmatic')
  }
  if (pid.includes('hacksaw') || slug.includes('hacksaw')) {
    push('hacksaw')
  }

  // Most unknown providers on Stake are still routed through a stake-engine style session.
  push('stakeEngine')
  push('generic')
  return order
}

/**
 * @param {string} providerId
 * @returns {{ startSession, placeBet, sendContinue, sendKeepAlive } | null}
 */
export function getProvider(providerId) {
  const isKnownProvider = providerId in WEB_PROVIDERS
  const resolvedProviderId = isKnownProvider ? providerId : 'generic'
  const impl = WEB_PROVIDERS[providerId] ?? GENERIC_BACKEND_PROVIDER
  const caps = getProviderCapabilities(providerId)
  return {
    ...impl,
    capabilities: caps,
    async startSession(...args) {
      if (typeof impl.startSession !== 'function') throw normalizeProviderError(resolvedProviderId, new Error('startSession not implemented'))

      // Unknown provider ids: try smart fallback chain before giving up on generic.
      if (!isKnownProvider) {
        const slotSlug = args[1]
        const fallbackOrder = buildUnknownProviderFallbackOrder(providerId, slotSlug)
        let lastErr = null
        for (const implId of fallbackOrder) {
          const fallbackImpl = AUTO_FALLBACK_IMPLS[implId]
          if (!fallbackImpl || typeof fallbackImpl.startSession !== 'function') continue
          try {
            const session = await executeProviderMethod(resolvedProviderId, 'startSession', () => fallbackImpl.startSession(...args))
            return {
              ...session,
              __resolvedProviderImplId: implId,
            }
          } catch (err) {
            lastErr = err
          }
        }
        if (lastErr) throw lastErr
      }
      return executeProviderMethod(resolvedProviderId, 'startSession', () => impl.startSession(...args))
    },
    async placeBet(...args) {
      if (typeof impl.placeBet !== 'function') throw normalizeProviderError(resolvedProviderId, new Error('placeBet not implemented'))

      if (!isKnownProvider) {
        const session = args[0]
        const implId = session?.__resolvedProviderImplId
        const fallbackImpl = implId ? AUTO_FALLBACK_IMPLS[implId] : null
        if (fallbackImpl && typeof fallbackImpl.placeBet === 'function') {
          return executeProviderMethod(resolvedProviderId, 'placeBet', () => fallbackImpl.placeBet(...args))
        }
      }

      return executeProviderMethod(resolvedProviderId, 'placeBet', () => impl.placeBet(...args))
    },
    async sendContinue(...args) {
      if (typeof impl.sendContinue !== 'function') return { ok: true }
      return executeProviderMethod(resolvedProviderId, 'sendContinue', () => impl.sendContinue(...args))
    },
    async sendKeepAlive(...args) {
      if (typeof impl.sendKeepAlive !== 'function') return { ok: true }
      return executeProviderMethod(resolvedProviderId, 'sendKeepAlive', () => impl.sendKeepAlive(...args))
    },
  }
}

/**
 * Prüft, ob ein Provider im Frontend verfügbar ist
 */
export function isWebProvider(providerId) {
  return providerId in WEB_PROVIDERS
}

/**
 * Backend-URL für SSP-Provider (Umgebungsvariable oder Default)
 */
export function getBackendUrl() {
  return import.meta.env.VITE_SSP_BACKEND_URL || 'http://localhost:3847'
}
