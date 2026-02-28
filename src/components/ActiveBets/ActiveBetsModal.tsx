import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserStore } from '../../store/userStore';
import type { SportBet } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { formatAmount } from '../Casino/utils/formatAmount';
import { getCashoutValue, getEffectiveOdds, getOpenLegsCount, isCashoutDisabledByCustomPrices } from '../../services/cashoutService';
import { useAutoCashout } from '../../hooks/useAutoCashout';
import { useBetHistory } from '../../hooks/useBetHistory';
import { BetPreviewModal } from './BetPreviewModal';
import { AutoCashoutControls } from './AutoCashoutControls';
import { BetTableSkeleton } from '../ui/BetTableSkeleton';
import { CollapsibleSection } from './CollapsibleSection';
import { BetListCard } from './BetListCard';

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
      setTimeout(() => refreshCashoutOffersRef.current(bets), 2000);
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

  const handleCashoutSelected = async () => {
    const ids = Array.from(selectedBetIds);
    if (ids.length === 0) return;
    
    // Process sequentially or batch? 
    // Cashout is per bet.
    for (const id of ids) {
      const bet = activeBets.find(b => b.id === id);
      if (bet && bet.cashoutMultiplier && !bet.cashoutDisabled) {
         try {
           await handleCashout(id, bet.cashoutMultiplier);
         } catch (e) {
           console.error(`Failed to cashout ${id}`, e);
         }
         // Small delay
         await new Promise(r => setTimeout(r, 500));
      }
    }
    setSelectedBetIds(new Set());
  };

  const refreshCashoutOffers = useCallback(async (source: SportBet[] = activeBets) => {
    if (source.length === 0) return;
    const next: SportBet[] = [];
    const chunks: SportBet[][] = [];
    
    // Chunk size 1 to be safe, with delay
    for (let i = 0; i < source.length; i += 1) {
      chunks.push(source.slice(i, i + 1));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (b) => {
        if (b?.customBet || isCashoutDisabledByCustomPrices(b)) {
          return { ...b, cashoutDisabled: true, cashoutMultiplier: b.cashoutMultiplier || 0 };
        }

        try {
          const iid = b?.bet?.iid;
          if (!iid) return { ...b };

          const preview = await StakeApi.query<{ bet?: { bet?: { payout?: number; cashoutMultiplier?: number } } }>(Queries.PreviewCashout, { iid });
          const data = preview?.data?.bet?.bet;

          if (data) {
            const hasPayout = data.payout != null && data.payout > 0;
            const hasMultiplier = data.cashoutMultiplier != null && data.cashoutMultiplier > 0;

            if (hasPayout || hasMultiplier) {
              const mult = hasMultiplier ? data.cashoutMultiplier! : (b.cashoutMultiplier ?? 0);
              const value = hasPayout
                ? data.payout!
                : getCashoutValue({ ...b, cashoutMultiplier: mult });
              const updatedBet: SportBet = {
                ...b,
                cashoutMultiplier: mult,
                cashoutValue: value,
                cashoutDisabled: false,
              };
              checkSingleBetAutoCashout(updatedBet);
              return updatedBet;
            }
          }
          return { ...b, cashoutMultiplier: b.cashoutMultiplier || 0 };
        } catch (err) {
          console.error(`Cashout check failed for ${b.id}`, err);
          return { ...b };
        }
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      next.push(...chunkResults);
      
      // OPTIONAL: Update state incrementally to show progress?
      // Updating state here might cause re-renders and re-trigger of effects.
      // But it gives better UX. Let's do it safely.
      // We need to merge 'next' (processed) with the remaining unprocessed bets?
      // Or just wait.
      
      // Wait 3s between individual checks
      await new Promise(r => setTimeout(r, 3000));
    }
    setActiveBets(next);
  }, [setActiveBets, checkSingleBetAutoCashout]);

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
        const preview = await StakeApi.query<{ bet?: { bet?: { payout?: number; cashoutMultiplier?: number } } }>(Queries.PreviewCashout, { iid });
        const data = preview?.data?.bet?.bet;
        if (data) {
          const hasPayout = data.payout != null && data.payout > 0;
          const hasMultiplier = data.cashoutMultiplier != null && data.cashoutMultiplier > 0;
          if (hasPayout || hasMultiplier) {
            const mult = hasMultiplier ? data.cashoutMultiplier! : (bet.cashoutMultiplier ?? 0);
            const value = hasPayout ? data.payout! : getCashoutValue({ ...bet, cashoutMultiplier: mult });
            const updatedBet: SportBet = {
              ...bet,
              cashoutMultiplier: mult,
              cashoutValue: value,
              cashoutDisabled: false,
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

  const formatCurrency = (amount: number, currency: string) => {
    // Stake sends raw amounts (e.g. 0.20 for $0.20), but formatAmount expects minor units for fiat (e.g. 20 cents)
    // We need to multiply by 100 for fiat if formatAmount divides by 100.
    // Check formatAmount implementation: "Fiat: /100, Crypto: unverändert"
    // So if amount is 0.20 USD, formatAmount expects 20.
    
    // However, crypto amounts (BTC) are usually raw (e.g. 0.00001). formatAmount handles them as is?
    // Let's check formatAmount logic: "const divideBy100 = isFiat(curr) ... const displayValue = divideBy100 ? n / 100 : n"
    
    // So for FIAT (USD, EUR, USDC, USDT), we need to feed it CENTS.
    // Stake API returns MAJOR units (e.g. 0.20 USD).
    // So we must MULTIPLY by 100 before calling formatAmount for FIAT.
    
    // BUT WAIT: USDC/USDT are considered FIAT in formatAmount helper? 
    // "FIAT_CURRENCIES = [..., 'usdc', 'usdt', ...]" -> YES.
    
    // So for USD, USDC, USDT: Input 0.20 -> *100 -> 20 -> formatAmount -> /100 -> 0.20.
    // For BTC: Input 0.0001 -> formatAmount -> 0.0001.
    
    const isFiatOrStable = ['usd', 'eur', 'jpy', 'usdc', 'usdt', 'brl', 'cad', 'cny', 'idr', 'inr', 'krw', 'mxn', 'php', 'pln', 'rub', 'try', 'vnd'].includes((currency || '').toLowerCase());
    
    // Zero decimal currencies (JPY, IDR, etc.) usually don't have cents, but Stake might send raw.
    // formatAmount handles zero-decimal via ZERO_DECIMAL_CURRENCIES list.
    // If we multiply by 100 for JPY (which is zero decimal), formatAmount won't divide back.
    // ZERO_DECIMAL_CURRENCIES = ['idr', 'jpy', 'krw', 'vnd']
    
    // Logic:
    // If it's a standard fiat (2 decimals): Stake sends 10.50 -> we pass 1050.
    // If it's crypto: Stake sends 0.001 -> we pass 0.001.
    
    // Exception: ActiveBetsModal receives amounts from GraphQL which are already floats (e.g. 0.2).
    // formatAmount is designed for minor units (integers) from database/slots?
    
    // Let's adjust:
    let val = amount;
    if (isFiatOrStable) {
        // Check if it's a zero-decimal currency
        const isZeroDecimal = ['idr', 'jpy', 'krw', 'vnd'].includes((currency || '').toLowerCase());
        if (!isZeroDecimal) {
            val = amount * 100;
        }
    }
    
    return `${formatAmount(val, currency)} ${(currency || 'UNK').toUpperCase()}`;
  };

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
    return [...source].sort((a, b) => {
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
                valA = getOpenLegsCount(a);
                valB = getOpenLegsCount(b);
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
        className="bg-stake-bg-card border border-stake-border rounded-lg shadow-2xl w-full max-w-4xl min-h-[50vh] max-h-[calc(100vh-11rem)] flex flex-col overflow-hidden shrink-0"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-stake-border bg-stake-bg-deep">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            {activeTab === 'active' ? 'Active Bets' : 'Finished Bets'}
            <span className="text-sm font-normal text-stake-text-muted bg-stake-border px-2 py-0.5 rounded-full">
              {activeTab === 'active' ? activeBets.length : finishedBets.length}
            </span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={activeTab === 'active' ? fetchActiveBets : fetchFinishedBets}
              disabled={activeTab === 'active' ? isLoadingActive : isLoadingFinished}
              className="p-2 hover:bg-stake-border rounded-lg transition-colors text-stake-text-muted hover:text-white disabled:opacity-50"
              title={activeTab === 'active' ? 'Refresh Active Bets' : 'Refresh Finished Bets'}
            >
              {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) ? (
                <span className="animate-spin block">↻</span>
              ) : (
                <span>↻</span>
              )}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-stake-border rounded-lg transition-colors text-stake-text-muted hover:text-white">
              ✕
            </button>
          </div>
        </div>

        <div className="flex border-b border-stake-border bg-stake-bg-deep">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider ${
              activeTab === 'active'
                ? 'text-white bg-stake-bg-deep'
                : 'text-stake-text-muted hover:text-white hover:bg-stake-bg-card/50'
            }`}
          >
            Active
            {activeTab === 'active' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-stake-success shadow-[0_0_8px_rgba(0,231,1,0.6)]" />
            )}
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
            className={`flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider ${
              activeTab === 'finished'
                ? 'text-white bg-stake-bg-deep'
                : 'text-stake-text-muted hover:text-white hover:bg-stake-bg-card/50'
            }`}
          >
            Finished
            {activeTab === 'finished' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-stake-success shadow-[0_0_8px_rgba(0,231,1,0.6)]" />
            )}
          </button>
        </div>

        {/* Sort bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-stake-border bg-stake-bg-deep/80 flex-wrap">
          <span className="text-xs text-stake-text-muted uppercase tracking-wider">Sortieren:</span>
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
                    ? 'bg-stake-success/20 text-stake-success border border-stake-success/50'
                    : 'bg-stake-border/50 text-stake-text-muted hover:text-white border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 rounded-lg bg-stake-border/50 text-stake-text-muted hover:text-white border border-transparent"
              title={sortDirection === 'asc' ? 'Aufsteigend (älteste zuerst)' : 'Absteigend (neueste zuerst)'}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Card layout: collapsible sections, more whitespace */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-stake-bg-deep">
          {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) &&
          (activeTab === 'active' ? activeBets.length : finishedBets.length) === 0 ? (
            <BetTableSkeleton rows={10} />
          ) : (
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-stake-border scrollbar-track-transparent p-5">
              {activeTab === 'active' ? (
                <>
                  <CollapsibleSection
                    title="Live"
                    count={liveBets.length}
                    defaultOpen={true}
                    accent="live"
                  >
                    {liveBets.length === 0 ? (
                      <p className="text-stake-text-dim text-sm py-2">Keine Live-Wetten.</p>
                    ) : (
                      liveBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatCurrency}
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
                      <p className="text-stake-text-dim text-sm py-2">Keine anstehenden Wetten.</p>
                    ) : (
                      upcomingBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatCurrency}
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
                      <p className="text-stake-text-dim text-sm py-2">Keine gewonnenen Wetten.</p>
                    ) : (
                      wonBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatCurrency}
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
                      <p className="text-stake-text-dim text-sm py-2">Keine verlorenen Wetten.</p>
                    ) : (
                      lostBets.map((bet) => (
                        <BetListCard
                          key={bet.id}
                          bet={bet}
                          formatCurrency={formatCurrency}
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
                          formatCurrency={formatCurrency}
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
                <div className="py-12 text-center text-stake-text-dim">
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

        <div className="p-4 border-t border-stake-border bg-stake-bg-card flex justify-between items-center text-xs text-stake-text-muted gap-4">
            <span>{activeTab === 'active' ? `Total Active: ${activeBets.length}` : `Total Finished: ${finishedBets.length}`}</span>
            <button onClick={onClose} className="px-4 py-2 bg-stake-success/20 hover:bg-stake-success/30 text-stake-success font-bold rounded-lg border border-stake-success/50 transition-colors uppercase tracking-wider shrink-0">
              Schließen
            </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modalContent, document.body);
}
