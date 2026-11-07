import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { useUserStore, type SportBet } from '../store/userStore';
import { setShieldOdds } from '../store/shieldOddsCache';
import { refreshFinishedSportBets, useFinishedSportBets } from '../store/finishedSportBets';
import { useSportsFxRates, loadSportsFxRates } from './useSportsFxRates';
import {
  ACTIVE_SPORT_BETS_MAX_TOTAL,
  ACTIVE_SPORT_BETS_PAGE_SIZE,
} from '../constants/sportsBetLimits';

const BATCH_LIMIT = ACTIVE_SPORT_BETS_PAGE_SIZE;
const MAX_BETS_LIMIT = ACTIVE_SPORT_BETS_MAX_TOTAL;

/** Liste liefert oft keinen Cashout – Preview-Werte nicht bei jedem Poll verlieren. */
function mergePreviewCashoutFields(server: SportBet, prev: SportBet | undefined): SportBet {
  if (!prev) return server;
  const merged = { ...server };
  const pv = Number(prev.cashoutValue);
  const sv = Number(merged.cashoutValue);
  if (Number.isFinite(pv) && pv > 0 && (!Number.isFinite(sv) || sv <= 0)) {
    merged.cashoutValue = prev.cashoutValue;
  }
  const pm = Number(prev.cashoutMultiplier);
  const sm = Number(merged.cashoutMultiplier);
  if (Number.isFinite(pm) && pm > 0 && (!Number.isFinite(sm) || sm <= 0)) {
    merged.cashoutMultiplier = prev.cashoutMultiplier;
  }
  return merged;
}

export interface UseBetHistoryOptions {
  userId: string | undefined;
  userName: string | undefined;
  refreshIntervalMs?: number;
  onActiveFetched?: (bets: SportBet[]) => void;
}

export function useBetHistory({
  userId,
  userName,
  refreshIntervalMs = 120_000,
  onActiveFetched,
}: UseBetHistoryOptions) {
  const setStoreActiveBets = useUserStore((s) => s.setActiveBets);
  const [activeBets, setActiveBetsState] = useState<SportBet[]>(() => useUserStore.getState().activeBets);
  const activeBetsRef = useRef(activeBets);
  const { bets: finishedBets, savedWonCount, loading: isLoadingFinished, error: finishedError } = useFinishedSportBets(userId, userName);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const { usdRates, refreshRates: fetchUsdRates } = useSportsFxRates();
  const onActiveFetchedRef = useRef(onActiveFetched);
  onActiveFetchedRef.current = onActiveFetched;
  const loadingActiveRef = useRef(false);

  const setActiveBets = useCallback<Dispatch<SetStateAction<SportBet[]>>>(
    (next) => {
      const resolved = typeof next === 'function' ? next(activeBetsRef.current) : next;
      activeBetsRef.current = resolved;
      setActiveBetsState(resolved);
      setStoreActiveBets(resolved);
    },
    [setStoreActiveBets]
  );

  const fetchActiveBets = useCallback(async () => {
    if (!userName) return;
    if (loadingActiveRef.current) return;
    loadingActiveRef.current = true;
    setIsLoadingActive(true);
    try {
      let offset = 0;
      const all: SportBet[] = [];
      while (true) {
        if (all.length >= MAX_BETS_LIMIT) break;
        const res = await StakeApi.query<{ user?: { activeSportBets?: SportBet[] } }>(Queries.FetchActiveSportBets, {
          limit: BATCH_LIMIT,
          offset,
          name: userName,
        });
        if (res.errors) break;
        const batch = res.data?.user?.activeSportBets ?? [];
        if (batch.length > 0) all.push(...batch);
        if (batch.length < BATCH_LIMIT) break;
        offset += BATCH_LIMIT;
        await new Promise((r) => setTimeout(r, 300));
      }
      const unique = Array.from(new Map(all.map((b) => [b.id, b])).values());
      setActiveBets((prev) => {
        const prevById = new Map(prev.map((b) => [b.id, b]));
        return unique.map((b) => mergePreviewCashoutFields(b, prevById.get(b.id)));
      });
      if (unique.length > 0) onActiveFetchedRef.current?.(unique);
    } catch (err) {
      console.error('Error fetching active bets:', err);
    } finally {
      setIsLoadingActive(false);
      loadingActiveRef.current = false;
    }
  }, [userName, setActiveBets]);

  useEffect(() => {
    if (!userName) return;
    fetchActiveBets();
    void loadSportsFxRates();
  }, [userName, fetchActiveBets]);

  useEffect(() => {
    if (!userName || refreshIntervalMs <= 0) return;
    const t = setInterval(fetchActiveBets, refreshIntervalMs);
    return () => clearInterval(t);
  }, [userName, refreshIntervalMs, fetchActiveBets]);

  // Persist API adjustments into shield cache so effective odds stay correct after refresh (same as AutoBet path).
  useEffect(() => {
    const all = [...activeBets, ...finishedBets];
    for (const b of all) {
      const m = b.adjustments?.payoutMultiplier;
      if (m != null && m > 0) setShieldOdds(b.id, m);
    }
  }, [activeBets, finishedBets]);

  return {
    activeBets,
    setActiveBets,
    finishedBets,
    savedWonCount,
    finishedError,
    isLoadingActive,
    isLoadingFinished,
    usdRates,
    fetchActiveBets,
    fetchFinishedBets: refreshFinishedSportBets,
    fetchUsdRates,
  };
}
