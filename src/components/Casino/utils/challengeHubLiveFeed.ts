/** Hub-Zeile: erst `pending` (nur Stake), Win/Multi nach houseBets oder http_deferred `settled`. */
export type HubBetSettlement = 'pending' | 'settled'

export interface ChallengeHubBetFeedEntry {
  id?: string | number
  slotSlug?: string
  slotName?: string
  betAmount?: number
  winAmount?: number
  currencyCode?: string
  roundId?: string | null
  sourceTag?: string
  addedAt?: number
  hubSettlement?: HubBetSettlement
  /** `houseBets` | `http_deferred` — nur gesetzt wenn settled */
  settlementSource?: string
  [key: string]: unknown
}

type FeedListener = (entry: ChallengeHubBetFeedEntry) => void

const MAX_FEED_ITEMS = 120
const listeners = new Set<FeedListener>()
let recentFeed: ChallengeHubBetFeedEntry[] = []

function normalizeEntry(entry: ChallengeHubBetFeedEntry): ChallengeHubBetFeedEntry {
  return {
    ...entry,
    id: entry.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : Date.now(),
  }
}

export function publishChallengeHubBet(entry: ChallengeHubBetFeedEntry) {
  const next = normalizeEntry(entry)
  const nextId = next.id != null ? String(next.id) : ''
  if (nextId) {
    const idx = recentFeed.findIndex((x) => String(x?.id ?? '') === nextId)
    if (idx >= 0) {
      // Upsert-by-id: keep row position, enrich existing row (e.g. add houseBet shareIid later).
      const merged = { ...recentFeed[idx], ...next }
      const clone = recentFeed.slice()
      clone[idx] = merged
      recentFeed = clone
    } else {
      recentFeed = [next, ...recentFeed].slice(0, MAX_FEED_ITEMS)
    }
  } else {
    recentFeed = [next, ...recentFeed].slice(0, MAX_FEED_ITEMS)
  }
  for (const listener of listeners) {
    try {
      const out =
        nextId && recentFeed.find((x) => String(x?.id ?? '') === nextId)
          ? recentFeed.find((x) => String(x?.id ?? '') === nextId)!
          : next
      listener(out)
    } catch {
      // keep feed resilient even if a listener fails
    }
  }
}

export function subscribeChallengeHubBetFeed(listener: FeedListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getChallengeHubRecentBets() {
  return recentFeed
}

