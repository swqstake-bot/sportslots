import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useUserStore, type SportBet } from '../store/userStore';
import { getCashoutValue, getClosedLegsCount } from '../services/cashoutService';
import { convertToUsd } from '../utils/monetaryContract';
import { processSingleBet, BATCH_DELAY_MS, PARALLEL_BATCH_SIZE } from './useCashoutOffers';

const DEFAULT_TOP_N = 15;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

export function rankActiveBetsByCashoutUsd(bets: SportBet[], usdRates: Record<string, number>): SportBet[] {
  return [...bets].sort((a, b) => {
    const cashA = convertToUsd(getCashoutValue(a), a.currency, 'major', usdRates).usdAmount ?? 0;
    const cashB = convertToUsd(getCashoutValue(b), b.currency, 'major', usdRates).usdAmount ?? 0;
    if (cashB !== cashA) return cashB - cashA;
    return getClosedLegsCount(b) - getClosedLegsCount(a);
  });
}

export interface UseTopActiveBetsCashoutOptions {
  usdRates: Record<string, number>;
  enabled?: boolean;
  topN?: number;
  refreshIntervalMs?: number;
}

export function useTopActiveBetsCashout({
  usdRates,
  enabled = true,
  topN = DEFAULT_TOP_N,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: UseTopActiveBetsCashoutOptions) {
  const activeBets = useUserStore((s) => s.activeBets);
  const setStoreActiveBets = useUserStore((s) => s.setActiveBets);
  const isMountedRef = useRef(true);
  const runningRef = useRef(false);
  const betIdsKey = useMemo(
    () => activeBets.map((b) => b.id).sort().join('|'),
    [activeBets]
  );
  const ratesReady = Object.keys(usdRates).length > 0;

  const mergeBetUpdate = useCallback(
    (updated: SportBet) => {
      const prev = useUserStore.getState().activeBets;
      setStoreActiveBets(prev.map((b) => (b.id === updated.id ? updated : b)));
    },
    [setStoreActiveBets]
  );

  const refreshTopCashouts = useCallback(async () => {
    if (!enabled || runningRef.current) return;
    const source = useUserStore.getState().activeBets;
    if (!source.length) return;

    const candidates = rankActiveBetsByCashoutUsd(source, usdRates).slice(0, topN);
    const withIid = candidates.filter((b) => b?.bet?.iid);
    if (!withIid.length) return;

    runningRef.current = true;
    try {
      for (let i = 0; i < withIid.length; i += PARALLEL_BATCH_SIZE) {
        if (!isMountedRef.current) return;
        const batch = withIid.slice(i, i + PARALLEL_BATCH_SIZE);
        const results = await Promise.all(batch.map(processSingleBet));
        for (const updated of results) {
          if (!updated || !isMountedRef.current) continue;
          mergeBetUpdate(updated);
        }
        if (i + PARALLEL_BATCH_SIZE < withIid.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    } finally {
      runningRef.current = false;
    }
  }, [enabled, mergeBetUpdate, topN, usdRates]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !betIdsKey || !ratesReady) return;
    void refreshTopCashouts();
  }, [betIdsKey, enabled, ratesReady, refreshTopCashouts]);

  useEffect(() => {
    if (!enabled || refreshIntervalMs <= 0 || !betIdsKey || !ratesReady) return;
    const timer = setInterval(() => {
      void refreshTopCashouts();
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [betIdsKey, enabled, ratesReady, refreshIntervalMs, refreshTopCashouts]);

  return { refreshTopCashouts };
}
