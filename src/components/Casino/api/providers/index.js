import * as hacksaw from './hacksaw'
import * as pragmatic from './pragmatic'
import * as stakeEngine from './stakeEngine'
import * as avatarux from './avatarux'
import * as nolimit from './nolimit'
import * as genericProviders from './genericProviders'
import { parseConfig } from './genericProviders'
import { getEffectiveBetAmount } from '../../constants/bet'
import { startThirdPartySession } from '../stake'
import { logApiCall } from '../../utils/apiLogger'

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
  stakeEngine,
  nolimit,
  avatarux,
  '1000lakes': stakeEngine, // Alias für 1000 Lakes Studios
  relax: genericProviders.relax,
  blueprint: genericProviders.blueprint,
  endorphina: genericProviders.endorphina,
  thunderkick: THUNDERKICK_WEBVIEW_PROVIDER,
  netent: genericProviders.netent,
  gameart: genericProviders.gameart,
  push: genericProviders.push,
  btg: genericProviders.btg,
  oak: genericProviders.oak,
  redtiger: genericProviders.redtiger,
  playngo: genericProviders.playngo,
  octoplay: genericProviders.octoplay,
  peterandsons: genericProviders.peterandsons,
  shady: genericProviders.shady,
  shuffle: genericProviders.shuffle,
  titan: genericProviders.titan,
  twist: genericProviders.twist,
  popiplay: genericProviders.popiplay,
  helio: genericProviders.helio,
  samurai: genericProviders.samurai,
}

const GENERIC_BACKEND_PROVIDER = {
  async startSession(_accessToken, _slug, _sourceCurrency, targetCurrency) {
    return {
      provider: 'backend-simulated',
      seq: 0,
      betLevels: [1000, 5000, 25000, 100000, 500000, 1000000],
      currencyCode: (targetCurrency || 'USD').toUpperCase(),
      initialBalance: null,
    }
  },
  async placeBet(session, betAmount, extraBet, _autoplay = false) {
    const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
    const currencyCode = (session?.currencyCode || 'USD').toUpperCase()
    const mult = Math.random() < 0.75 ? Math.random() * 2 : Math.random() * 50
    const winAmount = Math.round(effectiveBet * mult)
    const data = {
      statusCode: 0,
      accountBalance: { balance: null, currencyCode },
      round: {
        status: 'complete',
        events: [{ awa: winAmount }],
        winAmountDisplay: winAmount,
      },
    }
    return {
      data,
      nextSeq: (session?.seq || 0) + 1,
      session: { ...session, seq: (session?.seq || 0) + 1 },
    }
  },
  async sendContinue() {
    return { ok: true }
  },
  async sendKeepAlive() {
    return { ok: true }
  },
}

/**
 * @param {string} providerId
 * @returns {{ startSession, placeBet, sendContinue, sendKeepAlive } | null}
 */
export function getProvider(providerId) {
  return WEB_PROVIDERS[providerId] ?? GENERIC_BACKEND_PROVIDER
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
