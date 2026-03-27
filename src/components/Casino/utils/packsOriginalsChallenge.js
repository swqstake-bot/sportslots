/**
 * Stake Originals „Packs“ – Telegram-Challenges (Legendary-Karte, Bet-ID gerade, …).
 * GraphQL `casesBet` (Spiel „Packs“ im Kurator). Im Hunter wird die Antwort unter
 * `data._stakeEngine.raw.packsBet` / `raw.casesBet` durchgereicht.
 *
 * Legendary: zuerst explizite Felder aus der API (rarity / rarityId / …).
 * Multiplikator-Vergleich nur als Fallback, wenn **keine** Karte in der Hand Rarity-Metadaten hat.
 */

/**
 * Optional: Wenn `card.rarity` (oder ähnlich) als **Zahl** kommt und z. B. 5 = Legendary.
 * Bei Bedarf aus echtem HAR ergänzen (z. B. nur [5] oder [6]).
 */
export const PACKS_LEGENDARY_RARITY_NUMBERS = new Set([5, 6])

/**
 * @param {object} data – parseBetResponse-Input (mit _stakeEngine)
 * @returns {object | null}
 */
export function extractPacksBetFromStakeData(data) {
  const raw = data?._stakeEngine?.raw
  if (!raw || typeof raw !== 'object') return null
  if (raw.casesBet) return raw.casesBet
  if (raw.packsBet) return raw.packsBet
  if (raw.round?.packsBet) return raw.round.packsBet
  if (raw.data?.packsBet) return raw.data.packsBet
  return null
}

/**
 * Aus Telegram-Zeile „Earn $20 by getting the No. 6 Legendary card…“
 * @returns {{
 *   legendaryCatalogId: number | null,
 *   requireAnyLegendary: boolean,
 *   betIdEven: boolean | null,
 * }}
 */
export function parsePacksChallengeHints(objectiveText) {
  const t = String(objectiveText || '')
  const hints = {
    legendaryCatalogId: null,
    requireAnyLegendary: false,
    betIdEven: null,
  }
  const mNo = t.match(/\bNo\.?\s*(\d+)\s+Legendary\b/i)
  if (mNo) {
    hints.legendaryCatalogId = Number(mNo[1])
  } else if (/\bLegendary\b/i.test(t)) {
    hints.requireAnyLegendary = true
  }
  if (/\bbet\s+id\b/i.test(t) || /\bbet\s+ID\b/.test(t) || /ending\s+in\s+an?\s+even/i.test(t)) {
    if (/\beven\b/i.test(t) || /even\s+number/i.test(t)) hints.betIdEven = true
    else if (/\bodd\b/i.test(t) || /odd\s+number/i.test(t)) hints.betIdEven = false
  }
  return hints
}

/** Letzte Ziffer (nur Ziffern aus der ID) – für „even bet id“ */
export function betIdLastDigitIsEven(idStr) {
  const digits = String(idStr || '').replace(/\D/g, '')
  if (!digits.length) return null
  const last = parseInt(digits[digits.length - 1], 10)
  if (!Number.isFinite(last)) return null
  return last % 2 === 0
}

function rarityStringIsLegendary(s) {
  const x = String(s || '')
    .toLowerCase()
    .trim()
  if (!x) return false
  if (x.includes('legend')) return true
  if (x === 'l') return true
  return false
}

/** Liegt irgendein Rarity-/Tier-Feld vor (dann keine Multi-Heuristik für die ganze Hand)? */
export function cardHasRarityMetadata(card) {
  if (!card || typeof card !== 'object') return false
  const keys = [
    'rarity',
    'cardRarity',
    'tier',
    'rarityTier',
    'rarityId',
    'rarityType',
    'grade',
    'quality',
    'rank',
  ]
  for (const k of keys) {
    const v = card[k]
    if (v != null && v !== '') return true
  }
  return false
}

export function handHasAnyRarityMetadata(cards) {
  return Array.isArray(cards) && cards.some((c) => cardHasRarityMetadata(c))
}

/**
 * Legendary **nur** aus API-Feldern (kein Multiplikator).
 */
export function legendaryFromExplicitApi(card) {
  if (!card || typeof card !== 'object') return false
  if (card.legendary === true || card.isLegendary === true) return true

  const strFields = [card.rarity, card.cardRarity, card.tier, card.rarityType, card.grade, card.quality]
  for (const f of strFields) {
    if (typeof f === 'string' && rarityStringIsLegendary(f)) return true
  }

  const numCandidates = [
    card.rarity,
    card.rarityId,
    card.rarityTier,
    card.tierId,
    card.tier,
  ]
  for (const n of numCandidates) {
    const v = Number(n)
    if (Number.isFinite(v) && PACKS_LEGENDARY_RARITY_NUMBERS.has(v)) return true
  }

  return false
}

/**
 * Fallback nur wenn die Hand **gar keine** Rarity-Metadaten liefert (alte/leere Responses).
 */
function legendaryFromMultiplierHeuristic(card, maxMultiplierInHand) {
  if (!card || typeof card !== 'object') return false
  const m = Number(card.multiplier)
  if (!Number.isFinite(m)) return false
  if (!Number.isFinite(maxMultiplierInHand) || maxMultiplierInHand <= 0) return false
  return m >= maxMultiplierInHand * 0.85 && m >= 0.15
}

function maxMultiplierInCards(cards) {
  if (!Array.isArray(cards)) return 0
  let mx = 0
  for (const c of cards) {
    const m = Number(c?.multiplier)
    if (Number.isFinite(m) && m > mx) mx = m
  }
  return mx
}

/**
 * @param {object} card
 * @param {{ handHasRarityMetadata: boolean, maxMultiplier: number }} ctx
 */
function cardIsLegendary(card, ctx) {
  if (legendaryFromExplicitApi(card)) return true
  if (ctx.handHasRarityMetadata) return false
  return legendaryFromMultiplierHeuristic(card, ctx.maxMultiplier)
}

/**
 * @param {object} packsBet
 * @param {ReturnType<typeof parsePacksChallengeHints>} hints
 * @param {string | null} roundIdForParity – Bet-/Round-ID (UUID oder numerisch)
 */
export function packsHintsHaveConstraint(hints) {
  if (!hints) return false
  return (
    hints.legendaryCatalogId != null ||
    hints.requireAnyLegendary === true ||
    hints.betIdEven != null
  )
}

export function packsChallengeConditionMet(packsBet, hints, roundIdForParity) {
  if (!packsBet || !hints || !packsHintsHaveConstraint(hints)) return false
  const state = packsBet.state || {}
  const cards = Array.isArray(state.cards) ? state.cards : []

  const maxM = maxMultiplierInCards(cards)
  const handMeta = handHasAnyRarityMetadata(cards)
  const ctx = { handHasRarityMetadata: handMeta, maxMultiplier: maxM }

  let legendaryOk = true
  if (hints.legendaryCatalogId != null && Number.isFinite(hints.legendaryCatalogId)) {
    const want = Number(hints.legendaryCatalogId)
    if (handMeta) {
      legendaryOk = cards.some((c) => Number(c.id) === want && legendaryFromExplicitApi(c))
    } else {
      let hit = cards.some((c) => Number(c.id) === want && cardIsLegendary(c, ctx))
      if (!hit) {
        hit = cards.some((c) => Number(c.id) === want)
      }
      legendaryOk = hit
    }
  } else if (hints.requireAnyLegendary) {
    legendaryOk = cards.some((c) => cardIsLegendary(c, ctx))
  }

  if (!legendaryOk) return false

  if (hints.betIdEven != null && roundIdForParity != null) {
    const even = betIdLastDigitIsEven(String(roundIdForParity))
    if (even === null) return false
    if (even !== hints.betIdEven) return false
  }

  return true
}

/** Bet-ID für „gerade/ungerade“: bei Packs zuerst packsBet.id (Stake-Bet) */
export function getBetIdForParityCheck(data, parsedRoundId) {
  const pb = extractPacksBetFromStakeData(data)
  if (pb?.id != null) return String(pb.id)
  if (parsedRoundId != null && String(parsedRoundId).length) return String(parsedRoundId)
  return null
}

/** Anzeige / Clipboard: bevorzugt parseBetResponse, sonst packsBet.id / Round */
export function resolveTelegramBetRoundId(data, parsedRoundId) {
  if (parsedRoundId != null && String(parsedRoundId).length) return String(parsedRoundId)
  const pb = extractPacksBetFromStakeData(data)
  if (pb?.id != null) return String(pb.id)
  const rawR = data?._stakeEngine?.raw?.round
  if (rawR?.roundId != null) return String(rawR.roundId)
  if (rawR?.id != null) return String(rawR.id)
  return null
}
