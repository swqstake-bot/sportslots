/**
 * Challenge-Hub: houseBets → shareIid auf Feed-Zeilen (BetList + Highlights).
 */
import {
  getChallengeHubRecentBets,
  publishChallengeHubBet,
} from './challengeHubLiveFeed'
import { toMinor } from './formatAmount'
import {
  formatStakeShareBetId,
  pickStakeHouseBetShareRawId,
} from './stakeBetShareId'
import { betShareIdRegistry } from './betShareIdRegistry'

function hubRowMultiplier(row) {
  if (!row || row.hubSettlement === 'pending') return 0
  const explicit = Number(row.multiplier)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const bet = Number(row?.betAmount) || 0
  const win = Number(row?.winAmount) || 0
  if (bet <= 0 || win <= 0) return 0
  return win / bet
}

function hubRowHasShareId(row) {
  const raw = pickStakeHouseBetShareRawId({
    shareIid: row?.shareIid ?? row?.iid ?? null,
    houseTopId: row?.houseTopId ?? row?.houseId ?? null,
    id: row?.id,
  })
  return Boolean(formatStakeShareBetId(raw))
}

function multiClose(a, b) {
  const x = Number(a)
  const y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return false
  if (x < 1e-8 && y < 1e-8) return true
  const rel = Math.abs(x - y) / Math.max(x, y, 1e-9)
  return rel <= 0.05 || Math.abs(x - y) <= 0.1
}

function pickHubRowForRun(bets, runId, bItem, spinSeq) {
  const rid = String(runId || '')
  if (!rid || !bets?.length) return null
  const prefix = `${rid}:`
  const rows = bets.filter((b) => String(b?.id ?? '').startsWith(prefix))
  if (!rows.length) return null

  if (spinSeq != null) {
    const exact = rows.find((b) => String(b?.id ?? '') === `${rid}:${spinSeq}`)
    if (exact) return exact
  }

  const hbMult = Number(bItem?.payoutMultiplier)
  if (Number.isFinite(hbMult) && hbMult >= 0) {
    let best = null
    let bestDist = Infinity
    for (const row of rows) {
      const rm = hubRowMultiplier(row)
      const dist = Math.abs(rm - hbMult)
      if (dist < bestDist) {
        bestDist = dist
        best = row
      }
    }
    if (best && multiClose(hubRowMultiplier(best), hbMult)) return best
  }

  const withoutShare = rows.filter((r) => !hubRowHasShareId(r))
  if (withoutShare.length) {
    return withoutShare.reduce((a, b) =>
      (Number(b?.addedAt) || 0) > (Number(a?.addedAt) || 0) ? b : a
    )
  }

  return rows.reduce((a, b) =>
    hubRowMultiplier(b) > hubRowMultiplier(a) ? b : a
  )
}

/**
 * @param {string} feedEntryId
 * @param {object} bItem houseBets payload
 * @param {object} [extra]
 */
export function buildHubPatchFromHouseBet(feedEntryId, bItem, extra = {}) {
  const rawShare =
    bItem?.shareIid != null && String(bItem.shareIid).trim() !== ''
      ? String(bItem.shareIid).trim()
      : bItem?.iid != null && String(bItem.iid).trim() !== ''
        ? String(bItem.iid).trim()
        : null
  const shareFromPick = pickStakeHouseBetShareRawId(bItem)
  const shareIidForRow = formatStakeShareBetId(rawShare || shareFromPick)

  const hubPatch = {
    id: feedEntryId,
    houseTopId:
      bItem?.houseTopId != null && String(bItem.houseTopId).trim() !== ''
        ? String(bItem.houseTopId).trim()
        : null,
    houseId: bItem?.houseId != null ? String(bItem.houseId) : null,
    iid: bItem?.iid != null && String(bItem.iid).trim() !== '' ? String(bItem.iid).trim() : rawShare,
    hubSettlement: 'settled',
    settlementSource: 'houseBets',
    ...extra,
  }
  if (shareIidForRow) hubPatch.shareIid = shareIidForRow
  return hubPatch
}

export function patchHubFeedEntryFromHouseBet(feedEntryId, bItem, amountPatch = {}) {
  if (!feedEntryId || !bItem) return false
  publishChallengeHubBet(buildHubPatchFromHouseBet(feedEntryId, bItem, amountPatch))
  return true
}

export function patchHubFeedRunFromHouseBet(runId, bItem, opts = {}) {
  const row = pickHubRowForRun(getChallengeHubRecentBets(), runId, bItem, opts.spinSeq)
  if (!row?.id) return false
  return patchHubFeedEntryFromHouseBet(String(row.id), bItem, opts.amountPatch || {})
}

export function clearHubHouseBetRetryBuffer() {
  betShareIdRegistry.clearSession()
}

export function patchHubFeedRunShareId(runId, shareIid, opts = {}) {
  const formatted = formatStakeShareBetId(shareIid)
  if (!formatted || !runId) return false
  const bets = getChallengeHubRecentBets()
  const row = pickHubRowForRun(bets, runId, { payoutMultiplier: opts.multiplier }, opts.spinSeq)
  if (!row?.id) return false
  if (hubRowHasShareId(row) && formatStakeShareBetId(row.shareIid) === formatted) return true
  publishChallengeHubBet({
    id: String(row.id),
    shareIid: formatted,
    iid: formatted,
    hubSettlement: row.hubSettlement === 'pending' ? 'settled' : row.hubSettlement || 'settled',
    settlementSource: opts.settlementSource || 'logger_reconcile',
  })
  return true
}

export function clearPendingHouseBetsForRun(pendingMap, runId) {
  const rid = String(runId || '')
  if (!rid || !pendingMap || typeof pendingMap !== 'object') return
  delete pendingMap[rid]
}
