/**
 * EU-only Auto Wager GC panel — claim top-up (1000 GC) + Dice gold loop.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { useStakeSiteStore } from '../../../../../store/stakeSiteStore'
import { useUserStore } from '../../../../../store/userStore'
import {
  AUTO_WAGER_GC_DEFAULTS,
  runAutoWagerGc,
  type AutoWagerGcPhase,
  type AutoWagerGcStats,
} from './runAutoWagerGc'

function formatPhase(phase: AutoWagerGcPhase, detail?: string): string {
  const base =
    phase === 'idle'
      ? 'Idle'
      : phase === 'meta'
        ? 'Meta / balance'
        : phase === 'turnstile'
          ? 'Turnstile'
          : phase === 'claim'
            ? 'Claiming'
            : phase === 'wager'
              ? 'Wagering'
              : phase === 'cooldown'
                ? 'Waiting'
                : phase === 'error'
                  ? 'Error'
                  : phase === 'stopped'
                    ? 'Stopped'
                    : phase
  return detail ? `${base} — ${detail}` : base
}

export default function AutoWagerGcPanel() {
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const gold = useUserStore((s) => Number(s.balances.gold ?? 0) || 0)
  const [betGold, setBetGold] = useState(String(AUTO_WAGER_GC_DEFAULTS.betGold))
  const [targetMultiplier, setTargetMultiplier] = useState(
    String(AUTO_WAGER_GC_DEFAULTS.targetMultiplier)
  )
  const [paceMs, setPaceMs] = useState(String(AUTO_WAGER_GC_DEFAULTS.paceMs))
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<AutoWagerGcPhase>('idle')
  const [phaseDetail, setPhaseDetail] = useState('')
  const [error, setError] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
  const [stats, setStats] = useState<AutoWagerGcStats | null>(null)
  const signalRef = useRef({ cancelled: false })

  useEffect(() => {
    return () => {
      signalRef.current.cancelled = true
    }
  }, [])

  const addLog = useCallback((msg: string) => {
    setLogLines((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 80))
  }, [])

  const stop = useCallback(() => {
    signalRef.current.cancelled = true
    setRunning(false)
    setPhase('stopped')
  }, [])

  const start = useCallback(async () => {
    if (running) return
    if (preferredSite !== 'eu') {
      setError('Auto Wager GC is Stake.eu only — switch site to EU')
      return
    }
    setError('')
    setLogLines([])
    setStats(null)
    signalRef.current = { cancelled: false }
    setRunning(true)
    setPhase('meta')
    try {
      await runAutoWagerGc(
        {
          betGold: Number(betGold) || AUTO_WAGER_GC_DEFAULTS.betGold,
          targetMultiplier: Number(targetMultiplier) || AUTO_WAGER_GC_DEFAULTS.targetMultiplier,
          paceMs: Number(paceMs) || AUTO_WAGER_GC_DEFAULTS.paceMs,
        },
        {
          signal: signalRef.current,
          onPhase: (p, detail) => {
            setPhase(p)
            setPhaseDetail(detail || '')
          },
          onLog: addLog,
          onStats: setStats,
        }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      addLog(`Fatal: ${msg}`)
      setPhase('error')
    } finally {
      setRunning(false)
      if (!signalRef.current.cancelled) setPhase('idle')
    }
  }, [running, preferredSite, betGold, targetMultiplier, paceMs, addLog])

  if (preferredSite !== 'eu') return null

  const inputCls =
    'w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm text-[var(--text)]'
  const labelCls = 'mb-1 block text-xs text-[var(--text-muted)]'

  return (
    <div className="casino-card originals-automatic-card" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Auto Wager GC</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.75 }}>
            Dice until gold &lt; 10 → claim top-up (1000 GC) → repeat. Claim wait from server/meta
            (not a fixed cooldown).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!running ? (
            <Button type="button" variant="primary" size="sm" onClick={() => void start()}>
              Start
            </Button>
          ) : (
            <Button type="button" variant="danger" size="sm" onClick={stop}>
              Stop
            </Button>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 10,
          marginTop: 12,
        }}
      >
        <label>
          <span className={labelCls}>Bet (GC)</span>
          <input
            className={inputCls}
            type="number"
            min={1}
            step={1}
            disabled={running}
            value={betGold}
            onChange={(e) => setBetGold(e.target.value)}
          />
        </label>
        <label>
          <span className={labelCls}>Multi</span>
          <input
            className={inputCls}
            type="number"
            min={1.0102}
            max={2}
            step={0.001}
            disabled={running}
            value={targetMultiplier}
            onChange={(e) => setTargetMultiplier(e.target.value)}
          />
        </label>
        <label>
          <span className={labelCls}>Pace (ms)</span>
          <input
            className={inputCls}
            type="number"
            min={50}
            step={25}
            disabled={running}
            value={paceMs}
            onChange={(e) => setPaceMs(e.target.value)}
          />
        </label>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
        <span>
          Status: <strong>{formatPhase(phase, phaseDetail)}</strong>
        </span>
        <span>Gold: {gold.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
        {stats && (
          <>
            <span>Claims: {stats.claims}</span>
            <span>Spins: {stats.spins}</span>
            <span>
              Wagered:{' '}
              {(stats.wageredGold ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} GC
            </span>
            <span>Claimed: {stats.claimedGold.toLocaleString('en-US')} GC</span>
          </>
        )}
      </div>

      {error && (
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--danger, #f87171)' }}>{error}</p>
      )}

      {logLines.length > 0 && (
        <pre
          style={{
            marginTop: 10,
            maxHeight: 140,
            overflow: 'auto',
            fontSize: 11,
            lineHeight: 1.4,
            opacity: 0.85,
            whiteSpace: 'pre-wrap',
            marginBottom: 0,
          }}
        >
          {logLines.join('\n')}
        </pre>
      )}
    </div>
  )
}

