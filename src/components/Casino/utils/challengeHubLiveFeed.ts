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
  /** `houseBets` | `http_deferred` | `autorun` | `telegram` — nur gesetzt wenn settled */
  settlementSource?: string
  [key: string]: unknown
}

type FeedListener = (entry: ChallengeHubBetFeedEntry) => void
type FeedSnapshotListener = () => void

const MAX_FEED_ITEMS = 120
const listeners = new Set<FeedListener>()
const snapshotListeners = new Set<FeedSnapshotListener>()
let recentFeed: ChallengeHubBetFeedEntry[] = []

function notifySnapshotListeners() {
  for (const listener of snapshotListeners) {
    try {
      listener()
    } catch {
      // keep feed resilient even if a listener fails
    }
  }
}

function normalizeEntry(entry: ChallengeHubBetFeedEntry): ChallengeHubBetFeedEntry {
  return {
    ...entry,
    id: entry.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : Date.now(),
  }
}

function upsertChallengeHubFeedEntry(entry: ChallengeHubBetFeedEntry): ChallengeHubBetFeedEntry | null {
  const next = normalizeEntry(entry)
  const nextId = next.id != null ? String(next.id) : ''
  if (nextId) {
    const idx = recentFeed.findIndex((x) => String(x?.id ?? '') === nextId)
    if (idx >= 0) {
      const merged = { ...recentFeed[idx], ...next }
      const clone = recentFeed.slice()
      clone[idx] = merged
      recentFeed = clone
      return merged
    }
    recentFeed = [next, ...recentFeed].slice(0, MAX_FEED_ITEMS)
    return next
  }
  recentFeed = [next, ...recentFeed].slice(0, MAX_FEED_ITEMS)
  return next
}

export type PublishChallengeHubBetOptions = {
  /** When false, batch many upserts then call {@link notifyChallengeHubFeedSnapshot} once (avoids React #185). */
  notifySnapshot?: boolean
}

export function notifyChallengeHubFeedSnapshot() {
  notifySnapshotListeners()
}

export function publishChallengeHubBet(
  entry: ChallengeHubBetFeedEntry,
  options: PublishChallengeHubBetOptions = {}
) {
  const { notifySnapshot = true } = options
  const nextId = entry.id != null ? String(entry.id) : ''
  const out = upsertChallengeHubFeedEntry(entry)
  if (!out) return

  for (const listener of listeners) {
    try {
      const row =
        nextId && recentFeed.find((x) => String(x?.id ?? '') === nextId)
          ? recentFeed.find((x) => String(x?.id ?? '') === nextId)!
          : out
      listener(row)
    } catch {
      // keep feed resilient even if a listener fails
    }
  }
  if (notifySnapshot) notifySnapshotListeners()
}

/** Subscribe to full feed snapshot changes (for useSyncExternalStore). */
export function subscribeChallengeHubFeed(listener: FeedSnapshotListener) {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
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

