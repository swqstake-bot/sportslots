import { toUnits } from './formatAmount'
import { isPersistableStakeHouseBetShareId } from './stakeBetShareId'

const BEST_BET_ID_OVERALL_KEY = 'slotbot_hunter_best_betid_by_slug'

export const HUNTER_CARD_STAT_ROW = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.8rem',
  marginBottom: '0.25rem',
  fontVariantNumeric: 'tabular-nums',
}

function getRateForCurrency(rates, tCurr) {
  const c = (tCurr || '').toLowerCase()
  if (c === 'usd' || c === 'usdc' || c === 'usdt') return 1
  return rates[c] || 0
}

/** Minor units → USD (wie im Spin-Loop: toUnits * Kurs) */
export function minorToUsd(amountMinor, currency, rates) {
  if (amountMinor == null || currency == null) return 0
  const n = Number(amountMinor)
  if (!Number.isFinite(n)) return 0
  const c = String(currency).toLowerCase()
  const r = getRateForCurrency(rates, c)
  if (!r) return 0
  return toUnits(n, c) * r
}

function hubRowSettlementPending(row) {
  return row && typeof row === 'object' && row.hubSettlement === 'pending'
}

function hubBetListRowMultiplier(row) {
  if (hubRowSettlementPending(row)) return 0
  const bet = Number(row?.betAmount) || 0
  const win = Number(row?.winAmount) || 0
  if (bet <= 0) return 0
  return win / bet
}

/** Zeilen mit id `${runId}:…` — gleiche Zuordnung wie publishChallengeHubBet. */
export function hunterHubListMaxForRun(bets, runId) {
  const rid = String(runId || '')
  if (!bets?.length || !rid) return { max: 0, has: false }
  const prefix = `${rid}:`
  let m = 0
  let has = false
  for (const b of bets) {
    const id = String(b?.id ?? '')
    if (!id.startsWith(prefix)) continue
    has = true
    m = Math.max(m, hubBetListRowMultiplier(b))
  }
  return { max: m, has }
}

export function hunterHubListMaxForSlot(bets, slotSlug) {
  const slug = String(slotSlug || '').toLowerCase()
  if (!bets?.length || !slug) return { max: 0, has: false }
  let m = 0
  let has = false
  for (const b of bets) {
    const s = String(b?.slotSlug ?? '').toLowerCase()
    if (s !== slug) continue
    has = true
    m = Math.max(m, hubBetListRowMultiplier(b))
  }
  return { max: m, has }
}

/** Wie BetList: Share-Roh-ID aus der Zeile mit höchstem Multi (gleicher Run wie `${runId}:…`). */
export function hubPickShareRawFromBetList(bets, runId) {
  const p = `${String(runId)}:`
  let bestRaw = null
  let bestM = -1
  let fallbackPendingRaw = null
  for (const b of bets || []) {
    if (!String(b?.id ?? '').startsWith(p)) continue
    const raw = b.shareIid || b.houseTopId || b.houseId || b.iid
    if (raw == null || String(raw).trim() === '') continue
    if (hubRowSettlementPending(b)) {
      if (fallbackPendingRaw == null) fallbackPendingRaw = raw
      continue
    }
    const m = hubBetListRowMultiplier(b)
    if (m > bestM) {
      bestM = m
      bestRaw = raw
    }
  }
  return bestRaw ?? fallbackPendingRaw
}

export function loadOverallBetIdForSlug(slug) {
  if (!slug) return null
  try {
    const raw = localStorage.getItem(BEST_BET_ID_OVERALL_KEY)
    if (!raw) return null
    const m = JSON.parse(raw)
    if (!m || typeof m !== 'object') return null
    const v = m[slug]
    return v && isPersistableStakeHouseBetShareId(String(v)) ? String(v).trim() : null
  } catch {
    return null
  }
}
