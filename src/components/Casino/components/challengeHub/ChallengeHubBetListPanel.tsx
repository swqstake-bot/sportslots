import { memo, useEffect, useMemo, useState } from 'react'
import { SectionCard } from '../ui/SectionCard'
import { loadRecentBets } from '../../utils/betHistoryDb'
import { getChallengeHubRecentBets, subscribeChallengeHubBetFeed } from '../../utils/challengeHubLiveFeed'
import { ChallengeHubBetListFeed, CHALLENGE_HUB_BET_LIST_MAX_ROWS } from './ChallengeHubBetListFeed'
import { useChallengeHubBetListOptional } from './ChallengeHubBetListContext'
import { formatAmount } from '../../utils/formatAmount'
import {
  parseStoredTopEntries,
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
  const [lastUpdate, setLastUpdate] = useState<number>(() => Date.now())
  const [topMultisLimit, setTopMultisLimit] = useState<number>(20)
  const [topMultisAll, setTopMultisAll] = useState<TopEntry[]>(() => parseStoredTopEntries())

  useEffect(() => {
    let cancelled = false
    const max = CHALLENGE_HUB_BET_LIST_MAX_ROWS

    const hasCasinoSourceTag = (rows: any[]) =>
      (rows || []).some((x) => String(x?.sourceTag || '').startsWith('casino:'))

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
          setRecentBets((prev) => {
            if (hasCasinoSourceTag(prev) || hasCasinoSourceTag(getChallengeHubRecentBets())) {
              if (getChallengeHubRecentBets().length) {
                return getChallengeHubRecentBets().slice(0, max)
              }
              return prev
            }
            return db
          })
          if (!cancelled) setLastUpdate(Date.now())
        }
      } catch {
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
  }, [setRecentBets])

  useEffect(() => {
    setTopMultisAll((prev) => mergeTopEntries(prev, recentBets || []))
  }, [recentBets])

  useEffect(() => {
    let cancelled = false
    const loadLoggerTopRows = async () => {
      const loader = window.electronAPI?.loadLoggerBetLogs
      if (typeof loader !== 'function') return
      try {
        const rows = await loader({ limit: 5000 })
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return
        const mapped = rows
          .map((row) => loggerBetToTopCandidate(row))
          .filter(Boolean)
        if (!mapped.length) return
        setTopMultisAll((prev) => mergeTopEntries(prev, mapped))
      } catch {
      }
    }
    loadLoggerTopRows()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    persistTopEntries(topMultisAll)
  }, [topMultisAll])

  const topMultis = useMemo(() => {
    return topMultisAll.slice(0, Math.max(20, topMultisLimit))
  }, [topMultisAll, topMultisLimit])
  const topWins = useMemo(() => {
    return deriveTopWins(topMultisAll, Math.max(20, topMultisLimit))
  }, [topMultisAll, topMultisLimit])
  const topSlots = useMemo(() => {
    return deriveTopSlots(topMultisAll, Math.max(20, topMultisLimit))
  }, [topMultisAll, topMultisLimit])
  const clearTopMultis = () => {
    setTopMultisAll([])
    clearTopEntries()
  }

  return (
    <SectionCard title="Hub activity">
      <ChallengeHubBetListFeed lastUpdate={lastUpdate} recentBets={recentBets} />
      <div className="mt-3 border-t border-[var(--border)]/80 pt-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[0.65rem] uppercase tracking-wide text-[var(--text-muted)]">Top multis</p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[0.64rem] text-[var(--text-muted)]">
              Show
              <select
                value={topMultisLimit}
                onChange={(e) => setTopMultisLimit(Math.max(20, Number(e.target.value) || 20))}
                className="rounded border border-[var(--border)] bg-[var(--bg-deep)] px-1.5 py-0.5 text-[0.65rem] text-[var(--text)]"
              >
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={80}>80</option>
              </select>
            </label>
            <button
              type="button"
              onClick={clearTopMultis}
              className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[0.64rem] text-[var(--text-muted)] hover:text-[var(--error)]"
              title="Clear top multis list"
            >
              Clear
            </button>
          </div>
        </div>
        {topMultis.length === 0 ? (
          <p className="text-[0.72rem] text-[var(--text-muted)]">No settled multipliers yet.</p>
        ) : (
          <div className="space-y-1.5">
            {topMultis.map((row, idx) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 rounded border border-[var(--border)]/70 bg-[var(--bg-card)]/70 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.72rem] font-medium text-[var(--text)]">{row.slotName}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[0.64rem] text-[var(--text-muted)]">{formatAmount(row.winAmount, row.currencyCode)}</p>
                    {row.shareId ? (
                      <button
                        type="button"
                        className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[0.6rem] text-[var(--accent)]"
                        title={`Copy house id (${row.shareId})`}
                        onClick={() => {
                          try {
                            navigator?.clipboard?.writeText(row.shareId).catch(() => {})
                          } catch {}
                        }}
                      >
                        Copy ID
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[0.8rem] font-semibold text-[var(--success)] tabular-nums">{row.multiplier.toFixed(2)}x</p>
                  <p className="text-[0.62rem] text-[var(--text-muted)]">#{idx + 1}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-[var(--border)]/80 pt-2">
        <p className="mb-2 text-[0.65rem] uppercase tracking-wide text-[var(--text-muted)]">Top wins</p>
        {topWins.length === 0 ? (
          <p className="text-[0.72rem] text-[var(--text-muted)]">No settled wins yet.</p>
        ) : (
          <div className="space-y-1.5">
            {topWins.map((row, idx) => (
              <div key={`win:${row.key}`} className="flex items-center justify-between gap-2 rounded border border-[var(--border)]/70 bg-[var(--bg-card)]/70 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.72rem] font-medium text-[var(--text)]">{row.slotName}</p>
                  <p className="text-[0.64rem] text-[var(--text-muted)]">{formatAmount(row.winAmount, row.currencyCode)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.8rem] font-semibold text-[var(--success)] tabular-nums">{row.multiplier.toFixed(2)}x</p>
                  <p className="text-[0.62rem] text-[var(--text-muted)]">#{idx + 1}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-[var(--border)]/80 pt-2">
        <p className="mb-2 text-[0.65rem] uppercase tracking-wide text-[var(--text-muted)]">Top slots</p>
        {topSlots.length === 0 ? (
          <p className="text-[0.72rem] text-[var(--text-muted)]">No slot aggregates yet.</p>
        ) : (
          <div className="space-y-1.5">
            {topSlots.map((row, idx) => (
              <div key={`slot:${row.slotName}`} className="flex items-center justify-between gap-2 rounded border border-[var(--border)]/70 bg-[var(--bg-card)]/70 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.72rem] font-medium text-[var(--text)]">{row.slotName}</p>
                  <p className="text-[0.64rem] text-[var(--text-muted)]">{row.spins} top hits · best win {formatAmount(row.bestWinAmount, row.currencyCode)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.8rem] font-semibold text-[var(--success)] tabular-nums">{row.bestMulti.toFixed(2)}x</p>
                  <p className="text-[0.62rem] text-[var(--text-muted)]">#{idx + 1}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  )
})
