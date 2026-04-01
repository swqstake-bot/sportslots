import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CasinoLoggerTab from './tabs/CasinoLoggerTab';
import SportsLoggerTab from './tabs/SportsLoggerTab';
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

export default function LoggerView() {
  const [tab, setTab] = useState<LoggerTab>('casino');
  const [casinoBets, setCasinoBets] = useState<LoggerBetEntry[]>([]);
  const [sportsBets, setSportsBets] = useState<LoggerBetEntry[]>([]);
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [manualReloading, setManualReloading] = useState(false);
  const currencyRefreshInFlightRef = useRef(false);

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

  const loadLoggerLogs = useCallback(async (options?: { foreground?: boolean }) => {
    const foreground = options?.foreground === true;
    if (foreground) setManualReloading(true);
    try {
      const list = await window.electronAPI.loadLoggerBetLogs({ limit: 10000 });
      const normalized = (Array.isArray(list) ? list : []).map((b: any) => ({
        ...b,
        category: b?.category === 'sports' ? 'sports' : 'casino',
      }));
      setCasinoBets(normalized.filter((b: LoggerBetEntry) => b.category !== 'sports'));
      setSportsBets(normalized.filter((b: LoggerBetEntry) => b.category === 'sports'));
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
    setStatusMessage(`${r.bets?.length ?? 0} Wetten importiert.`);
  }, [loadLoggerLogs]);

  const handleExport = useCallback(async (bets: LoggerBetEntry[]) => {
    setStatusMessage('');
    if (!bets.length) {
      setStatusMessage('Keine Wetten zum Exportieren.');
      return;
    }
    const r = await window.electronAPI.exportLoggerBetLogs(bets);
    if (r?.cancelled) return;
    if (r?.ok) setStatusMessage(`Exportiert: ${bets.length} Wetten -> ${r.path || 'Gespeichert'}`);
    else setStatusMessage(r?.error || 'Export fehlgeschlagen');
  }, []);

  const handleDeleteAll = useCallback(async () => {
    const confirmed = window.confirm('Wirklich alles löschen? Das entfernt Casino-Logs und leert Sports-Stats.');
    if (!confirmed) return;
    const r = await window.electronAPI.deleteAllLoggerBetLogs();
    if (!r?.ok) {
      setStatusMessage(r?.error || 'Löschen fehlgeschlagen');
      return;
    }
    setCasinoBets([]);
    setSportsBets([]);
    setStatusMessage(`Alles gelöscht: ${r.deleted ?? 0} Log-Datei(en) entfernt.`);
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
    const t = setInterval(() => {
      loadLoggerLogs();
    }, 3000);
    return () => {
      clearInterval(t);
    };
  }, [loadLoggerLogs]);

  const sortedCasinoBets = useMemo(
    () => [...casinoBets].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    [casinoBets]
  );

  const sortedSportsBets = useMemo(
    () => [...sportsBets].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    [sportsBets]
  );

  return (
    <div className="logger-root p-6 lg:p-8 max-w-[1800px] mx-auto">
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
          subscriptionStatus="connected"
          subscriptionError=""
        />
      )}
    </div>
  );
}
