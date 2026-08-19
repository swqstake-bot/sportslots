import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchWeeklyWrappedBoard } from '../../api/stakeWeeklyWrapped'
import {
  isPromotionLive,
  loadStakeCmsPromotions,
  promotionTimeLeft,
} from '../../api/stakeCmsPromotions'
import {
  getHiddenForumPromoIds,
  isForumPromoLive,
  loadForumPromotions,
  setHiddenForumPromoId,
} from '../../api/forumPromotions'
import { useUiStore } from '../../../../store/uiStore'
import { useStakeSiteStore } from '../../../../store/stakeSiteStore'
import { clearPromotionCompletions, getPromotionCompletionHistory } from '../../utils/promoCompletion'
import { setPromotionWatcherCatalog, subscribePromotionCompletions, toggleWatchedPromotionCompletion } from '../../utils/promotionCompletionWatcher'

interface CmsGame {
  slug: string
  name?: string
  id?: string
  thumbnailUrl?: string
  provider?: string
  providerName?: string
  available?: boolean
  targetMultiplier?: number
  luckyWin?: { user?: string | null; multiplier?: number }
  bigWin?: { user?: string | null; valueUsd?: number }
  leaderboardSource?: string
}

interface CmsPromo {
  slug: string
  kind: string
  title: string
  summary?: string
  imageUrl?: string | null
  url: string
  startAt?: string | null
  endAt?: string | null
  prizePool?: string | null
  minBetUsd?: number | null
  games: CmsGame[]
  requiredGames?: number | null
  gameGroup?: { slug: string; url: string; gameCount?: number | null } | null
}

interface ForumPromo {
  id: string
  title: string
  url: string
  endsAt?: string | null
  endsLabel?: string | null
  imageUrl?: string | null
  prize?: { amount?: string | null; label?: string | null }
  games: CmsGame[]
  targetMultiplier?: number | null
  minBetUsd?: number | null
  requirement?: string | null
  boardName?: string
  betBased?: boolean
  ranking?: { paidPlaces?: number } | null
}

interface WeeklyTopEntry {
  position: number
  payoutMultiplier: number
  username: string
}

interface WeeklyProfitEntry {
  position: number
  profitValue: number
  username: string
}

interface WeeklySlotBoard {
  slug: string
  name: string
  thumbnailUrl?: string | null
  top: WeeklyTopEntry[]
  topProfit?: WeeklyProfitEntry[]
  error?: string | null
}

interface PromotionsViewProps {
  accessToken: string
  webSlots: any[]
  source?: 'casino' | 'forum'
}

function promoAllKey(promo: CmsPromo | ForumPromo) {
  return 'slug' in promo ? `all:${promo.slug}` : `all:forum:${promo.id}`
}

function promoGameKey(promo: CmsPromo | ForumPromo, game: CmsGame) {
  const root = 'slug' in promo ? promo.slug : `forum:${promo.id}`
  return `${root}:${String(game.slug || '').toLowerCase()}`
}

function formatMulti(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}x`
}

function formatProfit(value: number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '—'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatCountdown(ms: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return 'ended'
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function placeholderMultiRows(): WeeklyTopEntry[] {
  return [1, 2, 3].map((p) => ({ position: p, username: 'hidden', payoutMultiplier: 0 }))
}

function placeholderProfitRows(): WeeklyProfitEntry[] {
  return [1, 2, 3].map((p) => ({ position: p, username: 'hidden', profitValue: 0 }))
}

function loadCompletionNotes() {
  const history = getPromotionCompletionHistory({ limit: 250 })
  const out: Record<string, { ts: number; note: string }> = {}
  for (const row of history) {
    const slug = String(row?.slug || '').toLowerCase()
    if (!slug || out[slug]) continue
    out[slug] = { ts: Number(row?.ts || Date.now()), note: String(row?.note || '').trim() }
  }
  return out
}

function huntTargetForGame(promo: CmsPromo | ForumPromo, game: CmsGame) {
  const kind = 'kind' in promo ? promo.kind : 'multiplier-target'
  if (kind === 'leaderboard-race') {
    const lucky = Number(game.luckyWin?.multiplier)
    if (Number.isFinite(lucky) && lucky > 0) return lucky
  }
  const fromGame = Number(game.targetMultiplier)
  if (Number.isFinite(fromGame) && fromGame > 0) return fromGame
  const fromPromo = Number((promo as ForumPromo).targetMultiplier)
  return Number.isFinite(fromPromo) && fromPromo > 0 ? fromPromo : null
}

function gameLabel(game: CmsGame) {
  return String(game.name || game.slug || 'Slot')
}

function GamePoster({
  game,
  done,
  kind,
  target,
  onPlay,
  onToggleDone,
}: {
  game: CmsGame
  done?: boolean
  kind?: string
  target: number | null
  onPlay: () => void
  onToggleDone: () => void
}) {
  const available = Boolean(game.available && game.slug)
  return (
    <div className={`promo-poster ${done ? 'is-done' : ''} ${available ? '' : 'is-off'}`}>
      <button
        type="button"
        className={`promo-check ${done ? 'is-on' : ''}`}
        title={done ? 'Mark not done' : 'Mark done'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleDone()
        }}
      >
        {done ? '✓' : ''}
      </button>
      <button
        type="button"
        className="promo-poster-hit"
        disabled={!available}
        onClick={onPlay}
        title={available ? `Hunt ${gameLabel(game)}` : 'Not available'}
      >
        <div className="promo-poster-art">
          {game.thumbnailUrl ? (
            <img src={game.thumbnailUrl} alt="" loading="lazy" />
          ) : (
            <div className="promo-poster-fallback">{gameLabel(game)}</div>
          )}
          {kind !== 'leaderboard-race' && target != null && (
            <span className="promo-poster-badge">{Number(target).toFixed(Number(target) >= 100 ? 0 : 2)}x</span>
          )}
        </div>
        <div className="promo-poster-body">
          <div className="promo-poster-name">{gameLabel(game)}</div>
          {kind === 'leaderboard-race' ? (
            <>
              <div className="promo-poster-row">
                <span>LW</span>
                <strong>{game.luckyWin ? formatMulti(Number(game.luckyWin.multiplier)) : '—'}</strong>
              </div>
              <div className="promo-poster-row">
                <span>BW</span>
                <strong>{game.bigWin ? formatProfit(Number(game.bigWin.valueUsd)) : '—'}</strong>
              </div>
            </>
          ) : (
            <div className="promo-poster-sub">
              {done ? 'Done' : available ? game.providerName || game.provider || 'Hunt' : 'Unavailable'}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

function PromoSkeletons({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="promo-sheet">
          <div className="promo-banner promo-skel" style={{ minHeight: 56 }} />
          <div className="promo-game-grid">
            {Array.from({ length: 6 }).map((__, j) => (
              <div key={j} className="promo-poster promo-skel" style={{ minHeight: 120, border: 'none' }} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function LeaderboardMini({
  label,
  rows,
}: {
  label: string
  rows: { position: number; username: string; value: string }[]
}) {
  return (
    <div className="promo-lb">
      <div className="promo-lb-label">{label}</div>
      {rows.map((row) => (
        <div key={`${label}-${row.position}`} className="promo-lb-row">
          <span className="promo-lb-pos">{row.position}</span>
          <span className="promo-lb-name">{row.username || 'hidden'}</span>
          <span className="promo-lb-val">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

export const PromotionsView = memo(function PromotionsView({ accessToken, webSlots, source = 'casino' }: PromotionsViewProps) {
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const hasForum = preferredSite !== 'eu'
  const webSlotsRef = useRef(webSlots)
  webSlotsRef.current = webSlots
  const [now, setNow] = useState(Date.now())

  const [cmsLoading, setCmsLoading] = useState(false)
  const [cmsError, setCmsError] = useState('')
  const [cmsPromos, setCmsPromos] = useState<CmsPromo[]>([])
  const [cmsFetchedAt, setCmsFetchedAt] = useState(0)

  const [forumLoading, setForumLoading] = useState(false)
  const [forumError, setForumError] = useState('')
  const [forumPromos, setForumPromos] = useState<ForumPromo[]>([])
  const [forumFetchedAt, setForumFetchedAt] = useState(0)
  const [hiddenForum, setHiddenForum] = useState<Record<string, boolean>>(() => getHiddenForumPromoIds())
  const [showEndedForum, setShowEndedForum] = useState(false)

  const [completionByKey, setCompletionByKey] = useState<Record<string, { ts: number; note: string }>>(() => loadCompletionNotes())

  const [wrappedLoading, setWrappedLoading] = useState(false)
  const [wrappedError, setWrappedError] = useState('')
  const [wrappedSlots, setWrappedSlots] = useState<WeeklySlotBoard[]>([])
  const [wrappedSource, setWrappedSource] = useState<'group' | 'fallback' | ''>('')
  const [wrappedCached, setWrappedCached] = useState(false)
  const [wrappedFetchedAt, setWrappedFetchedAt] = useState<number | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const loadCms = useCallback(async (force = false) => {
    if (!accessToken) return
    setCmsLoading(true)
    setCmsError('')
    try {
      const payload = await loadStakeCmsPromotions({ site: preferredSite, webSlots: webSlotsRef.current, force }) as {
        promotions?: CmsPromo[]
        fetchedAt?: number
        error?: string
      }
      setCmsPromos(Array.isArray(payload?.promotions) ? payload.promotions : [])
      setCmsFetchedAt(Number(payload?.fetchedAt) || Date.now())
      if (payload?.error) setCmsError(String(payload.error))
    } catch (e: any) {
      setCmsPromos([])
      setCmsError(String(e?.message || 'Failed to load promotions'))
    } finally {
      setCmsLoading(false)
    }
  }, [accessToken, preferredSite])

  const loadForum = useCallback(async (force = false) => {
    if (!accessToken || preferredSite === 'eu') return
    setForumLoading(true)
    setForumError('')
    try {
      const payload = await loadForumPromotions({ webSlots: webSlotsRef.current, force }) as {
        promotions?: ForumPromo[]
        fetchedAt?: number
        error?: string
      }
      setForumPromos(Array.isArray(payload?.promotions) ? payload.promotions : [])
      setForumFetchedAt(Number(payload?.fetchedAt) || Date.now())
      if (payload?.error) setForumError(String(payload.error))
    } catch (e: any) {
      setForumPromos([])
      setForumError(String(e?.message || 'Failed to load forum promotions'))
    } finally {
      setForumLoading(false)
    }
  }, [accessToken, preferredSite])

  const loadWeeklyWrapped = useCallback(async (force = false) => {
    if (!accessToken) return
    setWrappedLoading(true)
    setWrappedError('')
    try {
      const board = await fetchWeeklyWrappedBoard({ locale: 'en', concurrency: 4, force })
      setWrappedSlots(Array.isArray(board?.slots) ? board.slots : [])
      setWrappedSource(board?.source === 'fallback' ? 'fallback' : 'group')
      setWrappedCached(Boolean(board?.cached))
      setWrappedFetchedAt(Number(board?.fetchedAt) || Date.now())
    } catch (e: any) {
      setWrappedSlots([])
      setWrappedSource('')
      setWrappedCached(false)
      setWrappedError(String(e?.message || 'Failed to load Weekly Wrapped'))
    } finally {
      setWrappedLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    void loadCms(false)
  }, [loadCms])

  useEffect(() => {
    if (hasForum) void loadForum(false)
  }, [hasForum, loadForum])

  useEffect(() => {
    void loadWeeklyWrapped(false)
  }, [loadWeeklyWrapped])

  useEffect(() => {
    setPromotionWatcherCatalog(cmsPromos)
  }, [cmsPromos])

  useEffect(() => {
    return subscribePromotionCompletions((key, entry) => {
      setCompletionByKey((prev) => {
        if (!entry) {
          if (!prev[key]) return prev
          const next = { ...prev }
          delete next[key]
          return next
        }
        return prev[key] ? prev : { ...prev, [key]: entry }
      })
    })
  }, [])

  const openExternal = useCallback(async (url: string) => {
    try {
      await window.electronAPI.invoke('open-external', url)
    } catch {
      /* ignore */
    }
  }, [])

  const queueHuntGames = useCallback((promo: CmsPromo | ForumPromo, games: CmsGame[]) => {
    const list = (games || []).filter((game) => game?.available && game?.slug)
    if (!list.length) return
    const ui = useUiStore.getState()
    ui.setCurrentView('casino')
    ;(ui.setCasinoMode as any)('challengeHub')
    const promoKey = 'slug' in promo ? promo.slug : `forum:${promo.id}`
    try {
      window.dispatchEvent(new CustomEvent('challenge-hub-open-tab', { detail: { tab: 'casino' } }))
      window.dispatchEvent(
        new CustomEvent('challenge-hunt-queue-add', {
          detail: {
            promoSource: promoKey,
            minBetUsd: Number.isFinite(Number(promo.minBetUsd)) ? Math.max(0.09, Number(promo.minBetUsd)) : 0.09,
            games: list.map((game) => ({
              challengeId: `promo:${promoKey}:${String(game.slug).toLowerCase()}`,
              gameSlug: String(game.slug).toLowerCase(),
              gameName: String(game.name || promo.title || game.slug),
              providerId: String(game.provider || 'stakeEngine'),
              targetMultiplier: huntTargetForGame(promo, game),
            })),
          },
        })
      )
    } catch {
      /* ignore */
    }
  }, [])

  const queueHunt = useCallback(
    (promo: CmsPromo | ForumPromo, game: CmsGame) => {
      queueHuntGames(promo, [game])
    },
    [queueHuntGames]
  )

  const queueHuntAll = useCallback(
    (promo: CmsPromo | ForumPromo, skipDone = true) => {
      const allKey = promoAllKey(promo)
      const sheetDone = Boolean(completionByKey[allKey])
      const remaining = (promo.games || []).filter((game) => {
        if (!game?.available || !game?.slug) return false
        if (!skipDone) return true
        return !(sheetDone || completionByKey[promoGameKey(promo, game)])
      })
      const fallback = (promo.games || []).filter((game) => game?.available && game?.slug)
      queueHuntGames(promo, remaining.length ? remaining : fallback)
    },
    [completionByKey, queueHuntGames]
  )

  const openForumThread = useCallback((promo: ForumPromo) => {
    try {
      window.dispatchEvent(new CustomEvent('promotions-hub-open-tab', { detail: { tab: 'forum' } }))
      window.dispatchEvent(new CustomEvent('forum-challenge-set-url', { detail: { url: promo.url } }))
    } catch {
      /* ignore */
    }
  }, [])

  const sortedCms = useMemo(() => {
    return [...cmsPromos].sort((a, b) => {
      const liveDelta = Number(isPromotionLive(b, now)) - Number(isPromotionLive(a, now))
      if (liveDelta !== 0) return liveDelta
      return (promotionTimeLeft(a, now) ?? Infinity) - (promotionTimeLeft(b, now) ?? Infinity)
    })
  }, [cmsPromos, now])

  const forumVisible = useMemo(() => {
    const shown = forumPromos.filter((promo) => !hiddenForum[promo.id])
    const live = shown.filter((promo) => isForumPromoLive(promo, now))
    const ended = shown.filter((promo) => !isForumPromoLive(promo, now))
    return { live, ended, hiddenCount: forumPromos.length - shown.length }
  }, [forumPromos, hiddenForum, now])

  const toggleDone = useCallback((key: string, note = 'Manual') => {
    toggleWatchedPromotionCompletion(key, { note })
  }, [])

  const wrappedPromoUrl =
    preferredSite === 'eu'
      ? 'https://stake.eu/en/promotions/promotion/weekly-wrapped'
      : 'https://stake.com/en/promotions/promotion/weekly-wrapped'

  return (
    <div className="promo-page">
      {source === 'forum' && hasForum ? (
        <>
          <div className="promo-toolbar">
            <button type="button" className="challenge-hub-action" onClick={() => void loadForum(true)} disabled={forumLoading || !accessToken}>
              {forumLoading ? 'Scanning…' : 'Refresh'}
            </button>
            {forumVisible.ended.length > 0 && (
              <button type="button" className="challenge-hub-action" onClick={() => setShowEndedForum((v) => !v)}>
                {showEndedForum ? 'Hide ended' : `Ended (${forumVisible.ended.length})`}
              </button>
            )}
            <span className="promo-toolbar-meta">
              {forumFetchedAt ? `Updated ${new Date(forumFetchedAt).toLocaleTimeString()}` : 'Forum competitions'}
            </span>
          </div>
          {forumLoading && forumPromos.length === 0 && (
            <>
              <p className="promo-note">
                Scanning the forum boards. A Cloudflare window may open the first time — leave it, it closes on its own.
              </p>
              <PromoSkeletons count={2} />
            </>
          )}
          {forumError && <div className="promo-error">{forumError}</div>}
          {!forumLoading && forumVisible.live.length === 0 && forumVisible.ended.length === 0 && !forumError && (
            <div className="promo-empty">No forum competition found.</div>
          )}
          <div className="promo-forum-grid">
            {(showEndedForum ? [...forumVisible.live, ...forumVisible.ended] : forumVisible.live).map((promo) => {
              const live = isForumPromoLive(promo, now)
              const prizeLabel = promo.prize?.amount || promo.prize?.label
              const allKey = promoAllKey(promo)
              const sheetDone = Boolean(completionByKey[allKey])
              return (
                <article key={promo.id} className={`promo-sheet promo-sheet--compact ${live ? '' : 'is-ended'} ${sheetDone ? 'is-checked' : ''}`}>
                  <div className="promo-banner promo-banner--compact">
                    <div className="promo-banner-art">
                      {promo.imageUrl ? <img src={promo.imageUrl} alt="" loading="lazy" /> : null}
                    </div>
                    <button
                      type="button"
                      className={`promo-check ${sheetDone ? 'is-on' : ''}`}
                      title={sheetDone ? 'Mark not done' : 'Mark done'}
                      onClick={() => toggleDone(allKey, promo.title)}
                    >
                      {sheetDone ? '✓' : ''}
                    </button>
                    <div className="promo-banner-copy">
                      <div className="promo-banner-kicker">
                        <span className={`promo-pill ${live ? 'is-live' : 'is-muted'}`}>
                          {live && promo.endsAt ? `Ends ${formatCountdown(Date.parse(promo.endsAt) - now)}` : live ? 'Live' : 'Ended'}
                        </span>
                        {prizeLabel ? <span className="promo-pill is-prize">{prizeLabel}</span> : null}
                      </div>
                      <h2 className="promo-title">{promo.title}</h2>
                    </div>
                  </div>
                  <div className="promo-forum-body">
                    <div className="promo-meta">
                      <span className="promo-pill is-muted">{promo.boardName || 'Forum'}</span>
                      {promo.minBetUsd != null ? (
                        <span className="promo-pill is-muted">Min ${Number(promo.minBetUsd).toFixed(2)}</span>
                      ) : null}
                      {promo.ranking?.paidPlaces ? (
                        <span className="promo-pill is-muted">{promo.ranking.paidPlaces} paid</span>
                      ) : null}
                      {promo.targetMultiplier != null ? (
                        <span className="promo-pill is-warn">{Number(promo.targetMultiplier).toFixed(2)}x</span>
                      ) : null}
                    </div>
                    {promo.requirement ? <p className="promo-summary">{promo.requirement}</p> : null}
                    <div className="promo-forum-actions">
                      {promo.games.filter((g) => g.available && g.slug).length > 1 ? (
                        <button type="button" className="challenge-hub-action" onClick={() => queueHuntAll(promo)}>
                          Hunt all
                        </button>
                      ) : null}
                      <button type="button" className="challenge-hub-action" onClick={() => openExternal(promo.url)}>
                        Open thread
                      </button>
                      <button type="button" className="challenge-hub-action" onClick={() => openForumThread(promo)}>
                        Verify bets
                      </button>
                      <button
                        type="button"
                        className="challenge-hub-action challenge-hub-action--ghost"
                        onClick={() => setHiddenForum(setHiddenForumPromoId(promo.id, !hiddenForum[promo.id]))}
                      >
                        Hide
                      </button>
                    </div>
                    {promo.games.length > 0 && (
                      <div className="promo-game-grid">
                        {promo.games.map((game, idx) => (
                          <GamePoster
                            key={`${promo.id}-${game.slug || game.name || idx}`}
                            game={game}
                            done={sheetDone || Boolean(completionByKey[promoGameKey(promo, game)])}
                            target={huntTargetForGame(promo, game)}
                            onPlay={() => queueHunt(promo, game)}
                            onToggleDone={() => toggleDone(promoGameKey(promo, game), game.name || game.slug)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="promo-toolbar">
            <button type="button" className="challenge-hub-action" onClick={() => void loadCms(true)} disabled={cmsLoading || !accessToken}>
              {cmsLoading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="challenge-hub-action challenge-hub-action--ghost"
              onClick={() => {
                clearPromotionCompletions()
                setCompletionByKey({})
              }}
            >
              Reset completions
            </button>
            <span className="promo-toolbar-meta">
              {cmsFetchedAt ? `Updated ${new Date(cmsFetchedAt).toLocaleTimeString()}` : 'Live casino promotions'}
            </span>
          </div>
          {cmsError && <div className="promo-error">{cmsError}</div>}
          {cmsLoading && cmsPromos.length === 0 && <PromoSkeletons count={2} />}
          {!cmsLoading && !cmsError && sortedCms.length === 0 && (
            <div className="promo-empty">No promotion is currently running.</div>
          )}
          {sortedCms.map((promo) => {
            const live = isPromotionLive(promo, now)
            const remaining = promotionTimeLeft(promo, now)
            const liveTargets = promo.games.filter((game) => game.leaderboardSource === 'live').length
            const allKey = promoAllKey(promo)
            const sheetDone = Boolean(completionByKey[allKey])
            return (
              <article key={promo.slug} className={`promo-sheet promo-sheet--compact ${live ? '' : 'is-ended'} ${sheetDone ? 'is-checked' : ''}`}>
                <div className="promo-banner promo-banner--compact">
                  <div className="promo-banner-art">
                    {promo.imageUrl ? <img src={promo.imageUrl} alt="" /> : null}
                  </div>
                  <button
                    type="button"
                    className={`promo-check ${sheetDone ? 'is-on' : ''}`}
                    title={sheetDone ? 'Mark not done' : 'Mark done'}
                    onClick={() => toggleDone(allKey, promo.title)}
                  >
                    {sheetDone ? '✓' : ''}
                  </button>
                  <div className="promo-banner-copy">
                    <div className="promo-banner-kicker">
                      <span className={`promo-pill ${live ? 'is-live' : 'is-muted'}`}>
                        {live && remaining != null ? `Ends ${formatCountdown(remaining)}` : live ? 'Live' : 'Ended'}
                      </span>
                      {promo.prizePool ? <span className="promo-pill is-prize">{promo.prizePool}</span> : null}
                      {promo.minBetUsd != null ? (
                        <span className="promo-pill is-muted">Min ${Number(promo.minBetUsd).toFixed(2)}</span>
                      ) : null}
                      {promo.requiredGames && promo.requiredGames > 1 ? (
                        <span className="promo-pill is-muted">{promo.requiredGames} games</span>
                      ) : null}
                      {promo.kind === 'leaderboard-race' ? (
                        <span className="promo-pill is-warn">{liveTargets > 0 ? 'Live boards' : 'Page targets'}</span>
                      ) : null}
                    </div>
                    <h2 className="promo-title">{promo.title}</h2>
                    {promo.summary ? <p className="promo-summary">{promo.summary}</p> : null}
                  </div>
                  <div className="promo-banner-actions">
                    {promo.games.filter((g) => g.available && g.slug).length > 1 ? (
                      <button
                        type="button"
                        className="challenge-hub-action"
                        onClick={() => queueHuntAll(promo)}
                        title="Queue every remaining slot from this promo"
                      >
                        Hunt all
                      </button>
                    ) : null}
                    <button type="button" className="challenge-hub-action" onClick={() => openExternal(promo.url)}>
                      Open
                    </button>
                  </div>
                </div>
                <div className="promo-game-grid">
                  {promo.games.map((game) => {
                    const key = promoGameKey(promo, game)
                    return (
                      <GamePoster
                        key={game.slug}
                        game={game}
                        done={sheetDone || Boolean(completionByKey[key])}
                        kind={promo.kind}
                        target={huntTargetForGame(promo, game)}
                        onPlay={() => queueHunt(promo, game)}
                        onToggleDone={() => toggleDone(key, game.name || game.slug)}
                      />
                    )
                  })}
                </div>
              </article>
            )
          })}

          <article className="promo-sheet">
            <div className="promo-banner">
              <div className="promo-banner-art" />
              <div className="promo-banner-copy">
                <div className="promo-banner-kicker">
                  <span className="promo-pill is-live">Weekly</span>
                  {wrappedSource ? <span className="promo-pill is-muted">{wrappedSource}{wrappedCached ? ' · cached' : ''}</span> : null}
                </div>
                <h2 className="promo-title">Weekly Wrapped</h2>
                <p className="promo-summary">Beste und große Gewinne der aktuellen Wrapped-Slots.</p>
              </div>
              <div className="promo-banner-actions">
                <button
                  type="button"
                  className="challenge-hub-action"
                  onClick={() => void loadWeeklyWrapped(true)}
                  disabled={wrappedLoading || !accessToken}
                >
                  {wrappedLoading ? 'Loading…' : 'Refresh'}
                </button>
                <button type="button" className="challenge-hub-action challenge-hub-action--ghost" onClick={() => openExternal(wrappedPromoUrl)}>
                  Open
                </button>
              </div>
            </div>
            {wrappedError && <div className="promo-error" style={{ margin: '0.7rem 0.85rem' }}>{wrappedError}</div>}
            {wrappedLoading && wrappedSlots.length === 0 && (
              <div className="promo-wrapped-grid">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="promo-wrapped-card promo-skel" style={{ minHeight: 112, border: 'none' }} />
                ))}
              </div>
            )}
            {!wrappedLoading && !wrappedError && wrappedSlots.length === 0 && (
              <p className="promo-empty" style={{ padding: '0 0.85rem 0.9rem' }}>No Weekly Wrapped slots found.</p>
            )}
            {wrappedSlots.length > 0 && (
              <div className="promo-wrapped-grid">
                {wrappedSlots.map((slot) => {
                  const multiRows = (slot.top?.length ? slot.top : placeholderMultiRows()).slice(0, 3)
                  const profitRows = (slot.topProfit?.length ? slot.topProfit : placeholderProfitRows()).slice(0, 3)
                  return (
                    <div key={slot.slug} className="promo-wrapped-card">
                      <div className="promo-wrapped-thumb">
                        {slot.thumbnailUrl ? <img src={slot.thumbnailUrl} alt="" loading="lazy" /> : null}
                      </div>
                      <div className="min-w-0">
                        <div className="promo-wrapped-name" title={slot.name || slot.slug}>
                          {slot.name || slot.slug}
                        </div>
                        {slot.error ? (
                          <p className="promo-summary">{slot.error}</p>
                        ) : (
                          <>
                            <LeaderboardMini
                              label="Beste"
                              rows={multiRows.map((row) => ({
                                position: row.position,
                                username: row.username,
                                value: formatMulti(row.payoutMultiplier),
                              }))}
                            />
                            <LeaderboardMini
                              label="Große"
                              rows={profitRows.map((row) => ({
                                position: row.position,
                                username: row.username,
                                value: formatProfit(row.profitValue),
                              }))}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {wrappedFetchedAt ? (
              <p className="promo-note" style={{ padding: '0 0.85rem 0.75rem' }}>
                Updated {new Date(wrappedFetchedAt).toLocaleTimeString()}
              </p>
            ) : null}
          </article>
        </>
      )}
    </div>
  )
})
