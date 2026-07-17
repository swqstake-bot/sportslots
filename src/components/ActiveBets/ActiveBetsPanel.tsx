import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useUserStore } from '../../store/userStore';
import type { SportBet } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { formatStakeAmount } from '../../utils/formatStakeAmount';
import {
  computeCashoutFromPreview,
  getCashoutValue,
  getEffectiveOdds,
  getClosedLegsCount,
  isCashoutDisabledByCustomPrices,
  resolveCashoutMultiplierForBet,
} from '../../services/cashoutService';
import { useCashoutOffers } from '../../hooks/useCashoutOffers';
import { useAutoCashout } from '../../hooks/useAutoCashout';
import { useBetHistory } from '../../hooks/useBetHistory';
import { BetPreviewModal } from './BetPreviewModal';
import { BetPreviewPanel } from './BetPreviewPanel';
import { AutoCashoutControls } from './AutoCashoutControls';
import { BetTableSkeleton } from '../ui/BetTableSkeleton';
import { CollapsibleSection } from './CollapsibleSection';
import { BetListCard } from './BetListCard';
import { extractSportBetFromPreviewResponse, logPreviewCashoutDebug } from '../../utils/previewCashoutResponse';
import { toUsd } from '../Logger/loggerUtils';
import { formatSportBetShareIdForCopy } from '../../utils/stakeSportsUrl';
import './active-bets-panel.css';

function hasLiveLeg(bet: SportBet): boolean {
  return (bet.outcomes ?? []).some((o: any) => {
    const es = o?.fixture?.eventStatus;
    if (!es) return false;
    const ms = String(es.matchStatus ?? '').toLowerCase();
    if (ms === 'live' || ms === 'in_play' || ms === 'inplay') return true;
    if (es.clock != null) return true;
    return false;
  });
}

export interface ActiveBetsPanelProps {
  onClose?: () => void;
  initialPreviewBetId?: string | null;
  embedded?: boolean;
}

export function ActiveBetsPanel({
  onClose,
  initialPreviewBetId = null,
  embedded = false,
}: ActiveBetsPanelProps) {
  const isBetOpenForCashout = useCallback((bet: SportBet) => {
    const status = String(bet.status || '').toLowerCase();
    if (bet.active) return true;
    if (status === 'active' || status === 'confirmed' || status === 'pending' || status === 'open') return true;
    return false;
  }, []);

  const { user } = useUserStore();
  const userName = user?.name;
  const showToast = useUiStore((s) => s.showToast);
  const clearActiveBetsPreview = useUiStore((s) => s.closeActiveBetsModal);

  const refreshCashoutOffersRef = useRef<(source: SportBet[]) => void>(() => {});

  const {
    activeBets,
    setActiveBets,
    finishedBets,
    isLoadingActive,
    isLoadingFinished,
    usdRates,
    fetchActiveBets,
    fetchFinishedBets,
  } = useBetHistory({
    userName,
    refreshIntervalMs: 120_000,
    onActiveFetched: (bets) => {
      setTimeout(() => refreshCashoutOffersRef.current(bets), 400);
    },
  });

  const formatCurrencyUsd = useCallback((amount: number, currency: string) => {
    const usdAmount = toUsd(amount, currency, usdRates);
    return formatStakeAmount(usdAmount, 'usd');
  }, [usdRates]);

  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'finished'>('active');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashoutTargetUsd, setAutoCashoutTargetUsd] = useState(500);
  const [selectedBetIds, setSelectedBetIds] = useState<Set<string>>(new Set());
  const [previewBet, setPreviewBet] = useState<SportBet | null>(null);
  const didOpenInitialPreviewRef = useRef(false);
  const autoCashoutFxWarningRef = useRef<Set<string>>(new Set());

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const closePreview = useCallback(() => {
    setPreviewBet(null);
    clearActiveBetsPreview();
  }, [clearActiveBetsPreview]);

  const { checkSingleBetAutoCashout, evaluateAutoCashout } = useAutoCashout({
    enabled: autoCashoutEnabled,
    targetUsd: autoCashoutTargetUsd,
    activeBets,
    setActiveBets,
    usdRates,
    onAutoCashoutSuccess: () => showToast('Auto cashout executed', 'success'),
    onAutoCashoutFxMissing: (currency) => {
      const key = String(currency || 'unknown').toUpperCase();
      if (autoCashoutFxWarningRef.current.has(key)) return;
      autoCashoutFxWarningRef.current.add(key);
      showToast(`Auto cashout paused for ${key}: FX rate missing`, 'info');
    },
  });

  const { refreshCashoutOffers } = useCashoutOffers({
    activeBets,
    setActiveBets,
    onSingleBetProcessed: checkSingleBetAutoCashout,
    enabled: true,
  });

  const handleCashout = async (betId: string, multiplier: number) => {
    try {
      const result = await StakeApi.mutate(Queries.CashoutSportBet, {
        betId,
        multiplier,
      });
      if (result.data?.cashoutSportBet) {
        setActiveBets((prev) => prev.filter((b) => b.id !== betId));
        if (previewBet?.id === betId) closePreview();
        showToast('Cashout successful', 'success');
      }
    } catch (err) {
      console.error('Cashout failed', err);
      showToast('Cashout failed', 'error');
    }
  };

  const handleCashoutSelected = async () => {
    const ids = Array.from(selectedBetIds);
    if (ids.length === 0) return;

    for (const id of ids) {
      const bet = activeBets.find((b) => b.id === id);
      const mult = bet ? resolveCashoutMultiplierForBet(bet) : 0;
      if (bet && mult > 0 && !bet.cashoutDisabled) {
        try {
          await handleCashout(id, mult);
        } catch (e) {
          console.error(`Failed to cashout ${id}`, e);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setSelectedBetIds(new Set());
  };

  useEffect(() => {
    refreshCashoutOffersRef.current = refreshCashoutOffers;
  }, [refreshCashoutOffers]);

  useEffect(() => {
    if (autoCashoutEnabled) {
      evaluateAutoCashout();
    }
  }, [activeBets, autoCashoutEnabled, evaluateAutoCashout]);

  const handlePreviewBet = useCallback(async (bet: SportBet) => {
    if (previewBet?.id === bet.id) {
      closePreview();
      return;
    }

    const iid = bet?.bet?.iid;
    if (bet.status === 'active' && iid && !bet?.customBet && !isCashoutDisabledByCustomPrices(bet)) {
      try {
        const preview = await StakeApi.query<{ bet?: unknown }>(Queries.PreviewCashout, { iid });
        const rootBet = preview?.data?.bet;
        const data = extractSportBetFromPreviewResponse(rootBet);
        logPreviewCashoutDebug('panelClick', { betId: bet.id, iid }, preview, rootBet, data);
        if (data) {
          const payout = Number(data.payout);
          const cm = Number(data.cashoutMultiplier);
          const hasPayout = Number.isFinite(payout) && payout > 0;
          const hasMultiplier = Number.isFinite(cm) && cm > 0;
          if (hasPayout || hasMultiplier) {
            const stakeBet = bet.amount != null && Number(bet.amount) > 0 ? Number(bet.amount) : 0;
            const stakePreview = data.amount != null && Number(data.amount) > 0 ? Number(data.amount) : 0;
            let mult = hasMultiplier ? cm : (bet.cashoutMultiplier ?? 0);
            if ((!mult || mult <= 0) && hasPayout && stakeBet > 0) {
              mult = payout / stakeBet;
            }
            const value = computeCashoutFromPreview(bet, { ...data, cashoutMultiplier: mult });
            const amountMerged =
              stakeBet > 0 ? bet.amount : stakePreview > 0 ? stakePreview : bet.amount;
            const updatedBet: SportBet = {
              ...bet,
              ...(amountMerged != null && (bet.amount == null || Number(bet.amount) <= 0) ? { amount: amountMerged } : {}),
              cashoutMultiplier: mult,
              cashoutValue: value,
              cashoutDisabled: data.cashoutDisabled === true,
            };
            setActiveBets((prev) => prev.map((b) => (b.id === bet.id ? updatedBet : b)));
            setPreviewBet(updatedBet);
            return;
          }
        }
      } catch (err) {
        console.error(`Preview cashout failed for ${bet.id}`, err);
      }
    }
    setPreviewBet(bet);
  }, [setActiveBets, previewBet?.id, closePreview]);

  useEffect(() => {
    if (!initialPreviewBetId || didOpenInitialPreviewRef.current) return;
    const target =
      activeBets.find((b) => b.id === initialPreviewBetId) ??
      finishedBets.find((b) => b.id === initialPreviewBetId) ??
      null;
    if (!target) return;
    didOpenInitialPreviewRef.current = true;
    const t = setTimeout(() => {
      void handlePreviewBet(target);
    }, 0);
    return () => clearTimeout(t);
  }, [initialPreviewBetId, activeBets, finishedBets, handlePreviewBet]);

  const copyLink = (betId: string, iid?: string) => {
    const shareId = formatSportBetShareIdForCopy(iid);
    const text =
      shareId ?? `https://stake.com/sports/my-bets/${betId}?modal=bet`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(betId);
      setTimeout(() => setCopiedId(null), 2000);
      showToast(shareId ? 'Bet ID copied' : 'Link copied', 'success');
    }).catch((err) => {
      console.error('Failed to copy bet reference', err);
      showToast('Copy failed', 'error');
    });
  };

  const sortedBets = useMemo(() => {
    const source = activeTab === 'active' ? activeBets : finishedBets;
    const deduped = Array.from(new Map(source.map((b) => [b.id, b])).values());
    return [...deduped].sort((a, b) => {
      let valA: any = a;
      let valB: any = b;

      switch (sortField) {
        case 'amount':
          valA = toUsd(a.amount, a.currency, usdRates);
          valB = toUsd(b.amount, b.currency, usdRates);
          break;
        case 'payoutMultiplier':
          valA = getEffectiveOdds(a);
          valB = getEffectiveOdds(b);
          break;
        case 'payout':
          valA = a.payout;
          valB = b.payout;
          break;
        case 'status':
          if (activeTab === 'finished') {
            const statusA = String(a.status || '').toLowerCase();
            const statusB = String(b.status || '').toLowerCase();
            const score = (s: string) =>
              s.includes('cashout') ? 2 :
              s.includes('lost') ? 1 :
              s.includes('won') ? 0 :
              s.includes('cancel') ? -1 :
              0;
            valA = score(statusA);
            valB = score(statusB);
          } else {
            valA = String(a.status || '').toLowerCase();
            valB = String(b.status || '').toLowerCase();
          }
          break;
        case 'cashout':
          valA = toUsd(getCashoutValue(a), a.currency, usdRates);
          valB = toUsd(getCashoutValue(b), b.currency, usdRates);
          break;
        case 'openLegs':
          valA = getClosedLegsCount(a);
          valB = getClosedLegsCount(b);
          break;
        case 'createdAt':
        default:
          valA = new Date(a.createdAt).getTime();
          valB = new Date(b.createdAt).getTime();
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeBets, finishedBets, activeTab, sortField, sortDirection, usdRates]);

  const { liveBets, upcomingBets, wonBets, lostBets, cashoutBets } = useMemo(() => {
    const live: SportBet[] = [];
    const upcoming: SportBet[] = [];
    const won: SportBet[] = [];
    const lost: SportBet[] = [];
    const cashout: SportBet[] = [];
    for (const b of sortedBets) {
      if (activeTab === 'active') {
        if (hasLiveLeg(b)) live.push(b);
        else upcoming.push(b);
      } else {
        const s = String(b.status ?? '').toLowerCase();
        if (s === 'won') won.push(b);
        else if (s === 'cashout' || s === 'cashoutpending') cashout.push(b);
        else lost.push(b);
      }
    }
    return { liveBets: live, upcomingBets: upcoming, wonBets: won, lostBets: lost, cashoutBets: cashout };
  }, [sortedBets, activeTab]);

  const renderBet = (bet: SportBet) => (
    <BetListCard
      key={bet.id}
      bet={bet}
      formatCurrency={formatCurrencyUsd}
      onCashout={handleCashout}
      onPreview={handlePreviewBet}
      onCopyLink={copyLink}
      copiedId={copiedId}
      isSelected={previewBet?.id === bet.id}
    />
  );

  const renderBetSections = () => {
    if (activeTab === 'active') {
      return (
        <>
          <CollapsibleSection title="Live" count={liveBets.length} defaultOpen accent="live">
            {liveBets.length === 0 ? (
              <p className="bet-group-empty">No live bets.</p>
            ) : (
              liveBets.map(renderBet)
            )}
          </CollapsibleSection>
          <CollapsibleSection title="Upcoming" count={upcomingBets.length} defaultOpen accent="upcoming">
            {upcomingBets.length === 0 ? (
              <p className="bet-group-empty">No upcoming bets.</p>
            ) : (
              upcomingBets.map(renderBet)
            )}
          </CollapsibleSection>
        </>
      );
    }

    return (
      <>
        <CollapsibleSection title="Won" count={wonBets.length} defaultOpen accent="won">
          {wonBets.length === 0 ? (
            <p className="bet-group-empty">No won bets.</p>
          ) : (
            wonBets.map(renderBet)
          )}
        </CollapsibleSection>
        <CollapsibleSection title="Lost" count={lostBets.length} defaultOpen accent="lost">
          {lostBets.length === 0 ? (
            <p className="bet-group-empty">No lost bets.</p>
          ) : (
            lostBets.map(renderBet)
          )}
        </CollapsibleSection>
        {cashoutBets.length > 0 && (
          <CollapsibleSection title="Cashout" count={cashoutBets.length} defaultOpen accent="cashout">
            {cashoutBets.map(renderBet)}
          </CollapsibleSection>
        )}
      </>
    );
  };

  const isLoading = activeTab === 'active' ? isLoadingActive : isLoadingFinished;
  const totalCount = activeTab === 'active' ? activeBets.length : finishedBets.length;
  const showInlinePreview = embedded && previewBet;
  const showModalPreview = !embedded && previewBet;

  return (
    <div className={`active-bets-panel ${embedded ? 'active-bets-panel--embedded' : ''}`.trim()}>
      <AnimatePresence>
        {showModalPreview && (
          <BetPreviewModal
            bet={previewBet}
            onClose={closePreview}
            onCashout={isBetOpenForCashout(previewBet) ? handleCashout : undefined}
            usdRates={usdRates}
          />
        )}
      </AnimatePresence>

      <div className="active-bets-panel-header">
        <h2 className="active-bets-panel-title">
          {activeTab === 'active' ? 'Active Bets' : 'Finished Bets'}
          <span className="active-bets-panel-count">
            {activeTab === 'active' ? activeBets.length : finishedBets.length}
          </span>
        </h2>
        <div className="active-bets-panel-actions">
          <button
            type="button"
            onClick={activeTab === 'active' ? fetchActiveBets : fetchFinishedBets}
            disabled={isLoading}
            className="active-bets-panel-icon-btn"
            title={activeTab === 'active' ? 'Refresh Active Bets' : 'Refresh Finished Bets'}
          >
            {isLoading ? <span className="animate-spin block">↻</span> : <span>↻</span>}
          </button>
          {!embedded && onClose && (
            <button type="button" onClick={onClose} className="active-bets-panel-icon-btn" aria-label="Close">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="active-bets-panel-subtabs">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`active-bets-panel-subtab ${activeTab === 'active' ? 'is-active' : ''}`.trim()}
        >
          Active
        </button>

        <AutoCashoutControls
          enabled={autoCashoutEnabled}
          targetUsd={autoCashoutTargetUsd}
          onEnabledChange={setAutoCashoutEnabled}
          onTargetChange={setAutoCashoutTargetUsd}
          selectedCount={selectedBetIds.size}
          onCashoutSelected={handleCashoutSelected}
        />

        <button
          type="button"
          onClick={() => setActiveTab('finished')}
          className={`active-bets-panel-subtab ${activeTab === 'finished' ? 'is-active' : ''}`.trim()}
        >
          Finished
        </button>
      </div>

      <div className="active-bets-panel-sort">
        <span className="active-bets-panel-sort-label">Sort:</span>
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'createdAt', label: 'Date' },
            { key: 'cashout', label: 'Cashout' },
            { key: 'openLegs', label: 'Legs' },
            { key: 'payoutMultiplier', label: 'Odds' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSort(key)}
              className={`active-bets-panel-sort-btn ${sortField === key ? 'is-active' : ''}`.trim()}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="active-bets-panel-sort-btn"
            title={sortDirection === 'asc' ? 'Ascending (oldest first)' : 'Descending (newest first)'}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className={`active-bets-panel-body ${showInlinePreview ? 'active-bets-split' : ''}`.trim()}>
        {isLoading && totalCount === 0 ? (
          <BetTableSkeleton rows={10} />
        ) : (
          <>
            <div className="active-bets-list-pane scrollbar-thin">
              {totalCount > 0 && (
                <div className="bet-list-table-head" aria-hidden>
                  <span />
                  <span>Event</span>
                  <span>Stake</span>
                  <span>Odds</span>
                  <span>Cashout</span>
                  <span />
                </div>
              )}
              {renderBetSections()}
              {totalCount === 0 && !isLoading && (
                <div className="active-bets-panel-empty">
                  <svg
                    className="w-14 h-14 mx-auto mb-3 opacity-50"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <p className="font-bold uppercase tracking-wide">
                    {activeTab === 'active' ? 'No active bets' : 'No finished bets'}
                  </p>
                </div>
              )}
            </div>

            {showInlinePreview && (
              <div className="active-bets-preview-pane">
                <BetPreviewPanel
                  bet={previewBet}
                  onClose={closePreview}
                  onCashout={isBetOpenForCashout(previewBet) ? handleCashout : undefined}
                  usdRates={usdRates}
                  variant="inline"
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="active-bets-panel-footer">
        <span>{activeTab === 'active' ? `Total Active: ${activeBets.length}` : `Total Finished: ${finishedBets.length}`}</span>
        {!embedded && onClose && (
          <button type="button" onClick={onClose} className="active-bets-panel-close-btn">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
