import { toMinor } from './formatAmount'
import { formatStakeShareBetId } from './stakeBetShareId'

export const TOP_DOMAIN_STORAGE_KEY = 'slotbot_challenge_hub_top_multis_v1'
export const TOP_DOMAIN_STORAGE_MAX = 600

export type TopEntry = {
  key: string
  id: string
  slotName: string
  multiplier: number
  winAmount: number
  currencyCode: string
  shareId: string
  addedAt: number
}

export type TopSlotEntry = {
  slotName: string
  spins: number
  bestMulti: number
  bestWinAmount: number
  currencyCode: string
}

export function parseStoredTopEntries(): TopEntry[] {
  try {
    const raw = localStorage.getItem(TOP_DOMAIN_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => ({
        key: String(x?.key || ''),
        id: String(x?.id || ''),
        slotName: String(x?.slotName || 'Unknown Slot'),
        multiplier: Number(x?.multiplier) || 0,
        winAmount: Number(x?.winAmount) || 0,
        currencyCode: String(x?.currencyCode || 'usd').toLowerCase(),
        shareId: String(x?.shareId || ''),
        addedAt: Number(x?.addedAt) || 0,
      }))
      .filter((x) => x.key && Number.isFinite(x.multiplier) && x.multiplier > 0)
      .slice(0, TOP_DOMAIN_STORAGE_MAX)
  } catch {
    return []
  }
}

export function toTopEntry(row: any): TopEntry | null {
  if (!row || String(row?.hubSettlement || '').toLowerCase() === 'pending') return null
  const bet = Number(row?.betAmount) || 0
  const win = Number(row?.winAmount) || 0
  const explicitMultiplier = Number(row?.multiplier)
  if (!Number.isFinite(explicitMultiplier) && (!Number.isFinite(bet) || bet <= 0 || !Number.isFinite(win) || win <= 0)) return null
  const multiplier = Number.isFinite(explicitMultiplier) && explicitMultiplier > 0 ? explicitMultiplier : (win / bet)
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null
  const shareId = formatStakeShareBetId(row?.shareIid || row?.houseTopId || row?.houseId || row?.iid || null)
  const id = String(row?.id ?? '')
  const key = String(id || shareId || `${row?.slotSlug || 'slot'}:${bet}:${win}:${row?.addedAt || ''}`)
  if (!key) return null
  return {
    key,
    id,
    slotName: String(row?.slotName || row?.slotSlug || 'Unknown Slot'),
    multiplier,
    winAmount: win,
    currencyCode: String(row?.currencyCode || 'USD').toLowerCase(),
    shareId: String(shareId || ''),
    addedAt: Number(row?.addedAt || Date.now()),
  }
}

function sameTopEntryIdentity(a: TopEntry, b: TopEntry): boolean {
  if (!a || !b) return false
  if (a.key && b.key && a.key === b.key) return true
  if (a.id && b.id && a.id === b.id) return true
  if (a.shareId && b.shareId && a.shareId === b.shareId) return true
  return false
}

export function mergeTopEntries(prev: TopEntry[], rows: any[]): TopEntry[] {
  const map = new Map<string, TopEntry>()
  for (const item of prev || []) {
    if (!item?.key) continue
    map.set(item.key, item)
  }
  for (const row of rows || []) {
    const next = toTopEntry(row)
    if (!next) continue
    let matchedKey: string | null = null
    let cur: TopEntry | undefined
    for (const [k, existing] of map.entries()) {
      if (!existing) continue
      if (sameTopEntryIdentity(existing, next)) {
        matchedKey = k
        cur = existing
        break
      }
    }
    if (!cur || next.multiplier > cur.multiplier || (next.multiplier === cur.multiplier && next.winAmount > cur.winAmount)) {
      if (matchedKey && matchedKey !== next.key) map.delete(matchedKey)
      map.set(next.key, next)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => (b.multiplier - a.multiplier) || (b.winAmount - a.winAmount) || (b.addedAt - a.addedAt))
    .slice(0, TOP_DOMAIN_STORAGE_MAX)
}

export function deriveTopWins(all: TopEntry[], limit: number): TopEntry[] {
  return [...all]
    .sort((a, b) => (b.winAmount - a.winAmount) || (b.multiplier - a.multiplier) || (b.addedAt - a.addedAt))
    .slice(0, limit)
}

export function deriveTopSlots(all: TopEntry[], limit: number): TopSlotEntry[] {
  const map = new Map<string, TopSlotEntry>()
  for (const row of all) {
    const key = String(row.slotName || 'Unknown Slot')
    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        slotName: key,
        spins: 1,
        bestMulti: row.multiplier,
        bestWinAmount: row.winAmount,
        currencyCode: row.currencyCode,
      })
      continue
    }
    cur.spins += 1
    if (row.multiplier > cur.bestMulti) cur.bestMulti = row.multiplier
    if (row.winAmount > cur.bestWinAmount) {
      cur.bestWinAmount = row.winAmount
      cur.currencyCode = row.currencyCode
    }
  }
  return Array.from(map.values())
    .sort((a, b) => (b.bestMulti - a.bestMulti) || (b.bestWinAmount - a.bestWinAmount) || (b.spins - a.spins))
    .slice(0, limit)
}

export function loggerBetToTopCandidate(row: any): any | null {
  if (!row || typeof row !== 'object') return null
  const gameSlug = String(row?.gameSlug || '').trim()
  const gameName = String(row?.gameName || gameSlug || '').trim()
  if (!gameSlug && !gameName) return null
  const status = String(row?.status || '').toLowerCase()
  if (status.includes('pending') || status.includes('open')) return null
  const currency = String(row?.currency || 'usd').toLowerCase()
  const amountMajor = Number(row?.amount)
  const payoutMajor = Number(row?.payout)
  if (!Number.isFinite(amountMajor) || !Number.isFinite(payoutMajor) || amountMajor <= 0 || payoutMajor <= 0) return null
  const betAmount = toMinor(amountMajor, currency)
  const winAmount = toMinor(payoutMajor, currency)
  if (!Number.isFinite(betAmount) || !Number.isFinite(winAmount) || betAmount <= 0 || winAmount <= 0) return null
  return {
    id: row?.betId || row?.houseId || row?.iid || row?.receivedAt || `${gameSlug}:${amountMajor}:${payoutMajor}`,
    slotSlug: gameSlug || gameName.toLowerCase().replace(/\s+/g, '-'),
    slotName: gameName || gameSlug || 'Unknown Slot',
    betAmount,
    winAmount,
    currencyCode: currency.toUpperCase(),
    shareIid: formatStakeShareBetId(row?.iid || row?.houseId || row?.betId || null) || undefined,
    addedAt: row?.receivedAt ? Date.parse(String(row.receivedAt)) : Date.now(),
    hubSettlement: 'settled',
  }
}

export function persistTopEntries(entries: TopEntry[]) {
  try {
    localStorage.setItem(TOP_DOMAIN_STORAGE_KEY, JSON.stringify(entries.slice(0, TOP_DOMAIN_STORAGE_MAX)))
  } catch {
  }
}

export function clearTopEntries() {
  try {
    localStorage.removeItem(TOP_DOMAIN_STORAGE_KEY)
  } catch {
  }
}
