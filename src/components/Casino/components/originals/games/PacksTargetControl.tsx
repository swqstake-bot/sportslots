import { useCallback, useEffect, useState } from 'react'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import GameTargetSummary from './GameTargetSummary'
import { TextField } from './gamePanelFields'
import { fetchPacksProgress } from '../../../api/stakeOriginalsBets'
import {
  PACKS_TOTAL_CARDS,
  PACKS_PROGRESS_LOG_INTERVAL_MS,
  packsHuntAmountForCurrency,
  packsRemaining,
  publishPacksProgress,
} from '../../../utils/packsProgress'
import { getCurrencyLabel } from '../../../utils/currencyMeta'

interface PacksTargetControlProps {
  options: OriginalsWorkbenchOptions
  onPatch: (p: Partial<OriginalsWorkbenchOptions>) => void
  readOnly?: boolean
  currency?: string
}

export default function PacksTargetControl({
  options,
  onPatch,
  readOnly,
  currency = 'sweeps',
}: PacksTargetControlProps) {
  const [collected, setCollected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const total = PACKS_TOTAL_CARDS
  const remaining = packsRemaining(collected, total)
  const pct = total > 0 ? Math.min(100, (collected / total) * 100) : 0
  const huntAmt = packsHuntAmountForCurrency(currency)
  const curLabel = getCurrencyLabel(currency) || String(currency || 'sweeps').toUpperCase()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const prog = await fetchPacksProgress()
      setCollected(prog.collected)
      publishPacksProgress(prog.collected)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onProg = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail
      if (detail && Number.isFinite(Number(detail.collected))) {
        setCollected(Number(detail.collected))
      }
    }
    window.addEventListener('packs-progress', onProg as EventListener)
    return () => window.removeEventListener('packs-progress', onProg as EventListener)
  }, [])

  useEffect(() => {
    if (!options.huntPacksCards) return
    const id = window.setInterval(() => {
      void refresh()
    }, PACKS_PROGRESS_LOG_INTERVAL_MS)
    return () => clearInterval(id)
  }, [options.huntPacksCards, refresh])

  return (
    <>
      <GameTargetSummary gameSlug="packs" options={options} gameOnly />
      <div className="originals-field-group" style={{ marginBottom: '0.75rem' }}>
        <div className="originals-field-group-head">
          <span className="originals-field-group-title">Collection Progress</span>
          <button
            type="button"
            className="text-[11px] text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={loading || readOnly}
          >
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
        <div className="originals-field-group-body" style={{ gap: '0.4rem' }}>
          <div className="flex justify-between text-sm tabular-nums">
            <span className="text-[var(--text-muted)]">Cards</span>
            <span className="font-semibold">
              {collected} / {total}
            </span>
          </div>
          <div
            className="w-full rounded-full h-2 overflow-hidden"
            style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, var(--accent), #22c55e)',
              }}
            />
          </div>
          <div className="text-center text-[12px] text-[var(--text-muted)]">
            {remaining > 0 ? (
              <>
                <strong className="text-[var(--text)]">{remaining}</strong> cards remaining
                {' · '}
                {pct.toFixed(1)}%
              </>
            ) : (
              <span className="text-emerald-500 font-semibold">Collection complete</span>
            )}
          </div>
          {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
        </div>
      </div>

      <label
        className="flex items-start gap-2 text-[12px] text-[var(--text-muted)] cursor-pointer mb-3"
        title={`Sets stake to ${huntAmt} ${curLabel} and runs until all ${total} cards or Stop`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          disabled={readOnly}
          checked={!!options.huntPacksCards}
          onChange={(e) => {
            const on = e.target.checked
            if (on) {
              onPatch({
                huntPacksCards: true,
                numberOfBets: 0,
                initialBetSize: huntAmt,
                betSize: huntAmt,
              })
            } else {
              onPatch({ huntPacksCards: false })
            }
          }}
        />
        <span>
          <span className="text-[var(--text)] font-medium">Hunt packs cards</span>
          <br />
          Min stake {huntAmt} {curLabel} (GC 1000 / SC 0.10) · stop when all {total} cards collected
        </span>
      </label>

      <TextField
        label="Pack identifier"
        placeholder="empty = auto"
        readOnly={readOnly}
        value={options.casesIdentifier ?? ''}
        onChange={(v) => onPatch({ casesIdentifier: v })}
      />
      <p className="originals-target-slider-hint">
        Packs has no difficulty — amount + currency only (optional identifier).
      </p>
    </>
  )
}
