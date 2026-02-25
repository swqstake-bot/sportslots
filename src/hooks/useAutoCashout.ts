import { useCallback, useEffect, useRef } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import type { SportBet } from '../store/userStore';
import { getCashoutValue } from '../services/cashoutService';

export interface UseAutoCashoutOptions {
  enabled: boolean;
  targetUsd: number;
  activeBets: SportBet[];
  setActiveBets: React.Dispatch<React.SetStateAction<SportBet[]>>;
  usdRates: Record<string, number>;
  onAutoCashoutSuccess?: (betId: string) => void;
}

/**
 * Encapsulates auto-cashout logic: interval checks, value calculation, and cashout mutation.
 * Use in ActiveBetsModal; keeps the modal focused on UI.
 */
export function useAutoCashout({
  enabled,
  targetUsd,
  activeBets,
  setActiveBets,
  usdRates,
  onAutoCashoutSuccess,
}: UseAutoCashoutOptions) {
  const stateRef = useRef({ enabled, targetUsd });
  useEffect(() => {
    stateRef.current = { enabled, targetUsd };
  }, [enabled, targetUsd]);

  const checkSingleBetAutoCashout = useCallback(
    async (bet: SportBet) => {
      const { enabled: en, targetUsd: target } = stateRef.current;
      if (!en || !bet || (bet.status !== 'active' && bet.status !== 'confirmed')) return;

      const cashoutValue = getCashoutValue(bet);
      if (!cashoutValue || cashoutValue <= 0) return;

      const rate = usdRates[(bet.currency || 'usd').toLowerCase()] ?? 1;
      const valueUsd = cashoutValue * rate;
      if (valueUsd < target) return;

      const multiplierToUse = bet.cashoutMultiplier ?? 0;
      if (multiplierToUse <= 0) return;

      try {
        const result = await StakeApi.mutate(Queries.CashoutSportBet, {
          betId: bet.id,
          multiplier: multiplierToUse,
        });
        if (result?.data?.cashoutSportBet) {
          setActiveBets((prev) => prev.filter((x) => x.id !== bet.id));
          onAutoCashoutSuccess?.(bet.id);
        }
      } catch (err) {
        console.error(`Auto cashout failed for ${bet.id}`, err);
      }
    },
    [usdRates, setActiveBets, onAutoCashoutSuccess]
  );

  const evaluateAutoCashout = useCallback(async () => {
    const { enabled: en, targetUsd: target } = stateRef.current;
    if (!en || activeBets.length === 0) return;

    for (const b of activeBets) {
      if (b.status !== 'active' && b.status !== 'confirmed') continue;

      const cashoutValue = getCashoutValue(b);
      if (!cashoutValue || cashoutValue <= 0) continue;

      const rate = usdRates[(b.currency || 'usd').toLowerCase()] ?? 1;
      const valueUsd = cashoutValue * rate;
      if (valueUsd < target) continue;

      const multiplierToUse = b.cashoutMultiplier ?? 0;
      if (multiplierToUse <= 0) continue;

      try {
        const result = await StakeApi.mutate(Queries.CashoutSportBet, {
          betId: b.id,
          multiplier: multiplierToUse,
        });
        if (result?.data?.cashoutSportBet) {
          setActiveBets((prev) => prev.filter((x) => x.id !== b.id));
          onAutoCashoutSuccess?.(b.id);
        }
      } catch (err) {
        console.error(`Auto cashout failed for ${b.id}`, err);
      }
    }
  }, [activeBets, usdRates, setActiveBets, onAutoCashoutSuccess]);

  return { checkSingleBetAutoCashout, evaluateAutoCashout };
}
