import { logApiCall } from '../../utils/apiLogger'
import { getEffectiveBetAmount } from '../../constants/bet'

const AVATARUX_PLAY_BASE = 'https://eu2.l0mpxqfj.xyz'

async function safeFetch(url, options = {}) {
  if (window.electronAPI?.proxyRequest) {
    // If url is relative, it's not a proxy request in this context (but here we are proxying to external URLs)
    // Actually, avatarux.js was calling /api/rgs-proxy with a payload containing the external URL.
    // So we need to match that behavior: call proxyRequest with the target URL directly.
    // BUT wait, safeFetch is called with /api/rgs-proxy in the original code.
    // I need to intercept calls to /api/rgs-proxy and redirect to window.electronAPI.proxyRequest with the payload.
    // OR, better, rewrite the calling code to not use /api/rgs-proxy but use safeProxyRequest directly.
    
    // Let's implement safeProxyRequest locally for clarity
    return window.electronAPI.proxyRequest({
        url: options.url, // Target URL
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body
    }).then(res => ({
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        text: async () => res.data,
        json: async () => JSON.parse(res.data),
        url: res.finalUrl || options.url
    }))
  }
  throw new Error('Electron API not available')
}

export async function startSession(accessToken, slotSlug, sourceCurrency, targetCurrency) {
  const slug = slotSlug || ''
  const parts = slug.split('-')
  const game = parts.length > 1 ? parts.slice(1).join('-') : 'cherry-pop'

  let authData = null
  const key = import.meta.env.VITE_AVATARUX_KEY
  const xSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`

  if (key) {
    const url = `${AVATARUX_PLAY_BASE}/authenticate`
    const body = {
      wallet: 'hub88',
      operator: 'stake.com',
      key,
      provider: 'avatarux',
      game,
    }
    const t0 = Date.now()
    try {
      const proxyPayload = {
        url,
        body: JSON.stringify(body),
        headers: {
          'x-session-id': xSessionId,
          Origin: 'https://cdn-eu2.l0mpxqfj.xyz',
          Referer: 'https://cdn-eu2.l0mpxqfj.xyz/',
        },
      }
      
      // Use Electron Proxy directly
      const res = await safeFetch(null, {
        url: proxyPayload.url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...proxyPayload.headers },
        body: proxyPayload.body
      })

      const text = await res.text()
      try {
        authData = text ? JSON.parse(text) : null
      } catch {
        authData = null
      }
      const safeResponse = authData && typeof authData === 'object'
        ? {
            ok: res.ok,
            balance: authData.balance ?? null,
            currency: authData.currency ?? null,
            hasToken: !!authData.token,
            hasPlayerId: !!authData.playerId,
          }
        : { ok: res.ok, raw: text?.slice(0, 120) }
      logApiCall({
        type: 'avatarux/authenticate',
        endpoint: url,
        request: { wallet: body.wallet, operator: body.operator, provider: body.provider, game: body.game },
        response: safeResponse,
        error: !res.ok ? `HTTP ${res.status}` : null,
        durationMs: Date.now() - t0,
      })
      if (authData && authData.error && authData.error.code) {
        throw new Error(`AvatarUX Authenticate Fehler: ${authData.error.code}`)
      }
    } catch (e) {
      logApiCall({
        type: 'avatarux/authenticate',
        endpoint: `${AVATARUX_PLAY_BASE}/authenticate`,
        request: { wallet: 'hub88', operator: 'stake.com', provider: 'avatarux', game },
        response: null,
        error: e?.message || String(e),
        durationMs: Date.now() - t0,
      })
      authData = null
    }
  }

  const currencyFromAuth = authData?.currency || null
  const balanceFromAuth = authData?.balance != null ? Number(authData.balance) : null

  return {
    game,
    provider: 'avatarux',
    seq: 1,
    xSessionId,
    currencyCode: (targetCurrency || currencyFromAuth || 'eur').toUpperCase(),
    betLevels: [75, 150, 300, 750, 1500, 3000],
    initialBalance: balanceFromAuth,
    token: authData?.token || null,
    playerId: authData?.playerId || null,
  }
}

export async function placeBet(session, betAmount, extraBet = false, autoplay = false) {
  const effectiveBet = getEffectiveBetAmount(betAmount, extraBet)
  const url = `${AVATARUX_PLAY_BASE}/game/play`
  const body = {
    amount: effectiveBet,
    currency: session.currencyCode,
    game: session.game,
    token: session.token,
    playerId: session.playerId,
    roundId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }

  const t0 = Date.now()
  let data = null
  let res = null

  try {
     const proxyPayload = {
        url,
        body: JSON.stringify(body),
        headers: {
          'x-session-id': session.xSessionId,
          Origin: 'https://cdn-eu2.l0mpxqfj.xyz',
          Referer: 'https://cdn-eu2.l0mpxqfj.xyz/',
        },
      }

    res = await safeFetch(null, {
        url: proxyPayload.url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...proxyPayload.headers },
        body: proxyPayload.body
    })

    const text = await res.text()
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }

    logApiCall({
      type: 'avatarux/spin',
      endpoint: url,
      request: { amount: body.amount, currency: body.currency, game: body.game },
      response: data ? { balance: data.balance, win: data.win } : { raw: text?.slice(0, 100) },
      error: !res.ok ? `HTTP ${res.status}` : null,
      durationMs: Date.now() - t0,
    })

    if (!res.ok) {
      throw new Error(`Spin failed: ${res.status}`)
    }
  } catch (e) {
    logApiCall({
      type: 'avatarux/spin',
      endpoint: url,
      request: { amount: body.amount },
      response: null,
      error: e?.message || String(e),
      durationMs: Date.now() - t0,
    })
    throw e
  }

  return {
    data: {
        ...data,
        _avataruxRaw: data
    },
    nextSeq: (session.seq || 0) + 1,
    session: { ...session, seq: (session.seq || 0) + 1, lastPlayAt: Date.now() },
  }
}
