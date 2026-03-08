/**
 * Slot-Auswahl – Futuristisch: Horizontale Provider-Chips + kompaktes Grid
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { getSlotsGroupedByProvider, PROVIDERS as PROVIDERS_BASIC } from '../constants/slots'
import { PROVIDERS as PROVIDERS_META, supportsMultiCurrencySameSlot } from '../constants/providers'

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
)

/** Provider-Farben für Neon-Chips */
const PROVIDER_COLORS = {
  hacksaw: '#FF00AA',
  pragmatic: '#00F0FF',
  stakeEngine: '#9D00FF',
  nolimit: '#00ff88',
  default: '#00F0FF',
}

const getProviderColor = (pid) => PROVIDER_COLORS[pid] || PROVIDER_COLORS.default

/* SlotSelectSingle – Legacy Accordion (für Challenges etc.) */
const LEGACY_STYLES = {
  group: { marginBottom: '0.5rem' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.85rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' },
  groupSlots: { padding: '0.65rem', background: 'var(--bg-deep)', border: '1px solid var(--border-subtle)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' },
  slot: { padding: '0.5rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text)', border: '1px solid var(--border-subtle)', background: 'var(--bg-card)' },
  slotSelected: { background: 'rgba(0, 240, 255, 0.12)', borderColor: 'var(--accent)' },
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
 */
export function SlotSelectMulti({ slots, selectedSlugs, selectedInstances = [], onToggle, onAddInstance, onRemoveInstance, disabled, favorites = [], onToggleFavorite, sharedSourceCurrency, sharedTargetCurrency }) {
  const isInstanceMode = !!onAddInstance
  const groups = getSlotsGroupedByProvider(slots)
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

  const providerIds = useMemo(() => Object.keys(groups), [groups])
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

  const chipsRef = useRef(null)

  return (
    <div className="slot-select-cyber" style={{ marginBottom: '1rem' }}>
      {isInstanceMode && selectedInstances.length > 0 && (
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
                  background: 'rgba(0, 240, 255, 0.08)',
                  border: '1px solid rgba(0, 240, 255, 0.4)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  color: 'var(--text)',
                  boxShadow: '0 0 12px rgba(0, 240, 255, 0.15)',
                }}
              >
                <span>{label}{cc}</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveInstance?.(inst.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem', fontSize: '1rem', color: 'var(--text-muted)', lineHeight: 1 }} title="Entfernen">×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky Such- und Filter-Bar */}
      <div 
        style={{ 
          position: 'sticky', 
          top: 0, 
          zIndex: 10, 
          padding: '0.5rem 0', 
          background: 'var(--bg-deep)', 
          marginBottom: '0.75rem',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <span style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex' }}><SearchIcon /></span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Slot suchen..."
              style={{
                width: '100%',
                padding: '0.45rem 0.7rem 0.45rem 2rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text)',
                fontSize: '0.8rem',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
            />
          </div>
        </div>
        {/* Horizontale Provider-Chips */}
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
            onClick={() => setProviderFilter('')}
            style={{
              flexShrink: 0,
              padding: '0.4rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: `1px solid ${!providerFilter ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: !providerFilter ? 'rgba(0, 240, 255, 0.15)' : 'var(--bg-elevated)',
              color: !providerFilter ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: !providerFilter ? '0 0 12px rgba(0, 240, 255, 0.25)' : 'none',
            }}
          >
            All
          </button>
          {providerIds.map((pid) => {
            const count = groups[pid]?.slots?.length || 0
            const color = getProviderColor(pid)
            const isActive = providerFilter === pid
            return (
              <button
                key={pid}
                type="button"
                onClick={() => setProviderFilter(pid)}
                style={{
                  flexShrink: 0,
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${isActive ? color : 'var(--border-subtle)'}`,
                  background: isActive ? `${color}22` : 'var(--bg-elevated)',
                  color: isActive ? color : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
                }}
              >
                {PROVIDERS_META[pid]?.name || PROVIDERS_BASIC[pid]?.name || pid} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* Kompaktes Slot-Grid 3-5 Spalten */}
      <div style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: '0.35rem' }}>
        {displaySlots.length === 0 ? (
          <div style={{ padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            {debouncedSearch?.trim() ? 'Keine Slots gefunden.' : 'Keine Slots verfügbar.'}
          </div>
        ) : (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {displaySlots.map((slot) => {
              const selected = isInstanceMode ? selectedInstances.some((i) => i.slug === slot.slug) : selectedSlugs.includes(slot.slug)
              const instanceCount = isInstanceMode ? selectedInstances.filter((i) => i.slug === slot.slug).length : (selected ? 1 : 0)
              const isFav = favorites.includes(slot.slug)
              const handleClick = () => {
                if (disabled) return
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
              const initials = (slot.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase().slice(0, 2)
              const providerColor = getProviderColor(slot.providerId || slot.provider || 'default')
              const hasThumbnail = !!slot.thumbnailUrl
              return (
                <div
                  key={slot.slug}
                  role="button"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
                  className="slot-pill slot-card-compact"
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
                    background: selected ? 'rgba(0, 240, 255, 0.1)' : 'var(--bg-card)',
                    minHeight: '4.5rem',
                    transition: 'all 0.2s',
                    position: 'relative',
                    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                  }}
                  title={slot.name}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.25rem', marginBottom: '0.35rem' }}>
                    <div style={{ 
                      width: 42, height: 42, borderRadius: 8, 
                      background: hasThumbnail ? 'var(--bg-elevated)' : `${providerColor}33`, 
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
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.25, fontWeight: selected ? 600 : 400 }}>
                    {slot.name}
                    {instanceCount > 1 && <span style={{ marginLeft: '0.2rem', opacity: 0.8 }}>({instanceCount})</span>}
                  </span>
                  {onToggleFavorite && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(slot.slug) }}
                      style={{ position: 'absolute', bottom: '0.35rem', right: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem', fontSize: '0.75rem', color: isFav ? 'var(--warning)' : 'var(--text-muted)', opacity: isFav ? 1 : 0.4 }}
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
    </div>
  )
}
