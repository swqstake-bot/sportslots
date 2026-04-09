import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from './components/ui/Button'
import { Toast } from './components/Toast'
import { useSlots } from './hooks/useSlots'
import { loadSlotSets, saveSlotSet, deleteSlotSet, exportSlotSets, importSlotSets, loadFavorites, toggleFavorite } from './utils/slotSets'
import { loadDiscoveredSlots, saveDiscoveredSlots } from './utils/discoveredSlots'
import { loadRecentBets, clearAllBetHistory, clearSlotHistory } from './utils/betHistoryDb'
import { ALL_CURRENCIES } from './constants/currencies'
import { isFiat, isStable } from './utils/formatAmount'
import { CASINO_STORAGE_KEYS } from './utils/storageRegistry'
import './bridge/slotbotBridge'
import { useUiStore } from '../../store/uiStore'
import { useCasinoSession } from './hooks/useCasinoSession'
import { CasinoShell } from './components/shell/CasinoShell'
import { CasinoModeContent } from './components/tabs/CasinoModeContent'
import type { CasinoSlotInstance, SlotSet, CasinoChallengeSelection } from './types'

// Styles
import './casino.css'
import './styles/design-tokens.css'

const THEME_KEY = CASINO_STORAGE_KEYS.theme

export default function CasinoView() {
  const { token, status, error } = useCasinoSession()
  const [discoveredSlots, setDiscoveredSlots] = useState<{ slug: string; name: string; providerId: string; thumbnailUrl?: string }[]>(() => loadDiscoveredSlots())
  const { slots: webSlots, loading: slotsLoading, error: slotsError } = useSlots(token, discoveredSlots)
  const [selectedSlotInstances, setSelectedSlotInstances] = useState<CasinoSlotInstance[]>([])

  const selectedSlugs = selectedSlotInstances.map((i) => i.slug)
  const { casinoMode: mode, setCasinoMode: setMode } = useUiStore()
  const [slotSets, setSlotSets] = useState<SlotSet[]>(() => loadSlotSets())
  const [loadedSetId, setLoadedSetId] = useState('')
  const [saveSlotSetOpen, setSaveSlotSetOpen] = useState(false)
  const [saveSlotSetName, setSaveSlotSetName] = useState('')
  const [saveSlotSetError, setSaveSlotSetError] = useState('')
  const [toast, setToast] = useState('')
  const [theme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark')
  const [, setImportError] = useState('')
  const [favorites, setFavorites] = useState(() => loadFavorites())
  const slotControlRefsMap = useRef(new Map())
  /** Pro inst.id stabiler ref-Callback – vermeidet null/ref-Reattach bei jedem Parent-Render. */
  const slotControlRefCallbacks = useRef(new Map<string, (el: any) => void>())
  const [playLogRefreshKey, setPlayLogRefreshKey] = useState(0)

  const handlePlayLogUpdate = useCallback(() => {
    setPlayLogRefreshKey((k) => k + 1)
  }, [])

  const getSlotControlRef = useCallback((instanceId: string) => {
    let cb = slotControlRefCallbacks.current.get(instanceId)
    if (!cb) {
      cb = (el: any) => {
        if (el) slotControlRefsMap.current.set(instanceId, el)
        else slotControlRefsMap.current.delete(instanceId)
      }
      slotControlRefCallbacks.current.set(instanceId, cb)
    }
    return cb
  }, [])
  const [recentBets, setRecentBets] = useState<any[]>([])
  const [pendingPromoAutoStarts, setPendingPromoAutoStarts] = useState<Array<{
    instanceId: string
    autospinCount: number
    targetMultiplier?: number
    attempts: number
  }>>([])
  // const [lastBet, setLastBet] = useState<any>(null) // Unused
  const [useSharedCurrency, setUseSharedCurrency] = useState(false)
  const [sharedSourceCurrency, setSharedSourceCurrency] = useState('usdc')
  const [sharedTargetCurrency, setSharedTargetCurrency] = useState('eur')
  const [sharedCryptoOnly, setSharedCryptoOnly] = useState(false)
  const [globalControlsOpen, setGlobalControlsOpen] = useState(false)
  const [supportedCurrencies] = useState<{ value: string; label: string }[]>(ALL_CURRENCIES) // Removed unused setter

  // Filter currencies based on sharedCryptoOnly
  const displayedCurrencies = sharedCryptoOnly 
    ? supportedCurrencies.filter(c => !isFiat(c.value) || isStable(c.value))
    : supportedCurrencies

  // Auto-switch currency if filtered out
  useEffect(() => {
    if (sharedCryptoOnly) {
      if (isFiat(sharedSourceCurrency) && !isStable(sharedSourceCurrency)) {
        const first = displayedCurrencies.find(c => !isFiat(c.value) || isStable(c.value))
        if (first) setSharedSourceCurrency(first.value)
      }
      if (isFiat(sharedTargetCurrency) && !isStable(sharedTargetCurrency)) {
        const first = displayedCurrencies.find(c => !isFiat(c.value) || isStable(c.value))
        if (first) setSharedTargetCurrency(first.value)
      }
    }
  }, [sharedCryptoOnly, sharedSourceCurrency, sharedTargetCurrency, displayedCurrencies])

  // Beim App-Start: alte Slot-Statistiken löschen
  useEffect(() => {
    const key = CASINO_STORAGE_KEYS.sessionHistoryCleared
    if (!sessionStorage.getItem(key)) {
      clearAllBetHistory().catch(() => {}).finally(() => {
        try { sessionStorage.setItem(key, '1') } catch { /* ignore */ }
      })
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (playLogRefreshKey > 0 && recentBets.length > 0) {
      loadRecentBets(30).then(setRecentBets).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playLogRefreshKey])

  /*
  useEffect(() => {
    let cancelled = false
    const loadLast = () => {
      loadRecentBets(1)
        .then((list) => {
          if (!cancelled) setLastBet(list?.[0] ?? null)
        })
        .catch(() => {
          if (!cancelled) setLastBet(null)
        })
    }
    loadLast()
    const id = setInterval(loadLast, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])
  */

  const handleStartAll = useCallback(() => {
    selectedSlotInstances.forEach((inst) => {
      const ref = slotControlRefsMap.current.get(inst.id)
      if (ref) ref.startAutospin()
    })
  }, [selectedSlotInstances])

  const handleStopAll = useCallback(() => {
    selectedSlotInstances.forEach((inst) => {
      const ref = slotControlRefsMap.current.get(inst.id)
      if (ref) ref.stopAll()
    })
  }, [selectedSlotInstances])

  const handleApplyFirstSlotSettings = useCallback(() => {
    const refs = slotControlRefsMap.current
    const first = selectedSlotInstances[0]
    if (!first) return
    const ctrl = refs.get(first.id)
    if (!ctrl?.getSettings) return
    const settings = ctrl.getSettings()
    
    // Also sync shared currency state if applicable
    if (useSharedCurrency && settings.sourceCurrency && settings.targetCurrency) {
      setSharedSourceCurrency(settings.sourceCurrency)
      setSharedTargetCurrency(settings.targetCurrency)
    }

    for (let i = 1; i < selectedSlotInstances.length; i++) {
      refs.get(selectedSlotInstances[i].id)?.applySettings?.(settings)
    }
    setToast('Applied first slot settings to all slots')
  }, [selectedSlotInstances, useSharedCurrency])

  const handleSaveSet = (e: any) => {
    e?.preventDefault()
    if (!saveSlotSetName.trim()) return
    try {
      const id = saveSlotSet({ name: saveSlotSetName, slots: selectedSlotInstances.map((i) => i.slug) })
      const newSets = loadSlotSets()
      setSlotSets(newSets)
      setSaveSlotSetOpen(false)
      setSaveSlotSetName('')
      setSaveSlotSetError('')
      if (newSets.length > 0) {
        setLoadedSetId(id)
      }
    } catch (e: any) {
      setSaveSlotSetError(e.message)
    }
  }

  const handleLoadSet = (id: string) => {
    setLoadedSetId(id)
    const set = slotSets.find(s => s.id === id)
    if (set && Array.isArray(set.slugs)) {
      const newSlugs = new Set(set.slugs)
      setSelectedSlotInstances((prev) => {
        prev.forEach((i) => {
          if (!newSlugs.has(i.slug)) clearSlotHistory(i.slug).catch(() => {})
        })
        return set.slugs.map((slug, i) => ({
          id: `inst_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
          slug,
          sourceCurrency: sharedSourceCurrency,
          targetCurrency: sharedTargetCurrency,
        }))
      })
    }
  }

  const handleDeleteSet = (id: string, e: any) => {
    e.stopPropagation()
    if (!confirm('Delete slot set?')) return
    deleteSlotSet(id)
    setSlotSets(loadSlotSets())
    if (loadedSetId === id) setLoadedSetId('')
  }

  const handleExportSets = () => {
    const json = exportSlotSets()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'slotbot-sets.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportSets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        if (!ev.target?.result) return
        const res = importSlotSets(ev.target.result as string)
        if (res.ok) {
           setSlotSets(loadSlotSets())
           setImportError('')
           setToast('Sets importiert!')
           setTimeout(() => setToast(''), 3000)
        } else {
           setImportError(res.error || 'Import error')
        }
      } catch (err: any) {
        setImportError(err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleToggleFavorite = (slug: string) => {
    const newFavs = toggleFavorite(slug)
    setFavorites(newFavs)
  }

  const handleToggleSlot = useCallback((slug: string) => {
    setSelectedSlotInstances((prev) => {
      const removing = prev.some((i) => i.slug === slug)
      if (removing) {
        clearSlotHistory(slug).catch(() => {})
        return prev.filter((i) => i.slug !== slug)
      }
      return [...prev, { id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, slug, sourceCurrency: sharedSourceCurrency, targetCurrency: sharedTargetCurrency }]
    })
  }, [sharedSourceCurrency, sharedTargetCurrency])

  const handleAddInstance = useCallback((slug: string, source?: string | null, target?: string | null, blocked?: boolean) => {
    if (blocked) {
      setToast('Hacksaw supports only one session per game')
      setTimeout(() => setToast(''), 3000)
      return
    }
    setSelectedSlotInstances((prev) => [
      ...prev,
      {
        id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        slug,
        sourceCurrency: source || sharedSourceCurrency,
        targetCurrency: target || sharedTargetCurrency,
      },
    ])
  }, [sharedSourceCurrency, sharedTargetCurrency])

  /** Stabil, damit Kinder (Challenges / Auto Hunter) nicht bei jedem Render neu laden (useEffect-Deps). */
  const handleDiscoveredSlots = useCallback(
    (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => {
      setDiscoveredSlots((prev) => {
        const bySlug = new Map(prev.map((s) => [s.slug, { ...s }]))
        for (const s of added) {
          const ex = bySlug.get(s.slug)
          const merged = ex ? (s.thumbnailUrl ? { ...ex, thumbnailUrl: s.thumbnailUrl } : ex) : s
          bySlug.set(s.slug, merged)
        }
        const next = Array.from(bySlug.values())
        saveDiscoveredSlots(next)
        return next
      })
    },
    []
  )

  const handleRemoveInstance = useCallback((instanceId: string) => {
    setSelectedSlotInstances((prev) => {
      const removed = prev.find((i) => i.id === instanceId)
      const next = prev.filter((i) => i.id !== instanceId)
      if (removed && !next.some((i) => i.slug === removed.slug)) {
        clearSlotHistory(removed.slug).catch(() => {})
      }
      return next
    })
  }, [])

  const handleSelectChallenge = useCallback((challenge: CasinoChallengeSelection) => {
      if (!challenge?.gameSlug) return
      setMode('play')
      let selectedInstanceId = ''
      setSelectedSlotInstances((prev) => {
          const existing = prev.find((i) => i.slug === challenge.gameSlug)
          if (existing) {
            selectedInstanceId = existing.id
            return prev.map((item) => {
              if (item.id !== existing.id) return item
              return {
                ...item,
                targetCurrency: challenge.currency || item.targetCurrency || sharedTargetCurrency,
                ...(challenge.targetMultiplier != null && Number.isFinite(Number(challenge.targetMultiplier))
                  ? { challengeTargetMultiplier: Number(challenge.targetMultiplier) }
                  : {}),
                ...(challenge.targetMultipliers?.length
                  ? { challengeTargetMultipliers: challenge.targetMultipliers.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0) }
                  : {}),
                ...(challenge.minBetUsd != null && Number.isFinite(Number(challenge.minBetUsd)) && Number(challenge.minBetUsd) > 0
                  ? { minBetUsd: Number(challenge.minBetUsd) }
                  : {}),
                ...(challenge.promoSource ? { promoSource: challenge.promoSource } : {}),
              }
            })
          }
          selectedInstanceId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
          return [...prev, {
            id: selectedInstanceId,
            slug: challenge.gameSlug,
            sourceCurrency: sharedSourceCurrency,
            targetCurrency: challenge.currency || sharedTargetCurrency,
            ...(challenge.targetMultiplier != null && Number.isFinite(Number(challenge.targetMultiplier))
              ? { challengeTargetMultiplier: Number(challenge.targetMultiplier) }
              : {}),
            ...(challenge.targetMultipliers?.length
              ? { challengeTargetMultipliers: challenge.targetMultipliers.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0) }
              : {}),
            ...(challenge.minBetUsd != null && Number.isFinite(Number(challenge.minBetUsd)) && Number(challenge.minBetUsd) > 0
              ? { minBetUsd: Number(challenge.minBetUsd) }
              : {}),
            ...(challenge.promoSource ? { promoSource: challenge.promoSource } : {}),
          }]
      })
      if (challenge.autoStart && selectedInstanceId) {
        setPendingPromoAutoStarts((prev) => [
          ...prev,
          {
            instanceId: selectedInstanceId,
            autospinCount: Number.isFinite(Number(challenge.autospinCount)) ? Math.max(0, Number(challenge.autospinCount)) : 0,
            targetMultiplier: Number.isFinite(Number(challenge.targetMultiplier)) ? Number(challenge.targetMultiplier) : undefined,
            attempts: 0,
          },
        ])
      }
      setToast(`Challenge selected: ${challenge.gameName || challenge.gameSlug}`)
  }, [setMode, sharedSourceCurrency, sharedTargetCurrency])

  useEffect(() => {
    if (!pendingPromoAutoStarts.length) return
    const remaining: typeof pendingPromoAutoStarts = []
    for (const item of pendingPromoAutoStarts) {
      const ref = slotControlRefsMap.current.get(item.instanceId)
      if (!ref?.startSession || !ref?.startAutospin) {
        if ((item.attempts || 0) < 20) {
          remaining.push({ ...item, attempts: (item.attempts || 0) + 1 })
        }
        continue
      }
      const settings: any = {
        autospinCount: item.autospinCount,
        autospinStopOnBonus: false,
      }
      if (item.targetMultiplier != null && Number.isFinite(item.targetMultiplier) && item.targetMultiplier > 1) {
        settings.autospinStopOnMulti = true
        settings.autospinStopMultiplier = Math.max(2, item.targetMultiplier)
        settings.autospinStopMultiOnlyAt010Usd = true
      }
      try {
        ref.applySettings?.(settings)
      } catch {
        // ignore non-fatal setting apply failures
      }
      Promise.resolve(ref.startSession())
        .then(() => ref.startAutospin())
        .catch(() => {
          // ignore start failures, user can start manually
        })
    }
    const t = setTimeout(() => {
      setPendingPromoAutoStarts(remaining)
    }, remaining.length ? 120 : 0)
    return () => clearTimeout(t)
  }, [pendingPromoAutoStarts])

  if (status === 'idle') {
      return <div className="p-8 text-center text-[var(--text-muted)]">Loading Casino Session...</div>
  }

  const clearSlotHistoryForInstances = () => {
    setSelectedSlotInstances((prev) => {
      const slugsToClear = [...new Set(prev.map((i) => i.slug))]
      slugsToClear.forEach((s) => clearSlotHistory(s).catch(() => {}))
      return []
    })
  }

  return (
    <CasinoShell
      error={error}
      slotsError={slotsError}
      slotsLoading={slotsLoading}
      token={token}
      mode={mode}
      onChangeMode={setMode}
    >
      <CasinoModeContent
        mode={mode}
        token={token}
        webSlots={webSlots as any}
        selectedSlugs={selectedSlugs}
        selectedSlotInstances={selectedSlotInstances}
        loadedSetId={loadedSetId}
        slotSets={slotSets}
        favorites={favorites}
        globalControlsOpen={globalControlsOpen}
        sharedSourceCurrency={sharedSourceCurrency}
        sharedTargetCurrency={sharedTargetCurrency}
        sharedCryptoOnly={sharedCryptoOnly}
        useSharedCurrency={useSharedCurrency}
        displayedCurrencies={displayedCurrencies}
        playLogRefreshKey={playLogRefreshKey}
        recentBets={recentBets}
        setGlobalControlsOpen={setGlobalControlsOpen}
        setSharedSourceCurrency={setSharedSourceCurrency}
        setSharedTargetCurrency={setSharedTargetCurrency}
        setSharedCryptoOnly={setSharedCryptoOnly}
        setUseSharedCurrency={setUseSharedCurrency}
        setSaveSlotSetOpen={setSaveSlotSetOpen}
        setSelectedSlotInstances={setSelectedSlotInstances}
        clearSlotHistoryForInstances={clearSlotHistoryForInstances}
        handleToggleSlot={handleToggleSlot}
        handleAddInstance={handleAddInstance}
        handleRemoveInstance={handleRemoveInstance}
        handleToggleFavorite={handleToggleFavorite}
        handleLoadSet={handleLoadSet}
        handleDeleteSet={handleDeleteSet}
        handleImportSets={handleImportSets}
        handleExportSets={handleExportSets}
        handleStartAll={handleStartAll}
        handleStopAll={handleStopAll}
        handleApplyFirstSlotSettings={handleApplyFirstSlotSettings}
        getSlotControlRef={getSlotControlRef}
        handlePlayLogUpdate={handlePlayLogUpdate}
        handleDiscoveredSlots={handleDiscoveredSlots}
        handleSelectChallenge={handleSelectChallenge}
      />
      

      {/* Save Set Modal */}
      {saveSlotSetOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="casino-card w-full max-w-md shadow-[var(--shadow-elevated)] animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="casino-card-header text-lg">Save Slot Set</h3>
            
            {saveSlotSetError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-4 text-sm">
                {saveSlotSetError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Name</label>
                <input 
                  type="text" 
                  placeholder="My Best Slots" 
                  value={saveSlotSetName}
                  onChange={(e) => setSaveSlotSetName(e.target.value)}
                  className="w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none transition-all"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSet(e) }}
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setSaveSlotSetOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveSet} disabled={!saveSlotSetName.trim()}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} visible={!!toast} onHide={() => setToast('')} />}

    </CasinoShell>
  )
}
