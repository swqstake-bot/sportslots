import { toUnits } from './formatAmount'
import type { ChallengeHubBetFeedEntry } from './challengeHubLiveFeed'

/** Map hub feed rows → Logger JSONL shape for export / re-import in Logger tab. */
export function hubFeedEntryToLoggerExport(row: ChallengeHubBetFeedEntry) {
  if (!row) return null
  const curr = String(row.currencyCode || 'usd').toLowerCase()
  const betMinor = Number(row.betAmount) || 0
  const winMinor = Number(row.winAmount) || 0
  const mult = Number(row.multiplier)
  const shareRaw = row.shareIid ?? row.iid ?? row.houseTopId ?? row.houseId ?? null
  return {
    receivedAt: new Date(Number(row.addedAt) || Date.now()).toISOString(),
    iid: shareRaw != null ? String(shareRaw) : null,
    houseId: row.houseId != null ? String(row.houseId) : null,
    betId: row.roundId != null ? String(row.roundId) : null,
    gameSlug: row.slotSlug != null ? String(row.slotSlug) : null,
    gameName: row.slotName != null ? String(row.slotName) : null,
    amount: betMinor > 0 ? toUnits(betMinor, curr) : 0,
    payout: winMinor > 0 ? toUnits(winMinor, curr) : 0,
    payoutMultiplier: Number.isFinite(mult) && mult >= 0 ? mult : null,
    currency: curr,
    category: 'casino',
    hubFeedId: row.id != null ? String(row.id) : null,
    hubSettlement: row.hubSettlement ?? null,
  }
}

export function hubFeedToLoggerExportRows(rows: ChallengeHubBetFeedEntry[]) {
  if (!rows?.length) return []
  return rows.map(hubFeedEntryToLoggerExport).filter(Boolean) as NonNullable<
    ReturnType<typeof hubFeedEntryToLoggerExport>
  >[]
}
