import { useState, useEffect, useRef, useCallback } from 'react'
import SlotControlJS from './components/SlotControl'
const SlotControl = SlotControlJS as any
import LogViewer from './components/LogViewer'
import BonusHuntControl from './components/BonusHuntControl'
import AutoChallengeHunter from './components/AutoChallengeHunter'
import ForumChallengeView from './components/ForumChallengeView'
import { SlotSelectMulti } from './components/SlotSelectGrouped'
import { Button } from './components/ui/Button'
import { Toast } from './components/Toast'
import { useSlots } from './hooks/useSlots'
import { loadSlotSets, saveSlotSet, deleteSlotSet, exportSlotSets, importSlotSets, loadFavorites, toggleFavorite } from './utils/slotSets'
import { loadDiscoveredSlots, saveDiscoveredSlots } from './utils/discoveredSlots'
import { loadRecentBets } from './utils/betHistoryDb'
import BetList from './components/BetList'
import { ALL_CURRENCIES } from './constants/currencies'
import { isFiat, isStable } from './utils/formatAmount'
import './bridge/slotbotBridge'
import { useUiStore } from '../../store/uiStore'

// Styles
import './casino.css'
import './styles/design-tokens.css'

interface SlotSet {
  id: string;
  name: string;
  slugs: string[];
}

const THEME_KEY = 'slotbot_theme'

export default function CasinoView() {
  const [token, setToken] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [discoveredSlots, setDiscoveredSlots] = useState<{ slug: string; name: string; providerId: string; thumbnailUrl?: string }[]>(() => loadDiscoveredSlots())
  const { slots: webSlots, loading: slotsLoading, error: slotsError } = useSlots(token, discoveredSlots)
  const [selectedSlotInstances, setSelectedSlotInstances] = useState<{ id: string; slug: string; sourceCurrency?: string; targetCurrency?: string }[]>([])

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
  const [playLogRefreshKey, setPlayLogRefreshKey] = useState(0)
  const [recentBets, setRecentBets] = useState<any[]>([])
  // const [lastBet, setLastBet] = useState<any>(null) // Unused
  const [useSharedCurrency, setUseSharedCurrency] = useState(false)
  const [sharedSourceCurrency, setSharedSourceCurrency] = useState('usdc')
  const [sharedTargetCurrency, setSharedTargetCurrency] = useState('eur')
  const [sharedCryptoOnly, setSharedCryptoOnly] = useState(false)
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

  // Initialize Session
  useEffect(() => {
    const initSession = async () => {
        try {
            const t = await window.electronAPI.getSessionToken();
            if (t) {
                setToken(t);
                setStatus('connected');
            } else {
                console.warn("No session token found");
                setError("No active Stake session found. Please navigate to Stake in the app.");
            }
        } catch (e) {
            console.error("Failed to get session token", e);
            setError("Failed to access session.");
        }
    };
    initSession();
  }, []);

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
    setToast('Einstellungen vom ersten Slot auf alle übertragen')
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
      setSelectedSlotInstances(set.slugs.map((slug, i) => ({
        id: `inst_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
        slug,
        sourceCurrency: sharedSourceCurrency,
        targetCurrency: sharedTargetCurrency,
      })))
    }
  }

  const handleDeleteSet = (id: string, e: any) => {
    e.stopPropagation()
    if (!confirm('Slot-Set wirklich löschen?')) return
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
    setSelectedSlotInstances((prev) =>
      prev.some((i) => i.slug === slug)
        ? prev.filter((i) => i.slug !== slug)
        : [...prev, { id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, slug, sourceCurrency: sharedSourceCurrency, targetCurrency: sharedTargetCurrency }]
    )
  }, [sharedSourceCurrency, sharedTargetCurrency])

  const handleAddInstance = useCallback((slug: string, source?: string | null, target?: string | null, blocked?: boolean) => {
    if (blocked) {
      setToast('Hacksaw unterstützt nur eine Session pro Spiel')
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

  const handleRemoveInstance = useCallback((instanceId: string) => {
    setSelectedSlotInstances((prev) => prev.filter((i) => i.id !== instanceId))
  }, [])

  const handleSelectChallenge = useCallback((challenge: { gameSlug: string; gameName?: string; currency?: string }) => {
      if (!challenge?.gameSlug) return
      setMode('play')
      setSelectedSlotInstances((prev) => {
          if (prev.some((i) => i.slug === challenge.gameSlug)) return prev
          return [...prev, {
            id: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            slug: challenge.gameSlug,
            sourceCurrency: sharedSourceCurrency,
            targetCurrency: challenge.currency || sharedTargetCurrency,
          }]
      })
      setToast(`Challenge ausgewählt: ${challenge.gameName || challenge.gameSlug}`)
  }, [setMode, sharedSourceCurrency, sharedTargetCurrency])

  if (status === 'idle') {
      return <div className="p-8 text-center text-gray-400">Loading Casino Session...</div>
  }

  return (
    <div className="casino-root min-h-screen font-sans" style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}>
      <div className="p-6 lg:p-8 max-w-[1800px] mx-auto">
        
        {/* Content */}
        <main className="animate-in fade-in duration-500 space-y-6">
           {error && (
             <div className="casino-card border-l-4 border-l-[var(--error)] !bg-red-500/5">
               <p className="text-sm font-medium text-[var(--error)]">{error}</p>
             </div>
           )}
           {slotsError && !error && (
             <div className="casino-card border-l-4 border-l-[var(--error)] !bg-red-500/5">
               <p className="text-sm font-medium text-[var(--error)]">Slots: {slotsError}</p>
             </div>
           )}
           {slotsLoading && token && (
             <div className="space-y-2">
               <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                 <div
                   className="h-full min-w-[30%] rounded-full bg-[var(--accent)] opacity-80"
                   style={{
                     animation: 'slots-loading-shimmer 1.5s ease-in-out infinite',
                   }}
                 />
               </div>
               <p className="text-xs text-[var(--text-muted)]">Slots werden geladen…</p>
             </div>
           )}

           {mode === 'play' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                   <div className="xl:col-span-8">
                     <div className="casino-card">
                       <h2 className="casino-card-header">
                         <span className="casino-card-header-accent"></span>
                         Slot Selection
                       </h2>
                     <SlotSelectMulti
                       slots={webSlots}
                       selectedSlugs={selectedSlugs}
                       selectedInstances={selectedSlotInstances}
                       onToggle={handleToggleSlot}
                       onAddInstance={handleAddInstance}
                       onRemoveInstance={handleRemoveInstance}
                       sharedSourceCurrency={sharedSourceCurrency}
                       sharedTargetCurrency={sharedTargetCurrency}
                       favorites={favorites}
                       onToggleFavorite={handleToggleFavorite}
                       disabled={false}
                     />
                     
                     {/* Slot Sets Controls – modern button group */}
                     <div className="mt-4 flex flex-wrap gap-2 items-center">
                       <select 
                         value={loadedSetId} 
                         onChange={(e) => handleLoadSet(e.target.value)} 
                         className="bg-[var(--bg-deep)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none transition-all min-w-[120px]"
                       >
                         <option value="">Set...</option>
                         {slotSets.map(s => <option key={s.id} value={s.id}>{s.name} ({(s.slugs || []).length})</option>)}
                       </select>
                       <div className="flex gap-1.5 rounded-[var(--radius-md)] p-0.5 bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
                         <Button variant="secondary" size="sm" className="text-xs px-3 py-1.5 rounded-md hover:bg-[var(--bg-elevated)]" onClick={() => setSaveSlotSetOpen(true)}>Save</Button>
                         <Button variant="secondary" size="sm" className="text-xs px-3 py-1.5 rounded-md hover:bg-[var(--bg-elevated)]" onClick={handleExportSets}>Export</Button>
                         <label className="cursor-pointer inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-all bg-[var(--bg-elevated)] text-[var(--text)] border border-transparent hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] hover:border-transparent">
                            Import
                            <input type="file" accept=".json" onChange={handleImportSets} className="hidden" />
                         </label>
                         {loadedSetId && (
                            <Button variant="danger" size="sm" className="text-xs px-3 py-1.5 rounded-md" onClick={(e) => handleDeleteSet(loadedSetId, e)}>Delete</Button>
                         )}
                       </div>
                     </div>
                     </div>
                   
                   <div className="xl:col-span-4">
                     <div className="casino-card h-fit">
                      <h3 className="casino-card-header">
                        <span className="casino-card-header-accent"></span>
                        Global Controls
                      </h3>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                         <Button onClick={handleStartAll} disabled={selectedSlotInstances.length === 0} className="w-full h-11 text-sm font-semibold bg-[var(--accent)] hover:opacity-95 text-[var(--bg-deep)] shadow-[0_2px_12px_rgba(96,165,250,0.3)] hover:shadow-[0_4px_16px_rgba(96,165,250,0.35)] transition-shadow">
                           Start All
                         </Button>
                         <Button onClick={handleStopAll} disabled={selectedSlotInstances.length === 0} variant="danger" className="w-full h-11 text-sm font-semibold">
                           Stop All
                         </Button>
                       </div>

                       <Button 
                         onClick={handleApplyFirstSlotSettings} 
                         disabled={selectedSlotInstances.length < 2} 
                         variant="secondary" 
                         className="w-full mb-4 py-2.5 text-sm font-medium"
                       >
                         Apply First Slot Settings
                       </Button>
                       
                       <div className="space-y-3 pt-4 border-t border-[var(--border)]">
                         <label className="flex items-center gap-3 text-sm cursor-pointer hover:text-white transition-colors">
                           <input type="checkbox" checked={useSharedCurrency} onChange={(e) => setUseSharedCurrency(e.target.checked)} className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]" />
                           <span>Shared Currency</span>
                         </label>
                         
                         {useSharedCurrency && (
                           <div className="space-y-3 pl-7 animate-in fade-in slide-in-from-left-2">
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <span className="text-xs text-[var(--text-muted)] block mb-1">Bet</span>
                                 <select value={sharedSourceCurrency} onChange={(e) => setSharedSourceCurrency(e.target.value)} className="w-full text-sm bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-[var(--accent)] outline-none">
                                    {displayedCurrencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                 </select>
                               </div>
                               <div>
                                 <span className="text-xs text-[var(--text-muted)] block mb-1">Display</span>
                                 <select value={sharedTargetCurrency} onChange={(e) => setSharedTargetCurrency(e.target.value)} className="w-full text-sm bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-[var(--accent)] outline-none">
                                    {displayedCurrencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                 </select>
                               </div>
                             </div>
                             <label className="flex items-center gap-3 text-sm cursor-pointer hover:text-white transition-colors">
                               <input type="checkbox" checked={sharedCryptoOnly} onChange={(e) => setSharedCryptoOnly(e.target.checked)} className="w-4 h-4 rounded border-[var(--border)] accent-[var(--accent)]" />
                               <span>Crypto Only</span>
                             </label>
                           </div>
                         )}
                       </div>
                    </div>
                   </div>
              </div>
              </div>

               {/* Slots Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {selectedSlotInstances.map((inst) => {
                  const slot = webSlots.find((s: any) => s.slug === inst.slug)
                  if (!slot) return null
                  return (
                    <div key={inst.id} className="casino-card overflow-hidden p-4">
                    <SlotControl
                      ref={(el: any) => { slotControlRefsMap.current.set(inst.id, el) }}
                      slot={slot}
                      accessToken={token}
                      onLogUpdate={() => setPlayLogRefreshKey(k => k + 1)}
                      initialExpanded={selectedSlotInstances.length <= 2}
                      useSharedCurrency={useSharedCurrency}
                      sharedSourceCurrency={inst.sourceCurrency || sharedSourceCurrency}
                      sharedTargetCurrency={inst.targetCurrency || sharedTargetCurrency}
                      initialTargetCurrency={inst.targetCurrency}
                      sharedCryptoOnly={sharedCryptoOnly}
                    />
                    </div>
                  )
                })}
              </div>
               
               {selectedSlotInstances.length === 0 && (
                 <div className="casino-card text-center py-20 border-dashed border-[var(--border-subtle)]">
                   <div className="text-5xl mb-4 opacity-25">🎰</div>
                   <p className="text-[var(--text-muted)] font-medium text-sm">Select slots to start playing</p>
                   <p className="text-xs text-[var(--text-muted)] mt-1.5 opacity-70">Add slots from the list above</p>
                 </div>
               )}
             </div>
           )}

           {mode === 'challenges' && (
             <div className="casino-card">
               <h2 className="casino-card-header">
                 <span className="casino-card-header-accent"></span>
                 Auto Hunter
               </h2>
               <AutoChallengeHunter 
                 accessToken={token} 
                 webSlots={webSlots as any}
                 onDiscoveredSlots={(added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => {
                  setDiscoveredSlots(prev => {
                    const bySlug = new Map(prev.map(s => [s.slug, { ...s }]))
                    for (const s of added) {
                      const ex = bySlug.get(s.slug)
                      const merged = ex
                        ? (s.thumbnailUrl ? { ...ex, thumbnailUrl: s.thumbnailUrl } : ex)
                        : s
                      bySlug.set(s.slug, merged)
                    }
                    const next = Array.from(bySlug.values())
                    saveDiscoveredSlots(next)
                    return next
                  })
                }}
               />
             </div>
           )}

           {mode === 'bonushunt' && (
             <div className="bonushunt-wrapper">
             <BonusHuntControl 
                accessToken={token} 
                slots={webSlots as any}
                // @ts-expect-error - webSlots type mismatch
                selectedSlugs={selectedSlugs}
                onToggleSlot={handleToggleSlot}
                onSelectAll={() => setSelectedSlotInstances(webSlots.map((s: any) => ({
                  id: `inst_${Date.now()}_${s.slug}_${Math.random().toString(36).slice(2, 9)}`,
                  slug: s.slug,
                  sourceCurrency: sharedSourceCurrency,
                  targetCurrency: sharedTargetCurrency,
                })))}
                onSelectNone={() => setSelectedSlotInstances([])}
                // @ts-expect-error - slotSets type mismatch
                slotSets={slotSets}
                loadedSetId={loadedSetId}
                onLoadSlotSet={handleLoadSet}
               onSaveSlotSet={() => setSaveSlotSetOpen(true)}
               onDeleteSlotSet={handleDeleteSet}
               onToggleFavorite={handleToggleFavorite}
               favorites={favorites}
             />
             </div>
           )}
           
           {mode === 'forum' && (
             <ForumChallengeView 
                accessToken={token} 
                webSlots={webSlots as any}
                onSelectChallenge={handleSelectChallenge}
             />
           )}

           {mode === 'logs' && (
             <div className="space-y-6">
                <div className="casino-card">
                   <h2 className="casino-card-header">
                     <span className="casino-card-header-accent"></span>
                     Recent Bets
                   </h2>
                   <BetList bets={recentBets} totalCount={recentBets?.length ?? 0} currencyCode="usd" emptyMessage="No bets found" />
                </div>
                <LogViewer refreshKey={playLogRefreshKey} />
             </div>
           )}
        </main>
      </div>
      

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
                <label className="block text-sm text-[#9ca3af] mb-1">Name</label>
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

    </div>
  )
}
