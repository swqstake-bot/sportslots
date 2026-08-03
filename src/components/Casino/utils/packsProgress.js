/**
 * Stake Originals Packs — collection progress helpers.
 * HAR: POST /_api/casino/packs/getProgress → packsProgress.cardsCollected
 * Bet: packsBet.state.cards[{id,isNew}] + state.cardsCollected (ids)
 * SSP uses totalCards = 240.
 */

export const PACKS_TOTAL_CARDS = 240

/** Min pack-open stake for card hunting (Stake.eu). */
export function packsHuntAmountForCurrency(currency) {
  const c = String(currency || '').toLowerCase()
  if (c === 'gold' || c === 'xgc' || c === 'gc') return 1000
  if (c === 'sweeps' || c === 'xsc' || c === 'xswp' || c === 'sc') return 0.1
  // .com / fiat: same as SC card stake
  return 0.1
}

export function packsCollectedCount(cardsCollected) {
  if (!Array.isArray(cardsCollected)) return 0
  return cardsCollected.length
}

export function packsCollectedFromBetApi(betApi) {
  const state = betApi?.state
  if (!state) return null
  return packsCollectedCount(state.cardsCollected)
}

/** Unique new card ids from this pack open (HAR: cards[].isNew). */
export function packsNewCardIdsFromBetApi(betApi) {
  const cards = betApi?.state?.cards
  if (!Array.isArray(cards)) return []
  const seen = new Set()
  const out = []
  for (const card of cards) {
    if (!card || card.isNew !== true) continue
    const id = Number(card.id)
    if (!Number.isFinite(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function packsRemaining(collected, total = PACKS_TOTAL_CARDS) {
  const c = Math.max(0, Number(collected) || 0)
  const t = Math.max(1, Number(total) || PACKS_TOTAL_CARDS)
  return Math.max(0, t - c)
}

export function isPacksCollectionComplete(collected, total = PACKS_TOTAL_CARDS) {
  return packsRemaining(collected, total) <= 0
}

export function formatPacksProgressLog(collected, { newIds, prevCollected } = {}) {
  const rem = packsRemaining(collected)
  const base =
    rem > 0
      ? `Packs: ${collected}/${PACKS_TOTAL_CARDS} — ${rem} remaining`
      : `Packs: collection complete (${collected}/${PACKS_TOTAL_CARDS})`
  const gained =
    prevCollected != null && Number.isFinite(Number(prevCollected))
      ? Math.max(0, collected - Number(prevCollected))
      : 0
  const news = Array.isArray(newIds) ? newIds : []
  if (news.length > 0) {
    return `${base} · +${news.length} new (#${news.join(', #')})`
  }
  if (gained > 0) return `${base} · +${gained}`
  return base
}

export function publishPacksProgress(collected, total = PACKS_TOTAL_CARDS) {
  try {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('packs-progress', {
        detail: {
          collected: Math.max(0, Number(collected) || 0),
          total: Math.max(1, Number(total) || PACKS_TOTAL_CARDS),
        },
      })
    )
  } catch {
    // ignore
  }
}
