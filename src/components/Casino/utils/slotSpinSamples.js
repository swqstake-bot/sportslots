/**
 * Slot Spin Samples – automatisches Lernen pro Slot
 * Speichert 1–2 Request/Response-Beispiele pro Slot im Hintergrund in einem Ordner.
 * Electron: Ordner unter userData/slot-spin-samples/
 * Fallback (Web): localStorage
 */

const STORAGE_KEY = 'slotbot_spin_samples'
const BONUS_STORAGE_KEY = 'slotbot_spin_samples_bonus'
const MAX_SAMPLES_PER_SLOT = 2
const MAX_BONUS_SAMPLES_PER_SLOT = 5

function sanitize(obj) {
  if (obj == null) return null
  try {
    return JSON.parse(JSON.stringify(obj))
  } catch {
    return { _error: 'Could not serialize', _preview: String(obj).slice(0, 300) }
  }
}

function getElectronAPI() {
  return typeof window !== 'undefined' ? window.electronAPI : null
}

// --- Electron: Speichern im Ordner ---
async function saveToElectron({ slotSlug, slotName, providerId, request, response }) {
  const api = getElectronAPI()
  if (!api?.saveSlotSpinSample) return false
  await api.saveSlotSpinSample({
    slotSlug,
    slotName,
    providerId,
    request: sanitize(request),
    response: sanitize(response),
  })
  return true
}

// --- localStorage Fallback ---
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('slotbot: could not save spin samples', e)
  }
}

/**
 * Prüft, ob bereits genug Samples für einen Slot vorhanden sind (≥ MAX).
 * Wird beim Session-Start aufgerufen, um redundantes Speichern zu vermeiden.
 */
export async function hasEnoughSamplesForSlot(slotSlug) {
  if (!slotSlug || typeof slotSlug !== 'string') return false
  const slug = slotSlug.toLowerCase().trim()
  if (!slug) return false
  const all = await getSlotSpinSamples()
  const entries = all[slug] || []
  return entries.length >= MAX_SAMPLES_PER_SLOT
}

/**
 * Speichert ein Request/Response-Paar für einen Slot.
 * Im Hintergrund – blockiert nicht. Electron: Ordner, sonst localStorage.
 * @param {boolean} [skipIfFull] – wenn true, nur speichern wenn noch < MAX Samples (reduziert Schreibvorgänge)
 */
export function saveSlotSpinSample({ slotSlug, slotName, providerId, request, response, skipIfFull = false }) {
  if (!slotSlug || typeof slotSlug !== 'string') return
  const slug = slotSlug.toLowerCase().trim()
  if (!slug) return

  const doSave = async () => {
    if (skipIfFull) {
      const enough = await hasEnoughSamplesForSlot(slug)
      if (enough) return
    }
    if (getElectronAPI()?.saveSlotSpinSample) {
      await saveToElectron({ slotSlug: slug, slotName, providerId, request: sanitize(request), response: sanitize(response) })
    } else {
      const all = loadAll()
      let entries = all[slug] || []
      const entry = { ts: new Date().toISOString(), slotName: slotName || null, providerId: providerId || null, request: sanitize(request), response: sanitize(response) }
      entries = [entry, ...entries].slice(0, MAX_SAMPLES_PER_SLOT)
      all[slug] = entries
      saveAll(all)
    }
  }
  doSave().catch((err) => console.warn('[SlotSpinSamples] Save failed:', err))
}

/**
 * Speichert ein Bonus-Spin-Sample (wenn Spin ein Bonus war).
 * Pro Slot bis zu 5 Bonus-Beispiele (versch. Scatter-Stufen, Provider) für Vergleiche.
 * Dateiname: slug-bonus.json
 */
export function saveBonusSpinSample({ slotSlug, slotName, providerId, request, response }) {
  if (!slotSlug || typeof slotSlug !== 'string') return
  const slug = (slotSlug.toLowerCase().trim() + '-bonus').replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-')
  if (!slug || slug === '-bonus') return

  const doSave = async () => {
    const all = await getSlotSpinSamples()
    const entries = all[slug] || []
    if (entries.length >= MAX_BONUS_SAMPLES_PER_SLOT) return
    if (getElectronAPI()?.saveSlotSpinSample) {
      await saveToElectron({ slotSlug: slug, slotName, providerId, request: sanitize(request), response: sanitize(response) })
    } else {
      const allLocal = JSON.parse(localStorage.getItem(BONUS_STORAGE_KEY) || '{}')
      let localEntries = allLocal[slug] || []
      const entry = { ts: new Date().toISOString(), slotName: slotName || null, providerId: providerId || null, request: sanitize(request), response: sanitize(response), _bonus: true }
      localEntries = [entry, ...localEntries].slice(0, MAX_BONUS_SAMPLES_PER_SLOT)
      allLocal[slug] = localEntries
      try { localStorage.setItem(BONUS_STORAGE_KEY, JSON.stringify(allLocal)) } catch (_) {}
    }
  }
  doSave().catch((err) => console.warn('[SlotSpinSamples] Bonus save failed:', err))
}

/**
 * Gibt alle gespeicherten Samples zurück (inkl. Bonus-Samples als slug-bonus).
 * Electron: aus Ordner, sonst localStorage + Bonus localStorage.
 */
export async function getSlotSpinSamples() {
  const api = getElectronAPI()
  if (api?.getSlotSpinSamples) {
    try {
      return await api.getSlotSpinSamples() || {}
    } catch {
      return {}
    }
  }
  const base = loadAll()
  try {
    const bonus = JSON.parse(localStorage.getItem(BONUS_STORAGE_KEY) || '{}')
    return { ...base, ...bonus }
  } catch {
    return base
  }
}

/**
 * Gibt den Ordnerpfad zurück (nur Electron).
 */
export function getSpinSamplesDir() {
  const api = getElectronAPI()
  return api?.getSpinSamplesDir ? api.getSpinSamplesDir() : null
}

/**
 * Löscht alle gespeicherten Samples (inkl. Bonus).
 */
export async function clearSlotSpinSamples() {
  const api = getElectronAPI()
  if (api?.clearSlotSpinSamples) {
    await api.clearSlotSpinSamples()
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(BONUS_STORAGE_KEY)
  } catch (_) {}
}

/**
 * Exportiert alle Samples als JSON-Datei (Download).
 */
export async function exportSlotSpinSamplesAsFile() {
  const data = await getSlotSpinSamples()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `slotbot-spin-samples-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`
  a.click()
  URL.revokeObjectURL(url)
}
