import { BetGraph } from './BetGraph';
import { MatchTracker } from './MatchTracker';
import type { SportBet, SportBetOutcome } from '../../store/userStore';
import { getCashoutValue, getEffectiveOdds, resolveCashoutMultiplierForBet } from '../../services/cashoutService';
import { formatAmount } from '../Casino/utils/formatAmount';
import { toUsd } from '../Logger/loggerUtils';
import { useUiStore } from '../../store/uiStore';

function getLegStatus(outcome: SportBetOutcome): 'won' | 'lost' | 'open' {
  const s = (outcome?.status ?? '').toLowerCase();
  if (s === 'won' || s === 'win') return 'won';
  if (s === 'lost' || s === 'loss') return 'lost';
  return 'open';
}

interface BetPreviewModalProps {
  bet: SportBet;
  onClose: () => void;
  onCashout?: (betId: string, multiplier: number) => void;
  usdRates?: Record<string, number>;
}

function formatCurrency(amount: number, currency: string): string {
  const curr = (currency || '').toLowerCase();
  const isFiat = ['usd', 'eur', 'jpy', 'usdc', 'usdt', 'brl', 'cad', 'cny', 'idr', 'inr', 'krw', 'mxn', 'php', 'pln', 'rub', 'try', 'vnd'].includes(curr);
  const isZeroDecimal = ['idr', 'jpy', 'krw', 'vnd'].includes(curr);
  let val = amount;
  if (isFiat && !isZeroDecimal) val = amount * 100;
  return `${formatAmount(val, currency)} ${(currency || 'UNK').toUpperCase()}`;
}

export function BetPreviewModal({ bet, onClose, onCashout, usdRates = {} }: BetPreviewModalProps) {
  const currentView = useUiStore((s) => s.currentView);
  const cashoutVal = getCashoutValue(bet);
  const cashoutMult = resolveCashoutMultiplierForBet(bet);
  const statusLower = String(bet.status || '').toLowerCase();
  const isOpenBet = bet.active || statusLower === 'active' || statusLower === 'confirmed' || statusLower === 'pending' || statusLower === 'open';
  const canShowCashoutUi =
    isOpenBet && !bet.cashoutDisabled && cashoutVal > 0 && cashoutMult > 0;
  const rawSportsReference = String(bet.bet?.iid || bet.iid || bet.id || '');
  const sportsReference = rawSportsReference.toLowerCase().startsWith('sports:')
    ? rawSportsReference.slice(7)
    : rawSportsReference;
  const formatUsd = (amount: number, currency: string) => {
    const usd = toUsd(amount, currency, usdRates);
    return formatCurrency(usd, 'usd');
  };
  const effectiveOdds = getEffectiveOdds(bet);
  const potentialWinAmount =
    bet.payout != null && bet.payout > 0
      ? bet.payout
      : Math.max(0, (bet.amount || 0) * (effectiveOdds || 0));

  const handleCashout = () => {
    if (onCashout && cashoutMult > 0) onCashout(bet.id, cashoutMult);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] backdrop-blur-sm"
      data-app-mode={currentView}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl w-[96vw] max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
        style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-3 border-b shrink-0" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
          <h3 className="text-base font-bold" style={{ color: 'var(--app-text)' }}>Bet Details</h3>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:opacity-90" style={{ color: 'var(--app-text-muted)' }}>
            ✕
          </button>
        </div>

        <div className="p-3 border-b shrink-0" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in srgb, var(--app-bg-card) 88%, transparent)' }}>
          <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
              Sports ID: <span className="font-mono" style={{ color: 'var(--app-text)' }}>{`sports:${sportsReference}`}</span>
            </p>
            {statusLower !== 'confirmed' && (
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-md uppercase border"
                style={{
                  background:
                    bet.status === 'active'
                      ? 'rgba(var(--app-accent-rgb), 0.12)'
                      : bet.status === 'won'
                        ? 'rgba(var(--app-accent-rgb), 0.12)'
                        : bet.status === 'lost'
                          ? 'rgba(255,51,102,0.12)'
                          : 'var(--app-border)',
                  color:
                    bet.status === 'lost'
                      ? 'var(--app-error)'
                      : bet.status === 'active' || bet.status === 'won'
                        ? 'var(--app-accent)'
                        : 'var(--app-text-muted)',
                  borderColor:
                    bet.status === 'lost'
                      ? 'rgba(255,51,102,0.3)'
                      : 'rgba(var(--app-accent-rgb), 0.3)',
                }}
              >
                {bet.status}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Stake</div>
              <div className="font-mono text-xs" style={{ color: 'var(--app-text)' }}>{formatUsd(bet.amount, bet.currency)}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Potential win</div>
              <div className="font-mono text-xs" style={{ color: 'var(--app-accent)' }}>{formatUsd(potentialWinAmount, bet.currency)}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Total odds</div>
              <div className="font-mono text-xs" style={{ color: 'var(--app-accent)' }}>{effectiveOdds.toFixed(2)}x</div>
            </div>
            <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Current cashout</div>
              <div className="font-mono text-xs" style={{ color: 'var(--app-accent)' }}>
                {cashoutVal > 0 && !bet.cashoutDisabled ? formatUsd(cashoutVal, bet.currency) : '–'}
              </div>
            </div>
          </div>

          {isOpenBet && (
            <div
              className={`mt-2 rounded-md border px-2.5 py-2 ${
                cashoutVal > 0 && !bet.cashoutDisabled
                  ? ''
                  : ''
              }`}
              style={{
                borderColor:
                  cashoutVal > 0 && !bet.cashoutDisabled
                    ? 'rgba(var(--app-accent-rgb), 0.35)'
                    : 'var(--app-border)',
                background:
                  cashoutVal > 0 && !bet.cashoutDisabled
                    ? 'rgba(var(--app-accent-rgb), 0.08)'
                    : 'var(--app-bg-deep)',
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--app-text-muted)' }}>Cashout now</div>
              {cashoutVal > 0 && !bet.cashoutDisabled ? (
                <div className="text-sm font-bold font-mono leading-tight" style={{ color: 'var(--app-accent)' }}>
                  {formatUsd(cashoutVal, bet.currency)}
                </div>
              ) : (
                <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  Cashout is still loading from Stake (wait a moment or refresh list).
                </div>
              )}
            </div>
          )}
          {canShowCashoutUi && onCashout && (
            <button
              type="button"
              onClick={handleCashout}
              className="mt-2 w-full md:w-auto px-3 py-1.5 rounded-md border text-xs font-bold transition-all hover:opacity-90"
              style={{
                background: 'rgba(var(--app-accent-rgb), 0.14)',
                color: 'var(--app-accent)',
                borderColor: 'rgba(var(--app-accent-rgb), 0.4)',
              }}
            >
              Cashout {formatUsd(cashoutVal, bet.currency)}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {bet.outcomes?.map((o, i) => {
            const legStatus = getLegStatus(o);
            return (
              <div
                key={o?.id ?? i}
                className="border rounded-md p-2.5"
                style={{
                  background: 'var(--app-bg-deep)',
                  borderColor:
                    legStatus === 'won'
                      ? 'rgba(var(--app-accent-rgb), 0.45)'
                      : legStatus === 'lost'
                        ? 'rgba(255,51,102,0.45)'
                        : 'var(--app-border)',
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    legStatus === 'won' ? '' : legStatus === 'lost' ? '' : ''
                  }`}>
                    {legStatus === 'won' && (
                      <>
                        <svg className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                        <span style={{ color: 'var(--app-accent)' }}>Won</span>
                      </>
                    )}
                    {legStatus === 'lost' && (
                      <>
                        <svg className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        <span style={{ color: 'var(--app-error)' }}>Lost</span>
                      </>
                    )}
                    {legStatus === 'open' && (
                      <>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--app-text-muted)' }} />
                        <span style={{ color: 'var(--app-text-muted)' }}>Open</span>
                      </>
                    )}
                  </span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border" style={{ color: 'var(--app-accent)', background: 'color-mix(in srgb, var(--app-bg-card) 82%, transparent)', borderColor: 'var(--app-border)' }}>
                    {(o?.odds ?? o?.outcome?.odds ?? 0).toFixed(2)}x
                  </span>
                </div>
                {o?.fixture?.eventStatus && <MatchTracker fixture={o.fixture} />}
                <div className="mt-1.5">
                  <div className="flex items-center text-xs">
                    <span className="font-medium truncate flex-1" style={{ color: 'var(--app-text)' }} title={o?.outcome?.name}>
                      {o?.outcome?.name ?? '–'}
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--app-text-muted)' }}>
                    {o?.market?.name} · {o?.fixture?.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canShowCashoutUi && (
          <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
            <div className="mb-2 h-14 w-full rounded overflow-hidden border" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-card)' }}>
              <BetGraph
                currentValue={cashoutMult}
                maxValue={Math.max(effectiveOdds, cashoutMult, 1)}
                label=""
                color={cashoutMult > 1 ? 'var(--app-accent)' : '#ffd700'}
                height={56}
              />
            </div>
            {onCashout && (
              <button
                type="button"
                onClick={handleCashout}
                className="w-full font-bold text-sm py-2 rounded-md border transition-all hover:opacity-90"
                style={{
                  background: 'rgba(var(--app-accent-rgb), 0.14)',
                  color: 'var(--app-accent)',
                  borderColor: 'rgba(var(--app-accent-rgb), 0.4)',
                }}
              >
                Cashout {formatUsd(cashoutVal, bet.currency)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
