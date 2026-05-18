import { toMinor } from './formatAmount'
import { formatStakeShareBetId, pickStakeHouseBetShareRawId } from './stakeBetShareId'

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
    const rows = parsed
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
    return dedupeTopEntries(rows)
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
  const shareRaw = pickStakeHouseBetShareRawId({
    shareIid: row?.shareIid ?? row?.iid ?? null,
    houseTopId: row?.houseTopId ?? row?.houseId ?? null,
  })
  const shareId = formatStakeShareBetId(shareRaw)
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

function normalizeSlotNameKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function roundMultiplierKey(multiplier: number): number {
  return Math.round(multiplier * 100) / 100
}

/** Same spin from hub feed + logger often carries different ids until shareId is known. */
function sameTopEntryFingerprint(a: TopEntry, b: TopEntry): boolean {
  if (!a || !b) return false
  if (normalizeSlotNameKey(a.slotName) !== normalizeSlotNameKey(b.slotName)) return false
  if (a.winAmount !== b.winAmount || a.winAmount <= 0) return false
  return roundMultiplierKey(a.multiplier) === roundMultiplierKey(b.multiplier) && roundMultiplierKey(a.multiplier) > 0
}

function sameTopEntryIdentity(a: TopEntry, b: TopEntry): boolean {
  if (!a || !b) return false
  if (a.key && b.key && a.key === b.key) return true
  if (a.id && b.id && a.id === b.id) return true
  if (a.shareId && b.shareId && a.shareId === b.shareId) return true
  return sameTopEntryFingerprint(a, b)
}

function topEntryRichnessScore(entry: TopEntry): number {
  let score = 0
  if (entry.shareId) score += 8
  if (entry.id && !entry.id.includes(':')) score += 4
  if (entry.id) score += 2
  if (entry.key && entry.key === entry.shareId) score += 1
  return score
}

function pickPreferredTopEntry(a: TopEntry, b: TopEntry): TopEntry {
  const primary = topEntryRichnessScore(a) >= topEntryRichnessScore(b) ? a : b
  const secondary = primary === a ? b : a
  const shareId = primary.shareId || secondary.shareId
  const id = primary.id || secondary.id
  const key = shareId || id || primary.key || secondary.key
  const multiplier = Math.max(primary.multiplier, secondary.multiplier)
  const winAmount = Math.max(primary.winAmount, secondary.winAmount)
  return {
    ...secondary,
    ...primary,
    key,
    id,
    shareId,
    multiplier,
    winAmount,
    addedAt: Math.max(primary.addedAt, secondary.addedAt),
    slotName: primary.slotName || secondary.slotName,
    currencyCode: primary.currencyCode || secondary.currencyCode,
  }
}

function upsertTopEntryList(list: TopEntry[], next: TopEntry): TopEntry[] {
  const idx = list.findIndex((existing) => sameTopEntryIdentity(existing, next))
  if (idx < 0) return [...list, next]
  const out = list.slice()
  out[idx] = pickPreferredTopEntry(list[idx], next)
  return out
}

export function dedupeTopEntries(entries: TopEntry[]): TopEntry[] {
  let list: TopEntry[] = []
  for (const entry of entries || []) {
    if (!entry?.key) continue
    list = upsertTopEntryList(list, entry)
  }
  return list
    .sort((a, b) => (b.multiplier - a.multiplier) || (b.winAmount - a.winAmount) || (b.addedAt - a.addedAt))
    .slice(0, TOP_DOMAIN_STORAGE_MAX)
}

export function mergeTopEntries(prev: TopEntry[], rows: any[]): TopEntry[] {
  let list = dedupeTopEntries(prev || [])
  for (const row of rows || []) {
    const next = toTopEntry(row)
    if (!next) continue
    list = upsertTopEntryList(list, next)
  }
  return list
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
    shareIid: formatStakeShareBetId(
      pickStakeHouseBetShareRawId({
        shareIid: row?.iid ?? null,
        houseTopId: row?.houseId ?? null,
      })
    ) || undefined,
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
