import { memo, useCallback, useEffect, useState } from 'react'
import { fetchStakeSportsPromotions } from '../../api/stakePromotions'

interface SportsPromotionItem {
  locale: string
  slug: string
  title: string
  url: string
  gameSlugs: string[]
  sportsTargets: string[]
}

export const SportsChallengesView = memo(function SportsChallengesView() {
  const [items, setItems] = useState<SportsPromotionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadSportsPromotions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await fetchStakeSportsPromotions({ locale: 'de', maxItems: 20, withDetails: true })
      setItems(Array.isArray(rows) ? rows : [])
    } catch (e: any) {
      setItems([])
      setError(String(e?.message || 'Failed to load sports promotions'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSportsPromotions()
  }, [loadSportsPromotions])

  const openExternal = useCallback(async (url: string) => {
    try {
      await window.electronAPI.invoke('open-external', url)
    } catch {
      // ignore UI-side open errors
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Sports Challenges</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Live feed from Stake sports promotions category. No fixture list here.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className="challenge-hub-action" onClick={loadSportsPromotions}>
            Refresh
          </button>
          <button
            type="button"
            className="challenge-hub-action"
            onClick={() => openExternal('https://stake.com/de/promotions/category/sports')}
          >
            Open Sports Promotions
          </button>
          <span className="text-xs text-[var(--text-muted)]">Loaded: {items.length}</span>
        </div>
      </div>
      {error && <div className="text-xs text-[var(--error)]">{error}</div>}
      <div className="space-y-2">
        {loading && <div className="text-xs text-[var(--text-muted)]">Loading sports promotions…</div>}
        {!loading && items.map((promo) => (
          <div key={`${promo.locale}:${promo.slug}`} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--text)]">{promo.title}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {promo.slug} · Sports targets: {promo.sportsTargets.length} · Linked games: {promo.gameSlugs.length}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="challenge-hub-action" onClick={() => openExternal(promo.url)}>
                Open Promo
              </button>
              <button
                type="button"
                className="challenge-hub-action"
                onClick={() => openExternal(promo.sportsTargets[0] || 'https://stake.com/de/sports/home')}
              >
                Open Sports
              </button>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && !error && (
          <div className="text-xs text-[var(--text-muted)]">No sports promotions available right now.</div>
        )}
      </div>
    </div>
  )
})

