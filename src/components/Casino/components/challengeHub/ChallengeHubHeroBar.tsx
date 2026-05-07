import { memo } from 'react'
import { ChallengeHubNotificationCenter } from './ChallengeHubNotificationCenter'

type Aggregated = {
  queued: number
  running: number
  completed: number
  bestMulti: number
  sourceCount?: number
  lastUpdateTs?: number
}

interface ChallengeHubHeroBarProps {
  aggregated: Aggregated
}

export const ChallengeHubHeroBar = memo(function ChallengeHubHeroBar({ aggregated }: ChallengeHubHeroBarProps) {
  const ageMs = Math.max(0, Date.now() - Number(aggregated?.lastUpdateTs || 0))
  const isFresh = aggregated?.lastUpdateTs ? ageMs < 15_000 : false
  return (
    <div className="challenge-hub-hero">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Challenge Hub</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Wetten/KPIs, Autorun-Hunter, Telegram, Forum und Promos. <b>Bonus Hunt</b> (manuelle Slot-Jagd) liegt unter{' '}
            <b>Play → Bonus Hunt</b>. Autorun-Warteschlange geht beim App-Neustart verloren; Filter und Presets bleiben
            gespeichert.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="challenge-hub-kpi">Queued: {aggregated.queued}</span>
          <span className="challenge-hub-kpi">Running: {aggregated.running}</span>
          <span className="challenge-hub-kpi">Completed: {aggregated.completed}</span>
          <span className="challenge-hub-kpi">Best Multi: {aggregated.bestMulti.toFixed(2)}x</span>
          <span className="challenge-hub-kpi">Sources: {Number(aggregated?.sourceCount || 0)}</span>
          <span className="challenge-hub-kpi" style={{ color: isFresh ? 'var(--success)' : 'var(--warning, #f59e0b)' }}>
            Feed: {aggregated?.lastUpdateTs ? (isFresh ? 'fresh' : 'stale') : 'idle'}
          </span>
          <ChallengeHubNotificationCenter />
        </div>
      </div>
    </div>
  )
})
