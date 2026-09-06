import { useCallback, useEffect, useMemo, useState } from 'react'
import SlotControlJS from '../SlotControl'
import { SlotSelectMulti } from '../SlotSelectGrouped'
import { Button } from '../ui/Button'
import { SectionCard } from '../ui/SectionCard'
import { SlotWorkbench } from '../slots/workbench/SlotWorkbench'
import {
  SlotWorkbenchStatsPanel,
  type WorkbenchSessionPublish,
} from '../slots/workbench/SlotWorkbenchStatsPanel'
import type { CasinoSlotInstance, SlotSet } from '../../types'
import { useStakeSiteStore } from '../../../../store/stakeSiteStore'
import { isEuGoldCoinCode } from '../../constants/currencies'

const SlotControl = SlotControlJS as any
const STATS_FILTER_KEY = 'slotbot_workbench_stats_filter'

interface PlayModeContentProps {
  webSlots: any[]
  /** True while the catalog is loading; shows skeleton in slot grid when the list is still empty. */
  slotsLoading: boolean
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
  challengeHandoff?: { instanceId: string; gameName: string; targetMultiplier?: number } | null
  onDismissChallengeHandoff?: () => void
}

export function PlayModeContent(props: PlayModeContentProps) {
  const {
    webSlots,
    slotsLoading,
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
    challengeHandoff,
    onDismissChallengeHandoff,
  } = props
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const isEuGoldCoins = preferredSite === 'eu'
  const [activeInstanceId, setActiveInstanceId] = useState('')
  const [statsFilterId, setStatsFilterId] = useState(() => {
    try {
      const raw = localStorage.getItem(STATS_FILTER_KEY)
      return raw && raw.trim() ? raw : 'all'
    } catch {
      return 'all'
    }
  })
  const [sessionsById, setSessionsById] = useState<Record<string, WorkbenchSessionPublish>>({})

  const instanceIds = useMemo(
    () => selectedSlotInstances.map((i) => i.id),
    [selectedSlotInstances]
  )

  useEffect(() => {
    if (instanceIds.length === 0) {
      if (activeInstanceId) setActiveInstanceId('')
      return
    }
    if (!instanceIds.includes(activeInstanceId)) {
      setActiveInstanceId(instanceIds[instanceIds.length - 1])
    }
  }, [instanceIds, activeInstanceId])

  useEffect(() => {
    setSessionsById((prev) => {
      const next: Record<string, WorkbenchSessionPublish> = {}
      let changed = false
      for (const id of instanceIds) {
        if (prev[id]) next[id] = prev[id]
        else changed = true
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true
      return changed ? next : prev
    })
    if (statsFilterId !== 'all' && !instanceIds.includes(statsFilterId)) {
      setStatsFilterId('all')
    }
  }, [instanceIds, statsFilterId])

  useEffect(() => {
    try {
      localStorage.setItem(STATS_FILTER_KEY, statsFilterId)
    } catch {
      /* ignore */
    }
  }, [statsFilterId])

  const handleWorkbenchSessionPublish = useCallback((payload: WorkbenchSessionPublish) => {
    const id = String(payload?.instanceId || '')
    if (!id) return
    setSessionsById((prev) => {
      const prevRow = prev[id]
      if (
        prevRow &&
        prevRow.sessionStartAt === payload.sessionStartAt &&
        prevRow.isRunning === payload.isRunning &&
        prevRow.sessionBetsDeduped === payload.sessionBetsDeduped &&
        prevRow.stats === payload.stats
      ) {
        return prev
      }
      return { ...prev, [id]: payload }
    })
  }, [])

  const workbenchInstances = useMemo(
    () =>
      selectedSlotInstances.map((inst) => {
        const slot = webSlots.find((s: any) => s.slug === inst.slug)
        return {
          id: inst.id,
          slug: inst.slug,
          label: slot?.name || inst.slug,
          running: !!sessionsById[inst.id]?.isRunning,
        }
      }),
    [selectedSlotInstances, webSlots, sessionsById]
  )

  useEffect(() => {
    const id = challengeHandoff?.instanceId
    if (!id) return
    setActiveInstanceId(id)
    setStatsFilterId(id)
    const t = window.setTimeout(() => {
      document.getElementById(`slot-wb-instance-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [challengeHandoff?.instanceId])

  const hasSelection = selectedSlotInstances.length > 0

  const fleetBar = (
    <>
      <select
        value={loadedSetId}
        onChange={(e) => handleLoadSet(e.target.value)}
        className="bg-[var(--bg-deep)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none transition-all min-w-[120px]"
        aria-label="Load slot set"
      >
        <option value="">Set…</option>
        {slotSets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({(s.slugs || []).length})
          </option>
        ))}
      </select>
      <details className="relative">
        <summary className="list-none cursor-pointer h-8 px-2.5 text-xs font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-deep)] text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center">
          Sets
        </summary>
        <div className="absolute z-20 mt-1 flex gap-1.5 rounded-[var(--radius-md)] p-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-none">
          <Button variant="secondary" size="sm" className="text-xs px-3 py-1.5 rounded-md" onClick={() => setSaveSlotSetOpen(true)}>
            Save
          </Button>
          <Button variant="secondary" size="sm" className="text-xs px-3 py-1.5 rounded-md" onClick={handleExportSets}>
            Export
          </Button>
          <label className="cursor-pointer inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--bg-elevated)] text-[var(--text)]">
            Import
            <input type="file" accept=".json" onChange={handleImportSets} className="hidden" />
          </label>
          {loadedSetId && (
            <Button variant="danger" size="sm" className="text-xs px-3 py-1.5 rounded-md" onClick={(e) => handleDeleteSet(loadedSetId, e)}>
              Delete
            </Button>
          )}
        </div>
      </details>
      <div className="flex gap-1.5 items-center rounded-md p-0.5 bg-[var(--bg-deep)] border border-[var(--border-subtle)]">
        <Button
          onClick={handleStartAll}
          disabled={!hasSelection}
          size="sm"
          className="h-8 text-xs font-semibold px-3 bg-[var(--accent)] hover:opacity-95 text-[var(--bg-deep)]"
        >
          Start all
        </Button>
        <Button
          onClick={handleStopAll}
          disabled={!hasSelection}
          variant="danger"
          size="sm"
          className="h-8 text-xs font-semibold px-3"
        >
          Stop all
        </Button>
        <button
          type="button"
          onClick={() => setGlobalControlsOpen((o) => !o)}
          className="h-8 w-8 flex items-center justify-center rounded text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] transition-colors"
          aria-expanded={globalControlsOpen}
          aria-label="Shared currency and apply-first settings"
        >
          {globalControlsOpen ? '▼' : '▸'}
        </button>
      </div>
      {globalControlsOpen && (
        <div className="flex flex-wrap gap-2 items-center p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/40 w-full">
          <Button onClick={handleApplyFirstSlotSettings} disabled={selectedSlotInstances.length < 2} variant="secondary" size="sm" className="h-8 text-xs py-0 px-2">
            Apply first
          </Button>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[var(--text)]">
            <input
              type="checkbox"
              checked={useSharedCurrency}
              onChange={(e) => setUseSharedCurrency(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-[var(--accent)]"
            />
            <span>Shared</span>
          </label>
          {useSharedCurrency && (
            <span className="flex flex-wrap gap-1 items-center text-xs">
              {isEuGoldCoins ? (
                <select
                  value={isEuGoldCoinCode(sharedSourceCurrency) ? sharedSourceCurrency : 'sweeps'}
                  onChange={(e) => {
                    const v = e.target.value
                    setSharedSourceCurrency(v)
                    setSharedTargetCurrency(v)
                  }}
                  className="h-8 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
                  title="Currency (GC / SC)"
                >
                  {displayedCurrencies
                    .filter((c) => isEuGoldCoinCode(c.value))
                    .map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                </select>
              ) : (
                <>
                  <select
                    value={sharedSourceCurrency}
                    onChange={(e) => setSharedSourceCurrency(e.target.value)}
                    className="h-8 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
                  >
                    {displayedCurrencies.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[var(--text-muted)]">→</span>
                  <select
                    value={sharedTargetCurrency}
                    onChange={(e) => setSharedTargetCurrency(e.target.value)}
                    className="h-8 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
                  >
                    {displayedCurrencies.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 cursor-pointer text-[var(--text-muted)]">
                    <input type="checkbox" checked={sharedCryptoOnly} onChange={(e) => setSharedCryptoOnly(e.target.checked)} className="w-3.5 h-3.5 rounded accent-[var(--accent)]" />
                    <span>Crypto only</span>
                  </label>
                </>
              )}
            </span>
          )}
        </div>
      )}
    </>
  )

  const selectionBody = (
    <>
      <SlotSelectMulti
        slots={webSlots}
        loading={slotsLoading}
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
        hideInstanceTray
      />
    </>
  )

  return (
    <div className="space-y-3">
      {challengeHandoff ? (
        <div className="casino-handoff-banner" id="slot-wb-instance-handoff">
          <div>
            <strong>Challenge loaded</strong>
            <span>
              {challengeHandoff.gameName}
              {challengeHandoff.targetMultiplier
                ? ` · stop at ${challengeHandoff.targetMultiplier}×`
                : ''}
              . Start the session when you are ready.
            </span>
          </div>
          <button type="button" onClick={() => onDismissChallengeHandoff?.()}>
            Dismiss
          </button>
        </div>
      ) : null}
      {hasSelection ? (
        <details className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--text-muted)] select-none">
            Change slots ({selectedSlotInstances.length})
          </summary>
          <div className="mt-3 pt-2 border-t border-[var(--border-subtle)]">
            {selectionBody}
          </div>
        </details>
      ) : (
        <SectionCard>{selectionBody}</SectionCard>
      )}

      {hasSelection && (
        <SlotWorkbench
          instances={workbenchInstances}
          activeInstanceId={activeInstanceId || workbenchInstances[0]?.id || ''}
          onActiveInstanceChange={(id) => {
            setActiveInstanceId(id)
            setStatsFilterId(id)
          }}
          onRemoveInstance={handleRemoveInstance}
          fleet={fleetBar}
          stats={
            <SlotWorkbenchStatsPanel
              instances={workbenchInstances.map((i) => ({ id: i.id, label: i.label }))}
              sessionsById={sessionsById}
              filterId={statsFilterId}
              onFilterChange={setStatsFilterId}
            />
          }
        >
          {selectedSlotInstances.map((inst) => {
            const slot = webSlots.find((s: any) => s.slug === inst.slug)
            if (!slot) return null
            return (
              <SlotControl
                key={inst.id}
                ref={getSlotControlRef(inst.id)}
                slot={slot}
                accessToken={token}
                onLogUpdate={handlePlayLogUpdate}
                layout="workbench"
                workbenchInstanceId={inst.id}
                workbenchActive={inst.id === (activeInstanceId || workbenchInstances[0]?.id)}
                onWorkbenchSessionPublish={handleWorkbenchSessionPublish}
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
            )
          })}
        </SlotWorkbench>
      )}
    </div>
  )
}
