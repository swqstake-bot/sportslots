/**
 * Originals Script Mode – Scripts (.js) und Profile (.json) laden & ausführen,
 * plus Script Builder (Mechaniken → Profil exportieren).
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import OriginalsProfitChart, { profitsToChartData } from '../OriginalsProfitChart'
import { Button } from '../ui/Button'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import OriginalsScriptBuilder from './scriptBuilder/OriginalsScriptBuilder'
import { runProfileJson, runScriptAsProfile } from './scriptEngine/runScript'
import { formatScriptSessionDuration, type ScriptSessionStats } from './scriptEngine/scriptSessionStats'
import { isScriptDisplayableBetShareId } from './scriptEngine/scriptHouseBetIdBridge'
import { useCasinoBetListReset } from '../../utils/casinoBetSession'
import {
  KENO_B2B_INFINITY_WAGER_PROFILE_JSON,
  KENO_B2B_INFINITY_WAGER_SCRIPT,
  KENO_B2B_COMPLEX_TP_PROFILE_JSON,
  KENO_B2B_COMPLEX_TP_SCRIPT,
  KENO_B2B_HIGH_10_500_PROFILE_JSON,
} from './keno/kenoWageringProfile'
import {
  LIMBO_B2B_RANDOM_MULTI_200_PROFILE_JSON,
  LIMBO_B2B_RANDOM_MULTI_200_SCRIPT,
} from './limbo/limboWageringProfile'
import { ALL_CURRENCIES, CURRENCY_GROUPS } from '../../constants/currencies'

type ScriptSubTab = 'run' | 'builder'

type BetRow = {
  betIndex: number
  game: string
  betId: string | null
  betSizeUsd: number
  payoutUsd: number
  roundProfitUsd: number
  multi: number
  b2bMulti: number
  win: boolean
}

function shortenBetId(id: string, max = 14): string {
  if (id.length <= max) return id
  return `${id.slice(0, max)}…`
}

/** Kleine Crypto-/B2B-Einsätze nicht auf 2 Dezimalen künstlich runden. */
function formatScriptUsd(n: number): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v !== 0 && Math.abs(v) < 0.1) return v.toFixed(4)
  return v.toFixed(2)
}

/** Kumulativer Profit pro Bet-Index (1-basiert, wie stats.bets). */
function upsertChartProfit(prev: number[], betIndex: number, profit: number): number[] {
  if (betIndex < 1) return prev
  const idx = betIndex - 1
  if (idx < prev.length) {
    const next = [...prev]
    next[idx] = profit
    return next
  }
  if (idx === prev.length) {
    return [...prev, profit]
  }
  return prev
}

function StatItem({
  label,
  value,
  valueClass = 'text-[var(--text)]',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="min-w-0 leading-none" title={`${label}: ${value}`}>
      <div className="text-[9px] text-[var(--text-muted)] truncate">{label}</div>
      <div className={`text-[11px] font-medium tabular-nums truncate ${valueClass}`}>{value}</div>
    </div>
  )
}

function ScriptStatsPanel({ stats, wide = false }: { stats: ScriptSessionStats; wide?: boolean }) {
  const profitCls = stats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
  const green = 'text-emerald-400'
  const items: { label: string; value: string; valueClass?: string }[] = [
    { label: 'Bets', value: String(stats.bets) },
    { label: 'Wagered', value: `$${formatScriptUsd(stats.totalWagered)}` },
    { label: 'W / L', value: `${stats.wins} / ${stats.losses}` },
    { label: 'Win%', value: `${stats.bets ? ((stats.wins / stats.bets) * 100).toFixed(1) : '0'}%` },
    { label: 'Profit', value: `${stats.profit >= 0 ? '+' : ''}$${formatScriptUsd(stats.profit)}`, valueClass: profitCls },
    { label: 'Max×', value: stats.maxMulti > 0 ? `${stats.maxMulti.toFixed(2)}×` : '—' },
    {
      label: 'B2B×',
      value: stats.maxB2bMulti > 1.001 ? `${stats.maxB2bMulti.toFixed(2)}×` : '—',
      valueClass: stats.maxB2bMulti > 1.001 ? green : undefined,
    },
    {
      label: 'Best',
      value: stats.maxWinUsd > 0 ? `$${formatScriptUsd(stats.maxWinUsd)}` : '—',
      valueClass: stats.maxWinUsd > 0 ? green : undefined,
    },
    {
      label: 'Round+',
      value: stats.maxRoundProfitUsd > 0 ? `+$${formatScriptUsd(stats.maxRoundProfitUsd)}` : '—',
      valueClass: stats.maxRoundProfitUsd > 0 ? green : undefined,
    },
    { label: 'MaxBet', value: stats.maxBetUsd > 0 ? `$${formatScriptUsd(stats.maxBetUsd)}` : '—' },
    { label: 'Bets/s', value: stats.betsPerSec > 0 ? stats.betsPerSec.toFixed(2) : '—' },
    {
      label: 'B2B↑',
      value: stats.longestB2bStreak > 0 ? String(stats.longestB2bStreak) : '—',
      valueClass: stats.longestB2bStreak > 0 ? green : undefined,
    },
    { label: 'B2B', value: stats.currentB2bStreak > 0 ? String(stats.currentB2bStreak) : '—' },
    { label: 'Streak', value: stats.longestWinStreak > 0 ? String(stats.longestWinStreak) : '—' },
    { label: 'Time', value: formatScriptSessionDuration(stats.sessionElapsedMs) },
    { label: 'Peel', value: stats.b2bSecuredUsd > 0 ? `$${stats.b2bSecuredUsd.toFixed(2)}` : '—' },
    {
      label: 'Avg',
      value: stats.bets > 0 ? `$${(stats.totalWagered / stats.bets).toFixed(3)}` : '—',
    },
  ]
  return (
    <div
      className={
        wide
          ? 'grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-1.5 w-full'
          : 'grid grid-cols-4 sm:grid-cols-5 gap-x-2 gap-y-1.5 sm:w-[15.5rem] lg:w-[17rem] shrink-0 content-center'
      }
    >
      {items.map((item) => (
        <StatItem key={item.label} label={item.label} value={item.value} valueClass={item.valueClass} />
      ))}
    </div>
  )
}

function upsertBetRow(prev: BetRow[], row: BetRow): BetRow[] {
  const last = prev[prev.length - 1]
  if (last && last.betIndex === row.betIndex) {
    return [...prev.slice(0, -1), row]
  }
  return [...prev.slice(-29), row]
}

export default function OriginalsScriptView() {
  const [subTab, setSubTab] = useState<ScriptSubTab>('run')
  const [scriptPath, setScriptPath] = useState('')
  const [profilePath, setProfilePath] = useState('')
  const [scriptContent, setScriptContent] = useState('')
  const [profileContent, setProfileContent] = useState('')
  const [currency, setCurrency] = useState('usdc')
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const [lastStats, setLastStats] = useState<ScriptSessionStats | null>(null)
  const [chartProfits, setChartProfits] = useState<number[]>([])
  const [chartSessionKey, setChartSessionKey] = useState(0)
  const [betList, setBetList] = useState<BetRow[]>([])
  const [copiedBetIndex, setCopiedBetIndex] = useState<number | null>(null)
  const [appVersion, setAppVersion] = useState<string>('…')
  const stopRef = useRef<(() => void) | null>(null)
  const uiFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const executeScriptUiFlushRef = useRef<() => void>(() => {})
  const pendingUiRef = useRef<{
    stats: ScriptSessionStats | null
    bet: BetRow | null
  }>({ stats: null, bet: null })

  useEffect(() => {
    const api = (window as any).electronAPI
    void (async () => {
      if (api?.getAppVersion) {
        const v = await api.getAppVersion()
        setAppVersion(v ?? '…')
      } else if (api?.version) {
        setAppVersion(api.version)
      }
    })()
  }, [])

  const addLog = useCallback((msg: string) => {
    setLogLines((prev) => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`])
  }, [])

  const executeScriptUiFlush = useCallback(() => {
    uiFlushTimerRef.current = null
    const snap = pendingUiRef.current
    pendingUiRef.current = { stats: null, bet: null }
    if (snap.stats) {
      const stats = snap.stats
      setLastStats(stats)
      setChartProfits((prev) => upsertChartProfit(prev, stats.bets, stats.profit))
    }
    if (snap.bet) {
      setBetList((prev) => upsertBetRow(prev, snap.bet!))
    }
    if (pendingUiRef.current.stats || pendingUiRef.current.bet) {
      if (uiFlushTimerRef.current == null) {
        const delay = typeof document !== 'undefined' && document.hidden ? 50 : 16
        uiFlushTimerRef.current = setTimeout(() => executeScriptUiFlushRef.current(), delay)
      }
    }
  }, [])

  useEffect(() => {
    executeScriptUiFlushRef.current = executeScriptUiFlush
  }, [executeScriptUiFlush])

  const flushScriptUi = useCallback(() => {
    if (uiFlushTimerRef.current != null) return
    const delay = typeof document !== 'undefined' && document.hidden ? 50 : 16
    uiFlushTimerRef.current = setTimeout(executeScriptUiFlush, delay)
  }, [executeScriptUiFlush])

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return
      if (!pendingUiRef.current.stats && !pendingUiRef.current.bet) return
      if (uiFlushTimerRef.current != null) {
        clearTimeout(uiFlushTimerRef.current)
        uiFlushTimerRef.current = null
      }
      executeScriptUiFlush()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [executeScriptUiFlush])

  const handleStart = useCallback(async () => {
    const profileJson = profileContent.trim()
    const scriptCode = scriptContent.trim()
    if (!profileJson && !scriptCode) {
      addLog('Please paste profile JSON or script code.')
      return
    }
    addLog('Loading exchange rates (stake = USD)...')
    let usdRates: Record<string, number> = {}
    try {
      usdRates = (await fetchCurrencyRates('')) ?? {}
      if (Object.keys(usdRates).length > 0) addLog('Exchange rates loaded.')
    } catch {
      addLog('Exchange rates not loaded - stake is used 1:1 as currency unit.')
    }
    let accessToken: string | undefined
    try {
      accessToken = (await window.electronAPI?.getSessionToken?.()) ?? undefined
    } catch {
      accessToken = undefined
    }
    if (!accessToken?.trim()) {
      addLog('No session token — Bet IDs come from houseBets only after login.')
    }
    const callbacks = {
      onLog: addLog,
      onBetPlaced: (r: {
        error?: string
        betIndex?: number
        betId?: string | null
        game?: string
        betSizeUsd?: number
        payoutUsd?: number
        roundProfitUsd?: number
        multi?: number
        b2bMulti?: number
      }) => {
        if (r.error) addLog(r.error)
        else {
          const betSizeUsd = Number(r.betSizeUsd ?? 0)
          const payoutUsd = Number(r.payoutUsd ?? 0)
          const win = payoutUsd > 0
          const roundProfitUsd =
            r.roundProfitUsd != null
              ? Number(r.roundProfitUsd)
              : payoutUsd - betSizeUsd
          const multi =
            r.multi != null && Number.isFinite(Number(r.multi)) && Number(r.multi) > 0
              ? Number(r.multi)
              : win && betSizeUsd > 0
                ? payoutUsd / betSizeUsd
                : 0
          const b2bMulti = win ? Number(r.b2bMulti ?? 0) : 0
          pendingUiRef.current.bet = {
            betIndex: Number(r.betIndex ?? 0),
            game: (r.game || '—').toUpperCase(),
            betId: r.betId ?? null,
            betSizeUsd,
            payoutUsd,
            roundProfitUsd,
            multi,
            b2bMulti,
            win,
          }
          flushScriptUi()
        }
      },
      onStats: (stats: ScriptSessionStats) => {
        pendingUiRef.current.stats = stats
        flushScriptUi()
      },
      onStopped: () => setRunning(false),
      onSeedReset: () => {},
      onBetShareId: (betIndex: number, betId: string) => {
        setBetList((prev) =>
          prev.map((row) => (row.betIndex === betIndex ? { ...row, betId } : row))
        )
      },
    }
    if (profileJson) {
      const stop = runProfileJson(profileJson, currency, callbacks, usdRates, accessToken)
      if (stop) {
        stopRef.current = stop
        setChartProfits([])
        setChartSessionKey((k) => k + 1)
        setLastStats(null)
        setBetList([])
        setRunning(true)
        addLog('Profile started. Bet size = USD.')
      }
    } else if (scriptCode) {
      const looksLikeJson = scriptCode.startsWith('{') && (scriptCode.includes('"game"') || scriptCode.includes('"options"'))
      const stop = looksLikeJson
        ? runProfileJson(scriptCode, currency, callbacks, usdRates, accessToken)
        : runScriptAsProfile(scriptCode, currency, callbacks, usdRates, accessToken)
      if (stop) {
        stopRef.current = stop
        setChartProfits([])
        setChartSessionKey((k) => k + 1)
        setLastStats(null)
        setBetList([])
        setRunning(true)
        addLog(looksLikeJson ? 'Profile (JSON) started. Bet size = USD.' : 'Script config extracted, session started. Bet size = USD.')
      }
    }
  }, [profileContent, scriptContent, currency, addLog, flushScriptUi])

  const handleStop = useCallback(() => {
    if (stopRef.current) {
      stopRef.current()
      stopRef.current = null
      setRunning(false)
      addLog('Stopped.')
    }
  }, [addLog])

  const clearScriptRunSession = useCallback(() => {
    if (stopRef.current) {
      stopRef.current()
      stopRef.current = null
    }
    if (uiFlushTimerRef.current != null) {
      clearTimeout(uiFlushTimerRef.current)
      uiFlushTimerRef.current = null
    }
    pendingUiRef.current = { stats: null, bet: null }
    setRunning(false)
    setBetList([])
    setChartProfits([])
    setLastStats(null)
    setCopiedBetIndex(null)
    setChartSessionKey((k) => k + 1)
  }, [])

  useCasinoBetListReset(clearScriptRunSession)

  const handleResetStats = useCallback(() => {
    setChartProfits([])
    setChartSessionKey((k) => k + 1)
    setLastStats(null)
    setBetList([])
    setCopiedBetIndex(null)
    addLog('Statistics reset.')
  }, [addLog])

  const copyBetId = useCallback((betId: string, betIndex: number) => {
    void navigator.clipboard.writeText(betId).catch(() => {})
    setCopiedBetIndex(betIndex)
    window.setTimeout(() => setCopiedBetIndex((cur) => (cur === betIndex ? null : cur)), 2000)
  }, [])

  return (
    <div className="casino-card space-y-4">
      <h3 className="casino-card-header text-base flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="casino-card-header-accent" />
          Script mode
        </span>
        <span className="text-xs font-mono text-[var(--text-muted)]" title="App version (from main process, correct after auto-update)">
          v{appVersion}
        </span>
      </h3>

      <div className="flex gap-2 w-fit">
        <Button
          type="button"
          variant={subTab === 'run' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setSubTab('run')}
        >
          Run script
        </Button>
        <Button
          type="button"
          variant={subTab === 'builder' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setSubTab('builder')}
        >
          Script Builder
        </Button>
      </div>

      <div className={`space-y-4 ${subTab !== 'run' ? 'hidden' : ''}`}>
          <p className="text-sm text-[var(--text-muted)]">
            Paste a <strong>profile (.json)</strong> and press Start - or paste a <strong>script (.js)</strong>, then the config (game, stake, ...) is extracted and executed as a session. <strong>Stake is always in USD</strong> (e.g. 0.01 = $0.01); with another currency it is converted on start.
          </p>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-[var(--text-muted)]">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)]"
            >
              <optgroup label="Crypto">
                {CURRENCY_GROUPS.crypto.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="Fiat">
                {CURRENCY_GROUPS.fiat.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              {!ALL_CURRENCIES.some((c) => c.value === currency) && (
                <option value={currency}>{currency.toUpperCase()}</option>
              )}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Script (.js) — contents</label>
              <input
                type="text"
                value={scriptPath}
                onChange={(e) => setScriptPath(e.target.value)}
                placeholder="Optional: path"
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-2"
              />
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                placeholder="Paste script code (game=, initialBetSize=, ... are extracted)"
                rows={8}
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] outline-none resize-y"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Profile (.json) — contents</label>
              <input
                type="text"
                value={profilePath}
                onChange={(e) => setProfilePath(e.target.value)}
                placeholder="Optional: path"
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mb-2"
              />
              <textarea
                value={profileContent}
                onChange={(e) => setProfileContent(e.target.value)}
                placeholder='Paste profile JSON (e.g. { "name": "...", "options": { "game": "keno", ... } })'
                rows={8}
                className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] outline-none resize-y"
              />
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setProfileContent(KENO_B2B_INFINITY_WAGER_PROFILE_JSON)
                setScriptContent('')
                setProfilePath('keno-b2b-infinity-20k.json')
                addLog('Preset: Keno B2B Infinity Wager (Medium · 20k) → Profile JSON')
              }}
            >
              Preset: Keno B2B 20k
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setScriptContent(KENO_B2B_INFINITY_WAGER_SCRIPT)
                setProfileContent('')
                setScriptPath('keno-b2b-infinity.js')
                addLog('Preset: Keno B2B Script (Medium)')
              }}
            >
              Preset: Keno Script
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setProfileContent(KENO_B2B_COMPLEX_TP_PROFILE_JSON)
                setScriptContent('')
                setProfilePath('keno-b2b-complex-tp-20k.json')
                addLog('Preset: Keno B2B Complex TP (5 wins / mult / % · 20k)')
              }}
            >
              Preset: B2B Complex TP
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setScriptContent(KENO_B2B_COMPLEX_TP_SCRIPT)
                setProfileContent('')
                setScriptPath('keno-b2b-complex-tp.js')
                addLog('Preset: Keno B2B Complex TP Script')
              }}
            >
              Preset: Complex Script
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setProfileContent(KENO_B2B_HIGH_10_500_PROFILE_JSON)
                setScriptContent('')
                setProfilePath('keno-b2b-high-10-500.json')
                addLog('Preset: Keno High · 10 · B2B ($50 → $500)')
              }}
            >
              Preset: High·10 → $500
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setProfileContent(LIMBO_B2B_RANDOM_MULTI_200_PROFILE_JSON)
                setScriptContent('')
                setProfilePath('limbo-b2b-random-200.json')
                addLog('Preset: Limbo B2B Random 1.5–10× · $200 profit · ~$4.5k wagered')
              }}
            >
              Preset: Limbo B2B
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={running}
              onClick={() => {
                setScriptContent(LIMBO_B2B_RANDOM_MULTI_200_SCRIPT)
                setProfileContent('')
                setScriptPath('limbo-b2b-random.js')
                addLog('Preset: Limbo B2B Script (random multi 1.5–10×)')
              }}
            >
              Preset: Limbo Script
            </Button>
            <Button onClick={handleStart} disabled={running}>
              Start
            </Button>
            {running && (
              <Button onClick={handleStop} variant="secondary">
                Stop
              </Button>
            )}
            <Button onClick={handleResetStats} variant="secondary" disabled={running}>
              Reset stats
            </Button>
          </div>

          {(chartProfits.length > 0 || lastStats) && (
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Chart & stats</div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                {chartProfits.length > 0 && (
                  <div className="min-w-0 flex-1 h-32 shrink-0 overflow-hidden">
                    <OriginalsProfitChart
                      chartData={profitsToChartData(chartProfits)}
                      height={128}
                      domainResetKey={chartSessionKey}
                      compact
                    />
                  </div>
                )}
                {lastStats && (
                  <ScriptStatsPanel stats={lastStats} wide={chartProfits.length === 0} />
                )}
              </div>
            </div>
          )}

          <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Last 30 bets</div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)]/50">
            <div className="grid grid-cols-[minmax(3rem,auto)_minmax(5rem,1fr)_repeat(5,minmax(3rem,auto))] gap-x-2 gap-y-0 px-2 py-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-deep)]">
              <div>Game</div>
              <div>Bet ID</div>
              <div className="text-right">BetSize ($)</div>
              <div className="text-right">Payout ($)</div>
              <div className="text-right">Multi</div>
              <div className="text-right">B2B Multi</div>
              <div className="text-right">Round ($)</div>
            </div>
            {[...betList].reverse().map((b, i) => (
              <div
                key={`${b.betIndex}-${i}`}
                className="grid grid-cols-[minmax(3rem,auto)_minmax(5rem,1fr)_repeat(5,minmax(3rem,auto))] gap-x-2 gap-y-0 px-2 py-1.5 text-xs border-b border-[var(--border-subtle)]/60 items-center"
              >
                <div className="font-mono text-[var(--text)]">{b.game}</div>
                <div className="flex items-center gap-1 min-w-0">
                  {b.betId && isScriptDisplayableBetShareId(b.betId) ? (
                    <>
                      <span className="font-mono text-[10px] text-[var(--text-muted)] truncate" title={b.betId}>
                        {shortenBetId(b.betId, 18)}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--accent)] hover:bg-[var(--accent)]/10"
                        title={`Copy bet ID (${b.betId})`}
                        onClick={() => copyBetId(b.betId!, b.betIndex)}
                      >
                        {copiedBetIndex === b.betIndex ? '✓' : 'Copy'}
                      </button>
                    </>
                  ) : (
                    <span className="text-[var(--text-muted)]">—</span>
                  )}
                </div>
                <div className="text-right font-mono text-[var(--text)]">{formatScriptUsd(b.betSizeUsd)}</div>
                <div className={`text-right font-mono ${b.win ? 'text-emerald-400' : 'text-red-400'}`}>{formatScriptUsd(b.payoutUsd)}</div>
                <div className="text-right font-mono text-[var(--text)]">
                  {b.win ? `${b.multi.toFixed(2)}x` : '0.00x'}
                </div>
                <div className={`text-right font-mono ${b.b2bMulti > 1.001 ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                  {b.b2bMulti > 1.001 ? `${b.b2bMulti.toFixed(2)}x` : '—'}
                </div>
                <div className={`text-right font-mono ${b.roundProfitUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.roundProfitUsd >= 0 ? '+' : ''}{formatScriptUsd(b.roundProfitUsd)}
                </div>
              </div>
            ))}
            {betList.length === 0 && (
              <div className="px-2 py-3 text-[var(--text-muted)] text-xs">No bets yet.</div>
            )}
          </div>

          {logLines.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)] p-2 max-h-40 overflow-y-auto">
              <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Log</div>
              {logLines.map((line, i) => (
                <div key={i} className="text-xs text-[var(--text)] font-mono">{line}</div>
              ))}
            </div>
          )}
      </div>

      <div className={subTab !== 'builder' ? 'hidden' : ''}>
        <OriginalsScriptBuilder />
      </div>
    </div>
  )
}
