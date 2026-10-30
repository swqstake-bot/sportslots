import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { publishWorkspaceSession, removeWorkspaceSession, useWorkspaceSessionStore } from '../../../../store/workspaceSessionStore'
import SlotControlJS from '../SlotControl'
import { SlotSelectMulti } from '../SlotSelectGrouped'
import { SectionCard } from '../ui/SectionCard'
import { SlotWorkbench } from '../slots/workbench/SlotWorkbench'
import { SlotsOverview } from '../slots/workbench/SlotsOverview'
import type { SlotWorkspaceView } from '../slots/workbench/SlotWorkbench'
import {
  SlotWorkbenchStatsPanel,
  type WorkbenchSessionPublish,
} from '../slots/workbench/SlotWorkbenchStatsPanel'
import type { CasinoSlotInstance, SlotSet } from '../../types'
import { useStakeSiteStore } from '../../../../store/stakeSiteStore'
import { useUiStore } from '../../../../store/uiStore'
import { isEuGoldCoinCode } from '../../constants/currencies'
import { PROVIDERS } from '../../constants/providers'

const SlotControl = SlotControlJS as any
const STATS_FILTER_KEY = 'slotbot_workbench_stats_filter'
const WORKSPACE_VIEW_KEY = 'slotbot_workbench_view_v1'

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
  onStopInstance?: (instanceId: string) => void
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
    onStopInstance,
    handleApplyFirstSlotSettings,
    getSlotControlRef,
    handlePlayLogUpdate,
    challengeHandoff,
    onDismissChallengeHandoff,
  } = props
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const isEuGoldCoins = preferredSite === 'eu'
  const [activeInstanceId, setActiveInstanceId] = useState('')
  const [preferredView, setPreferredView] = useState<SlotWorkspaceView | null>(() => {
    try {
      const saved = localStorage.getItem(WORKSPACE_VIEW_KEY)
      return saved === 'focus' || saved === 'all' ? saved : null
    } catch {
      return null
    }
  })
  const [instanceNumbers, setInstanceNumbers] = useState<{ next: number; byId: Record<string, number> }>({ next: 1, byId: {} })
  const [statsFilterId, setStatsFilterId] = useState(() => {
    try {
      const raw = localStorage.getItem(STATS_FILTER_KEY)
      return raw && raw.trim() ? raw : 'all'
    } catch {
      return 'all'
    }
  })
  const [sessionsById, setSessionsById] = useState<Record<string, WorkbenchSessionPublish>>({})
  const publishedSessionIds = useRef(new Set<string>())
  const focusRequest = useUiStore(s => s.slotWorkbenchFocus)
  const consumedFocusRequest = useRef<{ instanceId: string; revision: number } | null>(null)

  const instanceIds = useMemo(
    () => selectedSlotInstances.map((i) => i.id),
    [selectedSlotInstances]
  )
  // Numbers belong to instance IDs, so removing a neighbor never renumbers a live card.
  if (instanceIds.length !== Object.keys(instanceNumbers.byId).length || instanceIds.some((id) => !instanceNumbers.byId[id])) {
    let next = instanceNumbers.next
    const byId: Record<string, number> = {}
    for (const id of instanceIds) byId[id] = instanceNumbers.byId[id] || next++
    setInstanceNumbers({ next, byId })
  }
  const workspaceView: SlotWorkspaceView = instanceIds.length > 1 ? (preferredView || 'all') : 'focus'

  const openInstanceControls = useCallback((id: string) => {
    setActiveInstanceId(id)
    setStatsFilterId(id)
    setPreferredView('focus')
  }, [])

  useEffect(() => {
    if (!preferredView) return
    try { localStorage.setItem(WORKSPACE_VIEW_KEY, preferredView) } catch { /* preferences may be unavailable */ }
  }, [preferredView])

  useEffect(() => {
    if (!focusRequest || !instanceIds.includes(focusRequest.instanceId)) return
    if (consumedFocusRequest.current?.instanceId === focusRequest.instanceId && consumedFocusRequest.current.revision === focusRequest.revision) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      consumedFocusRequest.current = focusRequest
      setActiveInstanceId(focusRequest.instanceId)
      setStatsFilterId(focusRequest.instanceId)
      setPreferredView('focus')
    })
    return () => { cancelled = true }
  }, [focusRequest, instanceIds])
  useEffect(() => {
    for (const id of publishedSessionIds.current) {
      if (!instanceIds.includes(id.slice('slot-'.length))) {
        removeWorkspaceSession(id)
        publishedSessionIds.current.delete(id)
      }
    }
  }, [instanceIds])
  useEffect(() => {
    const published = publishedSessionIds.current
    return () => { for (const id of published) removeWorkspaceSession(id) }
  }, [])

  // Derive valid activeInstanceId during render to avoid setState in effect
  useEffect(() => {
    const validId = instanceIds.length === 0 ? '' : (instanceIds.includes(activeInstanceId) ? activeInstanceId : instanceIds[instanceIds.length - 1])
    if (validId !== activeInstanceId) {
      queueMicrotask(() => setActiveInstanceId(validId))
    }
  }, [instanceIds, activeInstanceId])

  // Prune sessions and validate filter - queue updates to avoid synchronous setState in effect
  useEffect(() => {
    queueMicrotask(() => {
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
    })
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
    if (typeof payload.isRunning === 'boolean') {
      const workspaceId = `slot-${id}`
      const previous = useWorkspaceSessionStore.getState().sessions[workspaceId]
      const state = payload.isStarting ? 'waiting' : payload.isRunning || payload.isSpinning ? 'running' : payload.error ? 'error' : 'stopped'
      const number = instanceNumbers.byId[id]
      const name = payload.name || payload.slug || 'Slot session'
      const label = number ? `${name} · #${String(number).padStart(2, '0')}` : name
      const currency = payload.sourceCurrency || undefined
      const detail = payload.isStarting ? 'Opening the slot session.' : payload.error || (payload.isSpinning && !payload.isRunning ? 'Finishing the current spin.' : undefined)
      if ((payload.isRunning || payload.isSpinning || payload.isStarting || payload.error || previous) && (previous?.state !== state || previous.label !== label || previous.currency !== currency || previous.detail !== detail)) {
        publishedSessionIds.current.add(workspaceId)
        publishWorkspaceSession({ id: workspaceId, source: 'slots', label, state, currency, detail,
          updatedAt: Date.now(), destination: { view: 'casino', casinoMode: 'play', slotInstanceId: id },
        })
      }
    }
    setSessionsById((prev) => {
      const prevRow = prev[id]
      if (
        prevRow &&
        prevRow.sessionStartAt === payload.sessionStartAt &&
        prevRow.isRunning === payload.isRunning &&
        prevRow.hasSession === payload.hasSession &&
        prevRow.isStarting === payload.isStarting &&
        prevRow.isSpinning === payload.isSpinning &&
        prevRow.sourceCurrency === payload.sourceCurrency &&
        prevRow.targetCurrency === payload.targetCurrency &&
        prevRow.betLabel === payload.betLabel &&
        prevRow.error === payload.error &&
        prevRow.sessionBetsDeduped === payload.sessionBetsDeduped &&
        prevRow.stats === payload.stats
      ) {
        return prev
      }
      return { ...prev, [id]: payload }
    })
  }, [instanceNumbers.byId])

  const workbenchInstances = useMemo(
    () =>
      selectedSlotInstances.map((inst, index) => {
        const slot = webSlots.find((s: any) => s.slug === inst.slug)
        const provider = (PROVIDERS as Record<string, { name?: string }>)[String(slot?.providerId || '')]
        return {
          id: inst.id,
          slug: inst.slug,
          label: slot?.name || inst.slug,
          running: !!sessionsById[inst.id]?.isRunning,
          number: instanceNumbers.byId[inst.id] || index + 1,
          thumbnailUrl: slot?.thumbnailUrl || undefined,
          providerName: provider?.name || slot?.providerName || undefined,
        }
      }),
    [selectedSlotInstances, webSlots, sessionsById, instanceNumbers.byId]
  )

  useEffect(() => {
    const id = challengeHandoff?.instanceId
    if (!id) return
    // Queue state updates to avoid synchronous setState in effect
    queueMicrotask(() => {
      setActiveInstanceId(id)
      setStatsFilterId(id)
      setPreferredView('focus')
    })
    const t = window.setTimeout(() => {
      document.getElementById(`slot-wb-instance-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [challengeHandoff?.instanceId])

  const hasSelection = selectedSlotInstances.length > 0

  const fleetBar = (
    <>
      <div className="slot-wb-toolbar-row">
        <div className="slot-wb-set-controls">
          <select
            value={loadedSetId}
            onChange={(e) => handleLoadSet(e.target.value)}
            aria-label="Load slot set"
          >
            <option value="">Load slot set…</option>
            {slotSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({(s.slugs || []).length})
              </option>
            ))}
          </select>
          <details className="slot-wb-set-manager">
            <summary className="casino-action">Manage sets <span aria-hidden>▾</span></summary>
            <div className="slot-wb-set-menu">
              <button type="button" className="casino-action" onClick={() => setSaveSlotSetOpen(true)}>
                Save current set
              </button>
              <button type="button" className="casino-action" onClick={handleExportSets}>
                Export sets
              </button>
              <label className="casino-action slot-wb-import">
                Import sets
                <input type="file" accept=".json" aria-label="Import slot sets from JSON" onChange={handleImportSets} className="slot-wb-file-input" />
              </label>
              {loadedSetId && (
                <button type="button" className="casino-action casino-action--danger" onClick={(e) => handleDeleteSet(loadedSetId, e)}>
                  Delete loaded set
                </button>
              )}
            </div>
          </details>
        </div>
        <div className="slot-wb-group-controls" role="group" aria-label="All selected slots">
          <span className="slot-wb-control-label">All slots</span>
          <button
            type="button"
            onClick={handleStartAll}
            disabled={!hasSelection}
            className="casino-action casino-action--primary"
          >
            Start all ({selectedSlotInstances.length})
          </button>
          <button
            type="button"
            onClick={handleStopAll}
            disabled={!hasSelection}
            className="casino-action casino-action--danger"
          >
            Stop all
          </button>
        </div>
        <button
          type="button"
          onClick={() => setGlobalControlsOpen((o) => !o)}
          className={`casino-action slot-wb-shared-toggle${globalControlsOpen ? ' is-active' : ''}`}
          aria-expanded={globalControlsOpen}
          aria-controls="slot-workbench-shared-settings"
        >
          Shared settings <span aria-hidden>{globalControlsOpen ? '▴' : '▾'}</span>
        </button>
      </div>
      {globalControlsOpen && (
        <div id="slot-workbench-shared-settings" className="slot-wb-shared-settings">
          <div className="slot-wb-shared-heading">
            <strong>Settings for all selected slots</strong>
            <p>Use one currency setup, or copy the first slot’s settings to the others.</p>
          </div>
          <button type="button" onClick={handleApplyFirstSlotSettings} disabled={selectedSlotInstances.length < 2} className="casino-action">
            Copy first slot settings
          </button>
          <label className="slot-wb-check">
            <input
              type="checkbox"
              checked={useSharedCurrency}
              onChange={(e) => setUseSharedCurrency(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-[var(--accent)]"
            />
            <span>Use shared currency</span>
          </label>
          {useSharedCurrency && (
            <div className="slot-wb-currency-fields">
              {isEuGoldCoins ? (
                <label className="slot-wb-currency-field">
                  <span>Currency</span>
                  <select
                    aria-label="Shared currency"
                    value={isEuGoldCoinCode(sharedSourceCurrency) ? sharedSourceCurrency : 'sweeps'}
                    onChange={(e) => {
                      const v = e.target.value
                      setSharedSourceCurrency(v)
                      setSharedTargetCurrency(v)
                    }}
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
                </label>
              ) : (
                <>
                  <label className="slot-wb-currency-field">
                    <span>Wallet currency</span>
                    <select aria-label="Wallet currency" value={sharedSourceCurrency} onChange={(e) => setSharedSourceCurrency(e.target.value)}>
                      {displayedCurrencies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="slot-wb-currency-field">
                    <span>Game currency</span>
                    <select aria-label="Game currency" value={sharedTargetCurrency} onChange={(e) => setSharedTargetCurrency(e.target.value)}>
                      {displayedCurrencies.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="slot-wb-check">
                    <input type="checkbox" checked={sharedCryptoOnly} onChange={(e) => setSharedCryptoOnly(e.target.checked)} className="w-3.5 h-3.5 rounded accent-[var(--accent)]" />
                    <span>Crypto only</span>
                  </label>
                </>
              )}
            </div>
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
    <div className="slot-play-page">
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
        <details className="slot-selection-drawer">
          <summary>
            Add or change slots <span>{selectedSlotInstances.length} selected</span><span aria-hidden>▾</span>
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
          onActiveInstanceChange={openInstanceControls}
          view={workspaceView}
          onViewChange={setPreferredView}
          onRemoveInstance={handleRemoveInstance}
          fleet={fleetBar}
          stats={
            <SlotWorkbenchStatsPanel
              instances={workbenchInstances.map((i) => ({ id: i.id, label: `${i.label} · #${String(i.number).padStart(2, '0')}` }))}
              sessionsById={sessionsById}
              filterId={statsFilterId}
              onFilterChange={setStatsFilterId}
            />
          }
          overview={
            <SlotsOverview
              instances={workbenchInstances}
              sessionsById={sessionsById}
              onOpenControls={openInstanceControls}
              onRemoveInstance={handleRemoveInstance}
              onStopInstance={onStopInstance}
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
