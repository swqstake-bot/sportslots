import { useMemo, useState } from 'react';
import { formatBetIdForCopy, formatDate, formatNum, getBetMultiplier, toUsd } from '../loggerUtils';
import type { LoggerBetEntry } from '../loggerUtils';

const MAX_VISIBLE_BETS = 500;

interface SportsLoggerTabProps {
  bets: LoggerBetEntry[];
  currencyRates: Record<string, number>;
  subscriptionStatus: 'idle' | 'connecting' | 'connected' | 'error';
  subscriptionError: string;
}

export default function SportsLoggerTab({ bets, currencyRates, subscriptionStatus, subscriptionError }: SportsLoggerTabProps) {
  const [copyState, setCopyState] = useState('');
  const latestBets = useMemo(
    () => [...bets].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()).slice(0, MAX_VISIBLE_BETS),
    [bets]
  );

  const stats = useMemo(() => {
    let won = 0;
    let lost = 0;
    let profit = 0;
    latestBets.forEach((b) => {
      const stake = toUsd(b.amount, b.currency, currencyRates);
      const payout = toUsd(b.payout, b.currency, currencyRates);
      const net = payout - stake;
      profit += net;
      if (payout > 0) won++;
      else lost++;
    });
    return { won, lost, profit, total: latestBets.length };
  }, [latestBets, currencyRates]);

  const handleCopyBetId = async (value: string) => {
    const copied = formatBetIdForCopy(value);
    try {
      await navigator.clipboard.writeText(copied);
      setCopyState(`Copied: ${copied}`);
      setTimeout(() => setCopyState(''), 1800);
    } catch {
      setCopyState('Copy failed');
      setTimeout(() => setCopyState(''), 1800);
    }
  };

  return (
    <div className="logger-stack">
      <div className="logger-panel">
        <div className="logger-kpis">
          <div className="logger-kpi"><span>Sports Bets</span><strong>{stats.total}</strong></div>
          <div className="logger-kpi"><span>Won</span><strong>{stats.won}</strong></div>
          <div className="logger-kpi"><span>Lost</span><strong>{stats.lost}</strong></div>
          <div className={`logger-kpi ${stats.profit >= 0 ? 'positive' : 'negative'}`}><span>Profit / Loss ($)</span><strong>{stats.profit >= 0 ? '+' : ''}{formatNum(stats.profit)}</strong></div>
        </div>
        <p className="logger-muted">
          Subscription Status: <b>{subscriptionStatus}</b>{subscriptionError ? ` - ${subscriptionError}` : ''}
        </p>
      </div>

      <div className="logger-panel">
        <h2 className="logger-title">Sportsbook Bets ({bets.length})</h2>
        <div className="logger-table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>House ID</th><th>Type</th><th className="num">Stake ($)</th><th className="num">Win ($)</th><th className="num">Net ($)</th><th className="num">Multi</th></tr>
            </thead>
            <tbody>
              {latestBets.map((b, idx) => {
                const stake = toUsd(b.amount, b.currency, currencyRates);
                const payout = toUsd(b.payout, b.currency, currencyRates);
                const net = payout - stake;
                return (
                  <tr key={`${b.houseId ?? b.iid ?? b.betId}-${b.receivedAt}-${idx}`}>
                    <td>{formatDate(b.receivedAt)}</td>
                    <td className="mono">
                      <button
                        type="button"
                        className="logger-link-btn mono"
                        onClick={() => handleCopyBetId(String(b.houseId ?? b.iid ?? b.betId ?? '-'))}
                      >
                        {String(b.houseId ?? b.iid ?? b.betId ?? '-')}
                      </button>
                    </td>
                    <td><span className="logger-badge">{b.betType || 'SportsBet'}</span></td>
                    <td className="num">${formatNum(stake)}</td>
                    <td className="num">${formatNum(payout)}</td>
                    <td className={`num ${net >= 0 ? 'positive' : 'negative'}`}>{net >= 0 ? '+' : ''}${formatNum(net)}</td>
                    <td className="num">{getBetMultiplier(b) != null ? `${formatNum(getBetMultiplier(b), 2)}x` : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {copyState ? <p className="logger-status">{copyState}</p> : null}
      </div>
    </div>
  );
}
