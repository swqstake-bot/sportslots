import { memo } from 'react'
import BetList from '../BetList'

const MAX_ROWS = 80

const BET_LIST_STATIC = {
  currencyCode: 'usd',
  showSlot: true,
  showNet: false,
  showContext: false,
  showCopyHouse: true,
  maxRows: MAX_ROWS,
  title: 'BetList',
  emptyMessage: 'No live challenge bets yet.',
} as const

interface ChallengeHubBetListFeedProps {
  lastUpdate: number
  recentBets: any[]
}

/**
 * Live bet rows + timestamp only; keeps SectionCard chrome from re-running when lifted as sibling.
 */
export const ChallengeHubBetListFeed = memo(function ChallengeHubBetListFeed({ lastUpdate, recentBets }: ChallengeHubBetListFeedProps) {
  const n = recentBets?.length ?? 0
  return (
    <>
      <p className="text-[0.65rem] text-[var(--text-muted)] mb-2 tabular-nums">
        Last update: {new Date(lastUpdate).toLocaleTimeString()}
      </p>
      <BetList
        {...BET_LIST_STATIC}
        bets={recentBets}
        totalCount={n}
      />
    </>
  )
})

export { MAX_ROWS as CHALLENGE_HUB_BET_LIST_MAX_ROWS }
