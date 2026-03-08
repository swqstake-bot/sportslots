/**
 * Hook für das Laden und Aktualisieren von Cashout-Angeboten für Sportwetten.
 * Ruft die Stake-API auf und aktualisiert die Wetten mit Cashout-Multiplikatoren.
 */

import { useCallback, useEffect, useRef } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { getCashoutValue } from '../services/cashoutService';
import { isCashoutDisabledByCustomPrices } from '../services/cashoutService';
import type { SportBet } from '../store/userStore';

const CHUNK_DELAY_MS = 3000;

export interface UseCashoutOffersOptions {
  activeBets: SportBet[];
  setActiveBets: (updater: SportBet[] | ((prev: SportBet[]) => SportBet[])) => void;
  onSingleBetProcessed?: (bet: SportBet) => void;
  enabled?: boolean;
}

/**
 * Führt für eine einzelne Wette einen Cashout-Preview-Request aus
 * und gibt die aktualisierte Wette zurück.
 */
async function processSingleBet(
  bet: SportBet
): Promise<SportBet> {
  if (bet?.customBet || isCashoutDisabledByCustomPrices(bet)) {
    return { ...bet, cashoutDisabled: true, cashoutMultiplier: bet.cashoutMultiplier || 0 };
  }

  const iid = bet?.bet?.iid;
  if (!iid) return { ...bet };

  try {
    const preview = await StakeApi.query<{
      bet?: { bet?: { payout?: number; cashoutMultiplier?: number } };
    }>(Queries.PreviewCashout, { iid });
    const data = preview?.data?.bet?.bet;

    if (data) {
      const hasPayout = data.payout != null && data.payout > 0;
      const hasMultiplier = data.cashoutMultiplier != null && data.cashoutMultiplier > 0;

      if (hasPayout || hasMultiplier) {
        const mult = hasMultiplier ? data.cashoutMultiplier! : (bet.cashoutMultiplier ?? 0);
        const value = hasPayout
          ? data.payout!
          : getCashoutValue({ ...bet, cashoutMultiplier: mult });
        return {
          ...bet,
          cashoutMultiplier: mult,
          cashoutValue: value,
          cashoutDisabled: false,
        };
      }
    }
  } catch (err) {
    console.error(`Cashout check failed for ${bet.id}`, err);
  }

  return { ...bet, cashoutMultiplier: bet.cashoutMultiplier || 0 };
}

/**
 * Lädt Cashout-Angebote für alle aktiven Wetten.
 * Verarbeitet wettenweise mit Verzögerung, um API-Limits zu schonen.
 */
export function useCashoutOffers({
  activeBets,
  setActiveBets,
  onSingleBetProcessed,
  enabled = true,
}: UseCashoutOffersOptions) {
  const isMountedRef = useRef(true);

  const refreshCashoutOffers = useCallback(
    async (source: SportBet[] = activeBets) => {
      if (!enabled || source.length === 0) return;

      const next: SportBet[] = [];

      for (let i = 0; i < source.length; i++) {
        if (!isMountedRef.current) return;
        const chunk = source.slice(i, i + 1);
        const results = await Promise.all(chunk.map(processSingleBet));
        const updated = results[0];
        if (updated) {
          next.push(updated);
          onSingleBetProcessed?.(updated);
        }
        if (i < source.length - 1) {
          await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
        }
      }

      if (isMountedRef.current) {
        setActiveBets(next);
      }
    },
    [activeBets, setActiveBets, onSingleBetProcessed, enabled]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { refreshCashoutOffers };
}
