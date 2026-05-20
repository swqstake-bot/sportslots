import { memo, useEffect, useMemo, useState } from 'react'
import { subscribeToHouseBets } from '../../api/stakeRealtimeFacade'
import { SectionCard } from '../ui/SectionCard'
import { getChallengeHubRecentBets, subscribeChallengeHubBetFeed } from '../../utils/challengeHubLiveFeed'
import { applyHouseBetToHubFeed, backfillRecentBetsShareFromLogger } from '../../utils/challengeHubBetIdPatch'
import { ChallengeHubBetListFeed, CHALLENGE_HUB_BET_LIST_MAX_ROWS } from './ChallengeHubBetListFeed'
import { useChallengeHubRecentBets } from './ChallengeHubBetListContext'
import { formatAmount } from '../../utils/formatAmount'
import {
  parseStoredTopEntries,
  dedupeTopEntries,
  filterRowsForHighlightsMerge,
  mergeTopEntries,
  loggerBetToTopCandidate,
  persistTopEntries,
  clearTopEntries,
  deriveTopWins,
  deriveTopSlots,
  type TopEntry,
} from '../../utils/topDomain'

type ChallengeHubBetListPanelProps = {
  accessToken: string
}

/**
 * Hub feed: live rows from Challenge Hunter (amounts/pending).
 * Bet share IDs: single source = houseBets WebSocket (SSP-style), not IndexedDB.
 */
export const ChallengeHubBetListPanel = memo(function ChallengeHubBetListPanel({
  accessToken,
}: ChallengeHubBetListPanelProps) {
  const feedSnapshot = useChallengeHubRecentBets()
  const recentBets = useMemo(
    () => feedSnapshot.slice(0, CHALLENGE_HUB_BET_LIST_MAX_ROWS),
    [feedSnapshot]
  )
  const [topMultisLimit, setTopMultisLimit] = useState<number>(10)
  const [feedOpen, setFeedOpen] = useState(true)
  const [highlightsOpen, setHighlightsOpen] = useState(true)
  const [highlightMode, setHighlightMode] = useState<'multis' | 'wins' | 'slots'>('multis')
  const [topMultisAll, setTopMultisAll] = useState<TopEntry[]>(() => parseStoredTopEntries())

  useEffect(() => {
    setTopMultisAll((prev) => dedupeTopEntries(prev))
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = subscribeChallengeHubBetFeed((entry) => {
      if (cancelled) return
      if (entry?.hubSettlement !== 'pending' || entry?.shareIid) {
        setTopMultisAll((prev) => mergeTopEntries(prev, [entry]))
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  /** SSP-style: houseBets = einzige ID-Quelle fÃ¼r den Feed. */
  useEffect(() => {
    if (!accessToken?.trim()) return
    let cancelled = false
    let sub: { disconnect?: () => void } | null = null

    subscribeToHouseBets(accessToken, (bItem: unknown) => {
      if (cancelled) return
      applyHouseBetToHubFeed(bItem)
    }).then((s) => {
      if (cancelled) {
        try {
          s?.disconnect?.()
        } catch {
          // ignore
        }
        return
      }
      sub = s
    })

    return () => {
      cancelled = true
      try {
        sub?.disconnect?.()
      } catch {
        // ignore
      }
    }
  }, [accessToken])

  /** Logger nur zum Nachziehen fehlender shareIid (kein Bulk-Merge in Highlights). */
  useEffect(() => {
    let cancelled = false
    const syncLoggerIds = async () => {
      const loader = window.electronAPI?.loadLoggerBetLogs
      if (typeof loader !== 'function') return
      try {
        const rows = await loader({ limit: 800 })
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        backfillRecentBetsShareFromLogger(getChallengeHubRecentBets(), rows)
        const mapped = filterRowsForHighlightsMerge(rows)
          .map((row) => loggerBetToTopCandidate(row))
          .filter(Boolean)
        if (mapped.length) {
          setTopMultisAll((prev) => mergeTopEntries(prev, mapped))
        }
      } catch {
        // optional
      }
    }
    syncLoggerIds()
    const id = window.setInterval(syncLoggerIds, 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    persistTopEntries(topMultisAll)
  }, [topMultisAll])

  const topMultis = useMemo(() => {
    return topMultisAll.slice(0, Math.max(10, topMultisLimit))
  }, [topMultisAll, topMultisLimit])
  const topWins = useMemo(() => {
    return deriveTopWins(topMultisAll, Math.max(10, topMultisLimit))
  }, [topMultisAll, topMultisLimit])
  const topSlots = useMemo(() => {
    return deriveTopSlots(topMultisAll, Math.max(10, topMultisLimit))
  }, [topMultisAll, topMultisLimit])
  const clearTopMultis = () => {
    setTopMultisAll([])
    clearTopEntries()
  }

  const highlightRows = useMemo(() => {
    if (highlightMode === 'wins') {
      return topWins.map((row, idx) => ({
        key: `win:${row.key}`,
        title: row.slotName,
        subtitle: formatAmount(row.winAmount, row.currencyCode),
        value: `${row.multiplier.toFixed(2)}x`,
        rank: idx + 1,
        shareId: row.shareId ?? null,
      }))
    }
    if (highlightMode === 'slots') {
      return topSlots.map((row, idx) => ({
        key: `slot:${row.slotName}`,
        title: row.slotName,
        subtitle: `${row.spins} hits Â· best win ${formatAmount(row.bestWinAmount, row.currencyCode)}`,
        value: `${row.bestMulti.toFixed(2)}x`,
        rank: idx + 1,
        shareId: null,
      }))
    }
    return topMultis.map((row, idx) => ({
      key: row.key,
      title: row.slotName,
      subtitle: formatAmount(row.winAmount, row.currencyCode),
      value: `${row.multiplier.toFixed(2)}x`,
      rank: idx + 1,
      shareId: row.shareId ?? null,
    }))
  }, [highlightMode, topMultis, topSlots, topWins])

  return (
    <SectionCard title="Hub activity" className="challenge-hub-activity-panel">
      <div className="challenge-hub-activity-head">
        <p className="challenge-hub-activity-label">Feed</p>
        <button type="button" className="challenge-hub-action challenge-hub-action--ghost" onClick={() => setFeedOpen((prev) => !prev)}>
          {feedOpen ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {feedOpen ? (
        <div className="challenge-hub-activity-feed-wrap">
          <ChallengeHubBetListFeed recentBets={recentBets} />
        </div>
      ) : (
        <p className="challenge-hub-activity-empty">Feed collapsed.</p>
      )}

      <div className="challenge-hub-activity-divider" />
      <div className="challenge-hub-activity-highlights">
        <div className="challenge-hub-activity-head">
          <p className="challenge-hub-activity-label">Highlights</p>
          <div className="challenge-hub-activity-controls">
            <select
              value={highlightMode}
              onChange={(e) => setHighlightMode((e.target.value as 'multis' | 'wins' | 'slots') || 'multis')}
              className="challenge-hub-activity-select"
            >
              <option value="multis">Top multis</option>
              <option value="wins">Top wins</option>
              <option value="slots">Top slots</option>
            </select>
            <label className="challenge-hub-activity-show">
              Show
              <select
                value={topMultisLimit}
                onChange={(e) => setTopMultisLimit(Math.max(10, Number(e.target.value) || 10))}
                className="challenge-hub-activity-select"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={80}>80</option>
              </select>
            </label>
            <button
              type="button"
              className="challenge-hub-action challenge-hub-action--ghost"
              onClick={() => setHighlightsOpen((prev) => !prev)}
            >
              {highlightsOpen ? 'Collapse' : 'Expand'}
            </button>
            <button
              type="button"
              onClick={clearTopMultis}
              className="challenge-hub-action challenge-hub-action--danger"
              title="Clear top multis list"
            >
              Clear
            </button>
          </div>
        </div>
        {!highlightsOpen ? null : highlightRows.length === 0 ? (
          <p className="challenge-hub-activity-empty">No highlight rows yet.</p>
        ) : (
          <div className="challenge-hub-highlight-list">
            {highlightRows.map((row) => (
              <div
                key={row.key}
                className="challenge-hub-highlight-row"
              >
                <div className="challenge-hub-highlight-main">
                  <div className="challenge-hub-highlight-title-row">
                    <p className="challenge-hub-highlight-title">{row.title}</p>
                    <p className="challenge-hub-highlight-rank">#{row.rank}</p>
                  </div>
                  <div className="challenge-hub-highlight-sub-row">
                    <p className="challenge-hub-highlight-sub">{row.subtitle}</p>
                    {row.shareId ? (
                      <button
                        type="button"
                        className="challenge-hub-highlight-copy"
                        title={`Copy house id (${row.shareId})`}
                        onClick={() => {
                          try {
                            navigator?.clipboard?.writeText(row.shareId).catch(() => {})
                          } catch {
                            // ignore clipboard errors
                          }
                        }}
                      >
                        Copy ID
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="challenge-hub-highlight-value-wrap">
                  <p className="challenge-hub-highlight-value">{row.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
})
