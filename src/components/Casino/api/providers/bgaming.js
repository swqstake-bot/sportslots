/**
 * BGaming (Softswiss / Bulletproof) – Stake startThirdPartySession + RGS JSON-RPC.
 *
 * HAR (stake.com, bgaming-mystic-reels, usdc→eur):
 * 1) startThirdPartySession.config = ignition.button …?options=<base64>
 * 2) options.launch_options.game_url = curacao-interlayer …&_subdomain=mystic-reels&_target=/?token=JWT
 * 3) Spiel: https://{subdomain}.bgaming-network.com/?token=JWT  (GET first, then POST /api)
 * 4) POST https://{subdomain}.bgaming-network.com/api
 *    Headers: Accept application/json, Origin=game, Referer=launchUrl(?token=…), Chrome UA
 *    - init  { jsonrpc:"2.0", method:"init", params:{ token } }
 *    - play  { method:"play", params:{ token, req:{ bet_type:"bet", bet }, state_lock } }
 *    - Extra/Encore: req.purchased_feature = "buy_chance" (same base bet; +50% charged server-side)
 * Beträge in currency_attributes.subunits (EUR: 100 → Cent = App-Minor).
 *
 * HAR (stake.eu, bgaming-mystic-reels, sweeps→sweeps):
 * 1) source/target = sweeps (also gold/GC supported by kurator)
 * 2) game_url = https://{game}.gamma.bgaming-network.com/?token=JWT (direct, no interlayer)
 * 3) init: currency "STKC", currency_attributes.code "SC", subunits 100
 *    bet 20 subunits = 0.20 SC = 20 app-minor — map STKC/SC→sweeps for amount math (not crypto 1e8).
 *
 * Legacy Softswiss ({ command:"init"|"spin" }) als Fallback für ältere Titles.
 */
import { startThirdPartySession } from '../stake'
import { getEffectiveBetAmount } from '../../constants/bet'
import { logApiCall } from '../../utils/apiLogger'
import {
  getMinorFactor,
  normalizeCurrencyCode,
  isGoldCoinCurrency,
  canonicalizeGoldCoinCode,
  canonicalizeBgamingRgsCurrency,
} from '../../utils/currencyMeta'
import { normalizeProviderError } from './providerErrors'

/** EU GoldCoins wallet (gold/sweeps) — never true for .com crypto/fiat sessions. */
function isEuGoldCoinWallet(sourceCurrency, targetCurrency) {
  return isGoldCoinCurrency(sourceCurrency) || isGoldCoinCurrency(targetCurrency)
}

/** Currency used for subunit↔app-minor math (wallet-facing; may differ from RGS `STKC`). */
function sessionAmountMathCurrency(session) {
  return (
    session?.amountMathCurrency ||
    (session?.euGoldSession
      ? canonicalizeBgamingRgsCurrency(session?.rgsCurrencyCode, session?.rgsCurrencyAttrCode, {
          euGoldSession: true,
          walletTarget: session?.walletTarget,
        })
      : null) ||
    session?.currencyCode ||
    'eur'
  )
}

const BGAMING_NETWORK_HOST = 'bgaming-network.com'

/** Chrome-like UA (HAR). Electron UA is often CF/Softswiss-blocked. */
const BGAMING_BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'

/**
 * RGS API is always `{gameOrigin}/api` (HAR .com / .eu gamma).
 * Never publishing.bgaming-system.com (DNS ENOTFOUND).
 * Returns [{ origin, apiUrl, launchUrl }] — gamma as Softswiss fallback if .com network 403s.
 */
function bgamingApiCandidates(launch) {
  const token = launch?.token || null
  const origins = []
  const addOrigin = (raw) => {
    const origin = String(raw || '').replace(/\/$/, '')
    if (origin && !origins.includes(origin)) origins.push(origin)
  }
  addOrigin(launch?.gameOrigin)
  try {
    const host = new URL(String(launch?.gameOrigin || '')).hostname
    // .com interlayer resolves to {slot}.bgaming-network.com; if that 403s, try gamma (EU host pattern).
    if (/\.bgaming-network\.com$/i.test(host) && !/\.gamma\.bgaming-network\.com$/i.test(host)) {
      const sub = launch?.subdomain || host.split('.')[0]
      if (sub) addOrigin(`https://${sub}.gamma.${BGAMING_NETWORK_HOST}`)
    }
  } catch {
    /* ignore */
  }
  return origins.map((origin) => ({
    origin,
    apiUrl: `${origin}/api`,
    launchUrl: token
      ? `${origin}/?token=${encodeURIComponent(token)}`
      : `${origin}/`,
  }))
}

function bgamingRequestHeaders(origin, referer) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': BGAMING_BROWSER_UA,
  }
  if (origin) {
    headers.Origin = origin
    // HAR: Referer is the full game URL including ?token=… (not bare origin/)
    headers.Referer = referer || `${origin}/`
  }
  return headers
}

function describeHttpFailure(res, label) {
  const status = res?.status ?? '?'
  const rpcErr = res?.json?.error?.message
  const bodySnippet = String(res?.text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
  const parts = [`${label} HTTP ${status}`]
  if (rpcErr) parts.push(String(rpcErr))
  if (bodySnippet) parts.push(`body=${bodySnippet}`)
  return parts.join(' | ')
}

function bgamingError(message, cause) {
  return normalizeProviderError('bgaming', cause || new Error(message), message)
}

function newRpcId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

function decodeBase64Json(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  try {
    let seg = decodeURIComponent(s)
    const pad = seg.length % 4
    if (pad) seg += '='.repeat(4 - pad)
    seg = seg.replace(/-/g, '+').replace(/_/g, '/')
    if (typeof atob !== 'function') return null
    return JSON.parse(atob(seg))
  } catch {
    try {
      const pad = s.length % 4
      const seg = (pad ? s + '='.repeat(4 - pad) : s).replace(/-/g, '+').replace(/_/g, '/')
      if (typeof atob !== 'function') return null
      return JSON.parse(atob(seg))
    } catch {
      return null
    }
  }
}

async function proxyRequest({ url, method = 'GET', headers = {}, body = undefined }) {
  if (window.electronAPI?.proxyRequest) {
    const res = await window.electronAPI.proxyRequest({
      url,
      method,
      headers,
      body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    })
    const text = typeof res?.data === 'string' ? res.data : res?.data != null ? String(res.data) : ''
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text,
      json,
      finalUrl: res.finalUrl || url,
    }
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, text, json, finalUrl: res.url || url }
}

function extractTokenFromUrl(urlStr) {
  try {
    const u = new URL(String(urlStr || ''))
    return (
      u.searchParams.get('token') ||
      u.searchParams.get('session') ||
      u.searchParams.get('gs') ||
      null
    )
  } catch {
    return null
  }
}

/**
 * Resolve Softswiss/BGaming launch → { gameOrigin, token, launchUrl, apiCandidates }.
 */
export function resolveBgamingLaunch(configRaw) {
  const configUrl = typeof configRaw === 'string' ? configRaw : configRaw?.url || configRaw?.config || ''
  if (!configUrl) return null

  let gameUrl = null
  let token = extractTokenFromUrl(configUrl)

  try {
    const u = new URL(configUrl)
    const optionsParam = u.searchParams.get('options')
    if (optionsParam) {
      const opts = decodeBase64Json(optionsParam)
      const nested =
        opts?.launch_options?.game_url ||
        opts?.launch_options?.gameUrl ||
        opts?.game_url ||
        opts?.gameUrl ||
        null
      if (nested) gameUrl = String(nested)
    }
  } catch {
    /* ignore */
  }

  if (!gameUrl && /bgaming|softswiss|interl/i.test(configUrl)) {
    gameUrl = configUrl
  }

  let subdomain = null
  let targetPath = '/?token='
  if (gameUrl) {
    try {
      const gu = new URL(gameUrl)
      subdomain = gu.searchParams.get('_subdomain') || gu.searchParams.get('subdomain')
      const target = gu.searchParams.get('_target') || gu.searchParams.get('target')
      if (target) {
        targetPath = decodeURIComponent(target)
        if (!token) token = extractTokenFromUrl(`https://x.invalid${targetPath.startsWith('/') ? '' : '/'}${targetPath}`)
      }
      if (!token) token = extractTokenFromUrl(gameUrl)
      // Direct game host (already on bgaming-network / gamma.bgaming-network)
      if (!subdomain && /\.bgaming-network\.com$/i.test(gu.hostname)) {
        const hostParts = gu.hostname.split('.')
        // mystic-reels.bgaming-network.com OR mystic-reels.gamma.bgaming-network.com
        if (hostParts.length >= 3) subdomain = hostParts[0]
        if (!token) token = gu.searchParams.get('token')
        const origin = `${gu.protocol}//${gu.hostname}`
        const launchUrl = `${origin}${gu.pathname}${gu.search}`
        const resolved = {
          configUrl,
          gameUrl,
          launchUrl,
          gameOrigin: origin,
          subdomain,
          token,
        }
        resolved.apiCandidates = bgamingApiCandidates(resolved)
        return resolved
      }
    } catch {
      /* ignore */
    }
  }

  if (!subdomain || !token) {
    // Fallback: token only on outer config URL
    if (token && !subdomain) {
      try {
        const u = new URL(configUrl)
        const host = u.hostname || ''
        if (host.includes('bgaming')) {
          subdomain = host.split('.')[0]
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!subdomain || !token) return null

  const origin = `https://${subdomain}.${BGAMING_NETWORK_HOST}`
  const launchPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`
  const launchUrl = `${origin}${launchPath.includes('token=') ? launchPath : `/?token=${encodeURIComponent(token)}`}`

  const resolved = {
    configUrl,
    gameUrl,
    launchUrl,
    gameOrigin: origin,
    subdomain,
    token,
  }
  resolved.apiCandidates = bgamingApiCandidates(resolved)
  return resolved
}

function subunitsToAppMinor(amountSubunits, subunits, currencyCode) {
  const raw = Number(amountSubunits)
  if (!Number.isFinite(raw)) return 0
  const sub = Number(subunits) > 0 ? Number(subunits) : 100
  const factor = getMinorFactor(normalizeCurrencyCode(currencyCode))
  return Math.round((raw * factor) / sub)
}

function appMinorToSubunits(amountMinor, subunits, currencyCode) {
  const raw = Number(amountMinor)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  const sub = Number(subunits) > 0 ? Number(subunits) : 100
  const factor = getMinorFactor(normalizeCurrencyCode(currencyCode))
  return Math.max(1, Math.round((raw * sub) / factor))
}

function wrapBetResponse({ winMinor, currencyCode, roundId, balanceMinor, freeRoundOffer, raw }) {
  // Wallet-facing code (sweeps/gold/eur) — not raw RGS STKC
  const math = normalizeCurrencyCode(currencyCode) || 'eur'
  const cc = (canonicalizeGoldCoinCode(math) || math).toUpperCase()
  const w = Number.isFinite(Number(winMinor)) ? Number(winMinor) : 0
  return {
    statusCode: 0,
    accountBalance: {
      balance: balanceMinor != null && Number.isFinite(Number(balanceMinor)) ? Number(balanceMinor) : null,
      currencyCode: cc,
    },
    round: {
      status: 'complete',
      roundId: roundId || null,
      events: [{ awa: w }],
      winAmountDisplay: w,
    },
    ...(freeRoundOffer ? { freeRoundOffer: true } : {}),
    ...(raw != null ? { _bgamingRaw: raw } : {}),
  }
}

function extractJsonRpcWin(result) {
  const resp = result?.resp || result?.outcome || null
  if (!resp || typeof resp !== 'object') return 0
  const candidates = [resp.CashWin, resp.cashWin, resp.TotalWin, resp.totalWin, resp.win, result?.win]
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function hasBonusSignal(result, isJsonRpc) {
  if (!result || typeof result !== 'object') return false
  if (isJsonRpc) {
    const resp = result.resp || {}
    if (resp.freeSpinsAwarded === true) return true
    const spins = Array.isArray(resp.Spin) ? resp.Spin : []
    if (spins.some((s) => s?.spinEvent?.freeSpinsAwarded || s?.freeSpinsAwarded)) return true
    if (Array.isArray(result.freebets) && result.freebets.length > 0) return true
    return false
  }
  const actions = result?.flow?.available_actions || result?.available_actions || []
  if (Array.isArray(actions) && actions.some((a) => a && a !== 'init' && a !== 'spin')) return true
  return false
}

async function postJsonRpc(apiUrl, method, params, origin, referer) {
  const body = {
    id: newRpcId(),
    jsonrpc: '2.0',
    method,
    params: params || {},
  }
  return proxyRequest({
    url: apiUrl,
    method: 'POST',
    headers: bgamingRequestHeaders(origin, referer),
    body,
  })
}

async function postCommand(apiUrl, payload, origin, referer) {
  return proxyRequest({
    url: apiUrl,
    method: 'POST',
    headers: bgamingRequestHeaders(origin, referer),
    body: payload,
  })
}

/** HAR: browser loads `/?token=…` before POST /api (same-origin session / Softswiss boot). */
async function warmUpGamePage(launchUrl, origin) {
  if (!launchUrl) return
  try {
    await proxyRequest({
      url: launchUrl,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': BGAMING_BROWSER_UA,
        ...(origin
          ? {
              Origin: origin,
              Referer: `${origin}/`,
            }
          : {}),
      },
    })
  } catch {
    /* warm-up is best-effort; init may still succeed */
  }
}

/** Softswiss Encore / Chance — typically +50% total bet (Mystic Reels HAR + docs). */
const BGAMING_BUY_CHANCE_MULTIPLIER = 1.5

function mapPurchasedFeatures(features, { chanceMultiplier = BGAMING_BUY_CHANCE_MULTIPLIER } = {}) {
  if (!Array.isArray(features)) return []
  return features
    .filter((f) => typeof f === 'string' && f.trim())
    .map((key) => ({
      id: key,
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      // buy_chance = Extra/Encore; buy_bonus is a separate feature-buy (often 100×, charged server-side).
      multiplier: key === 'buy_chance' ? chanceMultiplier : 1,
    }))
}

function resolvePurchasedFeatureKey(extraBet, options, session) {
  const fromOpts =
    options?.bonusKey ||
    options?.purchasedFeature ||
    (typeof options?.bonus === 'string' ? options.bonus : options?.bonus?.key) ||
    null
  if (fromOpts) return String(fromOpts)
  if (extraBet) {
    if (session?.supportsExtraBet === false) return null
    return session?.extraBetFeature || 'buy_chance'
  }
  return null
}

/**
 * @param {string} accessToken
 * @param {string} slotSlug e.g. bgaming-mystic-reels
 */
export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency, opts = {}) {
  const source = (sourceCurrency || 'usdc').toLowerCase()
  const targetDefault = isGoldCoinCurrency(source) ? source : 'eur'
  const target = (targetCurrency || targetDefault).toLowerCase()
  const euGoldSession = isEuGoldCoinWallet(source, target)
  const t0 = Date.now()

  const stakeSession = await startThirdPartySession(accessToken, slotSlug, source, target, opts)
  const configRaw = stakeSession?.config
  const launch = resolveBgamingLaunch(configRaw)
  if (!launch?.token || !launch?.apiCandidates?.length) {
    logApiCall({
      type: 'bgaming/init',
      endpoint: typeof configRaw === 'string' ? configRaw : null,
      request: { slotSlug, source, target },
      response: null,
      error: 'Launch URL / token konnte nicht aus Softswiss-Config gelesen werden',
      durationMs: Date.now() - t0,
    })
    throw bgamingError('BGaming: Launch-URL/Token aus Session-Config nicht lesbar (ignition/interlayer).')
  }

  let lastErr = null
  for (const candidate of launch.apiCandidates) {
    const apiUrl = candidate.apiUrl
    const gameOrigin = candidate.origin
    const launchUrl = candidate.launchUrl || launch.launchUrl
    await warmUpGamePage(launchUrl, gameOrigin)

    // Prefer JSON-RPC (HAR / Bulletproof platform)
    try {
      const initRes = await postJsonRpc(apiUrl, 'init', { token: launch.token }, gameOrigin, launchUrl)
      const result = initRes.json?.result
      if (initRes.ok && result && (result.config || result.currency_attributes || result.balance != null)) {
        const subunits = Number(result.currency_attributes?.subunits) > 0 ? Number(result.currency_attributes.subunits) : 100
        const rgsCurrencyCode = String(result.currency || '').toUpperCase() || null
        const rgsCurrencyAttrCode = String(result.currency_attributes?.code || '').toUpperCase() || null
        // API may report STKC; math/UI use sweeps/gold (HAR EU: STKC + attributes.code SC).
        const amountMathCurrency =
          canonicalizeBgamingRgsCurrency(rgsCurrencyCode, rgsCurrencyAttrCode, {
            euGoldSession,
            walletTarget: target,
          }) || (euGoldSession ? canonicalizeGoldCoinCode(target) : target || 'eur')
        const currencyCode = amountMathCurrency
        const limits = result.config?.bet_limits || result.config?.freebets_limits || []
        const betLevels = Array.isArray(limits)
          ? limits
              .map((v) => subunitsToAppMinor(v, subunits, amountMathCurrency))
              .filter((v) => Number.isFinite(v) && v > 0)
          : []
        const purchasedRaw = result.config?.purchased_features
        const supportsExtraBet = Array.isArray(purchasedRaw) && purchasedRaw.includes('buy_chance')
        const extraBetMultiplier = supportsExtraBet ? BGAMING_BUY_CHANCE_MULTIPLIER : null
        const bonusGames = mapPurchasedFeatures(purchasedRaw, {
          chanceMultiplier: extraBetMultiplier || BGAMING_BUY_CHANCE_MULTIPLIER,
        })
        const balanceMinor = subunitsToAppMinor(result.balance, subunits, amountMathCurrency)
        const session = {
          provider: 'bgaming',
          seq: 1,
          slotSlug,
          token: launch.token,
          apiUrl,
          gameOrigin,
          launchUrl,
          configUrl: launch.configUrl,
          isJsonRpc: true,
          stateLock: result.state_lock || null,
          subunits,
          /** Exact RGS currency (HAR EU: STKC). */
          rgsCurrencyCode,
          rgsCurrencyAttrCode,
          /** Wallet math code — on .eu STKC/SC→sweeps, GC→gold. */
          amountMathCurrency,
          euGoldSession,
          walletTarget: target,
          currencyCode,
          betLevels,
          bonusGames,
          purchasedFeatures: Array.isArray(purchasedRaw) ? purchasedRaw.slice() : [],
          supportsExtraBet,
          extraBetFeature: supportsExtraBet ? 'buy_chance' : null,
          extraBetMultiplier,
          initialBalance: balanceMinor,
        }
        logApiCall({
          type: 'bgaming/init',
          endpoint: apiUrl,
          request: { slotSlug, source, target, mode: 'jsonrpc', euGoldSession, gameOrigin },
          response: {
            ok: true,
            currency: currencyCode,
            rgsCurrency: rgsCurrencyCode,
            rgsAttr: rgsCurrencyAttrCode,
            subunits,
            betLevels: betLevels.slice(0, 8),
            balance: balanceMinor,
            purchased: bonusGames.map((b) => b.key),
            supportsExtraBet,
            extraBetMultiplier,
            stateLock: !!session.stateLock,
          },
          error: null,
          durationMs: Date.now() - t0,
        })
        return session
      }
      lastErr =
        initRes.json?.error?.message ||
        describeHttpFailure(initRes, 'JSON-RPC init')
    } catch (e) {
      lastErr = e?.message || String(e)
    }

    // Legacy Softswiss command API
    try {
      const initRes = await postCommand(apiUrl, { command: 'init' }, gameOrigin, launchUrl)
      const data = initRes.json
      if (initRes.ok && data && (data.options || data.balance)) {
        const subunits = Number(data.options?.currency?.subunits || data.currency_attributes?.subunits) > 0
          ? Number(data.options?.currency?.subunits || data.currency_attributes?.subunits)
          : 100
        const rgsCurrencyCode = String(data.options?.currency?.code || data.currency || '').toUpperCase() || null
        const rgsCurrencyAttrCode = String(data.currency_attributes?.code || data.options?.currency?.code || '').toUpperCase() || null
        const amountMathCurrency =
          canonicalizeBgamingRgsCurrency(rgsCurrencyCode, rgsCurrencyAttrCode, {
            euGoldSession,
            walletTarget: target,
          }) || (euGoldSession ? canonicalizeGoldCoinCode(target) : target || 'eur')
        const currencyCode = amountMathCurrency
        const rawBets = data.options?.available_bets || data.options?.line_bets || []
        const betLevels = Array.isArray(rawBets)
          ? rawBets
              .map((v) => subunitsToAppMinor(v, subunits, amountMathCurrency))
              .filter((v) => Number.isFinite(v) && v > 0)
          : []
        const featureOpts = data.options?.feature_options
        let bonusGames = []
        let extraBetMultiplier = null
        let supportsExtraBet = false
        if (featureOpts && typeof featureOpts === 'object') {
          const baseBet = Number(featureOpts.base_bet) || 0
          if (featureOpts.buy_chance != null && baseBet > 0) {
            supportsExtraBet = true
            const m = Number(featureOpts.buy_chance) / baseBet
            if (Number.isFinite(m) && m > 0) extraBetMultiplier = m
          } else if (featureOpts.buy_chance != null) {
            supportsExtraBet = true
            extraBetMultiplier = BGAMING_BUY_CHANCE_MULTIPLIER
          }
          bonusGames = Object.entries(featureOpts)
            .filter(([k]) => k !== 'base_bet' && !String(k).includes('_buy'))
            .map(([key, cost]) => ({
              id: key,
              key,
              label: `${key.replace(/_/g, ' ')} (x${baseBet > 0 ? Number(cost) / baseBet : 1})`,
              multiplier: baseBet > 0 ? Number(cost) / baseBet : key === 'buy_chance' ? BGAMING_BUY_CHANCE_MULTIPLIER : 1,
            }))
        }
        const balRaw = data.balance?.game ?? data.balance?.wallet ?? data.balance
        const balanceMinor = subunitsToAppMinor(balRaw, subunits, amountMathCurrency)
        const session = {
          provider: 'bgaming',
          seq: 1,
          slotSlug,
          token: launch.token,
          apiUrl,
          gameOrigin,
          launchUrl,
          configUrl: launch.configUrl,
          isJsonRpc: false,
          stateLock: null,
          subunits,
          rgsCurrencyCode,
          rgsCurrencyAttrCode,
          amountMathCurrency,
          euGoldSession,
          walletTarget: target,
          currencyCode,
          betLevels,
          bonusGames,
          purchasedFeatures: bonusGames.map((b) => b.key),
          supportsExtraBet,
          extraBetFeature: supportsExtraBet ? 'buy_chance' : null,
          extraBetMultiplier,
          initialBalance: balanceMinor,
        }
        logApiCall({
          type: 'bgaming/init',
          endpoint: apiUrl,
          request: { slotSlug, source, target, mode: 'command', euGoldSession, gameOrigin },
          response: {
            ok: true,
            currency: currencyCode,
            rgsCurrency: rgsCurrencyCode,
            rgsAttr: rgsCurrencyAttrCode,
            subunits,
            betLevels: betLevels.slice(0, 8),
            balance: balanceMinor,
            purchased: bonusGames.map((b) => b.key),
            supportsExtraBet,
            extraBetMultiplier,
          },
          error: null,
          durationMs: Date.now() - t0,
        })
        return session
      }
      lastErr = describeHttpFailure(initRes, 'command init')
    } catch (e) {
      lastErr = e?.message || String(e)
    }
  }

  logApiCall({
    type: 'bgaming/init',
    endpoint: launch.apiCandidates[0]?.apiUrl || launch.gameOrigin,
    request: {
      slotSlug,
      source,
      target,
      candidates: launch.apiCandidates.map((c) => c.apiUrl),
    },
    response: null,
    error: lastErr || 'init failed',
    durationMs: Date.now() - t0,
  })
  throw bgamingError(`BGaming init fehlgeschlagen: ${lastErr || 'unbekannt'}`)
}

export async function placeBet(session, betAmount, extraBet = false, _autoplay = false, options = {}) {
  if (!session?.apiUrl || !session?.token) {
    throw bgamingError('BGaming: Session ohne apiUrl/token')
  }
  // Softswiss HAR: req.bet = selected base bet (subunits). Extra/Encore does NOT inflate bet —
  // it adds purchased_feature:"buy_chance". Stats use getEffectiveBetAmount (1.5× for bgaming-).
  const baseBetMinor = Number(betAmount) || 0
  const effectiveBet = Number(getEffectiveBetAmount(baseBetMinor, extraBet, session?.slotSlug)) || 0
  const subunits = Number(session.subunits) > 0 ? Number(session.subunits) : 100
  // Use wallet math currency (sweeps/gold), not raw RGS code (STKC) — else EU SC bets collapse to crypto scale.
  const currencyCode = sessionAmountMathCurrency(session)
  const apiBet = appMinorToSubunits(baseBetMinor, subunits, currencyCode)
  const t0 = Date.now()
  const stopOnBonus = !!(options?.stopOnBonus || options?.skipContinueOnBonus)
  const referer = session.launchUrl || `${session.gameOrigin || ''}/`
  const featureKey = resolvePurchasedFeatureKey(extraBet, options, session)

  if (session.isJsonRpc) {
    const req = { bet_type: 'bet', bet: apiBet }
    // Extra Bet / feature buy: purchased_feature (HAR). Never send on normal spins or continues.
    if (featureKey) req.purchased_feature = featureKey

    const params = {
      token: session.token,
      req,
    }
    if (session.stateLock) params.state_lock = session.stateLock

    const res = await postJsonRpc(session.apiUrl, 'play', params, session.gameOrigin, referer)
    const result = res.json?.result
    if (!res.ok || res.json?.error || !result) {
      const msg = res.json?.error?.message || describeHttpFailure(res, 'play')
      logApiCall({
        type: 'bgaming/play',
        endpoint: session.apiUrl,
        request: {
          bet: apiBet,
          uiBetMinor: baseBetMinor,
          effectiveBetMinor: effectiveBet,
          extraBet: !!extraBet,
          purchased_feature: featureKey || null,
        },
        response: res.json || res.text?.slice?.(0, 200),
        error: msg,
        durationMs: Date.now() - t0,
      })
      throw bgamingError(`BGaming play fehlgeschlagen: ${msg}`)
    }

    if (result.state_lock) session.stateLock = result.state_lock
    const winSub = extractJsonRpcWin(result)
    const winMinor = subunitsToAppMinor(winSub, subunits, currencyCode)
    const balanceMinor = subunitsToAppMinor(result.balance, subunits, currencyCode)
    const roundId = result.resp?.ResultId || result.resp?.resultId || null
    const freeRoundOffer = hasBonusSignal(result, true)

    logApiCall({
      type: 'bgaming/play',
      endpoint: session.apiUrl,
      request: {
        bet: apiBet,
        uiBetMinor: baseBetMinor,
        effectiveBetMinor: effectiveBet,
        extraBet: !!extraBet,
        purchased_feature: featureKey || null,
      },
      response: {
        ok: true,
        cashWin: winSub,
        winMinor,
        balance: balanceMinor,
        roundId,
        final: result.final,
        freeRoundOffer,
      },
      error: null,
      durationMs: Date.now() - t0,
    })

    if (freeRoundOffer && stopOnBonus) {
      const data = wrapBetResponse({
        winMinor,
        currencyCode,
        roundId,
        balanceMinor,
        freeRoundOffer: true,
        raw: result,
      })
      const nextSeq = (session.seq || 0) + 1
      return { data, nextSeq, session: { ...session, seq: nextSeq, stateLock: session.stateLock } }
    }

    // Optional: drain free-spin / feature if API expects another play without charging
    // (Mystic Reels HAR: final:true — no continue). Keep no-op unless non-final.
    let finalResult = result
    let guard = 0
    while (finalResult?.final === false && guard < 40) {
      guard += 1
      const contParams = {
        token: session.token,
        // Continues: base bet only — never re-send purchased_feature
        req: { bet_type: 'bet', bet: apiBet },
      }
      if (session.stateLock) contParams.state_lock = session.stateLock
      const cont = await postJsonRpc(session.apiUrl, 'play', contParams, session.gameOrigin, referer)
      if (!cont.ok || !cont.json?.result) break
      finalResult = cont.json.result
      if (finalResult.state_lock) session.stateLock = finalResult.state_lock
    }

    const winSubFinal = extractJsonRpcWin(finalResult)
    const winMinorFinal = subunitsToAppMinor(winSubFinal, subunits, currencyCode)
    const balanceFinal = subunitsToAppMinor(finalResult.balance, subunits, currencyCode)
    const roundIdFinal = finalResult.resp?.ResultId || roundId
    const data = wrapBetResponse({
      winMinor: winMinorFinal,
      currencyCode,
      roundId: roundIdFinal,
      balanceMinor: balanceFinal,
      freeRoundOffer: hasBonusSignal(finalResult, true),
      raw: finalResult,
    })
    const nextSeq = (session.seq || 0) + 1
    return { data, nextSeq, session: { ...session, seq: nextSeq, stateLock: session.stateLock } }
  }

  // Legacy Softswiss command:spin
  const optionsBody = { bet: apiBet }
  if (featureKey) optionsBody.purchased_feature = featureKey

  const res = await postCommand(
    session.apiUrl,
    { command: 'spin', options: optionsBody },
    session.gameOrigin,
    referer
  )
  const dataJson = res.json
  if (!res.ok || !dataJson) {
    logApiCall({
      type: 'bgaming/spin',
      endpoint: session.apiUrl,
      request: {
        bet: apiBet,
        uiBetMinor: baseBetMinor,
        effectiveBetMinor: effectiveBet,
        extraBet: !!extraBet,
        purchased_feature: featureKey || null,
      },
      response: res.text?.slice?.(0, 200),
      error: describeHttpFailure(res, 'spin'),
      durationMs: Date.now() - t0,
    })
    throw bgamingError(`BGaming spin fehlgeschlagen: ${describeHttpFailure(res, 'spin')}`)
  }

  if (Array.isArray(dataJson.errors)) {
    const funds = dataJson.errors.find((e) => e?.code === 301 || /not_enough_money|insufficient/i.test(e?.desc || e?.message || ''))
    if (funds) throw bgamingError('Insufficient Funds')
  }

  let current = dataJson
  let guard = 0
  const actions = () => current?.flow?.available_actions || current?.available_actions || []
  while (
    !stopOnBonus &&
    Array.isArray(actions()) &&
    actions().some((a) => a && a !== 'init' && a !== 'spin') &&
    guard < 40
  ) {
    guard += 1
    const nextCmd = actions().find((a) => a !== 'init' && a !== 'spin') || 'freespin'
    const cont = await postCommand(
      session.apiUrl,
      { command: nextCmd, options: { bet: apiBet } },
      session.gameOrigin,
      referer
    )
    if (!cont.ok || !cont.json) break
    current = cont.json
  }

  const winRaw =
    current?.outcome?.win ??
    current?.balance?.game ??
    current?.win ??
    0
  // Legacy: outcome.win often absolute win in subunits; balance.game is total round win after bonus
  const winSub = Number(current?.outcome?.win ?? current?.features?.total_win ?? winRaw) || 0
  const winMinor = subunitsToAppMinor(winSub, subunits, currencyCode)
  const balRaw = current?.balance?.wallet ?? current?.balance?.game ?? current?.balance
  const balanceMinor = subunitsToAppMinor(balRaw, subunits, currencyCode)

  logApiCall({
    type: 'bgaming/spin',
    endpoint: session.apiUrl,
    request: {
      bet: apiBet,
      uiBetMinor: baseBetMinor,
      effectiveBetMinor: effectiveBet,
      extraBet: !!extraBet,
      purchased_feature: featureKey || null,
    },
    response: { ok: true, winSub, winMinor, balance: balanceMinor, steps: guard },
    error: null,
    durationMs: Date.now() - t0,
  })

  const data = wrapBetResponse({
    winMinor,
    currencyCode,
    roundId: current?.outcome?.round_id || current?.round || null,
    balanceMinor,
    freeRoundOffer: hasBonusSignal(current, false),
    raw: current,
  })
  const nextSeq = (session.seq || 0) + 1
  return { data, nextSeq, session: { ...session, seq: nextSeq } }
}

export async function sendKeepAlive() {
  return { ok: true }
}

export async function sendContinue() {
  return { ok: true }
}
