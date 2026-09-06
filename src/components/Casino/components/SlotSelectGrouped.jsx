/**
 * Slot-Auswahl – Futuristisch: Horizontale Provider-Chips + kompaktes Grid
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { getSlotsGroupedByProvider, PROVIDERS as PROVIDERS_BASIC } from '../constants/slots'
import { PROVIDERS as PROVIDERS_META, supportsMultiCurrencySameSlot } from '../constants/providers'
import {
  loadProviderFavorites,
  saveProviderFavorites,
  loadSlotViewPreset,
  saveSlotViewPreset,
  loadRecentSlots,
  pushRecentSlot,
  pushRecentSlots,
  subscribeRecentSlots,
} from '../utils/slotDiscoveryPreferences'
import { loadRecentBets } from '../utils/betHistoryDb'

const BROWSE_SOFT_CAP = 72

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
)

/** Provider-Farben für Neon-Chips */
const PROVIDER_COLORS = {
  hacksaw: '#b61f34',
  pragmatic: '#b61f34',
  stakeEngine: '#9a1a2d',
  nolimit: '#c22a3f',
  default: '#b61f34',
}

const getProviderColor = (pid) => PROVIDER_COLORS[pid] || PROVIDER_COLORS.default

/* SlotSelectSingle – Legacy Accordion (für Challenges etc.) */
const LEGACY_STYLES = {
  group: { marginBottom: '0.5rem' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.85rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' },
  groupSlots: { padding: '0.65rem', background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' },
  slot: { padding: '0.5rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)' },
  slotSelected: { background: 'rgba(var(--accent-rgb), 0.12)', borderColor: 'var(--accent)' },
  chevron: { transition: 'transform 0.2s' },
}

export function SlotSelectSingle({ slots, value, onChange }) {
  const groups = getSlotsGroupedByProvider(slots)
  const [open, setOpen] = useState({})

  const toggleGroup = (pid) => {
    setOpen((o) => ({ ...o, [pid]: !o[pid] }))
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {Object.entries(groups).map(([providerId, { provider, slots: groupSlots }]) => {
        const isOpen = open[providerId]
        return (
          <div key={providerId} style={LEGACY_STYLES.group}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleGroup(providerId)}
              onKeyDown={(e) => e.key === 'Enter' && toggleGroup(providerId)}
              style={LEGACY_STYLES.groupHeader}
            >
              <span>{(PROVIDERS_META[providerId]?.name || provider?.name || providerId)}</span>
              <span style={{ ...LEGACY_STYLES.chevron, transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            </div>
            {isOpen && (
              <div style={LEGACY_STYLES.groupSlots}>
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  <div style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', color: 'var(--text)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Provider</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      ID: {providerId}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Impl: {PROVIDERS_BASIC[providerId]?.impl || 'n/a'}
                    </div>
                    {PROVIDERS_META[providerId]?.aliasOf && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Alias von: {PROVIDERS_META[providerId].aliasOf}
                      </div>
                    )}
                    {PROVIDERS_META[providerId]?.protocol && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Protocol: {PROVIDERS_META[providerId].protocol}
                      </div>
                    )}
                    {PROVIDERS_META[providerId]?.betLevelsSource && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        BetLevels: {PROVIDERS_META[providerId].betLevelsSource}
                      </div>
                    )}
                  </div>
                </div>
                {groupSlots.map((slot) => (
                  <div
                    key={slot.slug}
                    role="button"
                    tabIndex={0}
                    onClick={() => onChange(slot)}
                    onKeyDown={(e) => e.key === 'Enter' && onChange(slot)}
                    style={{
                      ...LEGACY_STYLES.slot,
                      ...(value?.slug === slot.slug ? LEGACY_STYLES.slotSelected : {}),
                    }}
                  >
                    {slot.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Optimierte Suchfunktion mit Memoization
function slotMatchesSearch(slot, q) {
  if (!q || !q.trim()) return true
  const ql = q.trim().toLowerCase()
  
  // Cache für Suchergebnisse
  if (!slot._searchCache) {
    slot._searchCache = {
      name: (slot.name || '').toLowerCase(),
      slug: (slot.slug || '').toLowerCase()
    }
  }
  
  return slot._searchCache.name.includes(ql) || slot._searchCache.slug.includes(ql)
}

/**
 * @param {object} props
 * @param {Array} props.slots
 * @param {Array<string>} props.selectedSlugs - für Bonus Hunt (unique)
 * @param {Array<{id,slug,sourceCurrency?,targetCurrency?}>} [props.selectedInstances] - für Play mode
 * @param {Function} props.onToggle - (slug) => void
 * @param {Function} [props.onAddInstance] - (slug, sourceCurrency?, targetCurrency?) => void
 * @param {Function} [props.onRemoveInstance] - (instanceId) => void
 * @param {boolean} [props.disabled]
 * @param {Array} [props.favorites]
 * @param {Function} [props.onToggleFavorite]
 * @param {string} [props.sharedSourceCurrency]
 * @param {string} [props.sharedTargetCurrency]
 * @param {boolean} [props.loading] - show skeleton grid when catalog is loading and list is still empty
 * @param {boolean} [props.discoveryLanding=true] - Recents/Favorites first; full grid only in Browse
 * @param {boolean} [props.hideInstanceTray=false] - hide selected chips (parent renders tray)
 */
export function SlotSelectMulti({
  slots,
  selectedSlugs,
  selectedInstances = [],
  onToggle,
  onAddInstance,
  onRemoveInstance,
  disabled,
  favorites = [],
  onToggleFavorite,
  sharedSourceCurrency,
  sharedTargetCurrency,
  hasBonusSlugs = [],
  loading = false,
  discoveryLanding = true,
  hideInstanceTray = false,
}) {
  const isInstanceMode = !!onAddInstance
  const groups = getSlotsGroupedByProvider(slots)
  const initialPreset = useMemo(() => loadSlotViewPreset(), [])
  const [search, setSearch] = useState(initialPreset.search || '')
  const [providerFilter, setProviderFilter] = useState(initialPreset.providerFilter || '')
  const [onlyFavoriteProviders, setOnlyFavoriteProviders] = useState(Boolean(initialPreset.onlyFavoriteProviders))
  const [favoriteProviders, setFavoriteProviders] = useState(() => loadProviderFavorites())
  const [debouncedSearch, setDebouncedSearch] = useState(initialPreset.search || '')
  const [browseOpen, setBrowseOpen] = useState(() =>
    Boolean(initialPreset.search?.trim() || initialPreset.providerFilter || initialPreset.onlyFavoriteProviders)
  )
  const [showAllCap, setShowAllCap] = useState(BROWSE_SOFT_CAP)
  const [recentSlugs, setRecentSlugs] = useState(() => loadRecentSlots())

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => subscribeRecentSlots(setRecentSlugs), [])

  // Seed Last played from bet history when local recents are empty (no-op if session-only bets).
  useEffect(() => {
    if (!discoveryLanding) return
    if (loadRecentSlots().length > 0) return
    let cancelled = false
    loadRecentBets(80)
      .then((bets) => {
        if (cancelled || !Array.isArray(bets) || bets.length === 0) return
        const ordered = []
        const seen = new Set()
        for (const bet of bets) {
          const slug = String(bet?.slotSlug || '').trim()
          if (!slug || seen.has(slug)) continue
          seen.add(slug)
          ordered.push(slug)
          if (ordered.length >= 12) break
        }
        if (ordered.length === 0) return
        // bets are newest-first; pushRecentSlots makes last input most recent — reverse so newest wins.
        const next = pushRecentSlots([...ordered].reverse())
        if (!cancelled) setRecentSlugs(next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [discoveryLanding])

  useEffect(() => {
    if (debouncedSearch?.trim() || providerFilter || onlyFavoriteProviders) {
      setBrowseOpen(true)
    }
  }, [debouncedSearch, providerFilter, onlyFavoriteProviders])

  useEffect(() => {
    setShowAllCap(BROWSE_SOFT_CAP)
  }, [providerFilter, debouncedSearch, onlyFavoriteProviders, browseOpen])

  const filteredGroups = useMemo(() => {
    let out = groups
    if (onlyFavoriteProviders) {
      const favoriteSet = new Set(favoriteProviders)
      out = Object.fromEntries(Object.entries(groups).filter(([pid]) => favoriteSet.has(pid)))
    }
    if (providerFilter && out[providerFilter]) {
      out = { [providerFilter]: groups[providerFilter] }
    }

    if (!debouncedSearch?.trim()) return out

    const searchOut = {}
    for (const [providerId, data] of Object.entries(out)) {
      if (!data) continue
      const matched = (data.slots || []).filter((s) => slotMatchesSearch(s, debouncedSearch))
      if (matched.length > 0) {
        searchOut[providerId] = { ...data, slots: matched }
      }
    }
    return searchOut
  }, [groups, debouncedSearch, providerFilter, onlyFavoriteProviders, favoriteProviders])

  const providerIds = useMemo(() => {
    const fav = new Set(favoriteProviders)
    return Object.keys(groups).sort((a, b) => {
      const af = fav.has(a)
      const bf = fav.has(b)
      if (af && !bf) return -1
      if (!af && bf) return 1
      const an = String(PROVIDERS_META[a]?.name || PROVIDERS_BASIC[a]?.name || a)
      const bn = String(PROVIDERS_META[b]?.name || PROVIDERS_BASIC[b]?.name || b)
      return an.localeCompare(bn, 'de')
    })
  }, [groups, favoriteProviders])

  const allSlotsFlat = useMemo(() => {
    const list = []
    for (const [, data] of Object.entries(filteredGroups)) {
      if (data?.slots) list.push(...data.slots)
    }
    return list.sort((a, b) => {
      const fa = favorites.includes(a.slug), fb = favorites.includes(b.slug)
      if (fa && !fb) return -1
      if (!fa && fb) return 1
      return 0
    })
  }, [filteredGroups, favorites])

  const displaySlots = providerFilter
    ? (filteredGroups[providerFilter]?.slots || []).sort((a, b) => {
        const fa = favorites.includes(a.slug), fb = favorites.includes(b.slug)
        if (fa && !fb) return -1
        if (!fa && fb) return 1
        return 0
      })
    : allSlotsFlat

  const slotsBySlug = useMemo(() => {
    const map = new Map()
    for (const s of slots || []) {
      if (s?.slug) map.set(s.slug, s)
    }
    return map
  }, [slots])

  const recentSlots = useMemo(
    () => recentSlugs.map((slug) => slotsBySlug.get(slug)).filter(Boolean).slice(0, 12),
    [recentSlugs, slotsBySlug]
  )

  const favoriteSlots = useMemo(
    () => (favorites || []).map((slug) => slotsBySlug.get(slug)).filter(Boolean).slice(0, 24),
    [favorites, slotsBySlug]
  )

  const showBrowseGrid = !discoveryLanding || browseOpen
  const applySoftCap = discoveryLanding && showBrowseGrid && !providerFilter && !debouncedSearch?.trim()
  const cappedSlots = applySoftCap
    ? displaySlots.slice(0, showAllCap)
    : displaySlots
  const hasMoreSoftCap = applySoftCap && displaySlots.length > showAllCap

  const chipsRef = useRef(null)
  const hasBonusLookup = useMemo(() => {
    if (hasBonusSlugs instanceof Set) return hasBonusSlugs
    if (Array.isArray(hasBonusSlugs)) return new Set(hasBonusSlugs)
    return new Set()
  }, [hasBonusSlugs])

  useEffect(() => {
    saveProviderFavorites(favoriteProviders)
  }, [favoriteProviders])

  useEffect(() => {
    saveSlotViewPreset({ search, providerFilter, onlyFavoriteProviders })
  }, [search, providerFilter, onlyFavoriteProviders])

  const toggleProviderFavorite = (providerId) => {
    setFavoriteProviders((prev) => {
      const set = new Set(prev)
      if (set.has(providerId)) set.delete(providerId)
      else set.add(providerId)
      return Array.from(set)
    })
  }

  const selectSlot = (slot) => {
    if (disabled || !slot?.slug) return
    setRecentSlugs(pushRecentSlot(slot.slug))
    if (isInstanceMode) {
      const alreadyHas = selectedInstances.some((i) => i.slug === slot.slug)
      const supportsMulti = supportsMultiCurrencySameSlot(slot.providerId || slot.provider)
      if (alreadyHas && !supportsMulti) {
        onAddInstance?.(slot.slug, null, null, true)
      } else {
        onAddInstance?.(slot.slug, sharedSourceCurrency, sharedTargetCurrency, false)
      }
    } else {
      onToggle(slot.slug)
    }
  }

  const openBrowseAll = () => {
    setProviderFilter('')
    setBrowseOpen(true)
  }

  const closeBrowseToLanding = () => {
    setSearch('')
    setDebouncedSearch('')
    setProviderFilter('')
    setOnlyFavoriteProviders(false)
    setBrowseOpen(false)
  }

  const showSlotSkeleton = Boolean(loading && (!slots || slots.length === 0))

  const renderSlotTile = (slot) => {
    const selected = isInstanceMode ? selectedInstances.some((i) => i.slug === slot.slug) : selectedSlugs.includes(slot.slug)
    const instanceCount = isInstanceMode ? selectedInstances.filter((i) => i.slug === slot.slug).length : (selected ? 1 : 0)
    const isFav = favorites.includes(slot.slug)
    const hasBonus = hasBonusLookup.has(slot.slug)
    const initials = (slot.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    const providerColor = getProviderColor(slot.providerId || slot.provider || 'default')
    const hasThumbnail = !!slot.thumbnailUrl
    return (
      <div
        key={slot.slug}
        role="button"
        tabIndex={0}
        onClick={() => selectSlot(slot)}
        onKeyDown={(e) => e.key === 'Enter' && selectSlot(slot)}
        className="slot-pill"
        data-selected={selected}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          padding: '0.5rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.75rem',
          cursor: 'pointer',
          color: 'var(--text)',
          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
          background: selected
            ? 'linear-gradient(180deg, rgba(var(--accent-rgb), 0.1) 0%, rgba(var(--accent-rgb), 0.03) 48%, rgba(8,8,12,0.94) 100%)'
            : 'linear-gradient(180deg, rgba(var(--accent-rgb), 0.05) 0%, rgba(var(--accent-rgb), 0.015) 42%, rgba(8,8,12,0.94) 100%)',
          minHeight: '4.5rem',
          transition: 'all 0.2s',
          position: 'relative',
          ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
        }}
        title={slot.name}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem', marginBottom: '0.35rem' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 3,
            background: hasThumbnail
              ? 'color-mix(in srgb, var(--bg-elevated) 90%, rgba(var(--accent-rgb), 0.08))'
              : `${providerColor}33`,
            border: `1px solid ${hasThumbnail ? 'var(--border-subtle)' : `${providerColor}66`}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: hasThumbnail ? 0 : '0.7rem', fontWeight: 700, color: providerColor, flexShrink: 0,
            overflow: 'hidden',
          }}>
            {hasThumbnail ? (
              <img src={slot.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            ) : (
              initials
            )}
          </div>
          <div style={{
            width: 14, height: 14, borderRadius: 3,
            border: `1px solid ${selected ? 'var(--accent)' : 'var(--text-muted)'}`,
            background: selected ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6rem', color: '#000', flexShrink: 0,
          }}>
            {selected && '✓'}
          </div>
        </div>
        {hasBonus && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              alignSelf: 'flex-start',
              marginBottom: '0.25rem',
              padding: '0.1rem 0.35rem',
              borderRadius: 999,
              border: '1px solid rgba(var(--accent-rgb), 0.35)',
              background: 'rgba(var(--accent-rgb), 0.08)',
              color: 'var(--accent)',
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >
            HAS BONUS
          </div>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, fontWeight: selected ? 600 : 400 }}>
          {slot.name}
          {instanceCount > 1 && <span style={{ marginLeft: '0.2rem', opacity: 0.8 }}>({instanceCount})</span>}
        </span>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(slot.slug) }}
            style={{ position: 'absolute', bottom: '0.35rem', right: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem', fontSize: '0.75rem', color: isFav ? 'var(--warning)' : 'var(--text-muted)', opacity: isFav ? 1 : 0.4 }}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFav ? '★' : '☆'}
          </button>
        )}
      </div>
    )
  }

  const renderQuickRow = (label, rowSlots, emptyHint) => (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
        {rowSlots.length > 0 && (
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{rowSlots.length}</span>
        )}
      </div>
      {rowSlots.length === 0 ? (
        <div style={{ padding: '0.65rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--bg-deep)' }}>
          {emptyHint}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.45rem' }}>
          {rowSlots.map(renderSlotTile)}
        </div>
      )}
    </div>
  )

  return (
    <div className="slot-select-cyber" style={{ marginBottom: '1rem' }}>
      {isInstanceMode && !hideInstanceTray && selectedInstances.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {selectedInstances.map((inst) => {
            const slot = slots?.find((s) => s.slug === inst.slug)
            const label = slot?.name || inst.slug
            const cc = inst.targetCurrency || inst.sourceCurrency ? ` (${(inst.targetCurrency || inst.sourceCurrency || '').toUpperCase()})` : ''
            return (
              <div
                key={inst.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.6rem',
                  background: 'rgba(var(--accent-rgb), 0.08)',
                  border: '1px solid rgba(var(--accent-rgb), 0.4)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  color: 'var(--text)',
                  boxShadow: '0 0 12px rgba(var(--accent-rgb), 0.18)',
                }}
              >
                <span>{label}{cc}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveInstance?.(inst.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem', fontSize: '1rem', color: 'var(--text-muted)', lineHeight: 1 }} title="Remove">×</button>
              </div>
            )
          })}
        </div>
      )}

      {discoveryLanding && !showBrowseGrid && (
        <div style={{ marginBottom: '0.75rem' }}>
          {showSlotSkeleton ? (
            <div
              className="slot-grid-skeleton"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.45rem', marginBottom: '0.85rem' }}
              aria-busy="true"
              aria-label="Loading games"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="slot-skeleton-tile" />
              ))}
            </div>
          ) : (
            <>
              {recentSlots.length > 0 && renderQuickRow('Last played', recentSlots)}
              {favoriteSlots.length > 0 && renderQuickRow('Favorites', favoriteSlots)}
            </>
          )}

          {(() => {
            const LANDING_PROVIDER_CAP = 8
            const favSet = new Set(favoriteProviders)
            const sortedIds = [...providerIds].sort((a, b) => Number(favSet.has(b)) - Number(favSet.has(a)))
            const shown = sortedIds.slice(0, LANDING_PROVIDER_CAP)
            const hidden = sortedIds.length - shown.length
            return (
          <div style={{ marginBottom: '0.55rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              Providers
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {shown.map((pid) => {
                const count = groups[pid]?.slots?.length || 0
                const color = getProviderColor(pid)
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => {
                      setProviderFilter(pid)
                      setBrowseOpen(true)
                    }}
                    style={{
                      padding: '0.4rem 0.7rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: `1px solid ${color}55`,
                      background: `${color}14`,
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    {PROVIDERS_META[pid]?.name || PROVIDERS_BASIC[pid]?.name || pid}
                    <span style={{ marginLeft: '0.35rem', color: 'var(--text-muted)', fontWeight: 500 }}>{count}</span>
                  </button>
                )
              })}
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={openBrowseAll}
                  style={{
                    padding: '0.4rem 0.7rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  +{hidden} more
                </button>
              )}
            </div>
          </div>
            )
          })()}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <span style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}><SearchIcon /></span>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (e.target.value.trim()) setBrowseOpen(true)
                }}
                placeholder="Search slot…"
                style={{
                  width: '100%',
                  padding: '0.45rem 0.7rem 0.45rem 2rem',
                  background: 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.05))',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text)',
                  fontSize: '0.8rem',
                }}
              />
            </div>
            <button
              type="button"
              onClick={openBrowseAll}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--accent)',
                background: 'rgba(var(--accent-rgb), 0.12)',
                color: 'var(--accent)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Browse all
            </button>
          </div>
        </div>
      )}

      {showBrowseGrid && (
        <>
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              padding: '0.5rem 0',
              background: 'linear-gradient(180deg, rgba(var(--accent-rgb), 0.06) 0%, rgba(var(--accent-rgb), 0.015) 42%, rgba(8,8,12,0.92) 100%)',
              marginBottom: '0.75rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
              {discoveryLanding && (
                <button
                  type="button"
                  onClick={closeBrowseToLanding}
                  style={{
                    padding: '0.4rem 0.65rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.05))',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ← Quick pick
                </button>
              )}
              <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                <span style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}><SearchIcon /></span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search slot..."
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.7rem 0.45rem 2rem',
                    background: 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.05))',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyFavoriteProviders((v) => !v)}
                style={{
                  padding: '0.4rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${onlyFavoriteProviders ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: onlyFavoriteProviders ? 'rgba(var(--accent-rgb), 0.1)' : 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.05))',
                  color: onlyFavoriteProviders ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Show only favorite providers"
              >
                Fav Providers
              </button>
            </div>
            <div
              ref={chipsRef}
              style={{
                display: 'flex',
                gap: '0.4rem',
                overflowX: 'auto',
                paddingBottom: '0.35rem',
                scrollbarGutter: 'stable',
              }}
            >
              <button
                type="button"
                onClick={openBrowseAll}
                style={{
                  flexShrink: 0,
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${!providerFilter ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: !providerFilter ? 'rgba(var(--accent-rgb), 0.1)' : 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.05))',
                  color: !providerFilter ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: !providerFilter ? '0 0 8px rgba(var(--accent-rgb), 0.12)' : 'none',
                }}
              >
                All
              </button>
              {providerIds.map((pid) => {
                const count = groups[pid]?.slots?.length || 0
                const color = getProviderColor(pid)
                const isActive = providerFilter === pid
                return (
                  <div key={pid} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setProviderFilter(pid)
                        setBrowseOpen(true)
                      }}
                      style={{
                        flexShrink: 0,
                        padding: '0.4rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: `1px solid ${isActive ? color : 'var(--border-subtle)'}`,
                        background: isActive ? `${color}1f` : 'color-mix(in srgb, var(--bg-elevated) 92%, rgba(var(--accent-rgb), 0.045))',
                        color: isActive ? color : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isActive ? `0 0 7px ${color}24` : 'none',
                      }}
                    >
                      {PROVIDERS_META[pid]?.name || PROVIDERS_BASIC[pid]?.name || pid} ({count})
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleProviderFavorite(pid)}
                      style={{
                        border: '1px solid var(--border-subtle)',
                        background: 'transparent',
                        color: favoriteProviders.includes(pid) ? 'var(--warning)' : 'var(--text-muted)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.3rem 0.4rem',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                      title={favoriteProviders.includes(pid) ? 'Remove provider favorite' : 'Add provider favorite'}
                    >
                      {favoriteProviders.includes(pid) ? '★' : '☆'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ maxHeight: '45vh', overflowY: 'auto', paddingRight: '0.35rem' }}>
            {showSlotSkeleton ? (
              <div
                className="slot-grid-skeleton"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '0.5rem',
                }}
                aria-busy="true"
                aria-label="Loading games"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="slot-skeleton-tile" />
                ))}
              </div>
            ) : cappedSlots.length === 0 ? (
              <div style={{ padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                {debouncedSearch?.trim() ? 'No slots found.' : 'No slots available.'}
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  {cappedSlots.map(renderSlotTile)}
                </div>
                {hasMoreSoftCap && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowAllCap((n) => n + BROWSE_SOFT_CAP)}
                      style={{
                        padding: '0.45rem 0.9rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Show more ({displaySlots.length - showAllCap} left)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
