/** Stake Dice: payout = 99 / winChance%, max 9900× at 0.01% win chance. */



export const DICE_MIN_WIN_CHANCE = 0.01

export const DICE_MAX_WIN_CHANCE = 98

export const DICE_MAX_MULTIPLIER = 9900

export const DICE_MIN_MULTIPLIER = 99 / DICE_MAX_WIN_CHANCE // ≈1.0102× at 98% win



/** Internal threshold: 99 / multiplier (used for API target mapping). */

export function multiplierToRollUnder(targetMultiplier: number): number {

  const mult = clampMultiplier(targetMultiplier)

  return 99 / mult

}



export function rollUnderToMultiplier(rollUnder: number): number {

  const ru = Number(rollUnder)

  if (!Number.isFinite(ru) || ru <= 0) return 2

  return clampMultiplier(99 / ru)

}



/** Win chance % for both roll over and roll under (Stake: always 99 / payout×). */

export function diceWinChance(targetMultiplier: number): number {

  const mult = clampMultiplier(targetMultiplier)

  return Math.max(DICE_MIN_WIN_CHANCE, Math.min(DICE_MAX_WIN_CHANCE, 99 / mult))

}



/** API diceRoll target (0.01–99.99). */

export function diceRollThreshold(targetMultiplier: number, rollOver: boolean): number {

  const ru = multiplierToRollUnder(targetMultiplier)

  const raw = rollOver ? 100 - ru : ru

  return Math.min(99.99, Math.max(0.01, Math.round(raw * 100) / 100))

}



export function clampMultiplier(n: number, max = DICE_MAX_MULTIPLIER): number {

  return Math.min(max, Math.max(DICE_MIN_MULTIPLIER, Number(n) || DICE_MIN_MULTIPLIER))

}



/** Win chance % → payout multiplier (Stake dice edge ≈ 1%). */

export function multiplierFromWinChance(chancePercent: number): number {

  const c = Math.max(DICE_MIN_WIN_CHANCE, Math.min(DICE_MAX_WIN_CHANCE, Number(chancePercent) || 49.5))

  return clampMultiplier(99 / c)

}



export function formatDiceMultiplier(multi: number): string {

  const m = clampMultiplier(multi)

  if (m >= 1000) return `${m.toLocaleString('en-US', { maximumFractionDigits: 0 })}×`

  if (m >= 100) return `${m.toFixed(0)}×`

  if (m >= 10) return `${m.toFixed(1)}×`

  return `${m.toFixed(2)}×`

}


