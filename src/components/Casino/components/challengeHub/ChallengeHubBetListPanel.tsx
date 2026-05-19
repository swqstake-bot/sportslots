import { memo, useEffect, useMemo, useState } from 'react'
import { SectionCard } from '../ui/SectionCard'
import { loadRecentBets } from '../../utils/betHistoryDb'
import { getChallengeHubRecentBets, subscribeChallengeHubBetFeed } from '../../utils/challengeHubLiveFeed'
import {
  backfillRecentBetsShareFromLogger,
  patchHubFeedFromHouseBetBestEffort,
} from '../../utils/challengeHubBetIdPatch'
import { ChallengeHubBetListFeed, CHALLENGE_HUB_BET_LIST_MAX_ROWS } from './ChallengeHubBetListFeed'
import { useChallengeHubBetListOptional } from './ChallengeHubBetListContext'
import { formatAmount } from '../../utils/formatAmount'
import {
  parseStoredTopEntries,
  dedupeTopEntries,
  mergeTopEntries,
  loggerBetToTopCandidate,
  persistTopEntries,
  clearTopEntries,
  deriveTopWins,
  deriveTopSlots,
  type TopEntry,
} from '../../utils/topDomain'

export const ChallengeHubBetListPanel = memo(function ChallengeHubBetListPanel() {
  const hubList = useChallengeHubBetListOptional()
  if (!hubList) {
    throw new Error('ChallengeHubBetListPanel must be used inside ChallengeHubBetListProvider')
  }
  const { recentBets, setRecentBets } = hubList
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
    const max = CHALLENGE_HUB_BET_LIST_MAX_ROWS

    const hasHubSourceTag = (rows: any[]) =>
      (rows || []).some((x) => {
        const tag = String(x?.sourceTag || '').toLowerCase()
        return tag.startsWith('casino:') || tag.startsWith('autorun:') || tag.startsWith('telegram:')
      })

    const hydrate = async () => {
      const fast = getChallengeHubRecentBets()
      if (fast.length > 0) {
        setRecentBets(fast.slice(0, max))
        setTopMultisAll((prev) => mergeTopEntries(prev, fast))
      }
      try {
        const db = await loadRecentBets(max)
        if (cancelled) return
        if (db?.length) {
          setRecentBets((prev) => {
            if (hasHubSourceTag(prev) || hasHubSourceTag(getChallengeHubRecentBets())) {
              if (getChallengeHubRecentBets().length) {
                return getChallengeHubRecentBets().slice(0, max)
              }
              return prev
            }
            return db
          })
          setTopMultisAll((prev) => mergeTopEntries(prev, db))
        }
      } catch {
        // keep panel resilient on db read failures
      }
    }

    const fallbackRefresh = async () => {
      try {
        const db = await loadRecentBets(max)
        if (cancelled || !db?.length) return
        setRecentBets((prev) => {
          if (hasHubSourceTag(prev)) return prev
          const prevFirst = prev?.[0]?.id ?? null
          const dbFirst = db?.[0]?.id ?? null
          if (prevFirst === dbFirst && prev.length === db.length) return prev
          return db
        })
        setTopMultisAll((prev) => mergeTopEntries(prev, db))
      } catch {
        // optional fallback refresh may fail
      }
    }

    const dbRefresh = async () => {
      try {
        await fallbackRefresh()
      } catch {
        // fallback failure is non-fatal
      }
    }

    hydrate()
    const dbIntervalId = window.setInterval(dbRefresh, 15_000)
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
      setTopMultisAll((prev) => mergeTopEntries(prev, [entry]))
    })
    return () => {
      cancelled = true
      window.clearInterval(dbIntervalId)
      unsubscribe()
    }
  }, [setRecentBets])

  useEffect(() => {
    let cancelled = false
    const syncLogger = async () => {
      const loader = window.electronAPI?.loadLoggerBetLogs
      if (typeof loader !== 'function') return
      try {
        const rows = await loader({ limit: 5000 })
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        const mapped = rows
          .map((row) => loggerBetToTopCandidate(row))
          .filter(Boolean)
        if (mapped.length) {
          setTopMultisAll((prev) => mergeTopEntries(prev, mapped))
        }
        setRecentBets((prev) => {
          const filled = backfillRecentBetsShareFromLogger(prev, rows)
          return filled === prev ? prev : filled
        })
      } catch {
        // optional logger enrichment
      }
    }
    syncLogger()
    const id = window.setInterval(syncLogger, 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [setRecentBets])

  useEffect(() => {
    const onRealtime = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail
      const payload = detail?.payload
      if (!payload || payload.source !== 'houseBets') return
      patchHubFeedFromHouseBetBestEffort(payload)
    }
    window.addEventListener('sportslots-realtime-event', onRealtime)
    return () => window.removeEventListener('sportslots-realtime-event', onRealtime)
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
        subtitle: `${row.spins} hits · best win ${formatAmount(row.bestWinAmount, row.currencyCode)}`,
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
