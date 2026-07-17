import type { SportBet, SportBetOutcome } from '../../store/userStore';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount, resolveCashoutMultiplierForBet } from '../../services/cashoutService';
import { formatAmount } from '../Casino/utils/formatAmount';
import { toUsd } from '../Logger/loggerUtils';
import { MatchTracker } from './MatchTracker';

function getLegStatus(outcome: SportBetOutcome): 'won' | 'lost' | 'open' {
  const s = (outcome?.status ?? '').toLowerCase();
  if (s === 'won' || s === 'win') return 'won';
  if (s === 'lost' || s === 'loss') return 'lost';
  return 'open';
}

function formatCurrency(amount: number, currency: string): string {
  const curr = (currency || '').toLowerCase();
  const isFiat = ['usd', 'eur', 'jpy', 'usdc', 'usdt', 'brl', 'cad', 'cny', 'idr', 'inr', 'krw', 'mxn', 'php', 'pln', 'rub', 'try', 'vnd'].includes(curr);
  const isZeroDecimal = ['idr', 'jpy', 'krw', 'vnd'].includes(curr);
  let val = amount;
  if (isFiat && !isZeroDecimal) val = amount * 100;
  return `${formatAmount(val, currency)} ${(currency || 'UNK').toUpperCase()}`;
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

function resolvePreviewStatus(bet: SportBet): { label: string; tone: 'active' | 'won' | 'lost' | 'neutral' } {
  const statusLower = String(bet.status ?? '').toLowerCase();
  if (isSuccessfulFinishedBet(bet)) {
    const isCashout = statusLower === 'cashout' || statusLower === 'cashoutpending';
    return { label: isCashout ? 'Cashout' : 'Won', tone: 'won' };
  }
  if (statusLower === 'lost' || statusLower === 'settled' || statusLower === 'cancelled') return { label: 'Lost', tone: 'lost' };
  if (bet.active || statusLower === 'active' || statusLower === 'confirmed') return { label: 'Active', tone: 'active' };
  return { label: bet.status || '—', tone: 'neutral' };
}

export interface BetPreviewPanelProps {
  bet: SportBet;
  onClose: () => void;
  onCashout?: (betId: string, multiplier: number) => void;
  usdRates?: Record<string, number>;
  variant?: 'modal' | 'inline';
}

export function BetPreviewPanel({
  bet,
  onClose,
  onCashout,
  usdRates = {},
  variant = 'modal',
}: BetPreviewPanelProps) {
  const cashoutVal = getCashoutValue(bet);
  const cashoutMult = resolveCashoutMultiplierForBet(bet);
  const statusLower = String(bet.status || '').toLowerCase();
  const canShowCashoutUi =
    (bet.active || statusLower === 'active' || statusLower === 'confirmed' || statusLower === 'pending' || statusLower === 'open')
    && !bet.cashoutDisabled && cashoutVal > 0 && cashoutMult > 0;

  const outcomes = bet.outcomes ?? [];
  const firstFixture = outcomes[0]?.fixture?.name ?? 'Bet';
  const legsTotal = outcomes.length;
  const openLegs = getOpenLegsCount(bet);
  const { label: statusLabel, tone: statusTone } = resolvePreviewStatus(bet);

  const rawSportsReference = String(bet.bet?.iid || bet.iid || bet.id || '');
  const sportsReference = rawSportsReference.toLowerCase().startsWith('sports:')
    ? rawSportsReference.slice(7)
    : rawSportsReference;
  const shortRef = sportsReference.length > 14 ? `${sportsReference.slice(0, 6)}…${sportsReference.slice(-4)}` : sportsReference;

  const formatUsd = (amount: number, currency: string) => {
    const usd = toUsd(amount, currency, usdRates);
    return formatCurrency(usd, 'usd');
  };

  const effectiveOdds = getEffectiveOdds(bet);
  const potentialWinAmount =
    bet.payout != null && bet.payout > 0
      ? bet.payout
      : Math.max(0, (bet.amount || 0) * (effectiveOdds || 0));

  const cashoutProgress = effectiveOdds > 0
    ? Math.min(100, Math.max(0, (cashoutMult / effectiveOdds) * 100))
    : 0;

  const handleCashout = () => {
    if (onCashout && cashoutMult > 0) onCashout(bet.id, cashoutMult);
  };

  const copyRef = () => {
    void navigator.clipboard.writeText(`sports:${sportsReference}`).catch(() => {});
  };

  return (
    <div
      className={`bet-preview-panel bet-preview-panel--${variant}`.trim()}
      style={variant === 'modal' ? { background: 'var(--app-bg-card)', border: '1px solid var(--app-border)' } : undefined}
      onClick={variant === 'modal' ? (e) => e.stopPropagation() : undefined}
    >
      <header className="bet-preview-head">
        <div className="bet-preview-head-text">
          <h3 className="bet-preview-head-title" title={firstFixture}>{firstFixture}</h3>
          <div className="bet-preview-head-meta">
            <span className={`bet-preview-head-status bet-preview-head-status--${statusTone}`}>{statusLabel}</span>
            {legsTotal > 0 && (
              <span className="bet-preview-head-chip">{openLegs}/{legsTotal} legs open</span>
            )}
            <button type="button" className="bet-preview-head-id" onClick={copyRef} title={`Copy sports:${sportsReference}`}>
              {shortRef}
            </button>
          </div>
        </div>
        <button type="button" onClick={onClose} className="bet-preview-panel-close" aria-label="Close preview">
          ✕
        </button>
      </header>

      <section className="bet-preview-kpi">
        <div className="bet-preview-kpi-cell">
          <span className="bet-preview-kpi-value">{formatUsd(bet.amount, bet.currency)}</span>
          <span className="bet-preview-kpi-label">Stake</span>
        </div>
        <div className="bet-preview-kpi-cell">
          <span className="bet-preview-kpi-value bet-preview-kpi-value--accent">{formatUsd(potentialWinAmount, bet.currency)}</span>
          <span className="bet-preview-kpi-label">Return</span>
        </div>
        <div className="bet-preview-kpi-cell">
          <span className="bet-preview-kpi-value bet-preview-kpi-value--accent">{effectiveOdds.toFixed(2)}x</span>
          <span className="bet-preview-kpi-label">Odds</span>
        </div>
        <div className="bet-preview-kpi-cell">
          <span className={`bet-preview-kpi-value ${canShowCashoutUi ? 'bet-preview-kpi-value--accent' : ''}`.trim()}>
            {canShowCashoutUi ? formatUsd(cashoutVal, bet.currency) : '–'}
          </span>
          <span className="bet-preview-kpi-label">Cashout</span>
        </div>
      </section>

      {canShowCashoutUi && (
        <div className="bet-preview-cashout-strip">
          <div className="bet-preview-cashout-track" aria-hidden>
            <div className="bet-preview-cashout-fill" style={{ width: `${cashoutProgress}%` }} />
          </div>
          {onCashout && (
            <button type="button" onClick={handleCashout} className="bet-preview-cashout-btn">
              Cashout {formatUsd(cashoutVal, bet.currency)}
            </button>
          )}
        </div>
      )}

      <div className="bet-preview-legs-head">
        <span>Selections</span>
        <span className="bet-preview-legs-count">{legsTotal}</span>
      </div>

      <div className="bet-preview-panel-legs">
        {outcomes.map((o, i) => {
          const legStatus = getLegStatus(o);
          return (
            <div key={o?.id ?? i} className={`bet-preview-leg-row bet-preview-leg-row--${legStatus}`}>
              <span className={`bet-preview-leg-dot bet-preview-leg-dot--${legStatus}`} aria-hidden />
              <div className="bet-preview-leg-content">
                <div className="bet-preview-leg-primary">
                  <span className="bet-preview-leg-pick" title={o?.outcome?.name}>
                    {o?.outcome?.name ?? '–'}
                  </span>
                  <span className="bet-preview-leg-odds">
                    {(o?.odds ?? o?.outcome?.odds ?? 0).toFixed(2)}x
                  </span>
                </div>
                <div className="bet-preview-leg-secondary">
                  {o?.market?.name}
                  {o?.fixture?.name ? ` · ${o.fixture.name}` : ''}
                </div>
                {o?.fixture?.eventStatus && (
                  <MatchTracker fixture={o.fixture} compact />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
