import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchTracker } from './MatchTracker';
import type { SportBet } from '../../store/userStore';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount } from '../../services/cashoutService';

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

  const legsBadgeClass =
    openLegsCount <= 1
      ? 'bg-red-500/20 text-red-400 border-red-500/50'
      : openLegsCount <= 3
        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
        : 'bg-stake-brand/15 text-stake-brand border-stake-brand/40';
  const statusLower = String(bet.status ?? '').toLowerCase();
  const isCashout = statusLower === 'cashout' || statusLower === 'cashoutpending';
  const isLostLike =
    statusLower === 'lost' ||
    statusLower === 'settled' ||
    statusLower === 'settledmanual' ||
    statusLower === 'settledpending' ||
    statusLower === 'cancelled' ||
    statusLower === 'cancelpending';
  const statusStyles: Record<string, string> = {
    active: 'bg-stake-brand/10 text-stake-brand border-stake-brand/30',
    won: 'bg-stake-success/10 text-stake-success border-stake-success/30',
    lost: 'bg-stake-error/10 text-stake-error border-stake-error/30',
    cashout: 'bg-stake-success/10 text-stake-success border-stake-success/30',
    cashoutpending: 'bg-stake-success/10 text-stake-success border-stake-success/30',
  };
  const statusClass = isLostLike
    ? 'bg-stake-error/10 text-stake-error border-stake-error/30'
    : statusStyles[statusLower] ?? 'bg-stake-border text-stake-text-muted border-transparent';
  const displayStatus = isCashout ? 'Cashout' : isLostLike ? 'Verloren' : bet.status;

  const handleCashout = async () => {
    if (!bet.cashoutMultiplier || bet.cashoutDisabled) return;
    setIsCashingOut(true);
    try {
      await onCashout(bet.id, bet.cashoutMultiplier);
    } finally {
      setIsCashingOut(false);
    }
  };

  return (
    <motion.article
      layout
      className="rounded-xl border border-stake-border bg-stake-bg-card overflow-hidden hover:border-stake-text-muted/50 transition-colors"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Card header: one-line summary, lots of padding */}
      <button
        type="button"
        onClick={() => onPreview(bet)}
        className="w-full text-left p-5 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-stake-success/50 rounded-t-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-white truncate pr-2">
              {firstFixture}
              {hasMultipleLegs && (
                <span className="text-stake-text-muted font-normal ml-2">
                  +{outcomes.length - 1} more
                </span>
              )}
            </h3>
            <p className="text-sm text-stake-text-muted mt-1">
              {isCashout && bet.payout != null && bet.payout > 0 ? (
                <>
                  Ausgezahlt:{' '}
                  <span className="text-stake-success font-mono font-semibold">
                    {formatCurrency(bet.payout, bet.currency)}
                  </span>
                </>
              ) : bet.status === 'active' ? (
                <>
                  {formatCurrency(bet.amount, bet.currency)} →{' '}
                  <span className="text-stake-success font-mono font-semibold">
                    {bet.cashoutMultiplier != null && bet.cashoutMultiplier > 0 && !bet.cashoutDisabled
                      ? formatCurrency(getCashoutValue(bet), bet.currency)
                      : '–'}
                  </span>
                  <span className="ml-2 text-stake-text-dim text-xs">Cashout</span>
                </>
              ) : (
                <>
                  {formatCurrency(bet.amount, bet.currency)} →{' '}
                  <span className="text-stake-text-dim font-mono">
                    {bet.payout != null && bet.payout > 0 ? formatCurrency(bet.payout, bet.currency) : '–'}
                  </span>
                </>
              )}
            </p>
            {getEffectiveOdds(bet) > 0 && (
              <p className="text-sm text-stake-text-muted mt-1">
                Quote:{' '}
                <span className="text-stake-success font-mono font-semibold">
                  {getEffectiveOdds(bet).toFixed(2)}x
                </span>
              </p>
            )}
            {(legsLabel != null || dateLabel != null) && (
              <p className="mt-2 flex flex-wrap items-center gap-2">
                {legsLabel != null && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-sm font-bold font-mono ${legsBadgeClass}`}>
                    {legsLabel} Legs offen
                  </span>
                )}
                {dateLabel != null && (
                  <span className="text-xs text-stake-text-muted">{dateLabel}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-lg uppercase tracking-wider border ${statusClass}`}
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
                className="p-2 rounded-lg bg-stake-border hover:bg-stake-border-hover text-stake-text-muted hover:text-white transition-colors"
                title="Link kopieren"
              >
                {copiedId === bet.id ? (
                  <span className="text-stake-success text-sm">✓</span>
                ) : (
                  <span className="text-sm">⎘</span>
                )}
              </button>
            )}
          </div>
        </div>
      </button>

      {/* Collapsible Selections */}
      <div className="border-t border-stake-border/80">
        <button
          type="button"
          onClick={() => setSelectionsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-stake-text-muted hover:text-white hover:bg-stake-bg-deep/30 transition-colors text-sm cursor-pointer"
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
                    className="rounded-lg bg-stake-bg-deep/50 border border-stake-border/50 p-4 space-y-2"
                  >
                    {o?.fixture?.eventStatus && (
                      <MatchTracker fixture={o.fixture} />
                    )}
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-white font-medium text-sm truncate">
                        {o?.outcome?.name ?? '—'}
                      </span>
                      <span className="text-stake-success font-mono text-sm shrink-0">
                        {(o?.odds ?? o?.outcome?.odds ?? 0).toFixed(2)}x
                      </span>
                    </div>
                    <p className="text-xs text-stake-text-dim truncate">
                      {o?.market?.name} · {o?.fixture?.name}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cashout CTA – only when active and available */}
      {bet.status === 'active' &&
        !bet.cashoutDisabled &&
        bet.cashoutMultiplier != null &&
        bet.cashoutMultiplier > 0 && (
          <div className="border-t border-stake-border px-5 py-4 bg-stake-bg-deep/30">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-stake-text-muted uppercase tracking-wider mb-0.5">
                  Cashout value
                </p>
                <p className="text-lg font-bold text-stake-success font-mono">
                  {formatCurrency(getCashoutValue(bet), bet.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCashout}
                disabled={isCashingOut}
                className="px-5 py-3 rounded-xl bg-stake-success/20 hover:bg-stake-success/30 text-stake-success font-bold border border-stake-success/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isCashingOut ? 'Cashing out…' : 'Cashout'}
              </button>
            </div>
          </div>
        )}
    </motion.article>
  );
}
