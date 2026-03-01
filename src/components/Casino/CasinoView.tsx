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
import { loadDiscoveredSlots } from './utils/discoveredSlots'
import { loadSlotSets, saveSlotSet, deleteSlotSet, exportSlotSets, importSlotSets, loadFavorites, toggleFavorite } from './utils/slotSets'
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
  const [discoveredSlots, setDiscoveredSlots] = useState(() => loadDiscoveredSlots())
  const { slots: webSlots } = useSlots(token, discoveredSlots)
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
    <div className="casino-root min-h-screen bg-[#0f212e] text-[#b1bad3] font-sans">
      <div className="p-6 space-y-8">
        
        {/* Content */}
        <main className="animate-in fade-in duration-500">
           {error && (
             <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg mb-6">
               {error}
             </div>
           )}

           {mode === 'play' && (
            <div className="space-y-8">
              <div className="bg-[#0f212e]">
                <div className="flex flex-col md:flex-row gap-8">
                   <div className="flex-1">
                     <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                       <span className="w-1.5 h-8 bg-[#00e676] rounded-full"></span>
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
                     
                     {/* Slot Sets Controls */}
                     <div className="mt-6 flex flex-wrap gap-3 items-center">
                       <select 
                         value={loadedSetId} 
                         onChange={(e) => handleLoadSet(e.target.value)}
                         className="bg-[#0f212e] border border-[#2f4553] rounded-lg px-4 py-2 text-base focus:ring-2 focus:ring-[#00e676] outline-none"
                       >
                         <option value="">Select Set...</option>
                         {slotSets.map(s => <option key={s.id} value={s.id}>{s.name} ({(s.slugs || []).length})</option>)}
                       </select>
                       
                       <Button variant="secondary" size="sm" className="text-base px-4 py-2" onClick={() => setSaveSlotSetOpen(true)}>Save Set</Button>
                       <Button variant="secondary" size="sm" className="text-base px-4 py-2" onClick={handleExportSets}>Export</Button>
                       <label className="cursor-pointer bg-[#2f4553] hover:bg-[#3d5566] text-white px-4 py-2 rounded-lg text-base transition-colors border border-[#2f4553]">
                          Import
                          <input type="file" accept=".json" onChange={handleImportSets} className="hidden" />
                       </label>
                       {loadedSetId && (
                          <Button variant="danger" size="sm" className="text-base px-4 py-2" onClick={(e) => handleDeleteSet(loadedSetId, e)}>Delete</Button>
                       )}
                     </div>
                     </div>
                   
                   <div className="w-full md:w-[460px] bg-[#0f212e] p-6 rounded-xl border border-[#2f4553]">
                      <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider">Global Controls</h3>
                      <div className="grid grid-cols-2 gap-4 mb-6">
                         <Button onClick={handleStartAll} disabled={selectedSlotInstances.length === 0} className="w-full h-14 text-lg bg-[#00e676] hover:bg-[#00b859] text-[#0a0c0f] font-bold">
                           Start All
                         </Button>
                         <Button onClick={handleStopAll} disabled={selectedSlotInstances.length === 0} variant="danger" className="w-full h-14 text-lg">
                           Stop All
                         </Button>
                       </div>

                       <Button 
                         onClick={handleApplyFirstSlotSettings} 
                         disabled={selectedSlotInstances.length < 2} 
                         variant="secondary" 
                         className="w-full mb-6 py-3"
                       >
                         Apply First Slot Settings to All
                       </Button>
                       
                       <div className="space-y-5 pt-5 border-t border-[#2f4553]">
                         <label className="flex items-center gap-4 text-lg cursor-pointer hover:text-white transition-colors">
                           <input type="checkbox" checked={useSharedCurrency} onChange={(e) => setUseSharedCurrency(e.target.checked)} className="w-6 h-6 rounded bg-[#0f212e] border-[#2f4553] text-[#00e676] focus:ring-[#00e676]" />
                           <span>Shared Currency</span>
                         </label>
                         
                         {useSharedCurrency && (
                           <div className="space-y-4 pl-10 animate-in fade-in slide-in-from-left-2">
                             <div className="grid grid-cols-2 gap-5">
                               <div>
                                 <span className="text-sm text-[#9ca3af] block mb-2">Bet</span>
                                 <select value={sharedSourceCurrency} onChange={(e) => setSharedSourceCurrency(e.target.value)} className="w-full text-base bg-[#0f212e] border border-[#2f4553] rounded p-3 focus:ring-1 focus:ring-[#00e676] outline-none">
                                    {displayedCurrencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                 </select>
                               </div>
                               <div>
                                 <span className="text-sm text-[#9ca3af] block mb-2">Display</span>
                                 <select value={sharedTargetCurrency} onChange={(e) => setSharedTargetCurrency(e.target.value)} className="w-full text-base bg-[#0f212e] border border-[#2f4553] rounded p-3 focus:ring-1 focus:ring-[#00e676] outline-none">
                                    {displayedCurrencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                 </select>
                               </div>
                             </div>
                             <label className="flex items-center gap-4 text-base cursor-pointer hover:text-white transition-colors">
                               <input type="checkbox" checked={sharedCryptoOnly} onChange={(e) => setSharedCryptoOnly(e.target.checked)} className="w-5 h-5 rounded bg-[#0f212e] border-[#2f4553] text-[#00e676] focus:ring-[#00e676]" />
                               <span>Crypto Only</span>
                             </label>
                           </div>
                         )}
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
                    <SlotControl
                      key={inst.id}
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
                  )
                })}
              </div>
               
               {selectedSlotInstances.length === 0 && (
                 <div className="text-center py-20 text-[#9ca3af] bg-[#0f212e] rounded-xl border border-[#2f4553] border-dashed">
                   <div className="text-4xl mb-4 opacity-20">🎰</div>
                   <p className="text-lg">Select slots to start playing</p>
                 </div>
               )}
             </div>
           )}

           {mode === 'challenges' && (
             <div className="bg-[#0f212e] rounded-xl border border-[#2f4553] overflow-hidden p-6">
               <h2 className="text-lg font-bold text-white mb-4">Auto Hunter</h2>
               <AutoChallengeHunter 
                 accessToken={token} 
                 webSlots={webSlots as any}
                 onDiscoveredSlots={() => setDiscoveredSlots(loadDiscoveredSlots())}
               />
             </div>
           )}

           {mode === 'bonushunt' && (
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
                <div className="bg-[#0f212e] p-6 rounded-xl border border-[#2f4553]">
                   <h2 className="text-lg font-bold text-white mb-4">Recent Bets</h2>
                   <BetList bets={recentBets} currencyCode="usd" emptyMessage="No bets found" />
                </div>
                <LogViewer refreshKey={playLogRefreshKey} />
             </div>
           )}
        </main>
      </div>
      

      {/* Save Set Modal */}
      {saveSlotSetOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-[#1a2c38] p-6 rounded-xl border border-[#2f4553] w-full max-w-md shadow-2xl scale-100 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-4">Save Slot Set</h3>
            
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
                  className="w-full bg-[#0f212e] border border-[#2f4553] rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-[#00e676] outline-none transition-all"
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
