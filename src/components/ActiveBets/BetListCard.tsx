import { useState } from 'react';
import type { SportBet } from '../../store/userStore';
import {
  getCashoutValue,
  getEffectiveOdds,
  getOpenLegsCount,
  resolveCashoutMultiplierForBet,
} from '../../services/cashoutService';

interface BetListCardProps {
  bet: SportBet;
  formatCurrency: (amount: number, currency: string) => string;
  onCashout: (betId: string, multiplier: number) => void;
  onPreview: (bet: SportBet) => void;
  onCopyLink?: (betId: string, iid?: string) => void;
  copiedId?: string | null;
  isSelected?: boolean;
}

function isSuccessfulFinishedBet(bet: SportBet): boolean {
  const statusLower = String(bet.status ?? '').toLowerCase();
  if (statusLower === 'won' || statusLower === 'cashout' || statusLower === 'cashoutpending') return true;
  if (!bet.active && bet.payout != null && bet.amount != null && bet.payout > bet.amount) return true;
  const outcomes = bet.outcomes ?? [];
  if (outcomes.length > 0 && !bet.active) {
    return outcomes.every((o) => {
      const st = String(o?.status ?? '').toLowerCase();
      return st === 'won' || st === 'win';
    });
  }
  return false;
}

function resolveDisplayStatus(bet: SportBet): { label: string; tone: 'active' | 'won' | 'lost' | 'cashout' | 'neutral' } {
  const statusLower = String(bet.status ?? '').toLowerCase();
  const isCashout = statusLower === 'cashout' || statusLower === 'cashoutpending';
  const isLostLike =
    statusLower === 'lost' ||
    statusLower === 'cancelled' ||
    statusLower === 'cancelpending';
  if (isSuccessfulFinishedBet(bet)) {
    return { label: isCashout ? 'Cashout' : 'Won', tone: isCashout ? 'cashout' : 'won' };
  }
  if (isLostLike || statusLower === 'settled' || statusLower === 'settledmanual' || statusLower === 'settledpending') {
    return { label: 'Lost', tone: 'lost' };
  }
  if (statusLower === 'active' || bet.active) return { label: 'Active', tone: 'active' };
  return { label: bet.status || '—', tone: 'neutral' };
}

export function BetListCard({
  bet,
  formatCurrency,
  onCashout,
  onPreview,
  onCopyLink,
  copiedId,
  isSelected = false,
}: BetListCardProps) {
  const [isCashingOut, setIsCashingOut] = useState(false);
  const outcomes = bet.outcomes ?? [];
  const firstFixture = outcomes[0]?.fixture?.name ?? 'Bet';
  const firstPick = outcomes[0]?.outcome?.name;
  const openLegsCount = getOpenLegsCount(bet);
  const legsTotal = outcomes.length;
  const dateLabel = bet.createdAt
    ? new Date(bet.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const currentCashoutValue = getCashoutValue(bet);
  const effectiveOdds = getEffectiveOdds(bet);
  const { label: statusLabel, tone: statusTone } = resolveDisplayStatus(bet);
  const showStatus = String(bet.status ?? '').toLowerCase() !== 'confirmed';
  const isActiveBet = bet.status === 'active' || !!bet.active;
  const canCashout = isActiveBet && !bet.cashoutDisabled && currentCashoutValue > 0;
  const cashoutDisplay =
    isActiveBet && !bet.cashoutDisabled && currentCashoutValue > 0
      ? formatCurrency(currentCashoutValue, bet.currency)
      : !isActiveBet && bet.payout != null && Number(bet.payout) > 0
        ? formatCurrency(Number(bet.payout), bet.currency)
        : null;
  const legsLabel = legsTotal > 0 ? `${openLegsCount}/${legsTotal}` : '–';

  const handleCashout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bet.cashoutDisabled) return;
    const mult = resolveCashoutMultiplierForBet(bet);
    if (mult <= 0) return;
    setIsCashingOut(true);
    try {
      await onCashout(bet.id, mult);
    } finally {
      setIsCashingOut(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPreview(bet)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPreview(bet);
        }
      }}
      className={`bet-list-row ${isSelected ? 'is-selected' : ''}`.trim()}
    >
      <div className="bet-list-row-main">
        <span
          className={`bet-list-dot bet-list-dot--${statusTone}`}
          title={showStatus ? statusLabel : undefined}
          aria-label={showStatus ? statusLabel : 'Bet status'}
        />

        <div className="bet-list-event">
          <span className="bet-list-event-title" title={firstFixture}>
            {firstFixture}
          </span>
          <span className="bet-list-event-meta">
            {firstPick && legsTotal === 1 ? (
              <>
                <span className="bet-list-pick" title={firstPick}>{firstPick}</span>
                {dateLabel ? <span className="bet-list-sep">·</span> : null}
              </>
            ) : null}
            {dateLabel && <span>{dateLabel}</span>}
          </span>
        </div>

        <div className="bet-list-stat bet-list-stat--stake">
          <span className="bet-list-stat-label">Stake</span>
          <span className="bet-list-stat-value">{formatCurrency(bet.amount, bet.currency)}</span>
        </div>

        <div className="bet-list-stat bet-list-stat--odds">
          <span className="bet-list-stat-label">Odds</span>
          <span className="bet-list-stat-value bet-list-stat-value--accent">
            {effectiveOdds > 0 ? `${effectiveOdds.toFixed(2)}x` : '–'}
          </span>
        </div>

        <div className="bet-list-stat bet-list-stat--legs">
          <span className="bet-list-stat-label">Legs</span>
          <span
            className={`bet-list-stat-value ${openLegsCount <= 1 && isActiveBet && legsTotal > 1 ? 'bet-list-stat-value--warn' : ''}`.trim()}
            title={legsTotal > 0 ? `${openLegsCount} open / ${legsTotal} total` : undefined}
          >
            {legsLabel}
          </span>
        </div>

        <div className="bet-list-stat bet-list-stat--cashout">
          <span className="bet-list-stat-label">{isActiveBet ? 'Cashout' : 'Payout'}</span>
          <span className={`bet-list-stat-value ${cashoutDisplay ? 'bet-list-stat-value--accent' : ''}`.trim()}>
            {cashoutDisplay ?? '–'}
          </span>
        </div>

        <div className="bet-list-actions">
          {canCashout && (
            <button
              type="button"
              onClick={handleCashout}
              disabled={isCashingOut}
              className="bet-list-cashout-btn"
            >
              {isCashingOut ? '…' : 'Cash'}
            </button>
          )}
          {onCopyLink && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopyLink(bet.id, bet.bet?.iid ?? bet.iid);
              }}
              className="bet-list-icon-btn"
              title="Copy bet ID"
            >
              {copiedId === bet.id ? '✓' : '⎘'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
