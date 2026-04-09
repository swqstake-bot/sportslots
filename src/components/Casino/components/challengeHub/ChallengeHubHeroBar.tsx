import { memo } from 'react'

type Aggregated = {
  queued: number
  running: number
  completed: number
  bestMulti: number
}

interface ChallengeHubHeroBarProps {
  aggregated: Aggregated
}

export const ChallengeHubHeroBar = memo(function ChallengeHubHeroBar({ aggregated }: ChallengeHubHeroBarProps) {
  return (
    <div className="challenge-hub-hero">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Challenge Hub</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Casino, Telegram, Forum, Sports, and Promotions in one workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="challenge-hub-kpi">Queued: {aggregated.queued}</span>
          <span className="challenge-hub-kpi">Running: {aggregated.running}</span>
          <span className="challenge-hub-kpi">Completed: {aggregated.completed}</span>
          <span className="challenge-hub-kpi">Best Multi: {aggregated.bestMulti.toFixed(2)}x</span>
        </div>
      </div>
    </div>
  )
})
