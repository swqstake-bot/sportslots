/**
 * Challenges tab – list active & completed Stake challenges.
 * Completion-Tracking: API-Sync + lokale Speicherung.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchAllChallenges, fetchCompletedChallenges, fetchCurrencyRates } from '../api/stakeChallenges'
import { getCompletedChallengeIds, syncFromApiChallenges, markChallengeCompleted } from '../utils/challengeCompletion'
import { addDiscoveredFromChallenges } from '../utils/discoveredSlots'
import { formatBetLabel, formatChallengeAmountWithSymbol } from '../utils/formatAmount'
import { SkeletonChallenges } from './SkeletonLoader'

const SORT_OPTIONS = [
  { value: 'einsatz-asc', label: 'Einsatz: wenig → viel' },
  { value: 'einsatz-desc', label: 'Einsatz: viel → wenig' },
  { value: 'preis-asc', label: 'Preis: wenig → viel' },
  { value: 'preis-desc', label: 'Preis: viel → wenig' },
]

const STYLES = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    minHeight: 0,
    overflow: 'auto',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 600,
    marginBottom: 'var(--space-2)',
  },
  help: {
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-4)',
    lineHeight: 1.5,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    maxHeight: 400,
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--bg-elevated)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'border-color var(--transition-fast), background var(--transition-fast)',
  },
  itemHover: {
    borderColor: 'var(--accent)',
    background: 'rgba(var(--accent-rgb, 0, 230, 118), 0.08)',
  },
  itemName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexShrink: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },
  itemMulti: {
    fontWeight: 600,
    color: 'var(--accent)',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-6)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },
  skeleton: {
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },
  skeletonLine: {
    height: 14,
    background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-deep) 50%, var(--border) 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.2s ease-in-out infinite',
    borderRadius: 4,
  },
  error: {
    padding: 'var(--space-4)',
    background: 'rgba(255, 82, 82, 0.1)',
    border: '1px solid rgba(255, 82, 82, 0.3)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--error)',
    fontSize: 'var(--text-sm)',
  },
  empty: {
    padding: 'var(--space-6)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
    textAlign: 'center',
  },
  sortRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  sortLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },
  sortSelect: {
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text)',
    cursor: 'pointer',
  },
  searchInput: {
    minWidth: 220,
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text)',
  },
}

function sortChallenges(list, sortKey) {
  const [field, dir] = sortKey.split('-')
  const asc = dir === 'asc'
  return [...list].sort((a, b) => {
    const aVal = field === 'einsatz' ? (a.minBetUsd ?? -1) : (a.award ?? -1)
    const bVal = field === 'einsatz' ? (b.minBetUsd ?? -1) : (b.award ?? -1)
    return asc ? aVal - bVal : bVal - aVal
  })
}

const TAB_ACTIVE = 'active'
const TAB_COMPLETED = 'completed'
const SORT_STORAGE_KEY = 'slotbot_challenges_sort'

export default function ChallengesView({ accessToken, onSelectChallenge, webSlots = [], onDiscoveredSlots }) {
  const onDiscoveredSlotsRef = useRef(onDiscoveredSlots)
  onDiscoveredSlotsRef.current = onDiscoveredSlots
  const webSlotsRef = useRef(webSlots)
  webSlotsRef.current = webSlots

  const [challenges, setChallenges] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hoverId, setHoverId] = useState(null)
  const [sortBy, setSortBy] = useState(() => {
    try {
      const s = localStorage.getItem(SORT_STORAGE_KEY)
      if (s && SORT_OPTIONS.some((o) => o.value === s)) return s
    } catch {}
    return 'einsatz-asc'
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [tab, setTab] = useState(TAB_ACTIVE)
  const [completionVersion, setCompletionVersion] = useState(0)
  const completedIds = useMemo(() => getCompletedChallengeIds(), [completionVersion])
  const sortedChallenges = useMemo(
    () => sortChallenges(challenges, sortBy),
    [challenges, sortBy],
  )
  const filteredChallenges = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return sortedChallenges
    return sortedChallenges.filter((c) => {
      const name = String(c?.gameName || '').toLowerCase()
      const slug = String(c?.gameSlug || '').toLowerCase()
      return name.includes(q) || slug.includes(q)
    })
  }, [searchTerm, sortedChallenges])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortBy)
    } catch {}
  }, [sortBy])

  const formatAwardUsd = (c) => {
    if (c.award == null) return null
    const rate = rates[c.currency?.toLowerCase()] ?? 0
    const usd = rate ? c.award * rate : null
    return usd != null ? `~$${usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null
  }

  useEffect(() => {
    if (!accessToken) {
      setChallenges([])
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    const fetchFn = tab === TAB_COMPLETED ? fetchCompletedChallenges : fetchAllChallenges
    Promise.all([fetchFn(accessToken), fetchCurrencyRates(accessToken)])
      .then(([{ challenges: list }, ratesMap]) => {
        if (!cancelled) {
          setChallenges(list)
          setRates(ratesMap)
          syncFromApiChallenges(list)
          const knownSlugs = new Set((webSlotsRef.current || []).map((s) => s.slug))
          const added = addDiscoveredFromChallenges(list, knownSlugs)
          if (added.length) onDiscoveredSlotsRef.current?.(added)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Challenges could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [accessToken, tab])

  if (!accessToken) {
    return (
      <div style={STYLES.container}>
        <h2 style={STYLES.title}>Challenges</h2>
        <p style={STYLES.help}>
          Bitte mit Stake verbinden, um deine aktiven Challenges anzuzeigen.
        </p>
      </div>
    )
  }

  if (loading) {
    return <SkeletonChallenges />
  }

  if (error) {
    return (
      <div style={STYLES.container}>
        <h2 style={STYLES.title}>Challenges</h2>
        <div style={{ ...STYLES.sortRow, marginBottom: 'var(--space-3)' }}>
          <button type="button" onClick={() => setTab(TAB_ACTIVE)} style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: tab === TAB_ACTIVE ? 'var(--accent)' : 'var(--bg-elevated)', color: tab === TAB_ACTIVE ? 'var(--bg-deep)' : 'var(--text)', cursor: 'pointer', fontSize: '0.8rem' }}>
            Aktiv
          </button>
          <button type="button" onClick={() => setTab(TAB_COMPLETED)} style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: tab === TAB_COMPLETED ? 'var(--accent)' : 'var(--bg-elevated)', color: tab === TAB_COMPLETED ? 'var(--bg-deep)' : 'var(--text)', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.25rem' }}>
            Abgeschlossen
          </button>
        </div>
        <div style={STYLES.error}>{error}</div>
      </div>
    )
  }

  if (challenges.length === 0) {
    return (
      <div style={STYLES.container}>
        <h2 style={STYLES.title}>Challenges</h2>
        <p style={STYLES.help}>
          {tab === TAB_COMPLETED
            ? 'Abgeschlossene Challenges von Stake.'
            : 'Zeigt deine aktiven Stake-Challenges (Casino/Slots).'}
        </p>
        <div style={{ ...STYLES.sortRow, marginBottom: 'var(--space-3)' }}>
          <button type="button" onClick={() => setTab(TAB_ACTIVE)} style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: tab === TAB_ACTIVE ? 'var(--accent)' : 'var(--bg-elevated)', color: tab === TAB_ACTIVE ? 'var(--bg-deep)' : 'var(--text)', cursor: 'pointer', fontSize: '0.8rem' }}>
            Aktiv
          </button>
          <button type="button" onClick={() => setTab(TAB_COMPLETED)} style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: tab === TAB_COMPLETED ? 'var(--accent)' : 'var(--bg-elevated)', color: tab === TAB_COMPLETED ? 'var(--bg-deep)' : 'var(--text)', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.25rem' }}>
            Abgeschlossen
          </button>
        </div>
        <div style={STYLES.empty}>
          {tab === TAB_COMPLETED
            ? 'No completed challenges.'
            : 'No active challenges. You can find new challenges on Stake under "Challenges".'}
        </div>
      </div>
    )
  }

  const handleMarkCompleted = (e, c) => {
    e.stopPropagation()
    markChallengeCompleted(c.id)
    setCompletionVersion((v) => v + 1)
  }

  return (
    <div style={STYLES.container}>
      <h2 style={STYLES.title}>Challenges</h2>
      <p style={STYLES.help}>
        Klicke auf eine Challenge, um zu „Spielen“ zu wechseln und das Spiel mit dem Mindesteinsatz vorzuwählen.
      </p>
      <div style={{ ...STYLES.sortRow, marginBottom: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            type="button"
            onClick={() => setTab(TAB_ACTIVE)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: tab === TAB_ACTIVE ? 'var(--accent)' : 'var(--bg-elevated)',
              color: tab === TAB_ACTIVE ? 'var(--bg-deep)' : 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Aktiv
          </button>
          <button
            type="button"
            onClick={() => setTab(TAB_COMPLETED)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: tab === TAB_COMPLETED ? 'var(--accent)' : 'var(--bg-elevated)',
              color: tab === TAB_COMPLETED ? 'var(--bg-deep)' : 'var(--text)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Abgeschlossen
          </button>
        </div>
        <select
          style={STYLES.sortSelect}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sortierung der Challenges"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Slot suchen (Name oder Slug)..."
          aria-label="Challenge Slot suchen"
          style={STYLES.searchInput}
        />
      </div>
      <div style={STYLES.list}>
        {filteredChallenges.length === 0 && (
          <div style={STYLES.empty}>
            Keine Challenge passt zu "{searchTerm}".
          </div>
        )}
        {filteredChallenges.map((c) => {
          const isCompleted = completedIds.has(c.id) || !!c.completedAt
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              style={{
                ...STYLES.item,
                ...(hoverId === c.id ? STYLES.itemHover : {}),
                opacity: tab === TAB_COMPLETED ? 0.9 : 1,
              }}
              onMouseEnter={() => setHoverId(c.id)}
              onMouseLeave={() => setHoverId(null)}
              onKeyDown={(e) => e.key === 'Enter' && !e.target.closest('button') && onSelectChallenge(c)}
              onClick={(e) => !e.target.closest('button') && onSelectChallenge(c)}
            >
              <span style={STYLES.itemName} title={c.gameSlug}>
                {c.gameName}
                {isCompleted && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', color: 'var(--success)', fontWeight: 600 }}>
                    ✓
                  </span>
                )}
              </span>
              <span style={STYLES.itemMeta}>
                {tab === TAB_ACTIVE && !isCompleted && (
                  <button
                    type="button"
                    onClick={(e) => handleMarkCompleted(e, c)}
                    title="Als erledigt markieren"
                    style={{
                      padding: '0.15rem 0.4rem',
                      fontSize: '0.65rem',
                      background: 'var(--bg-deep)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                    }}
                  >
                    ✓ Markieren
                  </button>
                )}
                <span style={STYLES.itemMulti}>{c.targetMultiplier}×</span>
                {c.award != null && c.award > 0 && (
                  <span title={c.currency ? formatBetLabel(c.award, c.currency) : undefined}>
                    {formatAwardUsd(c) ?? formatBetLabel(c.award, c.currency || 'usd')}
                  </span>
                )}
                {c.minBetUsd != null && c.minBetUsd > 0 && (
                  <span>min. {formatChallengeAmountWithSymbol(c.minBetUsd, 'usd')}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
