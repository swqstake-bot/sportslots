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
  const currentCashoutValue = getCashoutValue(bet);

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
  const displayStatus = isCashout ? 'Cashout' : isLostLike ? 'Lost' : bet.status;
  const showStatusBadge = statusLower !== 'confirmed';

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
      className="rounded-lg overflow-hidden transition-colors hover:opacity-95"
      style={{ border: '1px solid var(--app-border)', background: 'color-mix(in srgb, var(--app-bg-card) 90%, transparent)' }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={() => onPreview(bet)}
        className="w-full text-left p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate pr-2" style={{ color: 'var(--app-text)' }}>
              {firstFixture}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
              {hasMultipleLegs ? `${outcomes.length} legs total` : 'Single leg'}{dateLabel ? ` • ${dateLabel}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showStatusBadge && (
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border"
                style={statusStyle}
              >
                {displayStatus}
              </span>
            )}
            {onCopyLink && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyLink(bet.id, bet.bet?.iid ?? bet.iid);
                }}
                className="h-7 w-7 rounded-md transition-colors hover:opacity-90"
                style={{ background: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                title="Copy link"
              >
                {copiedId === bet.id ? (
                  <span className="text-xs" style={{ color: 'var(--app-accent)' }}>✓</span>
                ) : (
                  <span className="text-xs">⎘</span>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-1.5">
          <div className="rounded-md px-2 py-1.5 border" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Stake</div>
            <div className="font-mono text-xs" style={{ color: 'var(--app-text)' }}>{formatCurrency(bet.amount, bet.currency)}</div>
          </div>
          <div className="rounded-md px-2 py-1.5 border" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Odds</div>
            <div className="font-mono text-xs" style={{ color: 'var(--app-accent)' }}>
              {getEffectiveOdds(bet) > 0 ? `${getEffectiveOdds(bet).toFixed(2)}x` : '–'}
            </div>
          </div>
          <div className="rounded-md px-2 py-1.5 border" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Current cashout</div>
            <div className="font-mono text-xs" style={{ color: 'var(--app-accent)' }}>
              {!bet.cashoutDisabled && currentCashoutValue > 0 ? formatCurrency(currentCashoutValue, bet.currency) : '–'}
            </div>
          </div>
          <div className="rounded-md px-2 py-1.5 border flex items-center justify-between" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)', background: 'var(--app-bg-deep)' }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Legs</div>
              <div className="font-mono text-xs" style={{ color: 'var(--app-text)' }}>{legsLabel ?? '–'}</div>
            </div>
            {legsLabel != null && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold font-mono" style={legsBadgeStyle}>
                Open
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Collapsible Selections */}
      <div className="border-t" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 80%, transparent)' }}>
        <button
          type="button"
          onClick={() => setSelectionsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 transition-colors text-xs cursor-pointer hover:opacity-90"
          style={{ color: 'var(--app-text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span className="font-medium uppercase tracking-wider">
            Selections {outcomes.length > 0 && `(${outcomes.length})`}
          </span>
          <span
            className={`shrink-0 transition-transform duration-200 ${selectionsOpen ? 'rotate-180' : ''}`}
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
              <div className="px-3 pb-3 pt-0 space-y-2">
                {outcomes.map((o: any, i: number) => (
                  <div
                    key={o?.id ?? i}
                    className="rounded-md p-2.5 space-y-1.5"
                    style={{ background: 'color-mix(in srgb, var(--app-bg-deep) 50%, transparent)', border: '1px solid color-mix(in srgb, var(--app-border) 50%, transparent)' }}
                  >
                    {o?.fixture?.eventStatus && (
                      <MatchTracker fixture={o.fixture} />
                    )}
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-xs truncate" style={{ color: 'var(--app-text)' }}>
                        {o?.outcome?.name ?? '—'}
                      </span>
                      <span className="font-mono text-xs shrink-0" style={{ color: 'var(--app-accent)' }}>
                        {(o?.odds ?? o?.outcome?.odds ?? 0).toFixed(2)}x
                      </span>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: 'var(--app-text-muted)' }}>
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
        currentCashoutValue > 0 && (
          <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--app-border)', background: 'rgba(0,0,0,0.15)' }}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--app-text-muted)' }}>
                  Cashout value
                </p>
                <p className="text-sm font-bold font-mono" style={{ color: 'var(--app-accent)' }}>
                  {formatCurrency(currentCashoutValue, bet.currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCashout}
                disabled={isCashingOut}
                className="px-3 py-1.5 rounded-md text-xs font-bold border disabled:opacity-60 disabled:cursor-not-allowed transition-colors hover:opacity-90"
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
