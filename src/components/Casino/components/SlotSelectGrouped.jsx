/**
 * Slot-Auswahl gruppiert nach Anbieter, aufklappbar
 */
import { useState, useMemo, useEffect } from 'react'
import { getSlotsGroupedByProvider, PROVIDERS as PROVIDERS_BASIC } from '../constants/slots'
import { PROVIDERS as PROVIDERS_META } from '../constants/providers'

const STYLES = {
  searchInput: {
    width: '100%',
    padding: '0.5rem 0.75rem 0.5rem 2rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  searchWrap: { position: 'relative' },
  searchIcon: {
    position: 'absolute',
    left: '0.65rem',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
  },
  group: { marginBottom: '0.5rem' },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0.65rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
    userSelect: 'none',
    color: 'var(--text)',
  },
  groupSlots: {
    padding: '0.75rem',
    background: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border)',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '0.5rem',
  },
  slot: {
    padding: '0.5rem',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    minHeight: '3rem',
  },
  slotSelected: {
    background: 'rgba(var(--accent-rgb), 0.15)',
    borderColor: 'var(--accent)',
    color: 'var(--text)',
    fontWeight: 600,
    boxShadow: '0 0 0 1px var(--accent)',
  },
  slotHover: {
    borderColor: 'var(--text-muted)',
    transform: 'translateY(-1px)',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
  },
  chevron: { fontSize: '0.75rem', transition: 'transform 0.2s' },
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
          <div key={providerId} style={STYLES.group}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleGroup(providerId)}
              onKeyDown={(e) => e.key === 'Enter' && toggleGroup(providerId)}
              style={STYLES.groupHeader}
            >
              <span>{(PROVIDERS_META[providerId]?.name || provider?.name || providerId)}</span>
              <span style={{ ...STYLES.chevron, transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            </div>
            {isOpen && (
              <div style={STYLES.groupSlots}>
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
                      ...STYLES.slot,
                      ...(value?.slug === slot.slug ? STYLES.slotSelected : {}),
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

export function SlotSelectMulti({ slots, selectedSlugs, onToggle, disabled, favorites = [], onToggleFavorite }) {
  const groups = getSlotsGroupedByProvider(slots)
  const [open, setOpen] = useState({})
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce-Suche für bessere Performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const filteredGroups = useMemo(() => {
    // Erst Provider-Filter anwenden (schneller)
    let out = groups
    if (providerFilter) {
      out = { [providerFilter]: groups[providerFilter] }
    }
    
    // Dann Such-Filter anwenden
    if (!debouncedSearch?.trim()) return out
    
    const q = debouncedSearch.trim().toLowerCase()
    const searchOut = {}
    
    for (const [providerId, data] of Object.entries(out)) {
      if (!data) continue // Provider könnte undefined sein
      const matched = (data.slots || []).filter((s) => slotMatchesSearch(s, q))
      if (matched.length > 0) {
        searchOut[providerId] = { ...data, slots: matched }
      }
    }
    
    return searchOut
  }, [groups, debouncedSearch, providerFilter])

  const toggleGroup = (pid) => {
    setOpen((o) => ({ ...o, [pid]: !o[pid] }))
  }

  const providerIds = useMemo(() => Object.keys(groups), [groups])

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140, ...STYLES.searchWrap }}>
          <span style={STYLES.searchIcon}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Slot suchen..."
            style={STYLES.searchInput}
          />
        </div>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          style={{
            ...STYLES.searchInput,
            padding: '0.5rem 0.75rem',
            marginBottom: 0,
            width: 'auto',
            minWidth: 130,
          }}
        >
          <option value="">Alle Provider</option>
          {providerIds.map((pid) => (
            <option key={pid} value={pid}>
              {(PROVIDERS_META[pid]?.name || PROVIDERS_BASIC[pid]?.name || pid)}
            </option>
          ))}
        </select>
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: '0.5rem' }}>
      {Object.entries(filteredGroups).length === 0 ? (
        <div style={{ padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          {debouncedSearch?.trim() ? 'Keine Slots gefunden.' : 'Keine Slots verfügbar.'}
        </div>
      ) : (
      Object.entries(filteredGroups).map(([providerId, { provider, slots: groupSlots }]) => {
        const isOpen = debouncedSearch?.trim() ? true : open[providerId]
        return (
          <div key={providerId} style={{ ...STYLES.group, marginBottom: '1rem' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleGroup(providerId)}
              onKeyDown={(e) => e.key === 'Enter' && toggleGroup(providerId)}
              style={STYLES.groupHeader}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{isOpen ? '📂' : '📁'}</span>
                <span>{provider?.name || providerId}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>({groupSlots.length})</span>
              </div>
              <span style={{ ...STYLES.chevron, transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
            </div>
            {isOpen && (
              <div style={STYLES.groupSlots}>
                {[...groupSlots]
                  .sort((a, b) => {
                    const fa = favorites.includes(a.slug)
                    const fb = favorites.includes(b.slug)
                    if (fa && !fb) return -1
                    if (!fa && fb) return 1
                    return 0
                  })
                  .map((slot) => {
                    const selected = selectedSlugs.includes(slot.slug)
                    const isFav = favorites.includes(slot.slug)
                    return (
                      <div
                        key={slot.slug}
                        role="button"
                        tabIndex={0}
                        onClick={() => !disabled && onToggle(slot.slug)}
                        onKeyDown={(e) => e.key === 'Enter' && !disabled && onToggle(slot.slug)}
                        style={{
                          ...STYLES.slot,
                          ...(selected ? STYLES.slotSelected : {}),
                          ...(disabled ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                        }}
                        title={slot.name}
                      >
                        <div style={{ 
                          width: 20, height: 20, 
                          borderRadius: 4, 
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--text-muted)'}`,
                          background: selected ? 'var(--accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginRight: '0.25rem',
                          color: '#fff',
                          fontSize: '0.8rem'
                        }}>
                          {selected && '✓'}
                        </div>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selected ? 600 : 400 }}>{slot.name}</span>
                        {onToggleFavorite && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleFavorite(slot.slug) }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.2rem',
                              fontSize: '1rem',
                              color: isFav ? 'var(--warning)' : 'var(--text-muted)',
                              opacity: isFav ? 1 : 0.3,
                              transition: 'all 0.2s'
                            }}
                            title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                          >
                            {isFav ? '★' : '☆'}
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )
      })
      )}
      </div>
    </div>
  )
}
