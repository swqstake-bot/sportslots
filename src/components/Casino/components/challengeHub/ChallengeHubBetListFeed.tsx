import { memo } from 'react'
import BetList from '../BetList'

const MAX_ROWS = 80

const BET_LIST_STATIC = {
  currencyCode: 'usd',
  showSlot: true,
  showNet: true,
  showContext: false,
  showCopyHouse: true,
  maxRows: MAX_ROWS,
  title: 'Hub feed',
  emptyMessage: 'No challenge hub bets yet.',
} as const

interface ChallengeHubBetListFeedProps {
  recentBets: any[]
}

/**
 * Live bet rows + timestamp only; keeps SectionCard chrome from re-running when lifted as sibling.
 */
export const ChallengeHubBetListFeed = memo(function ChallengeHubBetListFeed({ recentBets }: ChallengeHubBetListFeedProps) {
  const n = recentBets?.length ?? 0
  return (
    <div className="challenge-hub-activity-feed">
      <BetList
        {...BET_LIST_STATIC}
        bets={recentBets}
        totalCount={n}
      />
    </div>
  )
})

export { MAX_ROWS as CHALLENGE_HUB_BET_LIST_MAX_ROWS }
