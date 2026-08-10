/**
 * Dev-only bet-speed staircase probe UI (Casino → Dev).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCurrencyRates } from '../../api/stakeChallenges'
import { useUserStore } from '../../../../store/userStore'
import { useStakeSiteStore } from '../../../../store/stakeSiteStore'
import { isGoldCoinCurrency } from '../../utils/currencyMeta'
import { SectionCard } from '../ui/SectionCard'
import {
  DEFAULT_PROBE_STAGES_BPS,
  isStakeEngineWebSlot,
  runBetSpeedProbe,
  type BetSpeedProbeConfig,
  type ProbeKind,
  type ProbeSignal,
  type ProbeStageResult,
  type ProbeStageStop,
} from './runBetSpeedProbe'

type SlotOpt = { slug: string; name?: string; providerId: string }

interface DevBetSpeedProbeProps {
  accessToken: string
  webSlots: SlotOpt[]
  sharedSourceCurrency?: string
  sharedTargetCurrency?: string
}

function parseStages(raw: string): number[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export function DevBetSpeedProbe({
  accessToken,
  webSlots,
  sharedSourceCurrency,
  sharedTargetCurrency,
}: DevBetSpeedProbeProps) {
  const selectedCurrency = useUserStore((s) => s.selectedCurrency)
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)

  const stakeEngineSlots = useMemo(() => {
    const list = (webSlots || []).filter((s) => isStakeEngineWebSlot(s))
    return list.sort((a, b) => String(a.name || a.slug).localeCompare(String(b.name || b.slug)))
  }, [webSlots])

  const defaultSlug = stakeEngineSlots[0]?.slug || ''

  const [kind, setKind] = useState<ProbeKind>('originals-dice')
  const [slotSlug, setSlotSlug] = useState(defaultSlug)
  const [slotFilter, setSlotFilter] = useState('')
  const [workers, setWorkers] = useState<1 | 2 | 4>(1)
  const [stagesText, setStagesText] = useState(DEFAULT_PROBE_STAGES_BPS.join(','))
  const [stageStop, setStageStop] = useState<ProbeStageStop>('duration')
  const [stageDurationSec, setStageDurationSec] = useState(45)
  const [betsPerStage, setBetsPerStage] = useState(500)
  const [betUsd, setBetUsd] = useState(0.01)

  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [stageResults, setStageResults] = useState<ProbeStageResult[]>([])
  const [live, setLive] = useState<{
    stageIndex: number
    targetBps: number
    bets: number
    errors: number
    throttleErrors: number
    elapsedMs: number
  } | null>(null)
  const [recommendation, setRecommendation] = useState<{ intervalMs: number | null; bps: number | null } | null>(
    null
  )

  const signalRef = useRef<ProbeSignal | null>(null)
  const startLockRef = useRef(false)
  const mountedRef = useRef(true)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!slotSlug && defaultSlug) setSlotSlug(defaultSlug)
  }, [defaultSlug, slotSlug])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs])

  // Hard stop on unmount — never leave runaway betting.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (signalRef.current) signalRef.current.cancelled = true
    }
  }, [])

  const filteredSlots = useMemo(() => {
    const q = slotFilter.trim().toLowerCase()
    if (!q) return stakeEngineSlots.slice(0, 80)
    return stakeEngineSlots.filter((s) => {
      const hay = `${s.slug} ${s.name || ''}`.toLowerCase()
      return hay.includes(q)
    }).slice(0, 80)
  }, [stakeEngineSlots, slotFilter])

  // Keep the selected slug visible even if the current filter excludes it.
  const slotOptions = useMemo(() => {
    if (!slotSlug) return filteredSlots
    if (filteredSlots.some((s) => s.slug === slotSlug)) return filteredSlots
    const selected = stakeEngineSlots.find((s) => s.slug === slotSlug)
    return selected ? [selected, ...filteredSlots] : filteredSlots
  }, [filteredSlots, slotSlug, stakeEngineSlots])

  const currency = (selectedCurrency || (preferredSite === 'eu' ? 'sweeps' : 'usdc')).toLowerCase()
  const sourceCurrency = (
    preferredSite === 'eu'
      ? isGoldCoinCurrency(sharedSourceCurrency || currency)
        ? sharedSourceCurrency || currency
        : currency
      : sharedSourceCurrency || currency
  ).toLowerCase()
  const targetCurrency = (
    preferredSite === 'eu' ? sourceCurrency : (sharedTargetCurrency || 'eur').toLowerCase()
  ).toLowerCase()

  const pushLog = useCallback((msg: string) => {
    if (!mountedRef.current) return
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`
    setLogs((prev) => [...prev.slice(-400), line])
  }, [])

  const handleStop = useCallback(() => {
    if (signalRef.current) signalRef.current.cancelled = true
    pushLog('Stop requested — draining in-flight bets…')
  }, [pushLog])

  const handleStart = useCallback(async () => {
    if (!accessToken) {
      pushLog('No session token — login / refresh session first.')
      return
    }
    if (running || startLockRef.current) return

    const stagesBps = parseStages(stagesText)
    if (!stagesBps.length) {
      pushLog('Invalid stages list.')
      return
    }
    if (kind === 'stake-engine' && !slotSlug) {
      pushLog('Pick a Stake Engine slot.')
      return
    }

    startLockRef.current = true
    setRunning(true)
    setStageResults([])
    setRecommendation(null)
    setLive(null)
    setLogs([])
    signalRef.current = { cancelled: false }

    pushLog(
      `WARNING: real bets at ~$${betUsd} — burns balance / may trip Stake limits. Site=${preferredSite}, currency=${currency}`
    )

    let usdRates: Record<string, number> = {}
    try {
      usdRates = (await fetchCurrencyRates(accessToken)) ?? {}
      pushLog(`FX rates loaded (${Object.keys(usdRates).length}).`)
    } catch {
      pushLog('FX load failed — using 1:1 / GC fallbacks.')
    }

    if (signalRef.current?.cancelled) {
      pushLog('Probe cancelled before start.')
      startLockRef.current = false
      if (mountedRef.current) {
        setRunning(false)
        setLive(null)
      }
      signalRef.current = null
      return
    }

    const selected = stakeEngineSlots.find((s) => s.slug === slotSlug)

    const config: BetSpeedProbeConfig = {
      kind,
      currency,
      sourceCurrency,
      targetCurrency,
      betUsd: Math.max(0.01, Number(betUsd) || 0.01),
      workers,
      stagesBps,
      stageStop,
      stageDurationSec: Math.max(5, Number(stageDurationSec) || 45),
      betsPerStage: Math.max(10, Number(betsPerStage) || 500),
      slotSlug,
      slotProviderId: selected?.providerId || 'stakeEngine',
      accessToken,
      usdRates,
    }

    try {
      const summary = await runBetSpeedProbe(config, signalRef.current!, {
        onLog: pushLog,
        onStageStart: (i, bps) => {
          if (!mountedRef.current) return
          setLive({ stageIndex: i, targetBps: bps, bets: 0, errors: 0, throttleErrors: 0, elapsedMs: 0 })
        },
        onProgress: (info) => {
          if (!mountedRef.current) return
          setLive(info)
        },
        onStageDone: (_i, result) => {
          if (!mountedRef.current) return
          setStageResults((prev) => [...prev, result])
        },
      })
      if (mountedRef.current) {
        setRecommendation({
          intervalMs: summary.recommendedIntervalMs,
          bps: summary.recommendedBps,
        })
      }
      if (summary.stopped) pushLog('Probe stopped.')
      else pushLog('Probe finished.')
    } catch (e) {
      pushLog(`Probe failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      startLockRef.current = false
      if (mountedRef.current) {
        setRunning(false)
        setLive(null)
      }
      signalRef.current = null
    }
  }, [
    accessToken,
    betUsd,
    betsPerStage,
    currency,
    kind,
    preferredSite,
    pushLog,
    running,
    slotSlug,
    sourceCurrency,
    stageDurationSec,
    stageStop,
    stagesText,
    stakeEngineSlots,
    targetCurrency,
    workers,
  ])

  const inputCls =
    'w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm text-[var(--text)]'
  const labelCls = 'block text-xs text-[var(--text-muted)] mb-1'

  return (
    <div className="space-y-4">
      <div className="casino-card border-l-4 border-l-amber-500/80 !bg-amber-500/5">
        <p className="text-sm font-medium text-amber-200/95">
          Dev only — places real bets. Burns money and can trigger Stake rate limits / soft bans. Do not leave
          running unattended. Stop always drains in-flight requests.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Session: {preferredSite === 'eu' ? 'stake.eu' : 'stake.com'} · wallet {currency}
          {kind === 'stake-engine' ? ` · slot ${sourceCurrency}→${targetCurrency}` : ''}
        </p>
      </div>

      <SectionCard title="Bet speed probe">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Target</label>
            <select
              className={inputCls}
              value={kind}
              disabled={running}
              onChange={(e) => setKind(e.target.value as ProbeKind)}
            >
              <option value="originals-dice">Originals · Dice</option>
              <option value="originals-limbo">Originals · Limbo</option>
              <option value="stake-engine">Stake Engine slot</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Workers (max in-flight)</label>
            <select
              className={inputCls}
              value={workers}
              disabled={running}
              onChange={(e) => setWorkers(Number(e.target.value) as 1 | 2 | 4)}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Bet size (USD equiv.)</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              className={inputCls}
              value={betUsd}
              disabled={running}
              onChange={(e) => setBetUsd(Number(e.target.value) || 0.01)}
            />
          </div>

          <div>
            <label className={labelCls}>Stages (bets/s)</label>
            <input
              className={inputCls}
              value={stagesText}
              disabled={running}
              onChange={(e) => setStagesText(e.target.value)}
              placeholder="5,8,10,12,15,20"
            />
          </div>

          <div>
            <label className={labelCls}>Stage stop</label>
            <select
              className={inputCls}
              value={stageStop}
              disabled={running}
              onChange={(e) => setStageStop(e.target.value as ProbeStageStop)}
            >
              <option value="duration">Duration (seconds)</option>
              <option value="count">Bet count</option>
            </select>
          </div>

          {stageStop === 'duration' ? (
            <div>
              <label className={labelCls}>Seconds per stage</label>
              <input
                type="number"
                min={5}
                max={600}
                className={inputCls}
                value={stageDurationSec}
                disabled={running}
                onChange={(e) => setStageDurationSec(Number(e.target.value) || 45)}
              />
            </div>
          ) : (
            <div>
              <label className={labelCls}>Bets per stage</label>
              <input
                type="number"
                min={10}
                max={5000}
                className={inputCls}
                value={betsPerStage}
                disabled={running}
                onChange={(e) => setBetsPerStage(Number(e.target.value) || 500)}
              />
            </div>
          )}
        </div>

        {kind === 'stake-engine' && (
          <div className="mt-3 space-y-2">
            <label className={labelCls}>Stake Engine slot ({stakeEngineSlots.length} available)</label>
            <input
              className={inputCls}
              placeholder="Filter slug / name…"
              value={slotFilter}
              disabled={running}
              onChange={(e) => setSlotFilter(e.target.value)}
            />
            <select
              className={inputCls}
              value={slotSlug}
              disabled={running}
              onChange={(e) => setSlotSlug(e.target.value)}
            >
              {!slotOptions.length && <option value="">No slots</option>}
              {slotOptions.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {(s.name || s.slug).slice(0, 80)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
            disabled={running || !accessToken}
            onClick={() => void handleStart()}
          >
            {running ? 'Running…' : 'Start probe'}
          </button>
          <button
            type="button"
            className="rounded border border-[var(--error)]/60 bg-red-500/10 px-3 py-1.5 text-sm text-[var(--error)] disabled:opacity-40"
            disabled={!running}
            onClick={handleStop}
          >
            Stop
          </button>
          {recommendation?.intervalMs != null && (
            <span className="text-sm text-[var(--text-muted)]">
              Recommend <code className="text-[var(--accent)]">interval_ms={recommendation.intervalMs}</code>
              {recommendation.bps != null ? ` (~${recommendation.bps}/s)` : ''} — copy manually; not applied.
            </span>
          )}
        </div>

        {live && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Live stage {live.stageIndex + 1}: target {live.targetBps}/s · bets {live.bets} · err {live.errors} ·
            429/5xx {live.throttleErrors} · {(live.elapsedMs / 1000).toFixed(1)}s
          </p>
        )}
      </SectionCard>

      <SectionCard title="Stage results">
        {stageResults.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No stages yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[var(--text-muted)]">
                <tr>
                  <th className="py-1 pr-2">Target/s</th>
                  <th className="py-1 pr-2">Achieved/s</th>
                  <th className="py-1 pr-2">Bets</th>
                  <th className="py-1 pr-2">Errors</th>
                  <th className="py-1 pr-2">429/5xx</th>
                  <th className="py-1 pr-2">p50</th>
                  <th className="py-1 pr-2">p95</th>
                  <th className="py-1 pr-2">interval</th>
                  <th className="py-1">OK</th>
                </tr>
              </thead>
              <tbody>
                {stageResults.map((r) => (
                  <tr key={`${r.targetBps}-${r.elapsedMs}`} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1 pr-2">{r.targetBps}</td>
                    <td className="py-1 pr-2">{r.achievedBps.toFixed(2)}</td>
                    <td className="py-1 pr-2">{r.bets}</td>
                    <td className="py-1 pr-2">{r.errors}</td>
                    <td className="py-1 pr-2">{r.throttleErrors}</td>
                    <td className="py-1 pr-2">{r.latencyP50Ms != null ? `${r.latencyP50Ms}ms` : '—'}</td>
                    <td className="py-1 pr-2">{r.latencyP95Ms != null ? `${r.latencyP95Ms}ms` : '—'}</td>
                    <td className="py-1 pr-2">{r.intervalMsAtTarget}ms</td>
                    <td className="py-1">{r.ok ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Live log">
        <div className="terminal-panel terminal-panel--compact max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
          {logs.length === 0 ? <p className="terminal-empty">Idle — probe not started.</p> : null}
          {logs.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`}>{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </SectionCard>
    </div>
  )
}

export default DevBetSpeedProbe
