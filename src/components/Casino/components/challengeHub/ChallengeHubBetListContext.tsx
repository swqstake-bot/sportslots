/* eslint-disable react-refresh/only-export-components */
import { useSyncExternalStore, type ReactNode } from 'react'
import {
  getChallengeHubRecentBets,
  subscribeChallengeHubFeed,
  type ChallengeHubBetFeedEntry,
} from '../../utils/challengeHubLiveFeed'

/** Structural shell marker — feed state lives in challengeHubLiveFeed, not React context. */
export function ChallengeHubBetListProvider({ children }: { children: ReactNode }) {
  return children
}

export function useChallengeHubRecentBets(): ChallengeHubBetFeedEntry[] {
  return useSyncExternalStore(subscribeChallengeHubFeed, getChallengeHubRecentBets, getChallengeHubRecentBets)
}

/** @deprecated Use useChallengeHubRecentBets — kept for gradual migration. */
export function useChallengeHubBetListOptional(): { recentBets: ChallengeHubBetFeedEntry[] } | null {
  const recentBets = useChallengeHubRecentBets()
  return { recentBets }
}
