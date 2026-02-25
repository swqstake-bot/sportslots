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

/** Statuses that mean the leg is already settled (won/lost) – nicht mehr "offen". */
const LEG_CLOSED_STATUSES = [
  'won', 'lost', 'settled', 'settledmanual', 'settledpending',
  'void', 'cancelled', 'cancelpending', 'refunded'
];

function isLegClosed(o: any): boolean {
  const s = (o?.outcome?.status ?? o?.market?.status ?? o?.status ?? '').toString().toLowerCase();
  return LEG_CLOSED_STATUSES.some((closed) => s.includes(closed) || s === closed);
}

/**
 * Anzahl Legs, die noch nicht als gewonnen oder verloren hinterlegt sind (offen).
 */
export function getOpenLegsCount(bet: SportBet): number {
  if (!bet.outcomes || !Array.isArray(bet.outcomes)) return 0;
  return bet.outcomes.filter((o: any) => !isLegClosed(o)).length;
}
