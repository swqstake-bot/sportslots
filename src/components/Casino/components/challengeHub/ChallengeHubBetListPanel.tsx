import { memo, useEffect, useState } from 'react'
import { SectionCard } from '../ui/SectionCard'
import { loadRecentBets } from '../../utils/betHistoryDb'
import { getChallengeHubRecentBets, subscribeChallengeHubBetFeed } from '../../utils/challengeHubLiveFeed'
import { ChallengeHubBetListFeed, CHALLENGE_HUB_BET_LIST_MAX_ROWS } from './ChallengeHubBetListFeed'

/**
 * Owns Challenge Hub live bet state so parent ChallengeHubView does not re-render on every feed tick.
 * Memoized (no props): parent hub stats / tab changes do not re-run this subtree.
 */
export const ChallengeHubBetListPanel = memo(function ChallengeHubBetListPanel() {
  const [recentBets, setRecentBets] = useState<any[]>([])
  const [lastUpdate, setLastUpdate] = useState<number>(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const max = CHALLENGE_HUB_BET_LIST_MAX_ROWS

    const hydrate = async () => {
      const fast = getChallengeHubRecentBets()
      if (fast.length > 0) {
        setRecentBets(fast.slice(0, max))
        setLastUpdate(Date.now())
      }
      try {
        const db = await loadRecentBets(max)
        if (cancelled) return
        if (db?.length) {
          setRecentBets(db)
          setLastUpdate(Date.now())
        }
      } catch {
        // keep hub stable when local history read fails
      }
    }

    const dbRefresh = async () => {
      try {
        const db = await loadRecentBets(max)
        if (cancelled) return
        if (!db?.length) return
        setRecentBets((prev) => {
          const hasLiveFeedRows = (prev || []).some((x) => String(x?.sourceTag || '').startsWith('casino:'))
          if (hasLiveFeedRows) return prev
          const prevFirst = prev?.[0]?.id ?? null
          const dbFirst = db?.[0]?.id ?? null
          if (prevFirst === dbFirst && prev.length === db.length) return prev
          return db
        })
        setLastUpdate(Date.now())
      } catch {
        // best-effort periodic fallback
      }
    }

    hydrate()
    const dbIntervalId = window.setInterval(dbRefresh, 2000)
    const unsubscribe = subscribeChallengeHubBetFeed((entry) => {
      if (cancelled) return
      setRecentBets((prev) => {
        const id = entry?.id != null ? String(entry.id) : ''
        if (!id) return [entry, ...prev].slice(0, max)
        const idx = prev.findIndex((x) => String(x?.id ?? '') === id)
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = { ...next[idx], ...entry }
          return next
        }
        return [entry, ...prev].slice(0, max)
      })
      setLastUpdate(Date.now())
    })
    return () => {
      cancelled = true
      window.clearInterval(dbIntervalId)
      unsubscribe()
    }
  }, [])

  return (
    <SectionCard title="BetList">
      <ChallengeHubBetListFeed lastUpdate={lastUpdate} recentBets={recentBets} />
    </SectionCard>
  )
})
