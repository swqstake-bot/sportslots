/**
 * Erster Gewinn pro Slot (Challenge Hunter) — ein Unterordner pro Slot, Datei first-win.json.
 * Nur Electron (userData); Web: no-op.
 */

function getElectronAPI() {
  return typeof window !== 'undefined' ? window.electronAPI : null
}

/**
 * @param {object} payload
 * @param {string} payload.slotSlug
 * @param {number} payload.winAmountMinor
 * @returns {Promise<{ saved: boolean; path?: string } | null>}
 */
export async function saveFirstSlotWinIfNeeded(payload) {
  if (!payload?.slotSlug || typeof payload.slotSlug !== 'string') return null
  const win = Number(payload.winAmountMinor)
  if (!Number.isFinite(win) || win <= 0) return null
  const api = getElectronAPI()
  if (!api?.saveSlotFirstWinIfNeeded) {
    console.debug('[slotFirstWin] skip (no Electron API)')
    return null
  }
  try {
    const r = await api.saveSlotFirstWinIfNeeded(payload)
    if (r?.saved) {
      console.log('[slotFirstWin] first win saved:', payload.slotSlug, {
        json: r.path,
        csv: r.csvPath,
        slotCsv: r.slotCsvPath,
      })
    }
    return r ?? { saved: false }
  } catch (err) {
    console.warn('[slotFirstWin] save failed:', err)
    return { saved: false }
  }
}

export function getSlotFirstWinsDir() {
  const api = getElectronAPI()
  return api?.getSlotFirstWinsDir ? api.getSlotFirstWinsDir() : Promise.resolve(null)
}
