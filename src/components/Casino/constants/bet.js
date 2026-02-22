/**
 * Extra Bet (mod_bonus) kostet slot-spezifisch 3×, 5× oder 10× die Basiswette.
 * Für Statistik: Gesamteinsatz = Basis × diesen Faktor.
 */
export const EXTRA_BET_MULTIPLIER = 5
const HACKSAW_DEFAULT_MULTIPLIER = 3

/** Hacksaw: Standard ist 3×. Nur diese 3 haben 5×. Andere Provider: 5×. */
const HACKSAW_5X_SLOTS = new Set([
  'hacksaw-chaos-crew-2',
  'hacksaw-chaos-crew-3',
  'hacksaw-2-wild-2-die',
])

/** Slot-Overrides für andere Provider (z.B. 10×). Hacksaw nutzt HACKSAW_5X_SLOTS. */
export const SLOT_EXTRA_BET_MULTIPLIERS = {}

export function getExtraBetMultiplier(slotSlug) {
  if (!slotSlug) return EXTRA_BET_MULTIPLIER
  const override = SLOT_EXTRA_BET_MULTIPLIERS[slotSlug]
  if (override != null && override >= 1) return override
  if (String(slotSlug).startsWith('hacksaw-')) {
    return HACKSAW_5X_SLOTS.has(slotSlug) ? 5 : HACKSAW_DEFAULT_MULTIPLIER
  }
  return EXTRA_BET_MULTIPLIER
}

export function getEffectiveBetAmount(baseBet, extraBet, slotSlug = null) {
  if (!extraBet) return baseBet
  const mult = getExtraBetMultiplier(slotSlug)
  return baseBet * mult
}

export const BET_SCHEMA = { casino:{type:'text',required:true}, username:{type:'text',required:true}, game:{type:'text',required:true}, provider:{type:'text',required:true}, currency:{type:'text',required:true}, bet_size:{type:'numeric',required:true}, payout:{type:'numeric',required:true}, multiplier:{type:'numeric',required:true}, created_at:{type:'numeric',required:true}, fiat_currency:{type:'text',required:false}, fiat_bet_size:{type:'numeric',required:false}, fiat_payout:{type:'numeric',required:false}, casino_id_public:{type:'text',required:false}, casino_id_internal:{type:'text',required:false} }

