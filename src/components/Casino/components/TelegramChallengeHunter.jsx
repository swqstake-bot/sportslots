/**
 * Telegram Challenge Hunter: wie AutoChallengeHunter – eigene Queue, Run-Cards, Spin-Loop.
 * Kein Wechsel zum Play-Tab.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchCurrencyRates } from '../api/stakeChallenges'
import { isFiat, toUnits } from '../utils/formatAmount'
import { parseTelegramStakeMessage } from '../utils/parseTelegramStakeMessage'
import { setTelegramSlotTargets, clearTelegramSlotTargets } from '../utils/hunterSlotTargetsBridge'
import { runTelegramChallengeSession } from '../utils/telegramHunterRun'
import { Button } from './ui/Button'
import { CURRENCY_GROUPS } from '../constants/currencies'
import { requestNotificationPermission } from '../utils/notifications'
import {
  usdLimitToInputStr,
  parseUsdLimitInput,
  isUsdLimitInputCharsOk,
} from '../utils/usdLimitInput'
import { parsePacksChallengeHints } from '../utils/packsOriginalsChallenge'

const CHALLENGE_SLIDER_MAX = 24
const DRAFT_KEY = 'slotbot_telegram_challenge_draft_v1'
const BEST_MULTI_STORAGE_KEY = 'slotbot_hunter_best_multi_by_slug'
const CHALLENGE_HITS_STORAGE_KEY = 'slotbot_hunter_challenge_hits'
/** GraphQL casesBet — `identifier` aus Network-Variables (Spiel „Packs“). */
const TG_CASES_BET_ID_KEY = 'slotbot_tg_cases_bet_identifier_v1'
const TG_CASES_BET_CHAIN_KEY = 'slotbot_tg_cases_bet_chain_identifier_v1'
const TG_CASES_BET_DIFFICULTY_KEY = 'slotbot_tg_cases_bet_difficulty_v1'
const CASES_DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'expert']
const DIRECT_ORIGINALS_SLUGS = new Set(['packs', 'dice', 'limbo', 'mines', 'plinko', 'keno'])

function getRateForCurrency(rates, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (c === 'usd') return 1
  return rates[c] || 0
}

function minorToUsd(amountMinor, currency, rates) {
  if (amountMinor == null || currency == null) return 0
  const n = Number(amountMinor)
  if (!Number.isFinite(n)) return 0
  const c = String(currency).toLowerCase()
  const r = getRateForCurrency(rates, c)
  if (!r) return 0
  return toUnits(n, c) * r
}

function persistChallengeHitRecord(entry) {
  try {
    const raw = localStorage.getItem(CHALLENGE_HITS_STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return
    arr.unshift({ ...entry, at: Date.now() })
    localStorage.setItem(CHALLENGE_HITS_STORAGE_KEY, JSON.stringify(arr.slice(0, 500)))
  } catch (_) {}
}

function loadBestMultiMap() {
  try {
    const raw = localStorage.getItem(BEST_MULTI_STORAGE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return {}
    return o
  } catch {
    return {}
  }
}

function persistBestMultiMap(map) {
  try {
    localStorage.setItem(BEST_MULTI_STORAGE_KEY, JSON.stringify(map))
  } catch (_) {}
}

function pickPrimaryTargetMultiplier(parsed) {
  const m = parsed.targetMultipliers || []
  const ge2 = m.filter((x) => x >= 2)
  const use = ge2.length ? ge2 : m
  if (use.length === 0) return 100
  return Math.min(...use)
}

/** Originals-Telegram-Posts haben oft kein „100×“ – dann kein Multi-Stopp (nur Limits / manuell). */
function shouldUseOriginalsOpenEnded(parsed) {
  if (!parsed?.isOriginalsChallenge) return false
  const m = parsed.targetMultipliers || []
  return m.length === 0
}

function getElectronApi() {
  if (typeof window === 'undefined') return null
  return window.electronAPI ?? null
}

function buildTelegramChallenge(parsed, game, messageKey) {
  const id = `tg_${messageKey}_${game.slug}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  const isOriginalBySlug = DIRECT_ORIGINALS_SLUGS.has(String(game?.slug || '').toLowerCase())
  const originalsOpenEnded = shouldUseOriginalsOpenEnded(parsed)
  const tgt = originalsOpenEnded ? 0 : pickPrimaryTargetMultiplier(parsed)
  const defaultMin =
    parsed.isOriginalsChallenge &&
    (parsed.minBetUsd == null || !Number.isFinite(parsed.minBetUsd))
      ? 0.01
      : 0.1
  const minBet =
    parsed.minBetUsd != null && Number.isFinite(parsed.minBetUsd) && parsed.minBetUsd > 0
      ? parsed.minBetUsd
      : defaultMin
  return {
    id,
    gameSlug: game.slug,
    game: { slug: game.slug, name: game.name },
    gameName: game.name,
    minBetUsd: minBet,
    targetMultiplier: tgt,
    originalsOpenEnded,
    isOriginalsChallenge: !!parsed.isOriginalsChallenge || isOriginalBySlug,
    originalsObjective: parsed.originalsObjectiveHint || null,
    packsHints:
      game.slug === 'packs' ? parsePacksChallengeHints(parsed.originalsObjectiveHint || '') : null,
    award: null,
    active: true,
    telegramMessageKey: messageKey,
  }
}

const STYLES = {
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    marginBottom: '0.25rem',
    fontVariantNumeric: 'tabular-nums',
  },
}

export default function TelegramChallengeHunter({ accessToken, webSlots = [], onDiscoveredSlots }) {
  const [draft, setDraft] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) || ''
    } catch {
      return ''
    }
  })
  const [challenges, setChallenges] = useState([])
  const [queue, setQueue] = useState([])
  const [activeRuns, setActiveRuns] = useState({})
  const [rates, setRates] = useState({})
  const [totalSessionStats, setTotalSessionStats] = useState({ wagered: 0, won: 0, lost: 0 })
  const [bestMultiBySlot, setBestMultiBySlot] = useState(() => loadBestMultiMap())
  const [logs, setLogs] = useState([])
  const [autoStart, setAutoStart] = useState(true)

  const [sourceCurrency, setSourceCurrency] = useState('xrp')
  const [targetCurrency, setTargetCurrency] = useState('usd')
  const [maxParallel, setMaxParallel] = useState(4)
  const [stopLoss, setStopLoss] = useState(0)
  const [stopProfit, setStopProfit] = useState(0)
  const [stopLossStr, setStopLossStr] = useState('')
  const [stopProfitStr, setStopProfitStr] = useState('')
  const [autoOptimalTargetCurrency, setAutoOptimalTargetCurrency] = useState(true)
  const [casesBetIdentifierStr, setCasesBetIdentifierStr] = useState(() => {
    try {
      return localStorage.getItem(TG_CASES_BET_ID_KEY) || ''
    } catch {
      return ''
    }
  })
  const [chainCasesBetIdentifier, setChainCasesBetIdentifier] = useState(() => {
    try {
      const raw = localStorage.getItem(TG_CASES_BET_CHAIN_KEY)
      if (raw == null || raw === '') return false
      if (raw === '0' || raw === 'false') return false
      return true
    } catch {
      return false
    }
  })
  const [casesBetDifficulty, setCasesBetDifficulty] = useState(() => {
    try {
      const raw = (localStorage.getItem(TG_CASES_BET_DIFFICULTY_KEY) || 'medium').toLowerCase()
      return CASES_DIFFICULTY_OPTIONS.includes(raw) ? raw : 'medium'
    } catch {
      return 'medium'
    }
  })

  const [apiIdStr, setApiIdStr] = useState('')
  const [apiHashStr, setApiHashStr] = useState('')
  const [phoneStr, setPhoneStr] = useState('')
  const [channelStr, setChannelStr] = useState('')
  const [listening, setListening] = useState(false)
  const [listenBusy, setListenBusy] = useState(false)
  const [listenError, setListenError] = useState('')
  const [lastLivePreview, setLastLivePreview] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [codeViaApp, setCodeViaApp] = useState(false)
  const [passwordHint, setPasswordHint] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [authPassword, setAuthPassword] = useState('')

  const runnersRef = useRef({})
  const activeRunsRef = useRef(activeRuns)
  const totalStatsRef = useRef(totalSessionStats)
  const challengesRef = useRef(challenges)
  const webSlotsRef = useRef(webSlots)
  const processedPairRef = useRef(new Set())

  useEffect(() => {
    activeRunsRef.current = activeRuns
  }, [activeRuns])
  useEffect(() => {
    totalStatsRef.current = totalSessionStats
  }, [totalSessionStats])
  useEffect(() => {
    challengesRef.current = challenges
  }, [challenges])
  useEffect(() => {
    webSlotsRef.current = webSlots
  }, [webSlots])

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, draft)
    } catch {
      /* ignore */
    }
  }, [draft])

  useEffect(() => {
    try {
      localStorage.setItem(TG_CASES_BET_ID_KEY, casesBetIdentifierStr)
    } catch {
      /* ignore */
    }
  }, [casesBetIdentifierStr])

  useEffect(() => {
    try {
      localStorage.setItem(TG_CASES_BET_CHAIN_KEY, chainCasesBetIdentifier ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [chainCasesBetIdentifier])

  const log = useCallback((msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 120))
  }, [])

  const parsed = useMemo(() => parseTelegramStakeMessage(draft), [draft])

  useEffect(() => {
    if (!accessToken) return
    fetchCurrencyRates(accessToken).then(setRates).catch(() => setRates({}))
  }, [accessToken])

  useEffect(() => {
    const next = {}
    for (const run of Object.values(activeRuns)) {
      if (run?.status !== 'running' || !run.slotSlug) continue
      if (run?.originalsOpenEnded) continue
      const m = Number(run.targetMultiplier)
      if (!Number.isFinite(m) || m <= 0) continue
      const slug = run.slotSlug
      if (!next[slug]) next[slug] = []
      next[slug].push(m)
    }
    for (const k of Object.keys(next)) {
      next[k] = [...new Set(next[k])].sort((a, b) => a - b)
    }
    setTelegramSlotTargets(next)
  }, [activeRuns])

  const refreshTgStatus = useCallback(async () => {
    const api = getElectronApi()
    if (!api?.invoke) return
    try {
      await api.invoke('telegram-status')
    } catch {
      /* ignore */
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
    })()
  }, [])

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

  const enqueueFromParsed = useCallback(
    (p, messageKey) => {
      if (!p.games.length) return
      const newChallenges = []
      for (const g of p.games) {
        const pairId = `${messageKey}::${g.slug}`
        if (processedPairRef.current.has(pairId)) continue
        processedPairRef.current.add(pairId)
        newChallenges.push(buildTelegramChallenge(p, g, messageKey))
      }
      if (newChallenges.length === 0) return
      setChallenges((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        const merged = [...prev]
        for (const c of newChallenges) {
          if (!seen.has(c.id)) {
            seen.add(c.id)
            merged.push(c)
          }
        }
        return merged
      })
      setQueue((q) => [...q, ...newChallenges.map((c) => c.id).filter((id) => !q.includes(id))])
      log(`${newChallenges.length} Eintrag(e) aus Telegram in die Warteschlange.`)

      const known = new Set(webSlotsRef.current.map((s) => s.slug))
      const added = []
      for (const g of p.games) {
        if (!known.has(g.slug)) {
          known.add(g.slug)
          const isOriginal = !!p.isOriginalsChallenge || DIRECT_ORIGINALS_SLUGS.has(String(g.slug || '').toLowerCase())
          added.push({
            slug: g.slug,
            name: g.name,
            providerId: isOriginal || g.slug === 'packs' ? 'stakeOriginals' : 'stakeEngine',
          })
        }
      }
      if (added.length) onDiscoveredSlots?.(added)
    },
    [log, onDiscoveredSlots]
  )

  useEffect(() => {
    const api = getElectronApi()
    if (!api?.on) return undefined
    const off = api.on('telegram-live-message', (payload) => {
      const text = typeof payload?.text === 'string' ? payload.text : ''
      if (!text.trim()) return
      setLastLivePreview(text.length > 200 ? `${text.slice(0, 200)}…` : text)
      const p = parseTelegramStakeMessage(text)
      const mid = payload?.id != null ? String(payload.id) : `t${Date.now()}`
      enqueueFromParsed(p, mid)
    })
    return () => off()
  }, [enqueueFromParsed])

  const handleManualQueue = useCallback(() => {
    requestNotificationPermission()
    const key = `manual_${Date.now()}`
    enqueueFromParsed(parsed, key)
  }, [parsed, enqueueFromParsed])

  /** ERR_IPB, Stop Loss, Stop Profit: nicht weiter aus der Warteschlange starten. */
  const clearTelegramQueueAfterGlobalStop = useCallback(() => {
    setAutoStart(false)
    setQueue([])
    processedPairRef.current.clear()
  }, [])

  const startTelegramRun = useCallback(
    async (challengeId) => {
      const challenge = challengesRef.current.find((c) => c.id === challengeId)
      if (!challenge) {
        log(`Challenge ${challengeId} nicht gefunden.`)
        return
      }
      const gSlug = challenge.gameSlug || challenge.game?.slug
      const gName = challenge.gameName || challenge.game?.name || gSlug
      let slot = (webSlotsRef.current || []).find((s) => s.slug === gSlug)
      if (!slot) {
        const isOriginal =
          !!challenge?.isOriginalsChallenge || DIRECT_ORIGINALS_SLUGS.has(String(gSlug || '').toLowerCase())
        slot = {
          slug: gSlug,
          name: gName || gSlug,
          providerId: isOriginal || gSlug === 'packs' ? 'stakeOriginals' : 'stakeEngine',
        }
      }

      await runTelegramChallengeSession({
        challenge,
        challengeId,
        accessToken,
        slot,
        rates,
        sourceCurrency,
        targetCurrency,
        autoOptimalTargetCurrency,
        stopLoss,
        stopProfit,
        runnersRef,
        setActiveRuns,
        setTotalSessionStats,
        totalStatsRef,
        log,
        setBestMultiBySlot,
        persistBestMultiMap,
        persistChallengeHitRecord,
        onInsufficientBalance: clearTelegramQueueAfterGlobalStop,
        onSessionStopLimit: clearTelegramQueueAfterGlobalStop,
        casesBetIdentifier: casesBetIdentifierStr,
        chainCasesBetIdentifier,
        casesBetDifficulty,
      })
    },
    [
      accessToken,
      rates,
      sourceCurrency,
      targetCurrency,
      autoOptimalTargetCurrency,
      stopLoss,
      stopProfit,
      log,
      clearTelegramQueueAfterGlobalStop,
      casesBetIdentifierStr,
      chainCasesBetIdentifier,
      casesBetDifficulty,
    ]
  )

  const activeRunList = useMemo(() => Object.entries(activeRuns).map(([id, run]) => ({ id, ...run })), [activeRuns])
  const runningCount = activeRunList.filter((r) => r.status === 'running').length
  const maxParallelClamped = Math.min(CHALLENGE_SLIDER_MAX, Math.max(1, maxParallel))
  const netUsd = totalSessionStats.won - totalSessionStats.lost

  useEffect(() => {
    if (!autoStart || queue.length === 0) return
    if (runningCount >= maxParallelClamped) return
    const nextId = queue[0]
    setQueue((q) => q.slice(1))
    startTelegramRun(nextId)
  }, [autoStart, queue, runningCount, maxParallelClamped, startTelegramRun])

  const stopAllRunners = useCallback(() => {
    Object.keys(runnersRef.current).forEach((id) => {
      if (runnersRef.current[id]) runnersRef.current[id].stop = true
    })
    setAutoStart(false)
    setQueue([])
    log('Alle Telegram-Läufe gestoppt, Warteschlange geleert.')
  }, [log])

  const stopSingleRunner = (runId) => {
    if (runnersRef.current[runId]) runnersRef.current[runId].stop = true
  }

  const removeRun = (runId) => {
    if (runnersRef.current[runId]) {
      runnersRef.current[runId].stop = true
      delete runnersRef.current[runId]
    }
    setActiveRuns((prev) => {
      const next = { ...prev }
      delete next[runId]
      return next
    })
    setQueue((q) => q.filter((id) => id !== runId))
  }

  const resetTelegramHunter = useCallback(() => {
    Object.keys(runnersRef.current).forEach((id) => {
      if (runnersRef.current[id]) runnersRef.current[id].stop = true
    })
    runnersRef.current = {}
    setQueue([])
    setActiveRuns({})
    setChallenges([])
    processedPairRef.current.clear()
    clearTelegramSlotTargets()
    setTotalSessionStats({ wagered: 0, won: 0, lost: 0 })
    setAutoStart(false)
    log('Telegram-Hunter zurückgesetzt.')
  }, [log])

  const electron = getElectronApi()

  return (
    <div className="hunter-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="hunter-header">
        <div className="hunter-title">Telegram Challenge Hunter</div>
        <p className="hunter-meta" style={{ maxWidth: '56rem', lineHeight: 1.45 }}>
          Läuft <strong>eigenständig</strong> wie der Auto-Hunter: Warteschlange, parallele Runs, Ziel-Multi –{' '}
          <strong>ohne</strong> Wechsel zum Play-Tab. Telegram liefert neue Challenges (Live oder Text in die Queue).
        </p>
      </div>

      {electron?.invoke && (
        <div className="hunter-card" style={{ padding: '1rem' }}>
          <div className="hunter-section-title" style={{ marginBottom: '0.5rem' }}>
            Telegram (GramJS)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
            <input
              value={apiIdStr}
              onChange={(e) => setApiIdStr(e.target.value)}
              placeholder="API-ID"
              style={{ padding: '0.45rem', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
            />
            <input
              type="password"
              value={apiHashStr}
              onChange={(e) => setApiHashStr(e.target.value)}
              placeholder="API-Hash"
              style={{ padding: '0.45rem', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
            />
            <input
              value={phoneStr}
              onChange={(e) => setPhoneStr(e.target.value)}
              placeholder="Telefon E.164"
              style={{ padding: '0.45rem', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
            />
            <input
              value={channelStr}
              onChange={(e) => setChannelStr(e.target.value)}
              placeholder="@kanal"
              style={{ padding: '0.45rem', background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const r = await electron.invoke('telegram-config-set', {
                  apiId: parseInt(apiIdStr, 10),
                  apiHash: apiHashStr.trim(),
                })
                if (!r?.ok) setLoginError(r?.error || 'Fehler')
                else setLoginError('')
              }}
            >
              API speichern
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={loginBusy}
              onClick={async () => {
                setLoginError('')
                setLoginBusy(true)
                try {
                  const r = await electron.invoke('telegram-login', {
                    phone: phoneStr.trim(),
                    apiId: parseInt(apiIdStr, 10),
                    apiHash: apiHashStr.trim(),
                  })
                  if (!r?.ok) setLoginError(r?.error || 'Login fehlgeschlagen')
                  await refreshTgStatus()
                } finally {
                  setLoginBusy(false)
                  setNeedsCode(false)
                  setNeedsPassword(false)
                }
              }}
            >
              Telegram Login
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={listenBusy || listening || !channelStr.trim()}
              onClick={async () => {
                setListenError('')
                setListenBusy(true)
                try {
                  const r = await electron.invoke('telegram-listen-start', { channel: channelStr.trim() })
                  setListening(!!r?.ok)
                  if (!r?.ok) setListenError(r?.error || '')
                } finally {
                  setListenBusy(false)
                }
              }}
            >
              Live lauschen
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!listening}
              onClick={async () => {
                await electron.invoke('telegram-listen-stop')
                setListening(false)
              }}
            >
              Live stoppen
            </Button>
          </div>
          {loginError && <p style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{loginError}</p>}
          {listenError && <p style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{listenError}</p>}
          {needsCode && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input value={authCode} onChange={(e) => setAuthCode(e.target.value)} placeholder="Code" />
              <Button onClick={() => electron.invoke('telegram-submit-auth-code', authCode)}>OK</Button>
            </div>
          )}
          {needsPassword && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="2FA"
              />
              <Button onClick={() => electron.invoke('telegram-submit-auth-password', authPassword)}>OK</Button>
            </div>
          )}
          {lastLivePreview && (
            <p className="hunter-meta" style={{ fontSize: '0.72rem', marginTop: '0.35rem' }}>
              Letzte Nachricht: {lastLivePreview}
            </p>
          )}
        </div>
      )}

      <div className="hunter-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '1rem', alignItems: 'start' }}>
        <div className="hunter-card" style={{ padding: '1rem' }}>
          <h3 className="hunter-section-title">Einstellungen (Run)</h3>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quelle (Crypto)</label>
            <select
              value={sourceCurrency}
              onChange={(e) => setSourceCurrency(e.target.value)}
              style={{ width: '100%', padding: '0.35rem', marginTop: '0.2rem' }}
            >
              {CURRENCY_GROUPS.crypto.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ziel</label>
            <select
              value={targetCurrency}
              onChange={(e) => setTargetCurrency(e.target.value)}
              style={{ width: '100%', padding: '0.35rem', marginTop: '0.2rem' }}
            >
              {CURRENCY_GROUPS.fiat.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option disabled>— Crypto —</option>
              {CURRENCY_GROUPS.crypto.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={autoOptimalTargetCurrency}
              onChange={(e) => setAutoOptimalTargetCurrency(e.target.checked)}
            />
            Zielwährung automatisch (wie Hunter)
          </label>
          <div
            style={{
              marginBottom: '0.65rem',
              padding: '0.5rem',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-deep)',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Packs / Cases (GraphQL <code style={{ fontSize: '0.7rem' }}>casesBet</code>): Pflichtfelder{' '}
              <code style={{ fontSize: '0.65rem' }}>amount, currency, identifier, difficulty</code>.{' '}
              <code style={{ fontSize: '0.7rem' }}>state</code> nur als{' '}
              <code style={{ fontSize: '0.65rem' }}>... on CasinoGamePacks</code> (Karten).
            </div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              difficulty (CasesDifficultyEnum)
            </label>
            <select
              value={casesBetDifficulty}
              onChange={(e) => setCasesBetDifficulty(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem',
                marginBottom: '0.35rem',
                fontSize: '0.8rem',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text)',
              }}
            >
              {CASES_DIFFICULTY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              value={casesBetIdentifierStr}
              onChange={(e) => setCasesBetIdentifierStr(e.target.value)}
              placeholder='identifier, z. B. "fzaf3vK72t9KR__-KKvtG"'
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '0.4rem',
                marginBottom: '0.35rem',
                fontSize: '0.78rem',
                fontFamily: 'ui-monospace, monospace',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text)',
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
              <input
                type="checkbox"
                checked={chainCasesBetIdentifier}
                onChange={(e) => setChainCasesBetIdentifier(e.target.checked)}
              />
              Nächsten Spin mit Bet-<code style={{ fontSize: '0.68rem' }}>id</code> aus der Antwort (Kette)
            </label>
          </div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Parallel max.</label>
          <input
            type="range"
            min={1}
            max={CHALLENGE_SLIDER_MAX}
            value={maxParallelClamped}
            onChange={(e) => setMaxParallel(parseInt(e.target.value, 10) || 1)}
            style={{ width: '100%' }}
          />
          <div style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            {maxParallelClamped}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.7rem' }}>Stop Loss USD</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0 = aus"
                value={stopLossStr}
                onChange={(e) => {
                  const raw = e.target.value
                  if (!isUsdLimitInputCharsOk(raw)) return
                  setStopLossStr(raw)
                  setStopLoss(parseUsdLimitInput(raw))
                }}
                onBlur={() => {
                  const v = parseUsdLimitInput(stopLossStr)
                  setStopLoss(v)
                  setStopLossStr(usdLimitToInputStr(v))
                }}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem' }}>Stop Profit USD</label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0 = aus"
                value={stopProfitStr}
                onChange={(e) => {
                  const raw = e.target.value
                  if (!isUsdLimitInputCharsOk(raw)) return
                  setStopProfitStr(raw)
                  setStopProfit(parseUsdLimitInput(raw))
                }}
                onBlur={() => {
                  const v = parseUsdLimitInput(stopProfitStr)
                  setStopProfit(v)
                  setStopProfitStr(usdLimitToInputStr(v))
                }}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <Button variant={autoStart ? 'success' : 'outline'} onClick={() => setAutoStart((a) => !a)}>
              Auto-Start: {autoStart ? 'an' : 'aus'}
            </Button>
            <Button variant="danger" onClick={stopAllRunners}>
              Alle stoppen
            </Button>
            <Button variant="secondary" onClick={resetTelegramHunter}>
              Zurücksetzen
            </Button>
          </div>
        </div>

        <div className="hunter-main" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="hunter-card" style={{ padding: '1rem' }}>
            <div className="hunter-section-title">Text → Warteschlange</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              placeholder="Nachricht mit stake.com/casino/games/… einfügen"
              style={{
                width: '100%',
                padding: '0.5rem',
                background: 'var(--bg-deep)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: '0.85rem',
              }}
            />
            <Button style={{ marginTop: '0.5rem' }} onClick={handleManualQueue} disabled={!parsed.games.length}>
              Erkannte Spiele in die Warteschlange
            </Button>
            <p className="hunter-meta" style={{ marginTop: '0.35rem', fontSize: '0.72rem' }}>
              Erkannt: {parsed.games.length} Spiel(e), Min. ${parsed.minBetUsd?.toFixed(2) ?? '—'},{' '}
              {shouldUseOriginalsOpenEnded(parsed) ? (
                <>Originals (kein Multi-Ziel im Text – Spin bis Limit/Stop)</>
              ) : (
                <>Ziel-Multi ~{pickPrimaryTargetMultiplier(parsed)}×</>
              )}
              {parsed.isOriginalsChallenge && (
                <span style={{ display: 'block', marginTop: '0.2rem', opacity: 0.9 }}>
                  Originals Challenge
                  {parsed.originalsObjectiveHint ? ` — ${parsed.originalsObjectiveHint}` : ''}
                </span>
              )}
            </p>
          </div>

          <div className="hunter-kpi-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div className="hunter-kpi-card" style={{ padding: '0.65rem 1rem' }}>
              <div className="hunter-kpi-label">Queue</div>
              <div className="hunter-kpi-value">{queue.length}</div>
            </div>
            <div className="hunter-kpi-card" style={{ padding: '0.65rem 1rem' }}>
              <div className="hunter-kpi-label">Läuft</div>
              <div className="hunter-kpi-value">
                {runningCount}/{maxParallelClamped}
              </div>
            </div>
            <div className="hunter-kpi-card" style={{ padding: '0.65rem 1rem' }}>
              <div className="hunter-kpi-label">Netto USD</div>
              <div className="hunter-kpi-value" style={{ color: netUsd >= 0 ? 'var(--success)' : 'var(--error)' }}>
                ${netUsd.toFixed(2)}
              </div>
            </div>
          </div>

          {activeRunList.length === 0 ? (
            <div className="hunter-empty">Keine aktiven Telegram-Runs. Queue füllen oder Live einschalten.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {activeRunList.map((run) => {
                const prizeLine = { main: run.prizeDisplay ?? '—', hint: run.prizeHint }
                return (
                  <div key={run.id} className="hunter-run-card">
                    <div className="hunter-run-card-inner">
                      <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{run.slotName}</div>
                      <div style={STYLES.statRow}>
                        <span>Status</span>
                        <span>{run.status === 'running' ? '● läuft' : run.status}</span>
                      </div>
                      <div style={STYLES.statRow}>
                        <span>Spins</span>
                        <span>{run.spins}</span>
                      </div>
                      <div style={STYLES.statRow}>
                        <span>Ziel-Multi</span>
                        <span
                          style={{ color: 'var(--accent)', fontWeight: 600, textAlign: 'right', maxWidth: '65%' }}
                          title={run.originalsObjective || ''}
                        >
                          {run.originalsOpenEnded ? 'Originals (offen)' : `${run.targetMultiplier}×`}
                        </span>
                      </div>
                      {run.originalsObjective ? (
                        <div style={{ ...STYLES.statRow, fontSize: '0.72rem', opacity: 0.9 }}>
                          <span>Aufgabe</span>
                          <span style={{ textAlign: 'right', maxWidth: '70%' }}>{run.originalsObjective}</span>
                        </div>
                      ) : null}
                      <div style={STYLES.statRow}>
                        <span>Max (Run)</span>
                        <span>{(run.bestMultiRun ?? 0).toFixed(2)}×</span>
                      </div>
                      <div style={STYLES.statRow}>
                        <span>Rekord Slot</span>
                        <span>
                          {run.slotSlug && bestMultiBySlot[run.slotSlug] != null
                            ? `${bestMultiBySlot[run.slotSlug].toFixed(2)}×`
                            : '—'}
                        </span>
                      </div>
                      <div style={STYLES.statRow}>
                        <span>Preis (TG)</span>
                        <span>{prizeLine.main}</span>
                      </div>
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <Button variant="secondary" disabled={run.status !== 'running'} onClick={() => stopSingleRunner(run.id)}>
                          Stop
                        </Button>
                        <Button variant="outline" onClick={() => removeRun(run.id)}>
                          Entfernen
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="hunter-log" style={{ maxHeight: 200, overflow: 'auto', fontSize: '0.75rem' }}>
            {logs.map((l, i) => (
              <div key={i} className="hunter-log-line">
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
