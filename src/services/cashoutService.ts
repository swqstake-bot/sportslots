/**
 * Pure business logic for sport bet cashout estimation.
 * Used by useAutoCashout and ActiveBetsModal; unit-testable.
 */
import type { SportBet } from '../store/userStore';

const LIABILITY_SENSITIVITY = 0.001;
const TYPE_FACTOR_SINGLE = 0.93;
const TYPE_FACTOR_MULTI = 0.61;

/**
 * Computes estimated cashout value from stake, multiplier, potential payout and bet type.
 */
export function estimateCashoutValue(bet: SportBet): number {
  if (!bet.cashoutMultiplier || !bet.amount || bet.cashoutMultiplier <= 0) return 0;

  const stake = bet.amount;
  const potentialPayout = bet.payout || stake * (bet.potentialMultiplier || 0);
  const fairValue = stake * bet.cashoutMultiplier;
  const liabilityFactor = 1 / (1 + potentialPayout * LIABILITY_SENSITIVITY);
  const isSingle = bet.outcomes?.length === 1;
  const typeFactor = isSingle ? TYPE_FACTOR_SINGLE : TYPE_FACTOR_MULTI;

  return fairValue * typeFactor * liabilityFactor;
}

/**
 * Returns the cashout value to use: explicit bet.cashoutValue or estimated.
 */
export function getCashoutValue(bet: SportBet): number {
  if (bet.cashoutValue != null && bet.cashoutValue > 0) return bet.cashoutValue;
  return estimateCashoutValue(bet);
}

/**
 * Checks if bet has stake_shield or custom bet (no cashout).
 */
export function isCashoutDisabledByCustomPrices(bet: SportBet): boolean {
  const customPrices = bet.customPrices;
  if (!Array.isArray(customPrices)) return false;
  return customPrices.some((p) => p?.type === 'stake_shield');
}
