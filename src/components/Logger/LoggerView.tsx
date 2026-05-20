import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CasinoLoggerTab from './tabs/CasinoLoggerTab';
import SportsLoggerTab from './tabs/SportsLoggerTab';
import {
  LOGGER_BET_SAVED_EVENT,
  mergeLoggerBetIntoList,
  normalizeLoggerBetEntry,
} from './loggerBetRealtime';
import { loggerBetsIdentity } from './loggerListIdentity';
import { inferLoggerCategory } from './loggerUtils';
import type { LoggerBetEntry } from './loggerUtils';

const LOGGER_POLL_FALLBACK_MS = 30_000;
import './logger.css';

type LoggerTab = 'casino' | 'sports';
type LoggerSubscriptionStatus = 'idle' | 'connecting' | 'connected' | 'error';

function loadCachedCurrencyRates(): Record<string, number> {
  try {
    const raw = localStorage.getItem('slotbot_currency_rates_cache');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const map = parsed?.map;
    if (!map || typeof map !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      const key = String(k || '').toLowerCase();
      const num = Number(v);
      if (key && Number.isFinite(num) && num > 0) out[key] = num;
    }
    return out;
  } catch {
    return {};
  }
}

export default function LoggerView() {
  const [tab, setTab] = useState<LoggerTab>('casino');
  const [casinoBets, setCasinoBets] = useState<LoggerBetEntry[]>([]);
  const [sportsBets, setSportsBets] = useState<LoggerBetEntry[]>([]);
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<LoggerSubscriptionStatus>('idle');
  const [subscriptionError, setSubscriptionError] = useState('');
  const [manualReloading, setManualReloading] = useState(false);
  const currencyRefreshInFlightRef = useRef(false);
  const lastCasinoIdentityRef = useRef<string>('');
  const lastSportsIdentityRef = useRef<string>('');

  const refreshCurrencyRates = useCallback(async () => {
    if (currencyRefreshInFlightRef.current) return;
    currencyRefreshInFlightRef.current = true;
    try {
      const rates = await window.electronAPI.fetchLoggerCurrencyRates();
      const cachedRates = loadCachedCurrencyRates();
      const merged = {
        ...cachedRates,
        ...(rates && typeof rates === 'object' ? rates : {}),
      };
      if (Object.keys(merged).length > 0) setCurrencyRates(merged);
    } catch {
      const cachedRates = loadCachedCurrencyRates();
      if (Object.keys(cachedRates).length > 0) setCurrencyRates(cachedRates);
    } finally {
      currencyRefreshInFlightRef.current = false;
    }
  }, []);

  const applyIncrementalBet = useCallback((raw: unknown) => {
    const entry = normalizeLoggerBetEntry(raw);
    if (!entry) return;
    if (entry.category === 'sports') {
      setSportsBets((prev) => {
        const next = mergeLoggerBetIntoList(prev, entry);
        const nextId = loggerBetsIdentity(next);
        if (nextId === lastSportsIdentityRef.current) return prev;
        lastSportsIdentityRef.current = nextId;
        return next;
      });
      return;
    }
    setCasinoBets((prev) => {
      const next = mergeLoggerBetIntoList(prev, entry);
      const nextId = loggerBetsIdentity(next);
      if (nextId === lastCasinoIdentityRef.current) return prev;
      lastCasinoIdentityRef.current = nextId;
      return next;
    });
  }, []);

  const loadLoggerLogs = useCallback(async (options?: { foreground?: boolean }) => {
    const foreground = options?.foreground === true;
    if (foreground) setManualReloading(true);
    try {
      const list = await window.electronAPI.loadLoggerBetLogs({ limit: 5000 });
      const normalized = (Array.isArray(list) ? list : []).map((b: any) => ({
        ...b,
        category: inferLoggerCategory(b),
      }));
      const casinoNorm = normalized.filter((b: LoggerBetEntry) => b.category !== 'sports');
      const sportsNorm = normalized.filter((b: LoggerBetEntry) => b.category === 'sports');
      const nextCasinoId = loggerBetsIdentity(casinoNorm);
      const nextSportsId = loggerBetsIdentity(sportsNorm);
      if (nextCasinoId !== lastCasinoIdentityRef.current) {
        lastCasinoIdentityRef.current = nextCasinoId;
        setCasinoBets(casinoNorm);
      }
      if (nextSportsId !== lastSportsIdentityRef.current) {
        lastSportsIdentityRef.current = nextSportsId;
        setSportsBets(sportsNorm);
      }
    } catch {
      // ignore
    } finally {
      if (foreground) setManualReloading(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    setStatusMessage('');
    const r = await window.electronAPI.importLoggerBetLogs();
    if (r?.cancelled) return;
    if (!r?.ok) {
      setStatusMessage(r?.error || 'Import fehlgeschlagen');
      return;
    }
    await loadLoggerLogs();
    setStatusMessage(`${r.bets?.length ?? 0} bets imported.`);
  }, [loadLoggerLogs]);

  const handleExport = useCallback(async (bets: LoggerBetEntry[]) => {
    setStatusMessage('');
    if (!bets.length) {
      setStatusMessage('No bets available to export.');
      return;
    }
    const r = await window.electronAPI.exportLoggerBetLogs(bets);
    if (r?.cancelled) return;
    if (r?.ok) setStatusMessage(`Exported: ${bets.length} bets -> ${r.path || 'Saved'}`);
    else setStatusMessage(r?.error || 'Export failed');
  }, []);

  const handleDeleteAll = useCallback(async () => {
    const confirmed = window.confirm('Delete everything? This removes casino logs and clears sports stats.');
    if (!confirmed) return;
    const r = await window.electronAPI.deleteAllLoggerBetLogs();
    if (!r?.ok) {
      setStatusMessage(r?.error || 'Delete failed');
      return;
    }
    setCasinoBets([]);
    setSportsBets([]);
    lastCasinoIdentityRef.current = loggerBetsIdentity([]);
    lastSportsIdentityRef.current = loggerBetsIdentity([]);
    setStatusMessage(`Deleted all: ${r.deleted ?? 0} log file(s) removed.`);
  }, []);

  useEffect(() => {
    loadLoggerLogs();
    refreshCurrencyRates();
  }, [loadLoggerLogs, refreshCurrencyRates]);

  useEffect(() => {
    const t = setInterval(() => refreshCurrencyRates(), 60 * 1000);
    return () => clearInterval(t);
  }, [refreshCurrencyRates]);

  useEffect(() => {
    const onBetSaved = (event: Event) => {
      applyIncrementalBet((event as CustomEvent).detail);
    };
    window.addEventListener(LOGGER_BET_SAVED_EVENT, onBetSaved as EventListener);
    return () => window.removeEventListener(LOGGER_BET_SAVED_EVENT, onBetSaved as EventListener);
  }, [applyIncrementalBet]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadLoggerLogs();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadLoggerLogs]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      loadLoggerLogs();
    }, LOGGER_POLL_FALLBACK_MS);
    return () => clearInterval(t);
  }, [loadLoggerLogs]);

  useEffect(() => {
    const applyStatus = (detail: any) => {
      const next = detail?.status;
      if (next === 'idle' || next === 'connecting' || next === 'connected' || next === 'error') {
        setSubscriptionStatus(next);
        setSubscriptionError(String(detail?.error || ''));
      }
    };
    try {
      const raw = localStorage.getItem('logger_subscription_status');
      if (raw) applyStatus(JSON.parse(raw));
    } catch {
      // ignore corrupt cached status
    }
    const handler = (event: Event) => {
      applyStatus((event as CustomEvent).detail);
    };
    window.addEventListener('logger-subscription-status', handler as EventListener);
    return () => window.removeEventListener('logger-subscription-status', handler as EventListener);
  }, []);

  const sortedCasinoBets = useMemo(
    () => [...casinoBets].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    [casinoBets]
  );

  const sortedSportsBets = useMemo(
    () => [...sportsBets].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    [sportsBets]
  );

  return (
    <div className="logger-root p-6 lg:p-8 w-full">
      <div className="logger-topbar mb-5">
        <div className="logger-tabs-wrap">
          <button
            type="button"
            onClick={() => setTab('casino')}
            className={`logger-tab-btn ${tab === 'casino' ? 'is-active' : ''}`}
          >
            Casino Bets
          </button>
          <button
            type="button"
            onClick={() => setTab('sports')}
            className={`logger-tab-btn ${tab === 'sports' ? 'is-active' : ''}`}
          >
            Sports Bets
          </button>
        </div>
        <button type="button" className="logger-danger-btn" onClick={handleDeleteAll}>
          Delete all
        </button>
      </div>

      <p className="logger-muted logger-archive-hint">
        Local bet archive: rows from HouseBets realtime + JSONL files (up to 5000 on load). Filters affect analytics,
        CSV and JSONL export — similar in spirit to SSP{' '}
        <span className="mono">bet-archive-list</span> / <span className="mono">analyze</span>, without a separate
        download backend.
      </p>

      {tab === 'casino' ? (
        <CasinoLoggerTab
          bets={sortedCasinoBets}
          currencyRates={currencyRates}
          statusMessage={statusMessage}
          loading={manualReloading}
          onReload={() => loadLoggerLogs({ foreground: true })}
          onExport={handleExport}
          onImport={handleImport}
        />
      ) : (
        <SportsLoggerTab
          bets={sortedSportsBets}
          currencyRates={currencyRates}
          subscriptionStatus={subscriptionStatus}
          subscriptionError={subscriptionError}
        />
      )}
    </div>
  );
}
