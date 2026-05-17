import { memo, useEffect, useMemo, useState } from 'react'
import { ChallengeHubNotificationCenter } from './ChallengeHubNotificationCenter'

type Aggregated = {
  queued: number
  running: number
  completed: number
  bestMulti: number
  sourceCount?: number
  latestSource?: string | null
  lastUpdateTs?: number
}

interface ChallengeHubHeroBarProps {
  aggregated: Aggregated
}

export const ChallengeHubHeroBar = memo(function ChallengeHubHeroBar({ aggregated }: ChallengeHubHeroBarProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 5000)
    return () => window.clearInterval(id)
  }, [])
  const ageMs = Math.max(0, nowTick - Number(aggregated?.lastUpdateTs || 0))
  const isFresh = aggregated?.lastUpdateTs ? ageMs < 15_000 : false
  const latestSourceLabel = useMemo(() => {
    const source = String(aggregated?.latestSource || '').trim()
    if (!source) return 'none'
    return source
  }, [aggregated?.latestSource])
  const heartbeatLabel = aggregated?.lastUpdateTs ? (isFresh ? 'live' : 'waiting') : 'idle'

  return (
    <div className="challenge-hub-hero">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text)]">Challenge Hub</h2>
          <p className="text-[0.68rem] text-[var(--text-muted)] mt-1">
            KPI snapshot der aktiven Quelle + globaler Bestwert aus allen Quellen.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="challenge-hub-kpi">Queued: {aggregated.queued}</span>
          <span className="challenge-hub-kpi">Running: {aggregated.running}</span>
          <span className="challenge-hub-kpi">Completed: {aggregated.completed}</span>
          <span className="challenge-hub-kpi">Best Multi (global): {aggregated.bestMulti.toFixed(2)}x</span>
          <span className="challenge-hub-kpi">Latest Source: {latestSourceLabel}</span>
          <span className="challenge-hub-kpi">Active Sources: {Number(aggregated?.sourceCount || 0)}</span>
          <span className="challenge-hub-kpi" style={{ color: isFresh ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
            Stats heartbeat: {heartbeatLabel}
          </span>
          <ChallengeHubNotificationCenter />
        </div>
      </div>
      <div className="mt-2 border-t border-[var(--border-subtle)]/70 pt-2">
        <button
          type="button"
          className="challenge-hub-action"
          aria-expanded={showHelp}
          onClick={() => setShowHelp((prev) => !prev)}
        >
          {showHelp ? 'Hide quick help' : 'Show quick help'}
        </button>
        {showHelp ? (
          <p className="text-[0.7rem] text-[var(--text-muted)] mt-2 leading-relaxed">
            Hub feed shows in-progress hub bets (casino / autorun / telegram). <b>Bonus Hunt</b> (manual) is under{' '}
            <b>Play → Bonus Hunt</b>. The autorun queue clears on app restart; filters and presets are kept.
          </p>
        ) : null}
      </div>
    </div>
  )
})
