import { getCachedStakeCmsPromotions, isPromotionLive } from '../api/stakeCmsPromotions'
import { getCompletedPromotionIds, markPromotionCompleted, togglePromotionCompleted } from './promoCompletion'

let catalog = []
const subscribers = new Set()
let listening = false

export function setPromotionWatcherCatalog(promos) {
  catalog = Array.isArray(promos) ? promos : []
}

export function subscribePromotionCompletions(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

function notify(key, entry) {
  for (const fn of subscribers) {
    try {
      fn(key, entry)
    } catch {
      /* ignore */
    }
  }
}

function considerBet(detail) {
  const slotSlug = String(detail?.slotSlug || '').toLowerCase()
  const multiplier = Number(detail?.multiplier || 0)
  const betUsd = Number(detail?.betUsd || 0)
  const winUsd = Number(detail?.winUsd || 0)
  if (!slotSlug || !Number.isFinite(multiplier) || multiplier <= 0) return
  const now = Date.now()
  const livePromos = catalog.filter((promo) => isPromotionLive(promo, now))
  const completed = getCompletedPromotionIds()
  for (const promo of livePromos) {
    const game = (promo.games || []).find((row) => String(row?.slug || '').toLowerCase() === slotSlug)
    if (!game) continue
    if (!(Number.isFinite(betUsd) && betUsd >= Math.max(0.09, Number(promo.minBetUsd || 0) * 0.9))) continue
    const key = `${promo.slug}:${slotSlug}`
    if (completed.has(key)) continue
    let hit = false
    let note = ''
    if (promo.kind === 'leaderboard-race') {
      const lucky = Number(game.luckyWin?.multiplier)
      const big = Number(game.bigWin?.valueUsd)
      if (lucky && multiplier > lucky) {
        hit = true
        note = `Lucky ${multiplier.toFixed(2)}x on ${slotSlug}`
      } else if (big && winUsd > big) {
        hit = true
        note = `Big win $${winUsd.toFixed(2)} on ${slotSlug}`
      }
    } else {
      const target = Number(game.targetMultiplier)
      if (target && multiplier >= target) {
        hit = true
        note = `${multiplier.toFixed(2)}x on ${slotSlug}`
      }
    }
    if (!hit) continue
    const entry = { ts: Date.now(), note }
    markPromotionCompleted(key, {
      note,
      slotSlug,
      multiplier,
      betUsd,
      roundId: detail.roundId != null ? String(detail.roundId) : '',
    })
    completed.add(key)
    notify(key, entry)
  }
}

function onCasinoBetAdded(ev) {
  considerBet(ev?.detail || {})
}

export function toggleWatchedPromotionCompletion(key, payload = {}) {
  const note = String(payload.note || 'Manual')
  const nowDone = togglePromotionCompleted(key, { ...payload, note })
  notify(key, nowDone ? { ts: Date.now(), note } : null)
  return nowDone
}

export function startPromotionCompletionWatcher(site = 'com') {
  if (typeof window === 'undefined') return () => {}
  if (!catalog.length) {
    const cached = getCachedStakeCmsPromotions(site)
    if (Array.isArray(cached?.promotions) && cached.promotions.length) {
      catalog = cached.promotions
    }
  }
  if (listening) return () => {}
  listening = true
  window.addEventListener('casino-bet-added', onCasinoBetAdded)
  return () => {
    listening = false
    window.removeEventListener('casino-bet-added', onCasinoBetAdded)
  }
}
