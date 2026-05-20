import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';

export type UsdRatesMap = Record<string, number>;

let cachedRates: UsdRatesMap | null = null;
let fetchPromise: Promise<UsdRatesMap> | null = null;
const listeners = new Set<() => void>();
/** Stable empty snapshot — `?? {}` in getSnapshot would create a new object every read → React #185 loop. */
const EMPTY_RATES: UsdRatesMap = Object.freeze({});

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function parseCurrencyConfiguration(
  res: { data?: { info?: { currencies?: Array<{ name?: string; usd?: number }> } } } | null | undefined
): UsdRatesMap {
  const list = res?.data?.info?.currencies ?? [];
  const map: UsdRatesMap = {};
  for (const c of list) {
    const name = String(c?.name ?? '').toLowerCase();
    const usd = Number(c?.usd ?? 0);
    if (name && Number.isFinite(usd) && usd > 0) map[name] = usd;
  }
  return map;
}

export async function loadSportsFxRates(force = false): Promise<UsdRatesMap> {
  if (!force && cachedRates) return cachedRates;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const res = await StakeApi.query<{ info?: { currencies?: Array<{ name?: string; usd?: number }> } }>(
        Queries.CurrencyConfiguration,
        {}
      );
      cachedRates = parseCurrencyConfiguration(res);
    } catch {
      cachedRates = {};
    }
    notifyListeners();
    return cachedRates;
  })().finally(() => {
    fetchPromise = null;
  });

  return fetchPromise;
}

export function invalidateSportsFxRates() {
  cachedRates = null;
}

export function useSportsFxRates() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => cachedRates ?? EMPTY_RATES, []);
  const getServerSnapshot = useCallback(() => EMPTY_RATES, []);

  useEffect(() => {
    void loadSportsFxRates();
  }, []);

  const usdRates = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const refreshRates = useCallback(async () => {
    cachedRates = null;
    return loadSportsFxRates(true);
  }, []);

  return {
    usdRates,
    refreshRates,
    isLoaded: cachedRates !== null,
  };
}
