import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

export type ChallengeHubBetListState = {
  recentBets: any[]
  setRecentBets: Dispatch<SetStateAction<any[]>>
}

const ChallengeHubBetListContext = createContext<ChallengeHubBetListState | null>(null)

export function ChallengeHubBetListProvider({ children }: { children: ReactNode }) {
  const [recentBets, setRecentBets] = useState<any[]>([])
  const value = useMemo(() => ({ recentBets, setRecentBets }), [recentBets])
  return <ChallengeHubBetListContext.Provider value={value}>{children}</ChallengeHubBetListContext.Provider>
}

/** Null when AutoChallengeHunter (or other) is rendered outside the Challenge Hub shell. */
export function useChallengeHubBetListOptional(): ChallengeHubBetListState | null {
  return useContext(ChallengeHubBetListContext)
}
