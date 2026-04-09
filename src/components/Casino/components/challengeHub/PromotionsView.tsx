import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { fetchStakeVsEddiePromotion, resolvePromotionGameSlots, STAKE_PROMOTION_KEYS } from '../../api/stakePromotions'
import { useUiStore } from '../../../../store/uiStore'
import { clearPromotionCompletions, getPromotionCompletionHistory, markPromotionCompleted } from '../../utils/promoCompletion'

interface PromotionItem {
  locale: string
  slug: string
  title: string
  url: string
  gameSlugs: string[]
  gameNames?: string[]
  sportsTargets: string[]
  targetMultiplier?: number | null
  minStakeUsd?: number | null
  taskText?: string
  isSportsPromotion?: boolean
}

interface PromotionsViewProps {
  accessToken: string
  webSlots: any[]
}

function loadPromoCompletionState() {
  const history = getPromotionCompletionHistory({ limit: 250 })
  const out: Record<string, { ts: number; note: string }> = {}
  for (const row of history) {
    const slug = String(row?.slug || '').toLowerCase()
    if (!slug || out[slug]) continue
    out[slug] = {
      ts: Number(row?.ts || Date.now()),
      note: String(row?.note || '').trim(),
    }
  }
  return out
}

export const PromotionsView = memo(function PromotionsView({ accessToken, webSlots }: PromotionsViewProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stakeVsEddiePromo, setStakeVsEddiePromo] = useState<PromotionItem | null>(null)
  const [completionBySlug, setCompletionBySlug] = useState<Record<string, { ts: number; note: string }>>(() => loadPromoCompletionState())

  const loadPromotions = useCallback(async () => {
    if (!accessToken) return // keep auth-gate behavior aligned with other tabs
    setLoading(true)
    setError('')
    try {
      const stakeVsEddie = await fetchStakeVsEddiePromotion({ locale: 'de', withDetails: true })
      setStakeVsEddiePromo(stakeVsEddie || null)
      setCompletionBySlug(loadPromoCompletionState())
    } catch (e: any) {
      setStakeVsEddiePromo(null)
      setError(String(e?.message || 'Failed to load promotions'))
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadPromotions()
  }, [loadPromotions])

  const matchedSlots = useMemo(() => {
    if (!stakeVsEddiePromo) return []
    return resolvePromotionGameSlots(stakeVsEddiePromo, webSlots || []).slice(0, 12)
  }, [stakeVsEddiePromo, webSlots])

  const openExternal = useCallback(async (url: string) => {
    try {
      await window.electronAPI.invoke('open-external', url)
    } catch {
      // ignore UI-side open errors
    }
  }, [])

  const startStakeHuntForSlot = useCallback((slot: any) => {
    if (!stakeVsEddiePromo || !slot?.slug) return
    const ui = useUiStore.getState()
    ui.setCurrentView('casino')
    ui.setCasinoMode('challengeHub')
    try {
      window.dispatchEvent(
        new CustomEvent('challenge-hub-open-tab', {
          detail: { tab: 'casino' },
        })
      )
      window.dispatchEvent(
        new CustomEvent('challenge-hunt-queue-add', {
          detail: {
            challengeId: `promo:${STAKE_PROMOTION_KEYS.stakeVsEddie}:${String(slot.slug).toLowerCase()}`,
            gameSlug: String(slot.slug).toLowerCase(),
            gameName: String(slot.name || stakeVsEddiePromo.title || slot.slug),
            providerId: String(slot.providerId || 'stakeEngine'),
            targetMultiplier: Number.isFinite(Number(stakeVsEddiePromo.targetMultiplier)) ? Number(stakeVsEddiePromo.targetMultiplier) : null,
            minBetUsd: Number.isFinite(Number(stakeVsEddiePromo.minStakeUsd)) ? Math.max(0.09, Number(stakeVsEddiePromo.minStakeUsd)) : 0.09,
            promoSource: STAKE_PROMOTION_KEYS.stakeVsEddie,
          },
        })
      )
    } catch {
      // ignore window event dispatch failures
    }
  }, [stakeVsEddiePromo])

  useEffect(() => {
    function onCasinoBetAdded(ev: Event) {
      const detail = (ev as CustomEvent<any>)?.detail || {}
      const slotSlug = String(detail.slotSlug || '').toLowerCase()
      const multiplier = Number(detail.multiplier || 0)
      const betUsd = Number(detail.betUsd || 0)
      if (!slotSlug || !Number.isFinite(multiplier) || multiplier <= 0) return
      const svs = stakeVsEddiePromo
      if (!svs) return
      const matched = matchedSlots.some((slot: any) => String(slot?.slug || '').toLowerCase() === slotSlug)
      if (!matched) return
      const target = Number.isFinite(Number(svs.targetMultiplier)) ? Number(svs.targetMultiplier) : null
      if (!target || multiplier < target) return
      if (!(Number.isFinite(betUsd) && betUsd >= 0.09)) return
      setCompletionBySlug((prev) => {
        if (prev[svs.slug]) return prev
        const note = `${multiplier.toFixed(2)}x on ${slotSlug}`
        markPromotionCompleted(svs.slug, {
          note,
          slotSlug,
          multiplier,
          betUsd,
          roundId: detail.roundId != null ? String(detail.roundId) : '',
        })
        const next = { ...prev, [svs.slug]: { ts: Date.now(), note } }
        return next
      })
    }
    window.addEventListener('casino-bet-added', onCasinoBetAdded as EventListener)
    return () => window.removeEventListener('casino-bet-added', onCasinoBetAdded as EventListener)
  }, [matchedSlots, stakeVsEddiePromo])

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Stake vs Eddie Hunt</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Promotion target runner focused on Stake vs Eddie.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="challenge-hub-action" onClick={loadPromotions}>
            Refresh
          </button>
          <button
            type="button"
            className="challenge-hub-action"
            onClick={() => openExternal('https://stake.com/de/promotions/promotion/stake-versus-eddie')}
          >
            Open Stake vs Eddie
          </button>
          <button
            type="button"
            className="challenge-hub-action"
            onClick={() => {
              clearPromotionCompletions()
              setCompletionBySlug({})
            }}
          >
            Reset Completions
          </button>
          <span className="text-xs text-[var(--text-muted)]">
            Mode: Casino only
          </span>
        </div>
      </div>
      {error && <div className="text-xs text-[var(--error)]">{error}</div>}
      <div className="space-y-2">
        {loading && <div className="text-xs text-[var(--text-muted)]">Loading promotions…</div>}
        {!loading && stakeVsEddiePromo && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
            <div className="text-sm font-semibold text-[var(--text)]">Stake vs Eddie</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">
              {stakeVsEddiePromo.targetMultiplier != null ? `Target: ${Number(stakeVsEddiePromo.targetMultiplier).toFixed(2)}x` : 'Target: n/a'} · Matched slots: {matchedSlots.length}
              {stakeVsEddiePromo.minStakeUsd != null ? ` · Min stake: $${Number(stakeVsEddiePromo.minStakeUsd).toFixed(2)}` : ''}
            </div>
            {completionBySlug[STAKE_PROMOTION_KEYS.stakeVsEddie] ? (
              <div className="text-[11px] text-[var(--accent)] mt-1">
                Completed: {completionBySlug[STAKE_PROMOTION_KEYS.stakeVsEddie]?.note || 'tracked'} · {new Date(completionBySlug[STAKE_PROMOTION_KEYS.stakeVsEddie].ts).toLocaleString()}
              </div>
            ) : null}
            <div className="mt-2 space-y-1.5">
              {matchedSlots.length > 0 ? matchedSlots.map((slot: any) => (
                <button
                  key={String(slot?.slug || '')}
                  type="button"
                  className="w-full flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-deep)] px-2 py-1.5 hover:border-[var(--accent)] transition-colors"
                  onClick={() => startStakeHuntForSlot(slot)}
                  title="Add and start hunt for this slot at target multi"
                >
                  <div className="text-xs text-[var(--text)] truncate">
                    {String(slot?.name || slot?.slug || 'slot')}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--accent)]">
                      {stakeVsEddiePromo.targetMultiplier != null ? `${Number(stakeVsEddiePromo.targetMultiplier).toFixed(2)}x` : 'multi n/a'}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">Add & Start</span>
                  </div>
                </button>
              )) : (
                <div className="text-xs text-[var(--text-muted)]">No slot mapped from promo data.</div>
              )}
            </div>
          </div>
        )}
        {!loading && !error && !stakeVsEddiePromo && (
          <div className="text-xs text-[var(--text-muted)]">No promotions found right now.</div>
        )}
      </div>
    </div>
  )
})

