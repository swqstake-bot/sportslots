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
import { getProvider } from '../../api/providers'
import { getMinorFactor } from '../../../../utils/monetaryContract'
import { getApiLogs } from '../../utils/apiLogger'
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
  } = props
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const isEuGoldCoins = preferredSite === 'eu'
  const [smokeRunning, setSmokeRunning] = useState(false)
  const [smokeResults, setSmokeResults] = useState<Array<{ providerId: string; slotSlug: string; ok: boolean; message: string; ms: number; requestedStakeMinor?: number; appliedBetAmount?: number | null }>>([])
  const [smokeSummary, setSmokeSummary] = useState('')
  const [lastSmokeReport, setLastSmokeReport] = useState<any | null>(null)
  const [smokeSourceCurrency, setSmokeSourceCurrency] = useState(sharedSourceCurrency || 'usdc')
  const [smokeTargetCurrency, setSmokeTargetCurrency] = useState(sharedTargetCurrency || 'eur')
  const [smokeStakeMajor, setSmokeStakeMajor] = useState('0.10')
  const [smokeParallelism, setSmokeParallelism] = useState(5)
  const [smokeOnlyNoLimit, setSmokeOnlyNoLimit] = useState(true)
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

  const hasSelection = selectedSlotInstances.length > 0

  const pickSafeSmokeBetAmount = (betLevels: number[], requestedMinor: number) => {
    const requested = Math.max(1, Math.round(Number(requestedMinor) || 1))
    if (!Array.isArray(betLevels) || betLevels.length === 0) {
      return { betAmount: requested as number | null, reason: null as string | null }
    }
    const clean = betLevels
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0)
      .sort((a, b) => a - b)
    if (clean.length === 0) return { betAmount: requested as number | null, reason: null as string | null }
    const closest = clean.reduce((best, v) => (Math.abs(v - requested) < Math.abs(best - requested) ? v : best), clean[0])
    const maxAllowed = Math.max(requested * 2, requested + 50)
    if (closest > maxAllowed) {
      return { betAmount: null, reason: `min level too high (${closest}) for requested ${requested}` }
    }
    return { betAmount: closest, reason: closest !== requested ? `snapped ${requested}->${closest}` : null }
  }

  const downloadSmokeReport = (report: any) => {
    const json = JSON.stringify(report, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `provider-smoke-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleProviderSmokeTest = async () => {
    if (smokeRunning) return
    if (!token) {
      setSmokeSummary('No token available.')
      return
    }
    const source = String(smokeSourceCurrency || '').toLowerCase().trim()
    const target = String(smokeTargetCurrency || '').toLowerCase().trim()
    const stakeMajor = Number(smokeStakeMajor)
    if (!source || !target) {
      setSmokeSummary('Set source and target currency first.')
      return
    }
    if (!Number.isFinite(stakeMajor) || stakeMajor <= 0) {
      setSmokeSummary('Set a valid stake first.')
      return
    }
    const smokeStakeMinor = Math.max(1, Math.round(stakeMajor * getMinorFactor(target)))

    const providerToSlot = new Map<string, any>()
    for (const slot of webSlots || []) {
      const pid = String(slot?.providerId || '').trim()
      const slug = String(slot?.slug || '').trim()
      if (!pid || !slug) continue
      if (!providerToSlot.has(pid)) providerToSlot.set(pid, slot)
    }

    const providerIdsAll = Array.from(providerToSlot.keys()).sort((a, b) => a.localeCompare(b))
    const providerIds = smokeOnlyNoLimit
      ? providerIdsAll.filter((pid) => {
          const v = String(pid || '').toLowerCase()
          return v === 'nolimit' || v === 'no-limit' || v === 'no-limit-city' || v === 'nlc'
        })
      : providerIdsAll
    if (providerIds.length === 0) {
      setSmokeSummary('No provider slots loaded.')
      return
    }

    setSmokeRunning(true)
    setSmokeResults([])
    setSmokeSummary(`Running smoke test for ${providerIds.length} provider(s)...`)
    const smokeStartedAt = new Date().toISOString()

    let okCount = 0
    let failCount = 0
    const resultsBuffer: Array<{ providerId: string; slotSlug: string; ok: boolean; message: string; ms: number; requestedStakeMinor?: number; appliedBetAmount?: number | null }> = []
    const queue = [...providerIds]
    const workerCount = Math.max(1, Math.min(Number(smokeParallelism) || 1, providerIds.length))

    const runOneProvider = async (providerId: string) => {
      const slot = providerToSlot.get(providerId)
      const slotSlug = String(slot?.slug || '')
      const started = Date.now()
      try {
        const provider = getProvider(providerId)
        if (!provider?.startSession || !provider?.placeBet) {
          throw new Error('Provider adapter missing startSession/placeBet')
        }

        const session = await provider.startSession(
          token,
          slotSlug,
          source,
          target
        )
        const betLevels = Array.isArray(session?.betLevels) ? session.betLevels.filter((v: number) => Number.isFinite(Number(v)) && Number(v) > 0) : []
        const picked = pickSafeSmokeBetAmount(betLevels as number[], smokeStakeMinor)
        if (picked.betAmount == null) {
          const row = {
            providerId,
            slotSlug,
            ok: false,
            message: `Skipped: ${picked.reason}`,
            ms: Date.now() - started,
            requestedStakeMinor: smokeStakeMinor,
            appliedBetAmount: null,
          }
          resultsBuffer.push(row)
          failCount += 1
          setSmokeResults((prev) => [...prev, row])
          return
        }
        const betAmount = picked.betAmount
        const spin = await provider.placeBet(session, betAmount, false, false, { slotSlug })
        const winRaw = spin?.data?.round?.winAmountDisplay ?? spin?.data?.round?.events?.[0]?.awa ?? 0
        const win = Number(winRaw)
        const row = {
          providerId,
          slotSlug,
          ok: true,
          message: `ok (win=${Number.isFinite(win) ? win : 0}${picked.reason ? `, ${picked.reason}` : ''})`,
          ms: Date.now() - started,
          requestedStakeMinor: smokeStakeMinor,
          appliedBetAmount: betAmount,
        }
        resultsBuffer.push(row)
        okCount += 1
        setSmokeResults((prev) => [...prev, row])
      } catch (err: any) {
        const row = {
          providerId,
          slotSlug,
          ok: false,
          message: String(err?.userMessage || err?.message || 'smoke failed'),
          ms: Date.now() - started,
          requestedStakeMinor: smokeStakeMinor,
          appliedBetAmount: null,
        }
        resultsBuffer.push(row)
        failCount += 1
        setSmokeResults((prev) => [...prev, row])
      }
    }

    const worker = async () => {
      while (queue.length > 0) {
        const providerId = queue.shift()
        if (!providerId) break
        await runOneProvider(providerId)
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    const smokeFinishedAt = new Date().toISOString()
    const smokeProviderSet = new Set(providerIds)
    const apiLogs = (getApiLogs() || []).filter((entry: any) => {
      const ts = Date.parse(String(entry?.ts || ''))
      const startTs = Date.parse(smokeStartedAt)
      if (!Number.isFinite(ts) || ts < startTs) return false
      const type = String(entry?.type || '').toLowerCase()
      if (!type.includes('/')) return false
      for (const pid of smokeProviderSet) {
        if (type.includes(pid.toLowerCase())) return true
      }
      if (type.includes('generic-universal') || type.includes('provider/')) return true
      return false
    })
    const report = {
      smokeStartedAt,
      smokeFinishedAt,
      config: {
        sourceCurrency: source,
        targetCurrency: target,
        stakeMajor,
        stakeMinor: smokeStakeMinor,
        parallelism: workerCount,
        onlyNoLimit: smokeOnlyNoLimit,
      },
      summary: {
        providersTotal: providerIds.length,
        okCount,
        failCount,
      },
      results: resultsBuffer,
      apiLogs,
    }
    setLastSmokeReport(report)
    downloadSmokeReport(report)
    setSmokeSummary(`Smoke done: ${okCount} ok / ${failCount} failed · report exported`)
    setSmokeRunning(false)
  }

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

      <details className="mt-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-deep)]/40 px-3 py-2 opacity-90">
        <summary className="cursor-pointer list-none text-[0.7rem] font-medium text-[var(--text-muted)] select-none">
          Advanced · Provider smoke (diagnostics)
        </summary>
        <div className="mt-3 flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--border-subtle)]">
          <select
            value={smokeSourceCurrency}
            onChange={(e) => setSmokeSourceCurrency(e.target.value)}
            className="h-8 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
            aria-label="Smoke source currency"
          >
            {displayedCurrencies.map((c) => (
              <option key={`smoke_src_${c.value}`} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--text-muted)]">→</span>
          <select
            value={smokeTargetCurrency}
            onChange={(e) => setSmokeTargetCurrency(e.target.value)}
            className="h-8 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
            aria-label="Smoke target currency"
          >
            {displayedCurrencies.map((c) => (
              <option key={`smoke_tgt_${c.value}`} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0.00000001"
            step="0.00000001"
            value={smokeStakeMajor}
            onChange={(e) => setSmokeStakeMajor(e.target.value)}
            className="h-8 w-20 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
            aria-label="Stake in major units"
            placeholder="Stake"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={smokeParallelism}
            onChange={(e) => setSmokeParallelism(Math.max(1, Math.min(20, parseInt(e.target.value || '1', 10) || 1)))}
            className="h-8 w-14 text-xs bg-[var(--bg-deep)] border border-[var(--border)] rounded px-2 py-0 outline-none"
            aria-label="Parallel workers"
          />
          <Button
            onClick={handleProviderSmokeTest}
            disabled={smokeRunning || !token}
            variant="secondary"
            size="sm"
            className="h-8 text-xs font-semibold px-2"
          >
            {smokeRunning ? 'Running…' : 'Run smoke'}
          </Button>
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={smokeOnlyNoLimit}
              onChange={(e) => setSmokeOnlyNoLimit(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-[var(--accent)]"
            />
            Nolimit only
          </label>
          <Button
            onClick={() => lastSmokeReport && downloadSmokeReport(lastSmokeReport)}
            disabled={!lastSmokeReport}
            variant="secondary"
            size="sm"
            className="h-8 text-xs font-semibold px-2"
          >
            Export JSON
          </Button>
        </div>
      </details>
      {(smokeSummary || smokeResults.length > 0) && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[var(--text-muted)]">{smokeSummary || `Smoke results (${smokeResults.length})`}</summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded border border-[var(--border)] bg-[var(--bg-deep)]">
            {smokeResults.length === 0 ? (
              <div className="px-3 py-2 text-[var(--text-muted)]">No results yet.</div>
            ) : (
              smokeResults.map((r, i) => (
                <div key={`${r.providerId}_${i}`} className="px-3 py-1.5 border-b border-[var(--border-subtle)]">
                  <span style={{ color: r.ok ? 'var(--accent)' : 'var(--error)' }}>{r.ok ? 'OK' : 'FAIL'}</span>{' '}
                  <span className="font-semibold">{r.providerId}</span>{' '}
                  <span className="text-[var(--text-muted)]">({r.slotSlug})</span>{' '}
                  <span className="text-[var(--text-muted)]">[{r.ms}ms]</span>{' '}
                  <span>{r.message}</span>
                </div>
              ))
            )}
          </div>
        </details>
      )}
    </>
  )

  return (
    <div className="space-y-6">
      {hasSelection ? (
        <details className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--text-muted)] select-none">
            Change selection ({selectedSlotInstances.length} slot{selectedSlotInstances.length === 1 ? '' : 's'})
          </summary>
          <div className="mt-3 pt-2 border-t border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Pick from last played or favorites, or browse by provider.
            </p>
            {selectionBody}
          </div>
        </details>
      ) : (
        <SectionCard title="Slot selection">
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Pick from last played or favorites, or browse by provider — then Start.
          </p>
          {selectionBody}
        </SectionCard>
      )}

      {hasSelection && (
        <SlotWorkbench
          instances={workbenchInstances}
          activeInstanceId={activeInstanceId || workbenchInstances[0]?.id || ''}
          onActiveInstanceChange={setActiveInstanceId}
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

      {!hasSelection && (
        <div className="casino-card text-center py-16 border-dashed border-[var(--border-subtle)]">
          <p className="text-[var(--text-muted)] font-medium text-sm">Pick a recent slot or browse</p>
          <p className="text-xs text-[var(--text-muted)] mt-1.5 opacity-70">
            Use Last played, Favorites, or Browse all above — then open the workbench
          </p>
        </div>
      )}
    </div>
  )
}
