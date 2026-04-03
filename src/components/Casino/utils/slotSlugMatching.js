/**
 * Einheitliche Slug-Matching-Heuristik für houseBets ↔ Session-Slots.
 */
export function normalizeBetSlugForHouseMatch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
}

export function houseBetSlugMatchesSessionSlug(houseSlug, sessionSlug) {
  const h = normalizeBetSlugForHouseMatch(houseSlug)
  const s = normalizeBetSlugForHouseMatch(sessionSlug)
  if (!h || !s) return false
  if (s === h) return true
  if (h.length >= 10 && s.endsWith(h)) return true
  if (s.length >= 10 && h.endsWith(s)) return true

  const hParts = h.split('-').filter(Boolean)
  const sParts = s.split('-').filter(Boolean)
  if (hParts.length === 0 || sParts.length === 0) return false
  if (hParts.length === sParts.length && hParts.length >= 2) {
    for (let n = hParts.length; n >= 2; n--) {
      if (hParts.slice(-n).join('-') === sParts.slice(-n).join('-')) return true
    }
  }
  if (hParts.length === sParts.length) return false

  const [shortParts, longParts] =
    hParts.length < sParts.length ? [hParts, sParts] : [sParts, hParts]
  if (shortParts.length < 2) return false
  for (let i = 0; i <= longParts.length - shortParts.length; i++) {
    let ok = true
    for (let j = 0; j < shortParts.length; j++) {
      if (longParts[i + j] !== shortParts[j]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

