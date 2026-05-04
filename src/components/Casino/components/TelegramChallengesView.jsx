import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { parseTelegramStakeMessage } from '../utils/parseTelegramStakeMessage'
import { setTelegramSlotTargets, clearTelegramSlotTargets } from '../utils/hunterSlotTargetsBridge'
import { Button } from './ui/Button'

const DRAFT_KEY = 'slotbot_telegram_challenge_draft_v1'

/** Wie Auto-Hunter: sinnvolles Ziel-Multi (bevorzugt ≥2×) */
function pickPrimaryTargetMultiplier(parsed) {
  const m = parsed.targetMultipliers || []
  const ge2 = m.filter((x) => x >= 2)
  const use = ge2.length ? ge2 : m
  if (use.length === 0) return undefined
  return Math.min(...use)
}
const PARALLEL_MAX = 12
const PARALLEL_MIN = 1

function getElectronApi() {
  if (typeof window === 'undefined') return null
  return window.electronAPI ?? null
}

/**
 * Tab: Telegram-Challenge – Text einfügen oder per eigenem Telegram-Konto (GramJS) Kanalnachrichten laden → Play.
 */
export default function TelegramChallengesView({
  webSlots = [],
  onDiscoveredSlots,
  sharedSourceCurrency = 'usdc',
  sharedTargetCurrency = 'eur',
  onAddToPlay,
}) {
  const [draft, setDraft] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) || ''
    } catch {
      return ''
    }
  })
  const [maxParallel, setMaxParallel] = useState(4)
  const [checkedSlugs, setCheckedSlugs] = useState(() => new Set())
  const draftRef = useRef(draft)
  draftRef.current = draft

  const [apiIdStr, setApiIdStr] = useState('')
  const [apiHashStr, setApiHashStr] = useState('')
  const [phoneStr, setPhoneStr] = useState('')
  const [channelStr, setChannelStr] = useState('')
  const [fetchLimit, setFetchLimit] = useState(30)
  const [appendFetch, setAppendFetch] = useState(false)

  const [tgStatus, setTgStatus] = useState(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [fetchBusy, setFetchBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [codeViaApp, setCodeViaApp] = useState(false)
  const [passwordHint, setPasswordHint] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [authPassword, setAuthPassword] = useState('')

  const [listening, setListening] = useState(false)
  const [listenBusy, setListenBusy] = useState(false)
  const [listenError, setListenError] = useState('')
  const [lastLivePreview, setLastLivePreview] = useState('')
  const telegramTargetsRef = useRef({})

  const electron = getElectronApi()

  const refreshTgStatus = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    try {
      const s = await api.invoke('telegram-status')
      setTgStatus(s)
    } catch {
      setTgStatus(null)
    }
  }, [])

  useEffect(() => {
    const api = getElectronApi()
    if (!api?.invoke) return
    ;(async () => {
      try {
        const cfg = await api.invoke('telegram-config-get')
        if (cfg?.apiId != null) setApiIdStr(String(cfg.apiId))
        if (cfg?.apiHash) setApiHashStr(cfg.apiHash)
      } catch {
        /* ignore */
      }
      await refreshTgStatus()
    })()
  }, [refreshTgStatus])

  useEffect(() => {
    const api = getElectronApi()
    if (!api?.on) return undefined
    const offCode = api.on('telegram-auth-needs-code', (payload) => {
      setNeedsCode(true)
      setCodeViaApp(!!payload?.isCodeViaApp)
    })
    const offPwd = api.on('telegram-auth-needs-password', (payload) => {
      setNeedsPassword(true)
      setPasswordHint(typeof payload?.hint === 'string' ? payload.hint : '')
    })
    return () => {
      offCode()
      offPwd()
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, draft)
    } catch {
      /* ignore */
    }
  }, [draft])

  const parsed = useMemo(() => parseTelegramStakeMessage(draft), [draft])

  const gamesKey = useMemo(() => parsed.games.map((g) => g.slug).join('|'), [parsed])

  useEffect(() => {
    const next = parseTelegramStakeMessage(draftRef.current).games
    setCheckedSlugs(new Set(next.map((g) => g.slug)))
  }, [gamesKey])

  const toggleSlug = useCallback((slug) => {
    setCheckedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  const handleDiscoverMissing = useCallback(() => {
    if (!onDiscoveredSlots) return
    const known = new Set(webSlots.map((s) => s.slug))
    const added = []
    for (const g of parsed.games) {
      if (!known.has(g.slug)) {
        known.add(g.slug)
        added.push({
          slug: g.slug,
          name: g.name,
          providerId: 'stakeEngine',
        })
      }
    }
    if (added.length) onDiscoveredSlots(added)
  }, [parsed.games, webSlots, onDiscoveredSlots])

  const discoverFromParsed = useCallback(
    (p) => {
      if (!onDiscoveredSlots) return
      const known = new Set(webSlots.map((s) => s.slug))
      const added = []
      for (const g of p.games) {
        if (!known.has(g.slug)) {
          known.add(g.slug)
          added.push({
            slug: g.slug,
            name: g.name,
            providerId: 'stakeEngine',
          })
        }
      }
      if (added.length) onDiscoveredSlots(added)
    },
    [webSlots, onDiscoveredSlots]
  )

  const mergeTelegramTargets = useCallback((p, slugs) => {
    const mults = p.targetMultipliers || []
    if (!mults.length || !slugs.length) return
    const next = { ...telegramTargetsRef.current }
    for (const slug of slugs) {
      next[slug] = [...new Set([...(next[slug] || []), ...mults])]
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b)
    }
    telegramTargetsRef.current = next
    setTelegramSlotTargets(next)
  }, [])

  const handleAddToPlay = useCallback(() => {
    const ordered = parsed.games.filter((g) => checkedSlugs.has(g.slug)).map((g) => g.slug)
    const take = ordered.slice(0, Math.max(PARALLEL_MIN, Math.min(PARALLEL_MAX, maxParallel)))
    if (take.length === 0) return
    mergeTelegramTargets(parsed, take)
    handleDiscoverMissing()
    const primary = pickPrimaryTargetMultiplier(parsed)
    onAddToPlay?.({
      slugs: take,
      minBetUsd: parsed.minBetUsd ?? undefined,
      challengeTargetMultiplier: primary,
      challengeTargetMultipliers: parsed.targetMultipliers?.length ? parsed.targetMultipliers : undefined,
    })
  }, [
    parsed,
    checkedSlugs,
    maxParallel,
    onAddToPlay,
    handleDiscoverMissing,
    mergeTelegramTargets,
  ])

  const applyLiveMessage = useCallback(
    (text) => {
      const p = parseTelegramStakeMessage(text)
      if (!p.games.length) return
      const slugsAll = p.games.map((g) => g.slug)
      const take = slugsAll.slice(0, Math.max(PARALLEL_MIN, Math.min(PARALLEL_MAX, maxParallel)))
      mergeTelegramTargets(p, take)
      discoverFromParsed(p)
      const primary = pickPrimaryTargetMultiplier(p)
      onAddToPlay?.({
        slugs: take,
        minBetUsd: p.minBetUsd ?? undefined,
        challengeTargetMultiplier: primary,
        challengeTargetMultipliers: p.targetMultipliers?.length ? p.targetMultipliers : undefined,
      })
    },
    [maxParallel, mergeTelegramTargets, discoverFromParsed, onAddToPlay]
  )

  useEffect(() => {
    const api = getElectronApi()
    if (!api?.on) return undefined
    const off = api.on('telegram-live-message', (payload) => {
      const text = typeof payload?.text === 'string' ? payload.text : ''
      if (!text.trim()) return
      setLastLivePreview(text.length > 220 ? `${text.slice(0, 220)}…` : text)
      applyLiveMessage(text)
    })
    return () => off()
  }, [applyLiveMessage])

  const parallelClamped = Math.min(PARALLEL_MAX, Math.max(PARALLEL_MIN, maxParallel))

  const handleSaveApiConfig = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    setLoginError('')
    const apiId = parseInt(apiIdStr.trim(), 10)
    const apiHash = apiHashStr.trim()
    if (!Number.isFinite(apiId) || apiId <= 0) {
      setLoginError('API-ID muss eine positive Zahl sein.')
      return
    }
    if (!apiHash) {
      setLoginError('API-Hash fehlt.')
      return
    }
    const r = await api.invoke('telegram-config-set', { apiId, apiHash })
    if (!r?.ok) setLoginError(r?.error || 'Save failed.')
  }, [apiIdStr, apiHashStr])

  const handleTelegramLogin = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    setLoginError('')
    const apiId = parseInt(apiIdStr.trim(), 10)
    const apiHash = apiHashStr.trim()
    const phone = phoneStr.trim()
    if (!Number.isFinite(apiId) || apiId <= 0) {
      setLoginError('Invalid API ID.')
      return
    }
    if (!apiHash) {
      setLoginError('API-Hash fehlt.')
      return
    }
    if (!phone) {
      setLoginError('Telefonnummer fehlt (international, z. B. +49…).')
      return
    }
    setLoginBusy(true)
    setNeedsCode(false)
    setNeedsPassword(false)
    setAuthCode('')
    setAuthPassword('')
    try {
      const r = await api.invoke('telegram-login', { phone, apiId, apiHash })
      if (r?.ok) {
        await refreshTgStatus()
      } else {
        setLoginError(r?.error || 'Login failed.')
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoginBusy(false)
      setNeedsCode(false)
      setNeedsPassword(false)
    }
  }, [apiIdStr, apiHashStr, phoneStr, refreshTgStatus])

  const handleSubmitAuthCode = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    await api.invoke('telegram-submit-auth-code', authCode)
    setAuthCode('')
    setNeedsCode(false)
  }, [authCode])

  const handleSubmitAuthPassword = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    await api.invoke('telegram-submit-auth-password', authPassword)
    setAuthPassword('')
    setNeedsPassword(false)
  }, [authPassword])

  const handleFetchChannel = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    setFetchError('')
    setFetchBusy(true)
    try {
      const r = await api.invoke('telegram-fetch-messages', {
        channel: channelStr.trim(),
        limit: fetchLimit,
      })
      if (r?.ok && Array.isArray(r.texts)) {
        const block = r.texts.join('\n\n---\n\n')
        setDraft((prev) => (appendFetch && prev.trim() ? `${prev.trim()}\n\n---\n\n${block}` : block))
        await refreshTgStatus()
      } else {
        setFetchError(r?.error || 'Loading failed.')
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetchBusy(false)
    }
  }, [channelStr, fetchLimit, appendFetch, refreshTgStatus])

  const handleStartListen = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    setListenError('')
    setListenBusy(true)
    try {
      const r = await api.invoke('telegram-listen-start', { channel: channelStr.trim() })
      if (r?.ok) {
        setListening(true)
      } else {
        setListenError(r?.error || 'Could not start listening.')
        setListening(false)
      }
    } catch (e) {
      setListenError(e instanceof Error ? e.message : String(e))
      setListening(false)
    } finally {
      setListenBusy(false)
    }
  }, [channelStr])

  const handleStopListen = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    setListenError('')
    try {
      await api.invoke('telegram-listen-stop')
    } catch {
      /* ignore */
    }
    telegramTargetsRef.current = {}
    clearTelegramSlotTargets()
    setListening(false)
    setLastLivePreview('')
  }, [])

  useEffect(() => {
    return () => {
      const api = getElectronApi()
      if (api?.invoke) api.invoke('telegram-listen-stop').catch(() => {})
    }
  }, [])

  const handleLogout = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    setLoginError('')
    try {
      await api.invoke('telegram-listen-stop')
    } catch {
      /* ignore */
    }
    telegramTargetsRef.current = {}
    clearTelegramSlotTargets()
    setListening(false)
    setLastLivePreview('')
    await api.invoke('telegram-logout')
    await refreshTgStatus()
  }, [refreshTgStatus])

  return (
    <div className="hunter-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="hunter-header" style={{ position: 'relative' }}>
        <div>
          <div className="hunter-title">Telegram Challenges</div>
          <p className="hunter-meta" style={{ marginTop: '0.35rem', maxWidth: '52rem', lineHeight: 1.45 }}>
            Paste text, <strong>load history</strong> or <strong>listen live to channel</strong> (new posts): like Auto Hunter,
            the <strong>minimum stake (USD)</strong> and <strong>target multipliers</strong> are transferred to slots (bridge). API ID
            / hash from{' '}
            <a
              href="https://my.telegram.org"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              my.telegram.org
            </a>
            .
          </p>
        </div>
      </div>

      {!electron?.invoke && (
        <div className="hunter-card" style={{ padding: '0.85rem', borderColor: 'var(--warning)' }}>
          <div className="hunter-section-title">Only in the Electron app</div>
          <p className="hunter-meta" style={{ margin: 0 }}>
            Automatic Telegram loading is only available in the desktop app. In the browser you can still
            paste manually.
          </p>
        </div>
      )}

      {electron?.invoke && (
        <div className="hunter-card" style={{ padding: '1rem' }}>
          <div className="hunter-section-title" style={{ marginBottom: '0.65rem' }}>
            Telegram account (own API, own account)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="hunter-kpi-label">API-ID</span>
              <input
                value={apiIdStr}
                onChange={(e) => setApiIdStr(e.target.value)}
                placeholder="12345678"
                autoComplete="off"
                style={{
                  padding: '0.5rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="hunter-kpi-label">API-Hash</span>
              <input
                type="password"
                value={apiHashStr}
                onChange={(e) => setApiHashStr(e.target.value)}
                placeholder="from my.telegram.org"
                autoComplete="off"
                style={{
                  padding: '0.5rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="hunter-kpi-label">Telefon (E.164)</span>
              <input
                value={phoneStr}
                onChange={(e) => setPhoneStr(e.target.value)}
                placeholder="+491234567890"
                autoComplete="tel"
                style={{
                  padding: '0.5rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
            <Button type="button" variant="secondary" onClick={handleSaveApiConfig}>
              Save API data
            </Button>
            <Button type="button" variant="primary" onClick={handleTelegramLogin} disabled={loginBusy}>
              {loginBusy ? 'Signing in...' : 'Sign in to Telegram'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleLogout}>
              Logout (session)
            </Button>
            {tgStatus && (
              <span className="hunter-meta">
                {tgStatus.authorized
                  ? 'Connected & signed in'
                  : tgStatus.hasSessionFile
                    ? 'Session found, checking connection...'
                    : 'Not signed in'}
              </span>
            )}
          </div>
          {loginError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
              {loginError}
            </p>
          )}
          {needsCode && (
            <div style={{ marginTop: '0.75rem', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div className="hunter-kpi-label" style={{ marginBottom: '0.35rem' }}>
                Login-Code {codeViaApp ? '(Telegram-App)' : '(SMS)'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Code from Telegram"
                  style={{
                    flex: '1 1 160px',
                    padding: '0.45rem 0.55rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-deep)',
                    color: 'var(--text)',
                  }}
                />
                <Button type="button" variant="primary" onClick={handleSubmitAuthCode} disabled={!authCode.trim()}>
                  Submit code
                </Button>
              </div>
            </div>
          )}
          {needsPassword && (
            <div style={{ marginTop: '0.75rem', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div className="hunter-kpi-label" style={{ marginBottom: '0.35rem' }}>
                2FA password{passwordHint ? ` (hint: ${passwordHint})` : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Cloud password"
                  style={{
                    flex: '1 1 160px',
                    padding: '0.45rem 0.55rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-deep)',
                    color: 'var(--text)',
                  }}
                />
                <Button type="button" variant="primary" onClick={handleSubmitAuthPassword} disabled={!authPassword}>
                  Submit password
                </Button>
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: '1rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.65rem',
              alignItems: 'end',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="hunter-kpi-label">Channel / Group</span>
              <input
                value={channelStr}
                onChange={(e) => setChannelStr(e.target.value)}
                placeholder="@channel or https://t.me/..."
                style={{
                  padding: '0.5rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span className="hunter-kpi-label">Latest messages (max.)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={fetchLimit}
                onChange={(e) => setFetchLimit(parseInt(e.target.value, 10) || 30)}
                style={{
                  padding: '0.5rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-deep)',
                  color: 'var(--text)',
                  fontSize: '0.82rem',
                }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={appendFetch} onChange={(e) => setAppendFetch(e.target.checked)} />
              <span className="hunter-meta">Append to text</span>
            </label>
            <Button type="button" variant="primary" onClick={handleFetchChannel} disabled={fetchBusy || !channelStr.trim()}>
              {fetchBusy ? 'Loading...' : 'Load messages'}
            </Button>
          </div>
          {fetchError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
              {fetchError}
            </p>
          )}
          <div
            style={{
              marginTop: '0.85rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span className="hunter-kpi-label" style={{ width: '100%', marginBottom: '0.15rem' }}>
              Live (recommended over history): new channel messages map to target multipliers and min bet like hunter
            </span>
            <Button
              type="button"
              variant="primary"
              onClick={handleStartListen}
              disabled={listenBusy || listening || !channelStr.trim()}
            >
              {listenBusy ? 'Starting...' : 'Start listening'}
            </Button>
            <Button type="button" variant="secondary" onClick={handleStopListen} disabled={!listening}>
              Stop listening
            </Button>
            {listening && (
              <span className="hunter-meta" style={{ color: 'var(--accent)' }}>
                ● Live active
              </span>
            )}
          </div>
          {listenError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.35rem', marginBottom: 0 }}>
              {listenError}
            </p>
          )}
          {lastLivePreview && (
            <p
              className="hunter-meta"
              style={{ marginTop: '0.35rem', marginBottom: 0, fontSize: '0.72rem', lineHeight: 1.4, maxHeight: '4.5rem', overflow: 'auto' }}
              title="Latest received message"
            >
              Latest: {lastLivePreview}
            </p>
          )}
        </div>
      )}

      <div className="hunter-main">
        <label className="hunter-section-title" style={{ display: 'block' }}>
          Message (manual or loaded from channel)
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste Telegram text with stake.com/casino/games/... links here ..."
          rows={12}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: '180px',
            padding: '0.75rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-deep)',
            color: 'var(--text)',
            fontSize: '0.82rem',
            lineHeight: 1.45,
            fontFamily: 'inherit',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '1rem',
            marginTop: '0.75rem',
            padding: '0.75rem 0',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <label className="hunter-kpi-label" style={{ display: 'block', marginBottom: '0.35rem' }}>
              Max slots at once (Play)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <input
                type="range"
                min={PARALLEL_MIN}
                max={PARALLEL_MAX}
                value={parallelClamped}
                onChange={(e) => setMaxParallel(parseInt(e.target.value, 10) || PARALLEL_MIN)}
                style={{ flex: 1 }}
              />
              <span className="hunter-meta" style={{ minWidth: 28, textAlign: 'right' }}>
                {parallelClamped}
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              The first {parallelClamped} <strong>checked</strong> games (order as listed below) are added to Play.
            </p>
          </div>
          <Button variant="primary" onClick={handleAddToPlay} disabled={parsed.games.length === 0 || checkedSlugs.size === 0}>
            Add to Play
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
        <div className="hunter-kpi-card" style={{ padding: '1rem' }}>
          <div className="hunter-kpi-label">Detected games</div>
          <div className="hunter-kpi-value" style={{ fontSize: '1.5rem' }}>
            {parsed.games.length}
          </div>
        </div>
        {parsed.minBetUsd != null && (
          <div className="hunter-kpi-card" style={{ padding: '1rem' }}>
            <div className="hunter-kpi-label">Min stake (estimated)</div>
            <div className="hunter-kpi-value" style={{ fontSize: '1.25rem' }}>
              ~${parsed.minBetUsd.toFixed(2)} USD
            </div>
          </div>
        )}
        {parsed.targetMultipliers?.length > 0 && (
          <div className="hunter-kpi-card" style={{ padding: '1rem' }}>
            <div className="hunter-kpi-label">Target multipliers (estimated)</div>
            <div className="hunter-kpi-value" style={{ fontSize: '1.15rem' }}>
              {parsed.targetMultipliers.map((n) => (Number.isInteger(n) ? n : n.toFixed(2))).join(' · ')}×
            </div>
          </div>
        )}
        {(parsed.durationHint || parsed.statusHint) && (
          <div className="hunter-kpi-card" style={{ padding: '1rem' }}>
            <div className="hunter-kpi-label">Status / Duration</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.4 }}>
              {parsed.statusHint && <div>{parsed.statusHint}</div>}
              {parsed.durationHint && <div className="hunter-meta">{parsed.durationHint}</div>}
            </div>
          </div>
        )}
      </div>

      {parsed.games.length > 0 && (
        <div className="hunter-found-panel" style={{ maxHeight: 'none' }}>
          <div className="hunter-found-head">Games from text (check to select)</div>
          <div className="hunter-found-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {parsed.games.map((g) => {
                const known = webSlots.some((w) => w.slug === g.slug)
                return (
                  <label
                    key={g.slug}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      padding: '0.55rem 0.65rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      background: checkedSlugs.has(g.slug) ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-deep))' : 'var(--bg-deep)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checkedSlugs.has(g.slug)}
                      onChange={() => toggleSlug(g.slug)}
                      style={{ marginTop: '0.2rem' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{g.name}</div>
                      <div className="hunter-meta" style={{ wordBreak: 'break-all' }}>
                        {g.slug}
                        {!known && (
                          <span style={{ color: 'var(--warning)', marginLeft: '0.35rem' }}>(discovered when adding)</span>
                        )}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {parsed.prizeLines.length > 0 && (
        <div className="hunter-card">
          <div className="hunter-section-title" style={{ marginBottom: '0.5rem' }}>
            Prizes / Notes (excerpt)
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {parsed.prizeLines.map((line, i) => (
              <li key={i} style={{ marginBottom: '0.25rem' }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft.trim() && parsed.games.length === 0 && (
        <div className="hunter-empty" style={{ padding: '1.25rem' }}>
          No <code style={{ color: 'var(--accent)' }}>stake.com/casino/games/...</code> links detected. Make sure the
          message contains full URLs (as copied from the Telegram client).
        </div>
      )}
    </div>
  )
}
