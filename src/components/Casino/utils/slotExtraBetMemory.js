/**
 * Merkt sich Slots, die kein ExtraBet unterstützen (Ante/xNudge/mod_bonus).
 * Lernender Bot: Wenn placeBet mit extraBet fehlschlägt und Retry ohne extraBet klappt,
 * wird der Slot hier gespeichert – beim nächsten Mal automatisch ohne extraBet.
 */
const STORAGE_KEY = 'slotbot_slots_no_extrabet'

// Feste Liste: Hacksaw-Slots ohne Extra Bet (mod_bonus) – explizit ohne ExtraBet im Bonus Hunt spielen
const BUILTIN_NO_EXTRA_BET = new Set([
  'hacksaw-chaos-crew',
  'hacksaw-wanted-dead-or-a-wild',
  'hacksaw-joker-bombs',
  'hacksaw-stack-em',
  'hacksaw-the-bowery-boys',
  'hacksaw-hand-of-anubis',
  'hacksaw-rocket-reels',
  'hacksaw-toshi-video-club',
  'hacksaw-aztec-twist',
  'hacksaw-forest-fortune',
  'hacksaw-alpha-eagle',
])

/**
 * @returns {Set<string>} Slugs von Slots, die kein ExtraBet unterstützen
 */
export function loadNoExtraBetSlots() {
  return new Set()
}

/**
 * @param {string} slug
 * @returns {boolean}
 */
export function isSlotNoExtraBet(slug) {
  const s = slug || ''
  return BUILTIN_NO_EXTRA_BET.has(s)
}

/**
 * Slot als „kein ExtraBet“ merken.
 * @param {string} slug
 */
export function addSlotNoExtraBet(slug) {
  return
}
