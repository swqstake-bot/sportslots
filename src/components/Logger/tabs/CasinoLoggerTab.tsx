import { useMemo, useState } from 'react';
import { formatBetIdForCopy, formatDate, formatNum, getBetMultiplier, toUsd } from '../loggerUtils';
import type { LoggerBetEntry } from '../loggerUtils';
import { loadDiscoveredSlots } from '../../Casino/utils/discoveredSlots';

const MAX_VISIBLE_BETS = 500;

interface CasinoLoggerTabProps {
  bets: LoggerBetEntry[];
  currencyRates: Record<string, number>;
  statusMessage: string;
  loading: boolean;
  onReload: () => Promise<void> | void;
  onExport: (bets: LoggerBetEntry[]) => Promise<void> | void;
  onImport: () => Promise<void> | void;
}

export default function CasinoLoggerTab({
  bets,
  currencyRates,
  statusMessage,
  loading,
  onReload,
  onExport,
  onImport,
}: CasinoLoggerTabProps) {
  const [filterMinMulti, setFilterMinMulti] = useState('');
  const [filterMaxMulti, setFilterMaxMulti] = useState('');
  const [filterMinPayout, setFilterMinPayout] = useState('');
  const [filterMaxPayout, setFilterMaxPayout] = useState('');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterGame, setFilterGame] = useState('');
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterBetType, setFilterBetType] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'game' | 'amount' | 'multi' | 'payout'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [gameDetails, setGameDetails] = useState<{
    gameName: string;
    bestMulti: number;
    houseId: string;
    receivedAt: string;
    thumbnailUrl?: string;
  } | null>(null);
  const [copyState, setCopyState] = useState('');
  const [houseIdCopyState, setHouseIdCopyState] = useState('');

  const filteredBets = useMemo(() => {
    let list = [...bets];
    const minM = filterMinMulti !== '' ? Number(filterMinMulti) : null;
    const maxM = filterMaxMulti !== '' ? Number(filterMaxMulti) : null;
    const minP = filterMinPayout !== '' ? Number(filterMinPayout) : null;
    const maxP = filterMaxPayout !== '' ? Number(filterMaxPayout) : null;
    const minA = filterMinAmount !== '' ? Number(filterMinAmount) : null;
    const maxA = filterMaxAmount !== '' ? Number(filterMaxAmount) : null;
    if (minM != null && !Number.isNaN(minM)) list = list.filter((b) => (getBetMultiplier(b) ?? 0) >= minM);
    if (maxM != null && !Number.isNaN(maxM)) list = list.filter((b) => (getBetMultiplier(b) ?? 0) <= maxM);
    if (minP != null && !Number.isNaN(minP)) list = list.filter((b) => toUsd(b.payout, b.currency, currencyRates) >= minP);
    if (maxP != null && !Number.isNaN(maxP)) list = list.filter((b) => toUsd(b.payout, b.currency, currencyRates) <= maxP);
    if (minA != null && !Number.isNaN(minA)) list = list.filter((b) => toUsd(b.amount, b.currency, currencyRates) >= minA);
    if (maxA != null && !Number.isNaN(maxA)) list = list.filter((b) => toUsd(b.amount, b.currency, currencyRates) <= maxA);
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter((b) => new Date(b.receivedAt) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((b) => new Date(b.receivedAt) <= to);
    }
    if (filterGame.trim()) {
      const q = filterGame.trim().toLowerCase();
      list = list.filter((b) => (b.gameName || '').toLowerCase().includes(q));
    }
    if (filterCurrency) list = list.filter((b) => (b.currency || '').toLowerCase() === filterCurrency.toLowerCase());
    if (filterBetType) list = list.filter((b) => (b.betType || '') === filterBetType);
    return list;
  }, [bets, currencyRates, filterMinMulti, filterMaxMulti, filterMinPayout, filterMaxPayout, filterMinAmount, filterMaxAmount, filterDateFrom, filterDateTo, filterGame, filterCurrency, filterBetType]);

  const latestFilteredBets = useMemo(
    () => [...filteredBets].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()).slice(0, MAX_VISIBLE_BETS),
    [filteredBets]
  );

  const visibleBets = useMemo(() => {
    const direction = sortDesc ? -1 : 1;
    const list = [...latestFilteredBets];
    list.sort((a, b) => {
      if (sortBy === 'date') return direction * (new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
      if (sortBy === 'multi') return direction * ((getBetMultiplier(a) ?? 0) - (getBetMultiplier(b) ?? 0));
      if (sortBy === 'payout') return direction * (toUsd(a.payout, a.currency, currencyRates) - toUsd(b.payout, b.currency, currencyRates));
      if (sortBy === 'amount') return direction * (toUsd(a.amount, a.currency, currencyRates) - toUsd(b.amount, b.currency, currencyRates));
      if (sortBy === 'game') return direction * (a.gameName || '').localeCompare(b.gameName || '');
      return 0;
    });
    return list;
  }, [latestFilteredBets, currencyRates, sortBy, sortDesc]);

  const gameStats = useMemo(() => {
    const byGame: Record<string, { count: number; amount: number; payout: number }> = {};
    filteredBets.forEach((b) => {
      const name = b.gameName || '(Unknown)';
      if (!byGame[name]) byGame[name] = { count: 0, amount: 0, payout: 0 };
      byGame[name].count++;
      byGame[name].amount += toUsd(b.amount, b.currency, currencyRates);
      byGame[name].payout += toUsd(b.payout, b.currency, currencyRates);
    });
    return Object.entries(byGame)
      .map(([name, s]) => ({
        name,
        ...s,
        rtp: s.amount > 0 ? (s.payout / s.amount) * 100 : null,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredBets, currencyRates]);

  const slotThumbBySlug = useMemo(() => {
    const bySlug = new Map<string, string>();
    try {
      const raw = localStorage.getItem('slotbot_stake_slots_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
        for (const s of slots) {
          const slug = String(s?.slug || '').toLowerCase();
          const thumbnailUrl = String(s?.thumbnailUrl || '');
          if (slug && thumbnailUrl) bySlug.set(slug, thumbnailUrl);
        }
      }
    } catch {
      // ignore cache parse errors
    }
    try {
      const discovered = loadDiscoveredSlots();
      for (const s of discovered || []) {
        const slug = String(s?.slug || '').toLowerCase();
        const thumbnailUrl = String(s?.thumbnailUrl || '');
        if (slug && thumbnailUrl && !bySlug.has(slug)) bySlug.set(slug, thumbnailUrl);
      }
    } catch {
      // ignore localStorage access errors
    }
    return bySlug;
  }, []);

  const slotThumbByName = useMemo(() => {
    const byName = new Map<string, string>();
    try {
      const raw = localStorage.getItem('slotbot_stake_slots_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
        for (const s of slots) {
          const name = String(s?.name || '').trim().toLowerCase();
          const thumbnailUrl = String(s?.thumbnailUrl || '');
          if (name && thumbnailUrl) byName.set(name, thumbnailUrl);
        }
      }
    } catch {
      // ignore
    }
    return byName;
  }, []);

  const openGameDetails = (gameName: string) => {
    const gameBets = filteredBets.filter((b) => (b.gameName || '(Unknown)') === gameName);
    if (!gameBets.length) return;
    let bestBet: LoggerBetEntry | null = null;
    let bestMulti = -1;
    for (const bet of gameBets) {
      const multi = getBetMultiplier(bet);
      if (multi != null && multi > bestMulti) {
        bestMulti = multi;
        bestBet = bet;
      }
    }
    if (!bestBet || bestMulti < 0) return;
    setCopyState('');
    const bestSlug = String(bestBet.gameSlug || '').toLowerCase();
    const thumbnailUrl = (bestSlug && slotThumbBySlug.get(bestSlug)) || slotThumbByName.get(gameName.trim().toLowerCase()) || '';
    setGameDetails({
      gameName,
      bestMulti,
      houseId: String(bestBet.houseId ?? bestBet.iid ?? bestBet.betId ?? '-'),
      receivedAt: bestBet.receivedAt,
      thumbnailUrl: thumbnailUrl || undefined,
    });
  };

  const handleCopyId = async () => {
    if (!gameDetails) return;
    const copied = formatBetIdForCopy(gameDetails.houseId);
    try {
      await navigator.clipboard.writeText(copied);
      setCopyState(`Copied: ${copied}`);
    } catch {
      setCopyState('Copy failed');
    }
  };

  const handleCopyHouseId = async (value: string) => {
    const copied = formatBetIdForCopy(value);
    try {
      await navigator.clipboard.writeText(copied);
      setHouseIdCopyState(`Copied: ${copied}`);
      setTimeout(() => setHouseIdCopyState(''), 1800);
    } catch {
      setHouseIdCopyState('Copy failed');
      setTimeout(() => setHouseIdCopyState(''), 1800);
    }
  };

  const currencies = useMemo(() => [...new Set(bets.map((b) => b.currency).filter((v): v is string => typeof v === 'string' && v.length > 0))].sort(), [bets]);
  const betTypes = useMemo(() => [...new Set(bets.map((b) => b.betType).filter((v): v is string => typeof v === 'string' && v.length > 0))].sort(), [bets]);

  return (
    <div className="logger-stack">
      <div className="logger-panel">
        <h2 className="logger-title">Casino Bets ({filteredBets.length})</h2>
        <div className="logger-grid">
          <label>Date from:<input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} /></label>
          <label>Date to:<input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} /></label>
          <label>Game:<input type="text" value={filterGame} onChange={(e) => setFilterGame(e.target.value)} placeholder="Search..." /></label>
          <label>Min stake ($):<input type="number" value={filterMinAmount} onChange={(e) => setFilterMinAmount(e.target.value)} /></label>
          <label>Max stake ($):<input type="number" value={filterMaxAmount} onChange={(e) => setFilterMaxAmount(e.target.value)} /></label>
          <label>Min Multi:<input type="number" value={filterMinMulti} onChange={(e) => setFilterMinMulti(e.target.value)} /></label>
          <label>Max Multi:<input type="number" value={filterMaxMulti} onChange={(e) => setFilterMaxMulti(e.target.value)} /></label>
          <label>Min win ($):<input type="number" value={filterMinPayout} onChange={(e) => setFilterMinPayout(e.target.value)} /></label>
          <label>Max win ($):<input type="number" value={filterMaxPayout} onChange={(e) => setFilterMaxPayout(e.target.value)} /></label>
          <label>
            Currency:
            <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}>
              <option value="">All</option>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Bet type:
            <select value={filterBetType} onChange={(e) => setFilterBetType(e.target.value)}>
              <option value="">All</option>
              {betTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Sort by:
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="date">Date</option>
              <option value="game">Game</option>
              <option value="amount">Stake</option>
              <option value="multi">Multi</option>
              <option value="payout">Win</option>
            </select>
          </label>
          <label className="logger-check"><input type="checkbox" checked={sortDesc} onChange={(e) => setSortDesc(e.target.checked)} />Descending</label>
          <button type="button" className="logger-action-btn" onClick={() => onReload()} disabled={loading}>{loading ? 'Loading...' : 'Reload logs'}</button>
          <button type="button" className="logger-action-btn" onClick={() => onExport(filteredBets.length > 0 ? filteredBets : bets)} disabled={bets.length === 0}>Export (JSONL)</button>
          <button type="button" className="logger-action-btn" onClick={() => onImport()}>Import (JSONL)</button>
        </div>
        {statusMessage ? <p className="logger-status">{statusMessage}</p> : null}
      </div>

      <div className="logger-panel">
        <h3 className="logger-title">Games by RTP (from filtered bets)</h3>
        <div className="logger-table-wrap logger-table-compact">
          <table>
            <thead>
              <tr><th>Game</th><th className="num">Bets</th><th className="num">Total stake ($)</th><th className="num">Total win ($)</th><th className="num">RTP %</th></tr>
            </thead>
            <tbody>
              {gameStats.slice(0, 50).map((g) => (
                <tr key={g.name}>
                  <td>
                    <button type="button" className="logger-link-btn" onClick={() => openGameDetails(g.name)}>
                      {g.name}
                    </button>
                  </td>
                  <td className="num">{g.count}</td>
                  <td className="num">${formatNum(g.amount)}</td>
                  <td className="num">${formatNum(g.payout)}</td>
                  <td className={`num ${g.rtp != null && g.rtp >= 100 ? 'positive' : g.rtp != null ? 'negative' : ''}`}>{g.rtp != null ? `${formatNum(g.rtp, 1)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="logger-panel">
        <h3 className="logger-title">Bets ({filteredBets.length})</h3>
        <div className="logger-table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>House ID</th><th>Game</th><th>Type</th><th className="num">Stake ($)</th><th className="num">Win ($)</th><th className="num">Multi</th></tr>
            </thead>
            <tbody>
              {visibleBets.map((b, idx) => (
                <tr key={`${b.iid ?? b.houseId ?? b.betId}-${b.receivedAt}-${idx}`}>
                  <td>{formatDate(b.receivedAt)}</td>
                  <td className="mono">
                    <button
                      type="button"
                      className="logger-link-btn mono"
                      onClick={() => handleCopyHouseId(String(b.houseId ?? b.iid ?? b.betId ?? '-'))}
                    >
                      {String(b.houseId ?? b.iid ?? b.betId ?? '-')}
                    </button>
                  </td>
                  <td>{b.gameName || '-'}</td>
                  <td><span className="logger-badge">{b.betType || '-'}</span></td>
                  <td className="num">${formatNum(toUsd(b.amount, b.currency, currencyRates))}</td>
                  <td className="num positive">${formatNum(toUsd(b.payout, b.currency, currencyRates))}</td>
                  <td className="num">{getBetMultiplier(b) != null ? formatNum(getBetMultiplier(b), 2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {houseIdCopyState ? <p className="logger-status">{houseIdCopyState}</p> : null}
        {filteredBets.length > MAX_VISIBLE_BETS ? <p className="logger-muted">Only the newest 500 entries are shown.</p> : null}
      </div>

      {gameDetails ? (
        <div className="logger-modal-overlay" onClick={() => setGameDetails(null)}>
          <div className="logger-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="logger-modal-body">
              <div className="logger-modal-info">
                <h4 className="logger-title">Best Multi: {gameDetails.gameName}</h4>
                <p className="logger-muted">Multi: <b>{formatNum(gameDetails.bestMulti, 2)}x</b></p>
                <p className="logger-muted">House-ID: <span className="mono">{gameDetails.houseId}</span></p>
                <p className="logger-muted">Date: {formatDate(gameDetails.receivedAt)}</p>
              </div>
              {gameDetails.thumbnailUrl ? (
                <img className="logger-slot-thumb" src={gameDetails.thumbnailUrl} alt={gameDetails.gameName} loading="lazy" />
              ) : null}
            </div>
            <div className="logger-modal-actions">
              <button type="button" className="logger-action-btn" onClick={handleCopyId}>Copy Id</button>
              <button type="button" className="logger-danger-btn" onClick={() => setGameDetails(null)}>Close</button>
            </div>
            {copyState ? <p className="logger-status">{copyState}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
