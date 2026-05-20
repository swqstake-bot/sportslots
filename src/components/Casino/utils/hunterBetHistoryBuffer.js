import { appendBet, pruneSlotBetHistory } from './betHistoryDb'

const HOT_BUFFER_MAX = 500
const FLUSH_BATCH_SIZE = 100
const SLOT_HISTORY_KEEP = 1800

/** @type {Array<{ slotSlug: string, entry: object, slotName?: string }>} */
let hotBuffer = []
let flushing = false
const slugsPendingPrune = new Set()

/**
 * Bet-History aus dem Hunter: Hot-Buffer, Batch-Flush in IndexedDB (nicht pro Spin im UI-Thread).
 * @param {string} slotSlug
 * @param {object} entry
 * @param {string} [slotName]
 */
export function queueHunterBetHistory(slotSlug, entry, slotName) {
  const slug = String(slotSlug || '').trim()
  if (!slug) return
  hotBuffer.push({ slotSlug: slug, entry, slotName })
  slugsPendingPrune.add(slug)
  if (hotBuffer.length >= HOT_BUFFER_MAX) {
    void flushHunterBetHistory()
  }
}

export async function flushHunterBetHistory() {
  if (flushing) return
  flushing = true
  try {
    while (hotBuffer.length > 0) {
      const batch = hotBuffer.splice(0, FLUSH_BATCH_SIZE)
      for (const row of batch) {
        try {
          await appendBet(row.slotSlug, row.entry, row.slotName)
        } catch (_) {}
      }
    }
    for (const slug of slugsPendingPrune) {
      slugsPendingPrune.delete(slug)
      try {
        await pruneSlotBetHistory(slug, SLOT_HISTORY_KEEP)
      } catch (_) {}
    }
  } finally {
    flushing = false
  }
}

export function clearHunterBetHistoryBuffer() {
  hotBuffer = []
  slugsPendingPrune.clear()
}
