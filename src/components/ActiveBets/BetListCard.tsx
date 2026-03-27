import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchTracker } from './MatchTracker';
import type { SportBet } from '../../store/userStore';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount, resolveCashoutMultiplierForBet } from '../../services/cashoutService';

interface BetListCardProps {
  bet: SportBet;
  formatCurrency: (amount: number, currency: string) => string;
  onCashout: (betId: string, multiplier: number) => void;
  onPreview: (bet: SportBet) => void;
  onCopyLink?: (betId: string, iid?: string) => void;
  copiedId?: string | null;
}

export function BetListCard({
  bet,
  formatCurrency,
  onCashout,
  onPreview,
  onCopyLink,
  copiedId,
}: BetListCardProps) {
  const [selectionsOpen, setSelectionsOpen] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const outcomes = bet.outcomes ?? [];
  const hasMultipleLegs = outcomes.length > 1;
  const firstFixture = outcomes[0]?.fixture?.name ?? 'Bet';

  const openLegsCount = getOpenLegsCount(bet);
  const legsLabel = outcomes.length > 0 ? `${openLegsCount}/${outcomes.length}` : null;
  const dateLabel = bet.createdAt ? new Date(bet.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : null;

  const legsBadgeStyle =
    openLegsCount <= 1
      ? { background: 'rgba(255,51,102,0.2)', color: 'var(--app-error)', border: '1px solid rgba(255,51,102,0.5)' }
      : openLegsCount <= 3
        ? { background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.5)' }
        : { background: 'rgba(var(--app-accent-rgb), 0.15)', color: 'var(--app-accent)', border: '1px solid rgba(var(--app-accent-rgb), 0.4)' };
  const statusLower = String(bet.status ?? '').toLowerCase();
  const isCashout = statusLower === 'cashout' || statusLower === 'cashoutpending';
  const isLostLike =
    statusLower === 'lost' ||
    statusLower === 'settled' ||
    statusLower === 'settledmanual' ||
    statusLower === 'settledpending' ||
    statusLower === 'cancelled' ||
    statusLower === 'cancelpending';
  const statusStyles: Record<string, React.CSSProperties> = {
    active: { background: 'rgba(var(--app-accent-rgb), 0.12)', color: 'var(--app-accent)', border: '1px solid rgba(var(--app-accent-rgb), 0.3)' },
    won: { background: 'rgba(var(--app-accent-rgb), 0.12)', color: 'var(--app-accent)', border: '1px solid rgba(var(--app-accent-rgb), 0.3)' },
    lost: { background: 'rgba(255,51,102,0.12)', color: 'var(--app-error)', border: '1px solid rgba(255,51,102,0.3)' },
    cashout: { background: 'rgba(var(--app-accent-rgb), 0.12)', color: 'var(--app-accent)', border: '1px solid rgba(var(--app-accent-rgb), 0.3)' },
    cashoutpending: { background: 'rgba(var(--app-accent-rgb), 0.12)', color: 'var(--app-accent)', border: '1px solid rgba(var(--app-accent-rgb), 0.3)' },
  };
  const statusStyle = isLostLike
    ? { background: 'rgba(255,51,102,0.12)', color: 'var(--app-error)', border: '1px solid rgba(255,51,102,0.3)' }
    : statusStyles[statusLower] ?? { background: 'var(--app-border)', color: 'var(--app-text-muted)', border: '1px solid transparent' };
  const displayStatus = isCashout ? 'Cashout' : isLostLike ? 'Verloren' : bet.status;

  const handleCashout = async () => {
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
    <motion.article
      layout
      className="rounded-xl overflow-hidden transition-colors hover:opacity-95"
      style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg-card)' }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Card header: one-line summary, lots of padding */}
      <button
        type="button"
        onClick={() => onPreview(bet)}
        className="w-full text-left p-5 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] rounded-t-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold truncate pr-2" style={{ color: 'var(--app-text)' }}>
              {firstFixture}
              {hasMultipleLegs && (
                <span className="font-normal ml-2" style={{ color: 'var(--app-text-muted)' }}>
                  +{outcomes.length - 1} more
                </span>
              )}
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
              {isCashout && bet.payout != null && bet.payout > 0 ? (
                <>
                  Ausgezahlt:{' '}
                  <span className="font-mono font-semibold" style={{ color: 'var(--app-accent)' }}>
                    {formatCurrency(bet.payout, bet.currency)}
                  </span>
                </>
              ) : bet.status === 'active' ? (
                <>
                  {formatCurrency(bet.amount, bet.currency)} →{' '}
                  <span className="font-mono font-semibold" style={{ color: 'var(--app-accent)' }}>
                    {!bet.cashoutDisabled && getCashoutValue(bet) > 0
                      ? formatCurrency(getCashoutValue(bet), bet.currency)
                      : '–'}
                  </span>
                  <span className="ml-2 text-xs" style={{ color: 'var(--app-text-muted)', opacity: 0.8 }}>Cashout</span>
                </>
              ) : (
                <>
                  {formatCurrency(bet.amount, bet.currency)} →{' '}
                  <span className="font-mono" style={{ color: 'var(--app-text-muted)' }}>
                    {bet.payout != null && bet.payout > 0 ? formatCurrency(bet.payout, bet.currency) : '–'}
                  </span>
                </>
              )}
            </p>
            {getEffectiveOdds(bet) > 0 && (
              <p className="text-sm mt-1" style={{ color: 'var(--app-text-muted)' }}>
                Quote:{' '}
                <span className="font-mono font-semibold" style={{ color: 'var(--app-accent)' }}>
                  {getEffectiveOdds(bet).toFixed(2)}x
                </span>
              </p>
            )}
            {(legsLabel != null || dateLabel != null) && (
              <p className="mt-2 flex flex-wrap items-center gap-2">
                {legsLabel != null && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md border text-sm font-bold font-mono" style={legsBadgeStyle}>
                    {legsLabel} Legs offen
                  </span>
                )}
                {dateLabel != null && (
                  <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>{dateLabel}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className="text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border"
              style={statusStyle}
            >
              {displayStatus}
            </span>
            {onCopyLink && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyLink(bet.id, bet.bet?.iid ?? bet.iid);
                }}
                className="p-2 rounded-lg transition-colors hover:opacity-90"
                style={{ background: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                title="Link kopieren"
              >
                {copiedId === bet.id ? (
                  <span className="text-sm" style={{ color: 'var(--app-accent)' }}>✓</span>
                ) : (
                  <span className="text-sm">⎘</span>
                )}
              </button>
            )}
          </div>
        </div>
      </button>

      {/* Collapsible Selections */}
      <div className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 80%, transparent)' }}>
        <button
          type="button"
          onClick={() => setSelectionsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-3 transition-colors text-sm cursor-pointer hover:opacity-90"
          style={{ color: 'var(--app-text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span className="font-medium uppercase tracking-wider">
            Selections {outcomes.length > 0 && `(${outcomes.length})`}
          </span>
          <span
            className={`shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -my-1 -mr-1 transition-transform duration-200 ${selectionsOpen ? 'rotate-180' : ''}`}
          >
            ▼
          </span>
        </button>
        <AnimatePresence initial={false}>
          {selectionsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-0 space-y-4">
                {outcomes.map((o: any, i: number) => (
                  <div
                    key={o?.id ?? i}
                    className="rounded-lg p-4 space-y-2"
                    style={{ background: 'color-mix(in srgb, var(--app-bg-deep) 50%, transparent)', border: '1px solid color-mix(in srgb, var(--app-border) 50%, transparent)' }}
                  >
                    {o?.fixture?.eventStatus && (
                      <MatchTracker fixture={o.fixture} />
                    )}
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-sm truncate" style={{ color: 'var(--app-text)' }}>
                        {o?.outcome?.name ?? '—'}
                      </span>
                      <span className="font-mono text-sm shrink-0" style={{ color: 'var(--app-accent)' }}>
                        {(o?.odds ?? o?.outcome?.odds ?? 0).toFixed(2)}x
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--app-text-muted)' }}>
                      {o?.market?.name} · {o?.fixture?.name}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cashout CTA – show when we have a cashout value (Preview or estimate) */}
      {bet.status === 'active' &&
        !bet.cashoutDisabled &&
        getCashoutValue(bet) > 0 && (
          <div className="border-t px-5 py-4" style={{ borderColor: 'var(--app-border)', background: 'rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--app-text-muted)' }}>
                  Cashout value
                </p>
                <p className="text-lg font-bold font-mono" style={{ color: 'var(--app-accent)' }}>
                  {formatCurrency(getCashoutValue(bet), bet.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCashout}
                disabled={isCashingOut}
                className="px-5 py-3 rounded-xl font-bold border disabled:opacity-60 disabled:cursor-not-allowed transition-colors hover:opacity-90"
                style={{ background: 'rgba(var(--app-accent-rgb), 0.15)', color: 'var(--app-accent)', borderColor: 'color-mix(in srgb, var(--app-accent) 50%, transparent)' }}
              >
                {isCashingOut ? 'Cashing out…' : 'Cashout'}
              </button>
            </div>
          </div>
        )}
    </motion.article>
  );
}
