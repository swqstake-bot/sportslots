import { useState } from 'react'
import SlotControlJS from '../SlotControl'
import { SlotSelectMulti } from '../SlotSelectGrouped'
import { Button } from '../ui/Button'
import { SectionCard } from '../ui/SectionCard'
import type { CasinoSlotInstance, SlotSet } from '../../types'
import { getProvider } from '../../api/providers'
import { getMinorFactor } from '../../../../utils/monetaryContract'
import { getApiLogs } from '../../utils/apiLogger'

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
  const [smokeRunning, setSmokeRunning] = useState(false)
  const [smokeResults, setSmokeResults] = useState<Array<{ providerId: string; slotSlug: string; ok: boolean; message: string; ms: number; requestedStakeMinor?: number; appliedBetAmount?: number | null }>>([])
  const [smokeSummary, setSmokeSummary] = useState('')
  const [lastSmokeReport, setLastSmokeReport] = useState<any | null>(null)
  const [smokeSourceCurrency, setSmokeSourceCurrency] = useState(sharedSourceCurrency || 'usdc')
  const [smokeTargetCurrency, setSmokeTargetCurrency] = useState(sharedTargetCurrency || 'eur')
  const [smokeStakeMajor, setSmokeStakeMajor] = useState('0.10')
  const [smokeParallelism, setSmokeParallelism] = useState(5)
  const [smokeOnlyNoLimit, setSmokeOnlyNoLimit] = useState(true)

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
              <select
                value={smokeSourceCurrency}
                onChange={(e) => setSmokeSourceCurrency(e.target.value)}
                className="h-6 text-[10px] bg-[var(--bg-deep)] border border-[var(--border)] rounded px-1.5 py-0 outline-none"
                title="Smoke source currency"
              >
                {displayedCurrencies.map((c) => (
                  <option key={`smoke_src_${c.value}`} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-[var(--text-muted)]">→</span>
              <select
                value={smokeTargetCurrency}
                onChange={(e) => setSmokeTargetCurrency(e.target.value)}
                className="h-6 text-[10px] bg-[var(--bg-deep)] border border-[var(--border)] rounded px-1.5 py-0 outline-none"
                title="Smoke target currency"
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
                className="h-6 w-[72px] text-[10px] bg-[var(--bg-deep)] border border-[var(--border)] rounded px-1.5 py-0 outline-none"
                title="Smoke stake (major units)"
                placeholder="Stake"
              />
              <input
                type="number"
                min={1}
                max={20}
                value={smokeParallelism}
                onChange={(e) => setSmokeParallelism(Math.max(1, Math.min(20, parseInt(e.target.value || '1', 10) || 1)))}
                className="h-6 w-[52px] text-[10px] bg-[var(--bg-deep)] border border-[var(--border)] rounded px-1.5 py-0 outline-none"
                title="Parallel providers"
              />
              <Button
                onClick={handleProviderSmokeTest}
                disabled={smokeRunning || !token}
                variant="secondary"
                size="sm"
                className="h-6 text-[10px] font-semibold py-0 px-2"
                title="Run startSession + 1 spin for each loaded provider (uses selected currencies and stake)"
              >
                {smokeRunning ? 'Smoke...' : 'Provider Smoke'}
              </Button>
              <label className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={smokeOnlyNoLimit}
                  onChange={(e) => setSmokeOnlyNoLimit(e.target.checked)}
                  className="w-3 h-3 rounded accent-[var(--accent)]"
                />
                Only NoLimit
              </label>
              <Button
                onClick={() => lastSmokeReport && downloadSmokeReport(lastSmokeReport)}
                disabled={!lastSmokeReport}
                variant="secondary"
                size="sm"
                className="h-6 text-[10px] font-semibold py-0 px-2"
                title="Export last smoke report JSON"
              >
                Export Smoke
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
          {(smokeSummary || smokeResults.length > 0) && (
            <details className="mt-3 text-xs" open>
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
