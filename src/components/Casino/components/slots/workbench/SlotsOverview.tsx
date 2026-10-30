import { memo, useMemo, useState } from 'react'
import { ALL_CURRENCIES } from '../../../constants/currencies'
import type { WorkbenchSessionPublish } from './SlotWorkbenchStatsPanel'
import type { SlotWorkbenchInstance } from './SlotWorkbench'
import './slots-overview.css'

export type SlotOverviewInstance = SlotWorkbenchInstance & {
  number: number
  thumbnailUrl?: string
  providerName?: string
}

interface SlotsOverviewProps {
  instances: SlotOverviewInstance[]
  sessionsById: Record<string, WorkbenchSessionPublish | undefined>
  onOpenControls: (id: string) => void
  onRemoveInstance: (id: string) => void
  onStopInstance?: (id: string) => void
}

type SlotState = 'unknown' | 'idle' | 'connecting' | 'ready' | 'running' | 'spinning' | 'error'

function slotState(session: WorkbenchSessionPublish | undefined): { id: SlotState; label: string } {
  if (!session) return { id: 'unknown', label: 'Waiting for status' }
  if (session.isStarting) return { id: 'connecting', label: 'Connecting' }
  if (session.isRunning) return { id: 'running', label: 'Running' }
  if (session.isSpinning) return { id: 'spinning', label: 'Spinning' }
  if (session.error) return { id: 'error', label: 'Needs attention' }
  if (session.hasSession) return { id: 'ready', label: 'Session ready' }
  return { id: 'idle', label: 'Not started' }
}

function currencyLabel(code: string | undefined) {
  if (!code) return null
  return ALL_CURRENCIES.find((entry) => entry.value === code.toLowerCase())?.label || code.toUpperCase()
}

function pendingResult(bet: any) {
  return Boolean(bet?.stoppedBonus || bet?.hubSettlement === 'pending')
}

function resultMultiplier(bet: any): number | null {
  if (pendingResult(bet)) return null
  if (bet?.betAmount == null || bet?.winAmount == null) return null
  const stake = Number(bet?.betAmount)
  const payout = Number(bet?.winAmount)
  if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(payout) || payout < 0) return null
  // Both values are the original minor units of this one result's currency.
  return payout / stake
}

function newestResults(bets: any[]) {
  if (bets.length < 2) return bets
  const firstAt = Number(bets[0]?.addedAt) || 0
  const lastAt = Number(bets[bets.length - 1]?.addedAt) || 0
  return firstAt > lastAt ? bets.slice(0, 6) : bets.slice(-6).reverse()
}

function SlotArtwork({ instance }: { instance: SlotOverviewInstance }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="slot-overview-art" aria-hidden="true">
      {instance.thumbnailUrl && !failed ? (
        <img src={instance.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span>{instance.label.trim().slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  )
}

const SlotOverviewCard = memo(function SlotOverviewCard({
  instance,
  session,
  onOpenControls,
  onRemoveInstance,
  onStopInstance,
}: {
  instance: SlotOverviewInstance
  session: WorkbenchSessionPublish | undefined
  onOpenControls: (id: string) => void
  onRemoveInstance: (id: string) => void
  onStopInstance?: (id: string) => void
}) {
  const state = slotState(session)
  const sessionBets = session?.sessionBetsDeduped
  const reportedSpins = session?.stats?.spins
  const reportedMax = session?.stats?.biggestMultiplier
  const { spins, spinsLabel, results, maxMultiplier, maxLabel } = useMemo(() => {
    const bets = Array.isArray(sessionBets) ? sessionBets : []
    const validCount = reportedSpins != null && Number.isFinite(Number(reportedSpins)) && Number(reportedSpins) >= 0
    const validMax = reportedMax != null && Number.isFinite(Number(reportedMax)) && Number(reportedMax) >= 0
    let maxMultiplier: number | null = null
    if (validMax) {
      // Published stats span the session, including results outside a retained history window.
      // A pending-only history does not establish a completed 0× result.
      if (Number(reportedMax) > 0 || (validCount && Number(reportedSpins) > bets.length) || bets.some((bet) => resultMultiplier(bet) !== null)) {
        maxMultiplier = Number(reportedMax)
      }
    } else {
      for (const bet of bets) {
        const value = resultMultiplier(bet)
        if (value !== null) maxMultiplier = Math.max(maxMultiplier ?? 0, value)
      }
    }
    return {
      spins: validCount ? Number(reportedSpins) : bets.length,
      spinsLabel: validCount ? 'Session spins' : 'Loaded results',
      results: newestResults(bets),
      maxMultiplier,
      maxLabel: validMax ? 'Highest multiplier' : 'Highest loaded multiplier',
    }
  }, [sessionBets, reportedSpins, reportedMax])
  const wallet = currencyLabel(session?.sourceCurrency)
  const gameCurrency = currencyLabel(session?.targetCurrency)
  const instanceLabel = `Instance ${String(instance.number).padStart(2, '0')}`

  return (
    <article className={`slot-overview-card is-${state.id}`} data-slot-instance-id={instance.id} aria-label={`${instance.label}, ${instanceLabel}`}>
      <div className="slot-overview-card-head">
        <SlotArtwork instance={instance} />
        <div className="slot-overview-identity">
          <span className="slot-overview-instance">{instanceLabel}</span>
          <h3>{instance.label}</h3>
          {instance.providerName ? <p>{instance.providerName}</p> : null}
        </div>
        <button type="button" className="slot-overview-remove" aria-label={`Remove ${instance.label}, ${instanceLabel}`} title={`Remove ${instanceLabel}`} onClick={() => onRemoveInstance(instance.id)}>×</button>
      </div>

      <div className="slot-overview-status-row">
        <span className={`slot-overview-state is-${state.id}`}><span aria-hidden="true" />{state.label}</span>
        {wallet || gameCurrency ? (
          <dl className="slot-overview-currencies">
            {wallet ? <div><dt>Wallet</dt><dd>{wallet}</dd></div> : null}
            {gameCurrency ? <div><dt>Game</dt><dd>{gameCurrency}</dd></div> : null}
          </dl>
        ) : null}
      </div>

      {session?.betLabel ? <div className="slot-overview-bet"><span>Configured bet</span><strong>{session.betLabel}</strong></div> : null}

      <dl className="slot-overview-metrics">
        <div><dt>{spinsLabel}</dt><dd data-slot-metric="spins">{session ? spins.toLocaleString() : '—'}</dd></div>
        <div><dt>{maxLabel}</dt><dd data-slot-metric="max-multi">{maxMultiplier === null ? '—' : `${maxMultiplier.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`}</dd></div>
      </dl>

      <div className="slot-overview-results">
        <span className="slot-overview-results-label">Latest results <span>newest first</span></span>
        {results.length ? (
          <ol>
            {results.map((bet, index) => {
              const multiplier = resultMultiplier(bet)
              const pending = pendingResult(bet)
              const tone = multiplier === null || multiplier === 1 ? 'neutral' : multiplier > 1 ? 'profit' : 'loss'
              const text = pending ? 'Pending' : multiplier === null ? '—' : `${multiplier.toFixed(2)}×`
              return <li key={`${bet?.id ?? bet?.roundId ?? 'result'}-${index}`} className={`is-${tone}`} title={pending ? 'Bonus result is awaiting settlement' : `Result ${index + 1}: ${text}`}>{text}</li>
            })}
          </ol>
        ) : <p>{session?.isRunning ? 'Waiting for the first result.' : 'Results appear after this slot is played.'}</p>}
      </div>

      {session?.error ? <p className="slot-overview-error" title={session.error}>{session.error}</p> : null}
      <div className="slot-overview-card-actions">
        <button type="button" className="casino-action slot-overview-open" onClick={() => onOpenControls(instance.id)} aria-label={`Open controls for ${instance.label}, ${instanceLabel}`}>Open controls <span aria-hidden="true">↗</span></button>
        {session?.isRunning && onStopInstance ? <button type="button" className="casino-action casino-action--danger" onClick={() => onStopInstance(instance.id)} aria-label={`Stop ${instance.label}, ${instanceLabel}`}>Stop this slot</button> : null}
      </div>
    </article>
  )
}, (previous, next) => previous.session === next.session
  && previous.instance.id === next.instance.id
  && previous.instance.label === next.instance.label
  && previous.instance.number === next.instance.number
  && previous.instance.thumbnailUrl === next.instance.thumbnailUrl
  && previous.instance.providerName === next.instance.providerName
  && previous.onOpenControls === next.onOpenControls
  && previous.onRemoveInstance === next.onRemoveInstance
  && previous.onStopInstance === next.onStopInstance)

export function SlotsOverview({ instances, sessionsById, onOpenControls, onRemoveInstance, onStopInstance }: SlotsOverviewProps) {
  const running = instances.filter((instance) => sessionsById[instance.id]?.isRunning).length
  const attention = instances.filter((instance) => Boolean(sessionsById[instance.id]?.error)).length
  return (
    <div className="slots-overview">
      <div className="slots-overview-heading">
        <div>
          <h2>All slots</h2>
          <p>Monitor each instance. Open its controls to configure, start or review it.</p>
        </div>
        <div className="slots-overview-summary">
          <span><i className={running ? 'is-running' : ''} aria-hidden="true" />{running} running</span>
          {attention ? <span className="has-attention">{attention} need attention</span> : null}
        </div>
      </div>
      <div className="slots-overview-grid">
        {instances.map((instance) => <SlotOverviewCard key={instance.id} instance={instance} session={sessionsById[instance.id]} onOpenControls={onOpenControls} onRemoveInstance={onRemoveInstance} onStopInstance={onStopInstance} />)}
      </div>
    </div>
  )
}
