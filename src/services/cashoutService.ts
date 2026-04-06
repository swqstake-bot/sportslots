/**
 * Cashout-Anzeige für Sportwetten.
 *
 * **Aktueller Cashout** kommt von Stake (GraphQL): `cashoutValue` aus PreviewCashout, oder
 * `amount * cashoutMultiplier` aus der Active-Bets-Liste – das ist kein Modell, sondern die gleiche Basis
 * wie auf dem offiziellen Schein.
 *
 * Nur wenn diese Felder fehlen, greift ein alter Heuristik-Fallback (`estimateCashoutValue`).
 */
import type { SportBet } from '../store/userStore';
import { getShieldOdds } from '../store/shieldOddsCache';

/** True when this bet used Stake Shield (API `customPrices` includes `stake_shield`). */
export function isStakeShieldBet(bet: SportBet): boolean {
  const cp = bet.customPrices;
  return Array.isArray(cp) && cp.some((p) => p?.type === 'stake_shield');
}

const LIABILITY_SENSITIVITY = 0.001;
const TYPE_FACTOR_SINGLE = 0.93;
const TYPE_FACTOR_MULTI = 0.61;

/**
 * Nur Fallback, wenn Stake **keinen** brauchbaren `cashoutMultiplier` / `cashoutValue` liefert.
 * Kein Ersatz für den echten Live-Cashout vom Schein – bitte `getCashoutValue` bevorzugen.
 */
export function estimateCashoutValue(bet: SportBet): number {
  if (!bet.cashoutMultiplier || !bet.amount || bet.cashoutMultiplier <= 0) return 0;

  const stake = bet.amount;
  const potentialPayout = bet.payout || stake * getEffectiveOdds(bet);
  const fairValue = stake * bet.cashoutMultiplier;
  const liabilityFactor = 1 / (1 + potentialPayout * LIABILITY_SENSITIVITY);
  const isSingle = bet.outcomes?.length === 1;
  const typeFactor = isSingle ? TYPE_FACTOR_SINGLE : TYPE_FACTOR_MULTI;

  return fairValue * typeFactor * liabilityFactor;
}

/**
 * Returns the effective odds to display (Shield-adjusted when available).
 * Bei Stake Shield: adjustments.payoutMultiplier = die Odds, die wir abgeschlossen haben.
 * Fallback: shieldOddsCache (falls API adjustments nicht liefert).
 */
export function getEffectiveOdds(bet: SportBet): number {
  const adj = bet.adjustments?.payoutMultiplier;
  if (adj != null && adj > 0) return adj;

  const cached = getShieldOdds(bet.id);
  if (cached != null && cached > 0) return cached;

  const pm = Number(bet.payoutMultiplier) || 0;
  const pot = Number(bet.potentialMultiplier) || 0;

  // Stake Shield: reduced locked odds are often on `payoutMultiplier`; `potentialMultiplier` can still reflect the raw combined price.
  if (isStakeShieldBet(bet)) {
    if (pm > 0 && pot > 0) return Math.min(pm, pot);
    if (pm > 0) return pm;
    if (pot > 0) return pot;
    return 0;
  }

  if (pm > 0) return pm;
  return pot;
}

/**
 * **Aktueller Cashout-Betrag** (wie auf dem Stake-Schein), soweit die API ihn liefert.
 *
 * Reihenfolge: (1) `cashoutValue` von PreviewCashout, (2) `Einsatz × cashoutMultiplier` aus der Wetten-Liste
 * (Stake aktualisiert das laufend), (3) nur in seltenen Fällen der interne Fallback `estimateCashoutValue`.
 */
export function getCashoutValue(bet: SportBet): number {
  if (isCashoutDisabledByCustomPrices(bet)) return 0;
  if (bet.cashoutValue != null && bet.cashoutValue > 0) return bet.cashoutValue;
  if (bet.amount && bet.cashoutMultiplier != null && bet.cashoutMultiplier > 0) {
    return bet.amount * bet.cashoutMultiplier;
  }
  return estimateCashoutValue(bet);
}

/**
 * PreviewCashout liefert oft `payout: 0` (noch nicht „locked“), aber `cashoutMultiplier` > 0.
 * Der Listen-`bet` hat manchmal kein `amount` – dann Einsatz aus der Preview (`data.amount`) nutzen.
 */
export function computeCashoutFromPreview(
  bet: SportBet,
  data: { payout?: number; cashoutMultiplier?: number; amount?: number }
): number {
  const payout = Number(data.payout);
  if (Number.isFinite(payout) && payout > 0) return payout;

  const mult = Number(data.cashoutMultiplier);
  if (!Number.isFinite(mult) || mult <= 0) return 0;

  const stakeBet = bet.amount != null && Number(bet.amount) > 0 ? Number(bet.amount) : 0;
  const stakePreview = data.amount != null && Number(data.amount) > 0 ? Number(data.amount) : 0;
  const stake = stakeBet > 0 ? stakeBet : stakePreview;

  if (stake > 0) return stake * mult;

  return getCashoutValue({ ...bet, cashoutMultiplier: mult, amount: stakeBet || stakePreview || bet.amount });
}

/** Für Cashout-Mutation: API-Multiplikator, sonst Verhältnis Cashout-Wert / Einsatz (wenn Preview nur payout liefert). */
export function resolveCashoutMultiplierForBet(bet: SportBet): number {
  if (isCashoutDisabledByCustomPrices(bet) || bet.cashoutDisabled) return 0;
  const m = bet.cashoutMultiplier ?? 0;
  if (m > 0) return m;
  const v = getCashoutValue(bet);
  if (bet.amount && bet.amount > 0 && v > 0) return v / bet.amount;
  return 0;
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

/**
 * Anzahl Legs, die bereits erledigt sind (gewonnen/verloren). Für Sortierung: mehr erledigt = besser (11/12 vor 11/11).
 */
export function getClosedLegsCount(bet: SportBet): number {
  const total = bet.outcomes?.length ?? 0;
  return total - getOpenLegsCount(bet);
}
