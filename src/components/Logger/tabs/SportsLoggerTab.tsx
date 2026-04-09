import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatBetIdForCopy, formatDate, formatNum, getBetMultiplier, toUsd } from '../loggerUtils';
import type { LoggerBetEntry } from '../loggerUtils';

const MAX_VISIBLE_BETS = 500;
const SPORTS_BETS_ROW_ESTIMATE_PX = 40;

type SportsVirtualRowLayout = {
  index: number;
  start: number;
  size: number;
  key: string | number | bigint;
};

type SportsBetVirtualRowProps = {
  layout: SportsVirtualRowLayout;
  dateLabel: string;
  houseIdDisplay: string;
  betTypeLabel: string;
  stakeUsd: number;
  payoutUsd: number;
  netUsd: number;
  multiLabel: string;
  onCopyBetId: (id: string) => void;
};

function sportsBetVirtualRowEqual(prev: SportsBetVirtualRowProps, next: SportsBetVirtualRowProps): boolean {
  if (prev.layout.index !== next.layout.index) return false;
  if (prev.layout.start !== next.layout.start) return false;
  if (prev.layout.size !== next.layout.size) return false;
  if (prev.layout.key !== next.layout.key) return false;
  if (prev.dateLabel !== next.dateLabel) return false;
  if (prev.houseIdDisplay !== next.houseIdDisplay) return false;
  if (prev.betTypeLabel !== next.betTypeLabel) return false;
  if (prev.stakeUsd !== next.stakeUsd) return false;
  if (prev.payoutUsd !== next.payoutUsd) return false;
  if (prev.netUsd !== next.netUsd) return false;
  if (prev.multiLabel !== next.multiLabel) return false;
  if (prev.onCopyBetId !== next.onCopyBetId) return false;
  return true;
}

const SportsBetVirtualRow = memo(function SportsBetVirtualRow({
  layout,
  dateLabel,
  houseIdDisplay,
  betTypeLabel,
  stakeUsd,
  payoutUsd,
  netUsd,
  multiLabel,
  onCopyBetId,
}: SportsBetVirtualRowProps) {
  return (
    <div
      role="row"
      className="logger-sports-virtual-row"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${layout.size}px`,
        transform: `translateY(${layout.start}px)`,
      }}
    >
      <span>{dateLabel}</span>
      <span className="mono">
        <button
          type="button"
          className="logger-link-btn mono logger-house-id-btn"
          onClick={() => onCopyBetId(houseIdDisplay)}
          title="Copy house ID"
          aria-label={`Copy house ID ${houseIdDisplay}`}
        >
          {houseIdDisplay}
        </button>
      </span>
      <span>
        <span className="logger-badge">{betTypeLabel}</span>
      </span>
      <span className="num">${formatNum(stakeUsd)}</span>
      <span className="num">${formatNum(payoutUsd)}</span>
      <span className={`num ${netUsd >= 0 ? 'positive' : 'negative'}`}>
        {netUsd >= 0 ? '+' : ''}${formatNum(netUsd)}
      </span>
      <span className="num">{multiLabel}</span>
    </div>
  );
}, sportsBetVirtualRowEqual);

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

  const handleCopyBetId = useCallback(async (value: string) => {
    const copied = formatBetIdForCopy(value);
    try {
      await navigator.clipboard.writeText(copied);
      setCopyState(`Copied: ${copied}`);
      setTimeout(() => setCopyState(''), 1800);
    } catch {
      setCopyState('Copy failed');
      setTimeout(() => setCopyState(''), 1800);
    }
  }, []);

  const sportsScrollParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: latestBets.length,
    getScrollElement: () => sportsScrollParentRef.current,
    estimateSize: () => SPORTS_BETS_ROW_ESTIMATE_PX,
    overscan: 14,
    getItemKey: (index) => {
      const b = latestBets[index];
      if (!b) return String(index);
      return `${String(b.iid ?? b.houseId ?? b.betId ?? '')}-${b.receivedAt}`;
    },
  });

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
        <div className="logger-table-wrap logger-table-sports-virtual logger-table-virtual">
          <div className="logger-sports-virtual-head" role="row">
            <span>Time</span>
            <span>House ID</span>
            <span>Type</span>
            <span className="num">Stake ($)</span>
            <span className="num">Win ($)</span>
            <span className="num">Net ($)</span>
            <span className="num">Multi</span>
          </div>
          <div ref={sportsScrollParentRef} className="logger-sports-virtual-scroll">
            <div
              className="logger-sports-virtual-spacer"
              style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const b = latestBets[virtualRow.index];
                if (!b) return null;
                const houseIdDisplay = String(b.houseId ?? b.iid ?? b.betId ?? '-');
                const stakeUsd = toUsd(b.amount, b.currency, currencyRates);
                const payoutUsd = toUsd(b.payout, b.currency, currencyRates);
                const netUsd = payoutUsd - stakeUsd;
                const multi = getBetMultiplier(b);
                return (
                  <SportsBetVirtualRow
                    key={virtualRow.key}
                    layout={{
                      index: virtualRow.index,
                      start: virtualRow.start,
                      size: virtualRow.size,
                      key: virtualRow.key,
                    }}
                    dateLabel={formatDate(b.receivedAt)}
                    houseIdDisplay={houseIdDisplay}
                    betTypeLabel={b.betType || 'SportsBet'}
                    stakeUsd={stakeUsd}
                    payoutUsd={payoutUsd}
                    netUsd={netUsd}
                    multiLabel={multi != null ? `${formatNum(multi, 2)}x` : '-'}
                    onCopyBetId={handleCopyBetId}
                  />
                );
              })}
            </div>
          </div>
        </div>
        {copyState ? <p className="logger-status">{copyState}</p> : null}
      </div>
    </div>
  );
}
