/**
 * Challenge-Hub: houseBets / Logger → shareIid auf Feed-Zeilen (BetList + Highlights).
 */
import { getChallengeHubRecentBets, publishChallengeHubBet } from './challengeHubLiveFeed'
import { toMinor } from './formatAmount'
import {
  formatStakeShareBetId,
  normalizedStakeShareIdCore,
  pickStakeHouseBetShareRawId,
} from './stakeBetShareId'
import { houseBetSlugMatchesSessionSlug, normalizeBetSlugForHouseMatch } from './slotSlugMatching'

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

function betMinorClose(a, b) {
  const x = Number(a)
  const y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return true
  const rel = Math.abs(x - y) / Math.max(x, y, 1)
  return rel <= 0.06
}

/** Ältestes Pending ohne ID (FIFO) — wie SSP: ein houseBet → eine Zeile. */
function pickHubRowForHouseBet(bets, bItem) {
  const payloadSlug = normalizeBetSlugForHouseMatch(bItem?.gameSlug)
  const hbMult = Number(bItem?.payoutMultiplier)
  const curr = (bItem?.currency || 'usd').toLowerCase()
  const betMajor = Number(bItem?.amountMajor ?? bItem?.amount) || 0
  const betMinor = Number.isFinite(Number(bItem?.amountMinor))
    ? Number(bItem.amountMinor)
    : toMinor(betMajor, curr)

  let pendingBest = null
  let pendingAt = Infinity
  let fallbackBest = null
  let fallbackAt = Infinity

  for (const row of bets || []) {
    if (hubRowHasShareId(row)) continue
    const rowSlug = normalizeBetSlugForHouseMatch(row?.slotSlug)
    if (payloadSlug && rowSlug && !houseBetSlugMatchesSessionSlug(payloadSlug, rowSlug)) continue
    const rowBet = Number(row.betAmount) || 0
    if (betMinor > 0 && rowBet > 0 && !betMinorClose(rowBet, betMinor)) continue
    const rm = hubRowMultiplier(row)
    if (Number.isFinite(hbMult) && hbMult > 0 && rm > 0 && !multiClose(rm, hbMult)) continue
    const at = Number(row.addedAt) || 0
    if (row.hubSettlement === 'pending' && at < pendingAt) {
      pendingAt = at
      pendingBest = row
    } else if (at < fallbackAt) {
      fallbackAt = at
      fallbackBest = row
    }
  }
  return pendingBest || fallbackBest
}

function hubRowFromHouseBet(bItem, feedEntryId, extra = {}) {
  const curr = (bItem?.currency || 'usd').toLowerCase()
  const betMajor = Number(bItem?.amountMajor ?? bItem?.amount) || 0
  const payoutMajor = Number(bItem?.payoutMajor ?? bItem?.payout) || 0
  const betMinor = Number.isFinite(Number(bItem?.amountMinor))
    ? Number(bItem.amountMinor)
    : toMinor(betMajor, curr)
  let winMinor = Number.isFinite(Number(bItem?.payoutMinor))
    ? Number(bItem.payoutMinor)
    : toMinor(payoutMajor, curr)
  const mult = Number(bItem?.payoutMultiplier)
  const multiplier =
    Number.isFinite(mult) && mult >= 0 ? mult : betMinor > 0 && winMinor >= 0 ? winMinor / betMinor : 0
  const slug = String(bItem?.gameSlug || '').trim()
  return {
    ...buildHubPatchFromHouseBet(feedEntryId, bItem, {
      slotSlug: slug,
      slotName: bItem?.gameName || slug || 'Unknown Slot',
      betAmount: betMinor,
      winAmount: winMinor,
      multiplier,
      currencyCode: curr.toUpperCase(),
      sourceTag: slug ? `casino:${slug}` : undefined,
      hubSettlement: 'settled',
      settlementSource: 'houseBets',
      addedAt: Date.now(),
      ...extra,
    }),
  }
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

export function patchHubFeedFromHouseBetBestEffort(bItem) {
  return applyHouseBetToHubFeed(bItem)
}

/**
 * SSP-style: houseBets WebSocket ist die einzige Share-ID-Quelle für den Hub-Feed.
 * Verknüpft FIFO mit pending-Zeilen vom Hunter oder legt eine neue Zeile an.
 */
export function applyHouseBetToHubFeed(bItem) {
  if (!bItem) return false
  const shareIid = formatStakeShareBetId(
    pickStakeHouseBetShareRawId({
      shareIid: bItem?.shareIid ?? bItem?.iid ?? null,
      houseTopId: bItem?.houseTopId ?? null,
      id: bItem?.houseId ?? bItem?.id ?? null,
    })
  )
  if (!shareIid) return false

  const bets = getChallengeHubRecentBets()
  const existing = bets.find((row) => {
    const sid = formatStakeShareBetId(row?.shareIid ?? row?.iid ?? null)
    return sid && sid === shareIid
  })
  if (existing?.id != null) {
    publishChallengeHubBet(hubRowFromHouseBet(bItem, String(existing.id)))
    return true
  }

  const target = pickHubRowForHouseBet(bets, bItem)
  // Nur bestehende Hub-Zeilen (v. a. Hunter-pending) patchen — keine hb:-Orphans vor dem Spin-HTTP.
  if (!target?.id) return false
  publishChallengeHubBet(hubRowFromHouseBet(bItem, String(target.id)))
  return true
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

function loggerRowMultiplier(row) {
  const pm = Number(row?.payoutMultiplier)
  if (Number.isFinite(pm) && pm > 0) return pm
  const amt = Number(row?.amount)
  const pay = Number(row?.payout)
  if (Number.isFinite(amt) && amt > 0 && Number.isFinite(pay) && pay > 0) return pay / amt
  return 0
}

function findLoggerRowForHubBet(hubRow, loggerRows) {
  if (!hubRow || !loggerRows?.length) return null
  const hubSlug = normalizeBetSlugForHouseMatch(hubRow.slotSlug || hubRow.slotName)
  const hubMult = hubRowMultiplier(hubRow)
  const hubTs = Number(hubRow.addedAt) || 0
  let best = null
  let bestScore = Infinity
  for (const row of loggerRows) {
    const slug = normalizeBetSlugForHouseMatch(row?.gameSlug || row?.gameName)
    if (hubSlug && slug && !houseBetSlugMatchesSessionSlug(hubSlug, slug)) continue
    const lm = loggerRowMultiplier(row)
    if (hubMult > 0 && lm > 0 && !multiClose(hubMult, lm)) continue
    const ts = Date.parse(String(row?.receivedAt || '')) || 0
    const timeDist = hubTs > 0 && ts > 0 ? Math.abs(ts - hubTs) : 0
    if (timeDist > 120_000 && hubTs > 0 && ts > 0) continue
    const score = timeDist + Math.abs(hubMult - lm) * 1000
    if (score < bestScore) {
      bestScore = score
      best = row
    }
  }
  return best
}

/** Logger-Zeilen → shareIid auf Hub-Feed-Zeilen (Production-Fallback wenn Pending-Match fehlschlägt). */
export function backfillRecentBetsShareFromLogger(recentBets, loggerRows, { publish = true } = {}) {
  if (!recentBets?.length || !loggerRows?.length) return recentBets
  let changed = false
  const next = recentBets.map((row) => {
    if (hubRowHasShareId(row)) return row
    const match = findLoggerRowForHubBet(row, loggerRows)
    if (!match) return row
    const shareIid = formatStakeShareBetId(
      pickStakeHouseBetShareRawId({
        shareIid: match?.iid ?? null,
        houseTopId: match?.houseId ?? null,
        id: match?.betId ?? null,
      })
    )
    if (!shareIid) return row
    changed = true
    const patched = {
      ...row,
      shareIid,
      iid: match.iid ?? shareIid,
      houseId: match.houseId ?? row.houseId,
      hubSettlement: row.hubSettlement === 'pending' ? 'settled' : row.hubSettlement,
      settlementSource: row.settlementSource || 'logger_backfill',
    }
    if (publish && patched.id != null) {
      publishChallengeHubBet({
        id: patched.id,
        shareIid: patched.shareIid,
        iid: patched.iid,
        houseId: patched.houseId,
        hubSettlement: patched.hubSettlement,
        settlementSource: patched.settlementSource,
      })
    }
    return patched
  })
  return changed ? next : recentBets
}
