const PROMO_COMPLETED_IDS_KEY = 'slotbot_promotions_completed_ids_v1'
const PROMO_COMPLETION_HISTORY_KEY = 'slotbot_promotions_completion_history_v1'
const MAX_HISTORY_ITEMS = 400

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage failures
  }
}

function normalizeSlug(slug) {
  return String(slug || '').trim().toLowerCase()
}

export function getCompletedPromotionIds() {
  const ids = readJson(PROMO_COMPLETED_IDS_KEY, [])
  return new Set(Array.isArray(ids) ? ids.map(normalizeSlug).filter(Boolean) : [])
}

export function isPromotionCompleted(slug) {
  const key = normalizeSlug(slug)
  if (!key) return false
  return getCompletedPromotionIds().has(key)
}

export function getPromotionCompletionHistory({ slug, limit = 200 } = {}) {
  const list = readJson(PROMO_COMPLETION_HISTORY_KEY, [])
  const rows = Array.isArray(list) ? list : []
  const wanted = normalizeSlug(slug)
  const filtered = wanted ? rows.filter((row) => normalizeSlug(row?.slug) === wanted) : rows
  return filtered.slice(0, Math.max(1, Number(limit) || 200))
}

export function markPromotionCompleted(slug, payload = {}) {
  const key = normalizeSlug(slug)
  if (!key) return
  const ids = getCompletedPromotionIds()
  ids.add(key)
  writeJson(PROMO_COMPLETED_IDS_KEY, Array.from(ids))

  const history = readJson(PROMO_COMPLETION_HISTORY_KEY, [])
  const rows = Array.isArray(history) ? history : []
  const entry = {
    slug: key,
    ts: Date.now(),
    note: String(payload.note || '').trim(),
    slotSlug: String(payload.slotSlug || '').trim().toLowerCase(),
    multiplier: Number(payload.multiplier || 0),
    betUsd: Number(payload.betUsd || 0),
    roundId: payload.roundId != null ? String(payload.roundId) : '',
  }
  const dedupeKey = `${entry.slug}:${entry.slotSlug}:${entry.roundId || ''}:${entry.multiplier}`
  const deduped = rows.filter((row) => {
    const rowKey = `${normalizeSlug(row?.slug)}:${String(row?.slotSlug || '').toLowerCase()}:${row?.roundId ? String(row.roundId) : ''}:${Number(row?.multiplier || 0)}`
    return rowKey !== dedupeKey
  })
  deduped.unshift(entry)
  writeJson(PROMO_COMPLETION_HISTORY_KEY, deduped.slice(0, MAX_HISTORY_ITEMS))
}

export function clearPromotionCompletions() {
  try {
    localStorage.removeItem(PROMO_COMPLETED_IDS_KEY)
    localStorage.removeItem(PROMO_COMPLETION_HISTORY_KEY)
  } catch {
    // ignore
  }
}
