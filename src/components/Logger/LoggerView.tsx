import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CasinoLoggerTab from './tabs/CasinoLoggerTab';
import SportsLoggerTab from './tabs/SportsLoggerTab';
import { loggerBetsIdentity } from './loggerListIdentity';
import { inferLoggerCategory } from './loggerUtils';
import type { LoggerBetEntry } from './loggerUtils';

import './logger.css';

type LoggerTab = 'casino' | 'sports';

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

function splitLoggerBets(normalized: LoggerBetEntry[]) {
  const casinoNorm = normalized.filter((b) => b.category !== 'sports');
  const sportsNorm = normalized.filter((b) => b.category === 'sports');
  return { casinoNorm, sportsNorm };
}

export default function LoggerView() {
  const [tab, setTab] = useState<LoggerTab>('casino');
  const [casinoBets, setCasinoBets] = useState<LoggerBetEntry[]>([]);
  const [sportsBets, setSportsBets] = useState<LoggerBetEntry[]>([]);
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [isImporting, setIsImporting] = useState(false);
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

  const applyImportedBets = useCallback((list: unknown[]) => {
    const normalized = (Array.isArray(list) ? list : []).map((b: any) => ({
      ...b,
      category: inferLoggerCategory(b),
    })) as LoggerBetEntry[];
    const { casinoNorm, sportsNorm } = splitLoggerBets(normalized);
    lastCasinoIdentityRef.current = loggerBetsIdentity(casinoNorm);
    lastSportsIdentityRef.current = loggerBetsIdentity(sportsNorm);
    setCasinoBets(casinoNorm);
    setSportsBets(sportsNorm);
  }, []);

  const handleImport = useCallback(async () => {
    setStatusMessage('');
    setIsImporting(true);
    try {
      const r = await window.electronAPI.importLoggerBetLogs();
      if (r?.cancelled) return;
      if (!r?.ok) {
        setStatusMessage(r?.error || 'Import failed.');
        return;
      }
      applyImportedBets(r.bets || []);
      setStatusMessage(`${r.bets?.length ?? 0} bets loaded (in-memory only).`);
    } catch (error) {
      setStatusMessage(`Import failed: ${error instanceof Error ? error.message : 'Unable to read the session file.'}`);
    } finally {
      setIsImporting(false);
    }
  }, [applyImportedBets]);

  const handleExport = useCallback(async (bets: LoggerBetEntry[]) => {
    setStatusMessage('');
    if (!bets.length) {
      setStatusMessage('No bets available to export.');
      return;
    }
    try {
      const r = await window.electronAPI.exportLoggerBetLogs(bets);
      if (r?.cancelled) return;
      if (r?.ok) setStatusMessage(`Exported: ${bets.length} bets -> ${r.path || 'Saved'}`);
      else setStatusMessage(r?.error || 'Export failed');
    } catch (error) {
      setStatusMessage(`Export failed: ${error instanceof Error ? error.message : 'Unable to save the session file.'}`);
    }
  }, []);

  const handleDeleteAll = useCallback(async () => {
    const confirmed = window.confirm('Clear imported bets from this view? (Does not affect Challenge Hub live feed.)');
    if (!confirmed) return;
    setCasinoBets([]);
    setSportsBets([]);
    lastCasinoIdentityRef.current = loggerBetsIdentity([]);
    lastSportsIdentityRef.current = loggerBetsIdentity([]);
    try {
      await window.electronAPI.deleteAllLoggerBetLogs();
    } catch {
      // ignore legacy disk cleanup errors
    }
    setStatusMessage('Cleared imported bets.');
  }, []);

  useEffect(() => {
    refreshCurrencyRates();
  }, [refreshCurrencyRates]);

  useEffect(() => {
    const t = setInterval(() => refreshCurrencyRates(), 60 * 1000);
    return () => clearInterval(t);
  }, [refreshCurrencyRates]);

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
      <div className="logger-analysis-intro"><span className="workspace-eyebrow">Review exported sessions</span><h2>Import analysis</h2><p>Inspect Casino and Sports bets from your saved session files.</p></div>
      <div className="logger-topbar mb-5">
        <div className="logger-tabs-wrap">
          <button
            type="button"
            onClick={() => setTab('casino')}
            className={`logger-tab-btn ${tab === 'casino' ? 'is-active' : ''}`}
            aria-pressed={tab === 'casino'}
          >
            Casino Bets
          </button>
          <button
            type="button"
            onClick={() => setTab('sports')}
            className={`logger-tab-btn ${tab === 'sports' ? 'is-active' : ''}`}
            aria-pressed={tab === 'sports'}
          >
            Sports Bets
          </button>
        </div>
        <div className="workspace-button-row">
        <button type="button" className="logger-action-btn" onClick={() => void handleImport()} disabled={isImporting}>{isImporting ? 'Importing…' : 'Import (JSONL)'}</button>
        <button type="button" className="logger-action-btn" onClick={() => void handleExport([...casinoBets, ...sportsBets])} disabled={casinoBets.length + sportsBets.length === 0}>Export all (JSONL)</button>
        <button type="button" className="logger-danger-btn" onClick={handleDeleteAll}>
          Clear view
        </button>
        </div>
      </div>

      <p className="logger-muted logger-archive-hint">
        Import-only: no background recording. Export a session from Challenge Hub (Export session), then use{' '}
        <span className="mono">Import (JSONL)</span> here to review, filter, and export CSV. Data stays in memory until
        you close the app or clear the view.
      </p>
      {statusMessage && <p className="logger-status" role="status">{statusMessage}</p>}

      {tab === 'casino' ? (
        <CasinoLoggerTab
          bets={sortedCasinoBets}
          currencyRates={currencyRates}
          statusMessage=""
          onExport={handleExport}
        />
      ) : (
        <SportsLoggerTab
          bets={sortedSportsBets}
          currencyRates={currencyRates}
          subscriptionStatus="idle"
          subscriptionError=""
        />
      )}
    </div>
  );
}
