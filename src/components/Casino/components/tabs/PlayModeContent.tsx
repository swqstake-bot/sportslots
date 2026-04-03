import SlotControlJS from '../SlotControl'
import { SlotSelectMulti } from '../SlotSelectGrouped'
import { Button } from '../ui/Button'
import { SectionCard } from '../ui/SectionCard'
import type { CasinoSlotInstance, SlotSet } from '../../types'

const SlotControl = SlotControlJS as any

interface PlayModeContentProps {
  webSlots: any[]
  selectedSlugs: string[]
  selectedSlotInstances: CasinoSlotInstance[]
  loadedSetId: string
  slotSets: SlotSet[]
  favorites: string[]
  globalControlsOpen: boolean
  sharedSourceCurrency: string
  sharedTargetCurrency: string
  sharedCryptoOnly: boolean
  useSharedCurrency: boolean
  displayedCurrencies: { value: string; label: string }[]
  token: string
  setGlobalControlsOpen: (open: boolean | ((prev: boolean) => boolean)) => void
  setSharedSourceCurrency: (v: string) => void
  setSharedTargetCurrency: (v: string) => void
  setSharedCryptoOnly: (v: boolean) => void
  setUseSharedCurrency: (v: boolean) => void
  setSaveSlotSetOpen: (v: boolean) => void
  handleToggleSlot: (slug: string) => void
  handleAddInstance: (slug: string, source?: string | null, target?: string | null, blocked?: boolean) => void
  handleRemoveInstance: (instanceId: string) => void
  handleToggleFavorite: (slug: string) => void
  handleLoadSet: (id: string) => void
  handleDeleteSet: (id: string, e: any) => void
  handleImportSets: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleExportSets: () => void
  handleStartAll: () => void
  handleStopAll: () => void
  handleApplyFirstSlotSettings: () => void
  getSlotControlRef: (instanceId: string) => any
  handlePlayLogUpdate: () => void
}

export function PlayModeContent(props: PlayModeContentProps) {
  const {
    webSlots,
    selectedSlugs,
    selectedSlotInstances,
    loadedSetId,
    slotSets,
    favorites,
    globalControlsOpen,
    sharedSourceCurrency,
    sharedTargetCurrency,
    sharedCryptoOnly,
    useSharedCurrency,
    displayedCurrencies,
    token,
    setGlobalControlsOpen,
    setSharedSourceCurrency,
    setSharedTargetCurrency,
    setSharedCryptoOnly,
    setUseSharedCurrency,
    setSaveSlotSetOpen,
    handleToggleSlot,
    handleAddInstance,
    handleRemoveInstance,
    handleToggleFavorite,
    handleLoadSet,
    handleDeleteSet,
    handleImportSets,
    handleExportSets,
    handleStartAll,
    handleStopAll,
    handleApplyFirstSlotSettings,
    getSlotControlRef,
    handlePlayLogUpdate,
  } = props

  return (
    <div className="space-y-6">
      <div>
        <SectionCard title="Slot Selection">
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

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <select
              value={loadedSetId}
              onChange={(e) => handleLoadSet(e.target.value)}
              className="bg-[var(--bg-deep)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none transition-all min-w-[120px]"
            >
              <option value="">Set...</option>
              {slotSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({(s.slugs || []).length})
                </option>
              ))}
            </select>
            <div className="flex gap-1.5 rounded-[var(--radius-md)] p-0.5 bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
              <Button variant="secondary" size="sm" className="text-xs px-3 py-1.5 rounded-md hover:bg-[var(--bg-elevated)]" onClick={() => setSaveSlotSetOpen(true)}>
                Save
              </Button>
              <Button variant="secondary" size="sm" className="text-xs px-3 py-1.5 rounded-md hover:bg-[var(--bg-elevated)]" onClick={handleExportSets}>
                Export
              </Button>
              <label className="cursor-pointer inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-all bg-[var(--bg-elevated)] text-[var(--text)] border border-transparent hover:bg-[var(--accent)] hover:text-[var(--bg-deep)] hover:border-transparent">
                Import
                <input type="file" accept=".json" onChange={handleImportSets} className="hidden" />
              </label>
              {loadedSetId && (
                <Button variant="danger" size="sm" className="text-xs px-3 py-1.5 rounded-md" onClick={(e) => handleDeleteSet(loadedSetId, e)}>
                  Delete
                </Button>
              )}
            </div>
            <span className="text-[10px] text-[var(--text-muted)] px-1">|</span>
            <div className="flex gap-1 items-center rounded-md p-0.5 bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
              <Button onClick={handleStartAll} disabled={selectedSlotInstances.length === 0} size="sm" className="h-6 text-[10px] font-semibold py-0 px-2 bg-[var(--accent)] hover:opacity-95 text-[var(--bg-deep)]">
                Start
              </Button>
              <Button onClick={handleStopAll} disabled={selectedSlotInstances.length === 0} variant="danger" size="sm" className="h-6 text-[10px] font-semibold py-0 px-2">
                Stop
              </Button>
              <button
                type="button"
                onClick={() => setGlobalControlsOpen((o) => !o)}
                className="h-6 w-6 flex items-center justify-center rounded text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] transition-colors"
                title="Mehr"
              >
                {globalControlsOpen ? '▼' : '▸'}
              </button>
            </div>
            {globalControlsOpen && (
              <div className="flex flex-wrap gap-2 items-center pl-2 border-l border-[var(--border)] animate-in fade-in slide-in-from-left-2 duration-150">
                <Button onClick={handleApplyFirstSlotSettings} disabled={selectedSlotInstances.length < 2} variant="secondary" size="sm" className="h-6 text-[10px] py-0 px-2">
                  Apply First
                </Button>
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                  <input type="checkbox" checked={useSharedCurrency} onChange={(e) => setUseSharedCurrency(e.target.checked)} className="w-3 h-3 rounded accent-[var(--accent)]" />
                  <span>Shared</span>
                </label>
                {useSharedCurrency && (
                  <span className="flex gap-1 items-center text-[10px]">
                    <select value={sharedSourceCurrency} onChange={(e) => setSharedSourceCurrency(e.target.value)} className="h-6 text-[10px] bg-[var(--bg-deep)] border border-[var(--border)] rounded px-1.5 py-0 outline-none">
                      {displayedCurrencies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-[var(--text-muted)]">→</span>
                    <select value={sharedTargetCurrency} onChange={(e) => setSharedTargetCurrency(e.target.value)} className="h-6 text-[10px] bg-[var(--bg-deep)] border border-[var(--border)] rounded px-1.5 py-0 outline-none">
                      {displayedCurrencies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={sharedCryptoOnly} onChange={(e) => setSharedCryptoOnly(e.target.checked)} className="w-3 h-3 rounded accent-[var(--accent)]" />
                      <span>Crypto only</span>
                    </label>
                  </span>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {selectedSlotInstances.map((inst) => {
          const slot = webSlots.find((s: any) => s.slug === inst.slug)
          if (!slot) return null
          return (
            <div key={inst.id} className="casino-card">
              <SlotControl
                ref={getSlotControlRef(inst.id)}
                slot={slot}
                accessToken={token}
                onLogUpdate={handlePlayLogUpdate}
                initialExpanded={selectedSlotInstances.length <= 2}
                useSharedCurrency={useSharedCurrency}
                sharedSourceCurrency={inst.sourceCurrency || sharedSourceCurrency}
                sharedTargetCurrency={inst.targetCurrency || sharedTargetCurrency}
                initialTargetCurrency={inst.targetCurrency}
                sharedCryptoOnly={sharedCryptoOnly}
                challengeTargetMultipliers={
                  inst.challengeTargetMultipliers?.length
                    ? inst.challengeTargetMultipliers
                    : inst.challengeTargetMultiplier != null
                      ? [inst.challengeTargetMultiplier]
                      : undefined
                }
                initialMinBetUsd={inst.minBetUsd}
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
  )
}
