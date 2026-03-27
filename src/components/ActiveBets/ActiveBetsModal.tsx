import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '../../store/userStore';
import type { SportBet } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { formatStakeAmount } from '../../utils/formatStakeAmount';
import { computeCashoutFromPreview, getCashoutValue, getEffectiveOdds, getClosedLegsCount, isCashoutDisabledByCustomPrices, resolveCashoutMultiplierForBet } from '../../services/cashoutService';
import { useCashoutOffers } from '../../hooks/useCashoutOffers';
import { useAutoCashout } from '../../hooks/useAutoCashout';
import { useBetHistory } from '../../hooks/useBetHistory';
import { BetPreviewModal } from './BetPreviewModal';
import { AutoCashoutControls } from './AutoCashoutControls';
import { BetTableSkeleton } from '../ui/BetTableSkeleton';
import { CollapsibleSection } from './CollapsibleSection';
import { BetListCard } from './BetListCard';
import { extractSportBetFromPreviewResponse, logPreviewCashoutDebug } from '../../utils/previewCashoutResponse';

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

interface ActiveBetsModalProps {
  onClose: () => void;
}

export function ActiveBetsModal({ onClose }: ActiveBetsModalProps) {
  const { user } = useUserStore();
  const userName = user?.name;

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
      // Schneller erste Cashout-Previews; Updates laufen inkrementell (useCashoutOffers)
      setTimeout(() => refreshCashoutOffersRef.current(bets), 400);
    },
  });

  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'finished'>('active');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashoutTargetUsd, setAutoCashoutTargetUsd] = useState(500);

  const [selectedBetIds, setSelectedBetIds] = useState<Set<string>>(new Set());
  const [previewBet, setPreviewBet] = useState<SportBet | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  const { checkSingleBetAutoCashout, evaluateAutoCashout } = useAutoCashout({
    enabled: autoCashoutEnabled,
    targetUsd: autoCashoutTargetUsd,
    activeBets,
    setActiveBets,
    usdRates,
    onAutoCashoutSuccess: () => showToast('Auto-Cashout ausgeführt', 'success'),
  });

  const { refreshCashoutOffers } = useCashoutOffers({
    activeBets,
    setActiveBets,
    onSingleBetProcessed: checkSingleBetAutoCashout,
    enabled: true,
  });

  const handleCashoutSelected = async () => {
    const ids = Array.from(selectedBetIds);
    if (ids.length === 0) return;
    
    // Process sequentially or batch? 
    // Cashout is per bet.
    for (const id of ids) {
      const bet = activeBets.find(b => b.id === id);
      const mult = bet ? resolveCashoutMultiplierForBet(bet) : 0;
      if (bet && mult > 0 && !bet.cashoutDisabled) {
         try {
           await handleCashout(id, mult);
         } catch (e) {
           console.error(`Failed to cashout ${id}`, e);
         }
         // Small delay
         await new Promise(r => setTimeout(r, 500));
      }
    }
    setSelectedBetIds(new Set());
  };

  useEffect(() => {
    refreshCashoutOffersRef.current = refreshCashoutOffers;
  }, [refreshCashoutOffers]);

  // Evaluate Auto Cashout whenever activeBets updates
  useEffect(() => {
    if (autoCashoutEnabled) {
        evaluateAutoCashout();
    }
  }, [activeBets, autoCashoutEnabled, evaluateAutoCashout]);


  const handleCashout = async (betId: string, multiplier: number) => {
    try {
      const result = await StakeApi.mutate(Queries.CashoutSportBet, {
        betId,
        multiplier,
      });
      if (result.data?.cashoutSportBet) {
        setActiveBets((prev) => prev.filter((b) => b.id !== betId));
        showToast('Cashout erfolgreich', 'success');
      }
    } catch (err) {
      console.error('Cashout failed', err);
      showToast('Cashout fehlgeschlagen', 'error');
    }
  };

  const handlePreviewBet = useCallback(async (bet: SportBet) => {
    const iid = bet?.bet?.iid;
    if (bet.status === 'active' && iid && !bet?.customBet && !isCashoutDisabledByCustomPrices(bet)) {
      try {
        const preview = await StakeApi.query<{ bet?: unknown }>(Queries.PreviewCashout, { iid });
        const rootBet = preview?.data?.bet;
        const data = extractSportBetFromPreviewResponse(rootBet);
        logPreviewCashoutDebug('modalClick', { betId: bet.id, iid }, preview, rootBet, data);
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
  }, [setActiveBets]);

  const copyLink = (betId: string, iid?: string) => {
    // Construct URL based on old tool behavior
    // If iid (ShareIdentifier) exists, use the stake slip sharing URL
    // Otherwise fallback to my-bets URL with bet ID
    let url;
    if (iid) {
        const safeIid = encodeURIComponent(iid);
        url = `https://stake.com/sports/home?operation=withdraw&iid=${safeIid}&modal=bet`;
    } else {
        url = `https://stake.com/sports/my-bets/${betId}?modal=bet`;
    }
    
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(betId);
      setTimeout(() => setCopiedId(null), 2000);
      showToast('Link kopiert', 'success');
    }).catch((err) => {
      console.error('Failed to copy link', err);
      showToast('Kopieren fehlgeschlagen', 'error');
    });
  };

  const sortedBets = React.useMemo(() => {
    const source = activeTab === 'active' ? activeBets : finishedBets;
    const deduped = Array.from(new Map(source.map((b) => [b.id, b])).values());
    return [...deduped].sort((a, b) => {
        let valA: any = a;
        let valB: any = b;

        switch (sortField) {
            case 'amount':
                valA = a.amount;
                valB = b.amount;
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
                valA = getCashoutValue(a);
                valB = getCashoutValue(b);
                break;
            case 'openLegs':
                // Sortieren nach Fortschritt: mehr erledigte Legs = besser (11/12 vor 11/11)
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
  }, [activeBets, finishedBets, activeTab, sortField, sortDirection]);

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
        else lost.push(b); // lost, settled, settledManual, settledPending, cancelled, cancelPending
      }
    }
    return { liveBets: live, upcomingBets: upcoming, wonBets: won, lostBets: lost, cashoutBets: cashout };
  }, [sortedBets, activeTab]);

  const modalContent = (
    <motion.div
      className="fixed inset-0 bg-black/80 flex items-start justify-center pb-8 overflow-y-auto z-[9999] backdrop-blur-sm px-4 sm:px-6"
      style={{ paddingTop: 120 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <AnimatePresence>
        {previewBet && (
          <BetPreviewModal
            bet={previewBet}
            onClose={() => setPreviewBet(null)}
            onCashout={previewBet.status === 'active' ? handleCashout : undefined}
          />
        )}
      </AnimatePresence>
      <motion.div
        className="rounded-lg shadow-2xl w-full max-w-4xl min-h-[50vh] max-h-[calc(100vh-11rem)] flex flex-col overflow-hidden shrink-0"
        style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)' }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
          <h2 className="text-xl font-bold flex items-center gap-3" style={{ color: 'var(--app-text)' }}>
            {activeTab === 'active' ? 'Active Bets' : 'Finished Bets'}
            <span className="text-sm font-normal px-2 py-0.5 rounded-full" style={{ color: 'var(--app-text-muted)', background: 'var(--app-border)' }}>
              {activeTab === 'active' ? activeBets.length : finishedBets.length}
            </span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={activeTab === 'active' ? fetchActiveBets : fetchFinishedBets}
              disabled={activeTab === 'active' ? isLoadingActive : isLoadingFinished}
              className="p-2 rounded-lg transition-colors disabled:opacity-50 hover:opacity-90"
              style={{ color: 'var(--app-text-muted)', background: 'transparent' }}
              title={activeTab === 'active' ? 'Refresh Active Bets' : 'Refresh Finished Bets'}
            >
              {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) ? (
                <span className="animate-spin block">↻</span>
              ) : (
                <span>↻</span>
              )}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:opacity-90" style={{ color: 'var(--app-text-muted)' }}>
              ✕
            </button>
          </div>
        </div>

        <div className="flex border-b p-1" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider rounded-t-lg ${
              activeTab === 'active'
                ? ''
                : 'hover:opacity-90'
            }`}
            style={activeTab === 'active' ? { color: 'var(--app-text)', background: 'var(--app-bg-card)', boxShadow: 'inset 0 -2px 0 0 var(--app-accent)' } : { color: 'var(--app-text-muted)' }}
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
            onClick={() => setActiveTab('finished')}
            className={`flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider rounded-t-lg ${
              activeTab === 'finished'
                ? ''
                : 'hover:opacity-90'
            }`}
            style={activeTab === 'finished' ? { color: 'var(--app-text)', background: 'var(--app-bg-card)', boxShadow: 'inset 0 -2px 0 0 var(--app-accent)' } : { color: 'var(--app-text-muted)' }}
          >
            Finished
          </button>
        </div>

        {/* Sort bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b flex-wrap" style={{ borderColor: 'var(--app-border)', background: 'color-mix(in srgb, var(--app-bg-deep) 80%, transparent)' }}>
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Sortieren:</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'createdAt', label: 'Datum' },
              { key: 'cashout', label: 'Cashout' },
              { key: 'openLegs', label: 'Legs' },
              { key: 'payoutMultiplier', label: 'Quote' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSort(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sortField === key
                    ? 'border'
                    : 'border border-transparent hover:opacity-90'
                }`}
                style={sortField === key
                  ? { background: 'rgba(var(--app-accent-rgb), 0.15)', color: 'var(--app-accent)', borderColor: 'color-mix(in srgb, var(--app-accent) 50%, transparent)' }
                  : { background: 'color-mix(in srgb, var(--app-border) 50%, transparent)', color: 'var(--app-text-muted)' }
                }
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 rounded-lg border border-transparent hover:opacity-90"
              style={{ background: 'color-mix(in srgb, var(--app-border) 50%, transparent)', color: 'var(--app-text-muted)' }}
              title={sortDirection === 'asc' ? 'Aufsteigend (älteste zuerst)' : 'Absteigend (neueste zuerst)'}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Card layout */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ background: 'var(--app-bg-deep)' }}>
          {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) &&
          (activeTab === 'active' ? activeBets.length : finishedBets.length) === 0 ? (
            <BetTableSkeleton rows={10} />
          ) : (
            <div className="flex-1 overflow-auto scrollbar-thin p-5" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
              {activeTab === 'active' ? (
                <>
                  <CollapsibleSection
                    title="Live"
                    count={liveBets.length}
                    defaultOpen={true}
                    accent="live"
                  >
                    {liveBets.length === 0 ? (
                      <p className="text-sm py-2" style={{ color: 'var(--app-text-muted)' }}>Keine Live-Wetten.</p>
                    ) : (
                      liveBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatStakeAmount}
                          onCashout={handleCashout}
                          onPreview={handlePreviewBet}
                          onCopyLink={copyLink}
                          copiedId={copiedId}
                        />
                      ))
                    )}
                  </CollapsibleSection>
                  <CollapsibleSection
                    title="Upcoming"
                    count={upcomingBets.length}
                    defaultOpen={true}
                    accent="upcoming"
                  >
                    {upcomingBets.length === 0 ? (
                      <p className="text-sm py-2" style={{ color: 'var(--app-text-muted)' }}>Keine anstehenden Wetten.</p>
                    ) : (
                      upcomingBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatStakeAmount}
                          onCashout={handleCashout}
                          onPreview={handlePreviewBet}
                          onCopyLink={copyLink}
                          copiedId={copiedId}
                        />
                      ))
                    )}
                  </CollapsibleSection>
                </>
              ) : (
                <>
                  <CollapsibleSection
                    title="Gewonnen"
                    count={wonBets.length}
                    defaultOpen={true}
                    accent="won"
                  >
                    {wonBets.length === 0 ? (
                      <p className="text-sm py-2" style={{ color: 'var(--app-text-muted)' }}>Keine gewonnenen Wetten.</p>
                    ) : (
                      wonBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatStakeAmount}
                          onCashout={handleCashout}
                          onPreview={handlePreviewBet}
                          onCopyLink={copyLink}
                          copiedId={copiedId}
                        />
                      ))
                    )}
                  </CollapsibleSection>
                  <CollapsibleSection
                    title="Verloren"
                    count={lostBets.length}
                    defaultOpen={true}
                    accent="lost"
                  >
                    {lostBets.length === 0 ? (
                      <p className="text-sm py-2" style={{ color: 'var(--app-text-muted)' }}>Keine verlorenen Wetten.</p>
                    ) : (
                      lostBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatStakeAmount}
                          onCashout={handleCashout}
                          onPreview={handlePreviewBet}
                          onCopyLink={copyLink}
                          copiedId={copiedId}
                        />
                      ))
                    )}
                  </CollapsibleSection>
                  {cashoutBets.length > 0 && (
                    <CollapsibleSection
                      title="Cashout"
                      count={cashoutBets.length}
                      defaultOpen={true}
                      accent="cashout"
                    >
                      {cashoutBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatStakeAmount}
                          onCashout={handleCashout}
                          onPreview={handlePreviewBet}
                          onCopyLink={copyLink}
                          copiedId={copiedId}
                        />
                      ))}
                    </CollapsibleSection>
                  )}
                </>
              )}
              {(activeTab === 'active' ? activeBets.length : finishedBets.length) === 0 &&
                !(activeTab === 'active' ? isLoadingActive : isLoadingFinished) && (
                <div className="py-12 text-center" style={{ color: 'var(--app-text-muted)' }}>
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
                    {activeTab === 'active' ? 'Keine aktiven Wetten' : 'Keine abgeschlossenen Wetten'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-between items-center text-xs gap-4" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-card)', color: 'var(--app-text-muted)' }}>
            <span>{activeTab === 'active' ? `Total Active: ${activeBets.length}` : `Total Finished: ${finishedBets.length}`}</span>
            <button onClick={onClose} className="px-4 py-2 font-bold rounded-lg border transition-colors uppercase tracking-wider shrink-0 hover:opacity-90" style={{ background: 'rgba(var(--app-accent-rgb), 0.15)', color: 'var(--app-accent)', borderColor: 'color-mix(in srgb, var(--app-accent) 50%, transparent)' }}>
              Schließen
            </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modalContent, document.body);
}
