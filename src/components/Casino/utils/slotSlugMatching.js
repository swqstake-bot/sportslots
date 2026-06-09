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

function normalizeGameNameToken(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
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
  const hTail = hParts[hParts.length - 1] || ''
  const sTail = sParts[sParts.length - 1] || ''
  // hub88-farmageddon ↔ playnetic-farmageddon (Provider-Präfix weicht ab)
  if (hTail && sTail && hTail === sTail && hTail.length >= 4) return true
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

/**
 * houseBets → aktiver Slot (Slug + optional Spielname, wie BonusHunt).
 */
export function houseBetMatchesSessionSlot(houseBet, sessionSlug, sessionName) {
  const slug = String(houseBet?.gameSlug || '').trim()
  const session = String(sessionSlug || '').trim()
  if (slug && session && houseBetSlugMatchesSessionSlug(slug, session)) return true

  const gameName = normalizeGameNameToken(houseBet?.gameName)
  const slotName = normalizeGameNameToken(sessionName)
  if (gameName && session && houseBetSlugMatchesSessionSlug(gameName, session)) return true
  if (gameName && slotName) {
    if (gameName === slotName) return true
    if (gameName.includes(slotName) || slotName.includes(gameName)) return true
  }
  return false
}

