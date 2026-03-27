import { useState, useCallback, useEffect, useRef } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import type { SportBet } from '../store/userStore';

const BATCH_LIMIT = 50;
const MAX_BETS_LIMIT = 500;
const FINISHED_STATUSES = [
  'settled',
  'settledManual',
  'settledPending',
  'cancelPending',
  'cancelled',
  'cashout',
  'cashoutPending',
];

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
  userName: string | undefined;
  refreshIntervalMs?: number;
  onActiveFetched?: (bets: SportBet[]) => void;
}

export function useBetHistory({
  userName,
  refreshIntervalMs = 120_000,
  onActiveFetched,
}: UseBetHistoryOptions) {
  const [activeBets, setActiveBets] = useState<SportBet[]>([]);
  const [finishedBets, setFinishedBets] = useState<SportBet[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [isLoadingFinished, setIsLoadingFinished] = useState(false);
  const [usdRates, setUsdRates] = useState<Record<string, number>>({});
  const onActiveFetchedRef = useRef(onActiveFetched);
  onActiveFetchedRef.current = onActiveFetched;
  const loadingActiveRef = useRef(false);
  const loadingFinishedRef = useRef(false);

  const fetchUsdRates = useCallback(async () => {
    try {
      const res = await StakeApi.query<{ info?: { currencies?: Array<{ name?: string; usd?: number }> } }>(Queries.CurrencyConfiguration, {});
      const list = res?.data?.info?.currencies ?? [];
      const map: Record<string, number> = {};
      for (const c of list) {
        const name = String(c?.name ?? '').toLowerCase();
        const usd = Number(c?.usd ?? 0);
        if (name) map[name] = usd;
      }
      setUsdRates(map);
    } catch {
      setUsdRates({});
    }
  }, []);

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
  }, [userName]);

  const fetchFinishedBets = useCallback(async () => {
    if (!userName) return;
    if (loadingFinishedRef.current) return;
    loadingFinishedRef.current = true;
    setIsLoadingFinished(true);
    try {
      let offset = 0;
      const all: SportBet[] = [];
      while (true) {
        if (all.length >= MAX_BETS_LIMIT) break;
        const res = await StakeApi.query<{ user?: { sportBetList?: Array<{ bet?: SportBet }> } }>(Queries.FetchFinishedSportBets, {
          limit: BATCH_LIMIT,
          offset,
          name: userName,
          status: FINISHED_STATUSES,
        });
        if (res.errors) break;
        const raw = res.data?.user?.sportBetList ?? [];
        const batch = raw.map((item) => item?.bet).filter((b): b is SportBet => !!b && !!b.id);
        if (batch.length > 0) all.push(...batch);
        if (batch.length < BATCH_LIMIT) break;
        offset += BATCH_LIMIT;
        await new Promise((r) => setTimeout(r, 1000));
      }
      const unique = Array.from(new Map(all.map((b) => [b.id, b])).values());
      setFinishedBets(unique);
    } catch (err) {
      console.error('Error fetching finished bets:', err);
    } finally {
      setIsLoadingFinished(false);
      loadingFinishedRef.current = false;
    }
  }, [userName]);

  useEffect(() => {
    if (!userName) return;
    fetchActiveBets();
    fetchFinishedBets();
    fetchUsdRates();
  }, [userName, fetchActiveBets, fetchFinishedBets, fetchUsdRates]);

  useEffect(() => {
    if (!userName || refreshIntervalMs <= 0) return;
    const t = setInterval(() => {
      fetchActiveBets();
      fetchFinishedBets();
    }, refreshIntervalMs);
    return () => clearInterval(t);
  }, [userName, refreshIntervalMs, fetchActiveBets, fetchFinishedBets]);

  return {
    activeBets,
    setActiveBets,
    finishedBets,
    setFinishedBets,
    isLoadingActive,
    isLoadingFinished,
    usdRates,
    fetchActiveBets,
    fetchFinishedBets,
    fetchUsdRates,
  };
}
