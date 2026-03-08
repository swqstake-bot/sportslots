/**
 * Formatiert Beträge aus der Stake GraphQL-API für die Anzeige.
 * Die API liefert Major Units (z.B. 0.20 USD); formatAmount erwartet Minor Units.
 */

import { formatAmount } from '../components/Casino/utils/formatAmount';

const FIAT_OR_STABLE = [
  'usd', 'eur', 'jpy', 'usdc', 'usdt', 'brl', 'cad', 'cny',
  'idr', 'inr', 'krw', 'mxn', 'php', 'pln', 'rub', 'try', 'vnd',
];
const ZERO_DECIMAL = ['idr', 'jpy', 'krw', 'vnd'];

/**
 * Konvertiert Stake-API-Beträge (Major Units) in das von formatAmount
 * erwartete Format (Minor Units für Fiat mit 2 Dezimalstellen).
 *
 * @param amount - Betrag von Stake (z.B. 0.20 für $0.20)
 * @param currency - Währungscode (z.B. 'usd', 'btc')
 * @returns Formatierter String mit Währung (z.B. "0,20 USD")
 */
export function formatStakeAmount(amount: number, currency: string): string {
  const curr = (currency || '').toLowerCase();
  const isFiatOrStable = FIAT_OR_STABLE.includes(curr);
  let val = amount;

  if (isFiatOrStable) {
    const isZeroDecimal = ZERO_DECIMAL.includes(curr);
    if (!isZeroDecimal) {
      val = amount * 100;
    }
  }

  return `${formatAmount(val, currency)} ${(currency || 'UNK').toUpperCase()}`;
}
