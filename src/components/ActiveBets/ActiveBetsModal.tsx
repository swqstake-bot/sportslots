import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUserStore } from '../../store/userStore';
import type { SportBet } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { formatAmount } from '../Casino/utils/formatAmount';
import { getCashoutValue, isCashoutDisabledByCustomPrices } from '../../services/cashoutService';
import { useAutoCashout } from '../../hooks/useAutoCashout';
import { BetPreviewModal } from './BetPreviewModal';

const ROW_HEIGHT = 76;
const VIRTUAL_THRESHOLD = 30; // ab dieser Anzahl Zeilen virtualisieren
const TABLE_GRID_COLS = '40px 130px minmax(160px,1fr) 56px 64px 80px 88px 88px 80px 100px';

interface ActiveBetsModalProps {
  onClose: () => void;
}

export function ActiveBetsModal({ onClose }: ActiveBetsModalProps) {
  const { user } = useUserStore();
  const userName = user?.name;
  
  const [activeBets, setActiveBets] = useState<SportBet[]>([]);
  const [finishedBets, setFinishedBets] = useState<SportBet[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState(false);
  const [isLoadingFinished, setIsLoadingFinished] = useState(false);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'finished'>('active');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashoutTargetUsd, setAutoCashoutTargetUsd] = useState(500);
  const [usdRates, setUsdRates] = useState<Record<string, number>>({});

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

  const handleSelectBet = (id: string, checked: boolean) => {
    const next = new Set(selectedBetIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedBetIds(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBetIds(new Set(activeBets.map(b => b.id)));
    } else {
      setSelectedBetIds(new Set());
    }
  };

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
            if (data.payout != null && data.payout > 0) {
              const updatedBet: SportBet = { ...b, cashoutMultiplier: 0, cashoutValue: data.payout, cashoutDisabled: false };
              checkSingleBetAutoCashout(updatedBet);
              return updatedBet;
            }
            if (data.cashoutMultiplier != null && data.cashoutMultiplier > 0) {
              const updatedBet: SportBet = {
                ...b,
                cashoutMultiplier: data.cashoutMultiplier,
                cashoutValue: getCashoutValue({ ...b, cashoutMultiplier: data.cashoutMultiplier }),
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
  }, [activeBets, checkSingleBetAutoCashout]);

  // New: Fetch all bets function
  const fetchActiveBets = useCallback(async () => {
    if (!userName) {
        console.error("No user found in store");
        return;
    }
    
    // Check loading via ref if possible, but here we use state.
    // The dependency issue is resolved by NOT including isLoadingActive in the dependency array
    // but checking it at the start. However, if it's not in deps, it might be stale.
    // Better pattern: Use a ref for loading state to avoid re-creating the function.
    if (isLoadingActive) return;
    
    setIsLoadingActive(true);
    try {
      let currentOffset = 0;
      let keepFetching = true;
      const BATCH_LIMIT = 50; 
      const MAX_BETS_LIMIT = 500; // Safety limit to prevent infinite loops
      let allFetchedBets: SportBet[] = [];

      while (keepFetching) {
        if (allFetchedBets.length >= MAX_BETS_LIMIT) {
            console.warn("Max bets limit reached, stopping fetch");
            break;
        }

        const res = await StakeApi.query<any>(Queries.FetchActiveSportBets, {
          limit: BATCH_LIMIT,
          offset: currentOffset,
          name: userName
        });

        if (res.errors) {
            console.error("GraphQL Errors:", res.errors);
            keepFetching = false;
            break;
        }

        if (res.data?.user?.activeSportBets) {
          const newBets = res.data.user.activeSportBets;
          
          if (newBets.length > 0) {
              allFetchedBets = [...allFetchedBets, ...newBets];
          }
          
          if (newBets.length < BATCH_LIMIT) {
            keepFetching = false;
          } else {
            currentOffset += BATCH_LIMIT;
            // Add delay to prevent rate limit during pagination
            await new Promise(r => setTimeout(r, 300));
          }
        } else {
          keepFetching = false;
        }
      }
      
      // Update state once with all bets
      // Deduplicate just in case
      const uniqueBets = Array.from(new Map(allFetchedBets.map(item => [item.id, item])).values());
      setActiveBets(uniqueBets);
      // Wait a bit before starting heavy cashout requests
      setTimeout(() => {
        refreshCashoutOffers(uniqueBets);
      }, 2000);

    } catch (err) {
      console.error("Error fetching all active bets:", err);
    } finally {
      setIsLoadingActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]); // Removed isLoadingActive and refreshCashoutOffers to prevent loops

  const fetchFinishedBets = useCallback(async () => {
    if (!userName) {
      console.error("No user found in store");
      return;
    }

    if (isLoadingFinished) return;

    setIsLoadingFinished(true);
    try {
      let currentOffset = 0;
      let keepFetching = true;
      const BATCH_LIMIT = 50;
      const MAX_BETS_LIMIT = 500;
      let allFetchedBets: SportBet[] = [];
      const status = [
        'settled',
        'settledManual',
        'settledPending',
        'cancelPending',
        'cancelled',
        'cashout',
        'cashoutPending'
      ];

      while (keepFetching) {
        if (allFetchedBets.length >= MAX_BETS_LIMIT) {
          console.warn("Max bets limit reached, stopping fetch");
          break;
        }

        const res = await StakeApi.query<any>(Queries.FetchFinishedSportBets, {
          limit: BATCH_LIMIT,
          offset: currentOffset,
          name: userName,
          status
        });

        if (res.errors) {
          console.error("GraphQL Errors:", res.errors);
          keepFetching = false;
          break;
        }

        if (res.data?.user?.sportBetList) {
          const newBets = res.data.user.sportBetList
            .map((item: any) => item?.bet)
            .filter((bet: any) => bet?.__typename === 'SportBet');

          if (newBets.length > 0) {
            allFetchedBets = [...allFetchedBets, ...newBets];
          }

          if (newBets.length < BATCH_LIMIT) {
            keepFetching = false;
          } else {
            currentOffset += BATCH_LIMIT;
            // Add delay to prevent rate limit during pagination
            await new Promise(r => setTimeout(r, 1000));
          }
        } else {
          keepFetching = false;
        }
      }

      const uniqueBets = Array.from(new Map(allFetchedBets.map(item => [item.id, item])).values());
      setFinishedBets(uniqueBets);
    } catch (err) {
      console.error("Error fetching finished bets:", err);
    } finally {
      setIsLoadingFinished(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]); // Removed isLoadingFinished to prevent loops

  const fetchUsdRates = useCallback(async () => {
    try {
      const res = await StakeApi.query<any>(Queries.CurrencyConfiguration, {});
      const list = res?.data?.info?.currencies || [];
      const map: Record<string, number> = {};
      for (const c of list) {
        const name = String(c?.name || '').toLowerCase();
        const usd = Number(c?.usd || 0);
        if (name) map[name] = usd;
      }
      setUsdRates(map);
    } catch {
      setUsdRates({});
    }
  }, []);

  // Initial load - now calls fetchAllBets instead of paginated fetch
  useEffect(() => {
    fetchActiveBets();
    fetchFinishedBets();
    fetchUsdRates();
  }, [fetchActiveBets, fetchFinishedBets, fetchUsdRates]);

  // Refresh interval (optional, every 120s instead of 60s)
  useEffect(() => {
    const interval = setInterval(() => {
      // Don't fetch if already fetching
      fetchActiveBets();
      fetchFinishedBets();
      // evaluateAutoCashout is called AFTER fetchActiveBets completes inside fetchActiveBets logic if we wanted,
      // but here it runs independently.
      // Ideally evaluateAutoCashout should run more frequently or after updates.
    }, 120000);
    return () => clearInterval(interval);
  }, [fetchActiveBets, fetchFinishedBets]);

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getOpenLegsCount = (bet: SportBet) => {
    if (!bet.outcomes || !Array.isArray(bet.outcomes)) return 0;
    return bet.outcomes.filter((o: any) => 
        o?.outcome?.status === 'active' || o?.outcome?.status === 'open' || 
        o?.market?.status === 'active' || o?.market?.status === 'open' ||
        o?.status === 'active'
    ).length;
  };

  const calculateOpenLegs = (bet: SportBet) => {
    if (!bet.outcomes) return '0/0';
    const total = bet.outcomes.length;
    const open = getOpenLegsCount(bet);
    return `${open}/${total}`;
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

  const handleSort = (field: string) => {
    if (sortField === field) {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
        setSortField(field);
        setSortDirection('desc');
    }
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
                valA = a.potentialMultiplier || a.payoutMultiplier;
                valB = b.potentialMultiplier || b.payoutMultiplier;
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight));
    ro.observe(el);
    setContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const useVirtual = sortedBets.length >= VIRTUAL_THRESHOLD;
  const virtualRange = useMemo(() => {
    if (!useVirtual) return { start: 0, end: sortedBets.length };
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + 6;
    return { start, end: Math.min(sortedBets.length, start + visibleCount) };
  }, [useVirtual, scrollTop, containerHeight, sortedBets.length]);
  const visibleBets = useMemo(() => sortedBets.slice(virtualRange.start, virtualRange.end), [sortedBets, virtualRange.start, virtualRange.end]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm">
      {previewBet && (
        <BetPreviewModal
          bet={previewBet}
          onClose={() => setPreviewBet(null)}
          onCashout={previewBet.status === 'active' ? handleCashout : undefined}
        />
      )}
      <div className="bg-[#1a2c38] border border-[#2f4553] rounded-lg shadow-2xl w-[95vw] h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#2f4553] bg-[#0f212e]">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            {activeTab === 'active' ? 'Active Bets' : 'Finished Bets'}
            <span className="text-sm font-normal text-[#b1bad3] bg-[#2f4553] px-2 py-0.5 rounded-full">
              {activeTab === 'active' ? activeBets.length : finishedBets.length}
            </span>
          </h2>
          <div className="flex gap-2">
            <button 
                onClick={activeTab === 'active' ? fetchActiveBets : fetchFinishedBets}
                disabled={activeTab === 'active' ? isLoadingActive : isLoadingFinished}
                className="p-2 hover:bg-[#2f4553] rounded-lg transition-colors text-[#b1bad3] hover:text-white disabled:opacity-50"
                title={activeTab === 'active' ? "Refresh Active Bets" : "Refresh Finished Bets"}
            >
                {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) ? (
                    <span className="animate-spin block">↻</span>
                ) : (
                    <span>↻</span>
                )}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[#2f4553] rounded-lg transition-colors">
              ✕
            </button>
          </div>
        </div>

        <div className="flex border-b border-[#2f4553] bg-[#0f212e]">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider ${
              activeTab === 'active' 
                ? 'text-white bg-[#0f212e]' 
                : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]/50'
            }`}
          >
            Active
            {activeTab === 'active' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00e701] shadow-[0_0_8px_rgba(0,231,1,0.6)]"></div>
            )}
          </button>
          
          {/* Auto Cashout & Bulk Actions */}
          <div className={`flex items-center gap-3 px-4 py-2 border-l border-r border-[#2f4553] transition-all duration-300 ${autoCashoutEnabled ? 'bg-[#00e701]/5 shadow-[inset_0_0_20px_rgba(0,231,1,0.1)]' : ''}`}>
            
            {/* Bulk Cashout Button */}
            {selectedBetIds.size > 0 && (
                <button 
                    onClick={handleCashoutSelected}
                    className="bg-[#00e701] hover:bg-[#00c201] text-[#0f212e] text-xs font-bold px-3 py-1.5 rounded shadow-[0_0_10px_rgba(0,231,1,0.4)] animate-in fade-in zoom-in duration-200"
                >
                    Cashout Selected ({selectedBetIds.size})
                </button>
            )}

            <div className="h-6 w-px bg-[#2f4553] mx-1"></div>

            <div className="flex items-center gap-2">
                <div className="relative flex items-center">
                    <input 
                        type="checkbox" 
                        id="auto-cashout-toggle"
                        checked={autoCashoutEnabled} 
                        onChange={e => setAutoCashoutEnabled(e.target.checked)} 
                        className="peer sr-only"
                    />
                    <label 
                        htmlFor="auto-cashout-toggle"
                        className={`w-9 h-5 rounded-full cursor-pointer transition-colors relative ${autoCashoutEnabled ? 'bg-[#00e701]' : 'bg-[#2f4553]'}`}
                    >
                        <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${autoCashoutEnabled ? 'translate-x-4' : ''}`}></div>
                    </label>
                </div>
                
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${autoCashoutEnabled ? 'text-[#00e701] drop-shadow-[0_0_5px_rgba(0,231,1,0.5)]' : 'text-[#b1bad3]'}`}>
                        AUTO CASHOUT ≥
                    </span>
                    <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#b1bad3] text-xs">$</span>
                        <input
                           type="number"
                           className={`bg-[#1a2c38] border text-xs pl-4 pr-2 py-1 rounded w-20 outline-none transition-all ${
                               autoCashoutEnabled 
                               ? 'border-[#00e701] text-white shadow-[0_0_5px_rgba(0,231,1,0.3)]' 
                               : 'border-[#2f4553] text-[#b1bad3] focus:border-white focus:text-white'
                           }`}
                           value={autoCashoutTargetUsd}
                           onChange={e => setAutoCashoutTargetUsd(Math.max(0, Number(e.target.value) || 0))}
                           // disabled={!autoCashoutEnabled} // Allow editing even if disabled
                         />
                    </div>
                </div>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('finished')}
            className={`flex-1 py-3 font-bold text-xs transition-all relative uppercase tracking-wider ${
              activeTab === 'finished' 
                ? 'text-white bg-[#0f212e]' 
                : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]/50'
            }`}
          >
            Finished
            {activeTab === 'finished' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00e701] shadow-[0_0_8px_rgba(0,231,1,0.6)]"></div>
            )}
          </button>
        </div>

        {/* Table Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#0f212e]">
            {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) && (activeTab === 'active' ? activeBets.length : finishedBets.length) === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-4 text-[#b1bad3]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00e701]"></div>
                    <p className="animate-pulse">{activeTab === 'active' ? 'Loading all active bets...' : 'Loading finished bets...'}</p>
                </div>
            ) : useVirtual ? (
                <div ref={scrollContainerRef} onScroll={() => setScrollTop(scrollContainerRef.current?.scrollTop ?? 0)} className="flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
                    <div className="sticky top-0 z-10 grid bg-[#1a2c38] text-xs font-bold text-[#b1bad3] uppercase tracking-wider border-b border-[#2f4553]" style={{ gridTemplateColumns: TABLE_GRID_COLS }}>
                        <div className="p-3 w-10"><input type="checkbox" className="cursor-pointer accent-[#00e701]" checked={activeBets.length > 0 && selectedBetIds.size === activeBets.length} onChange={e => handleSelectAll(e.target.checked)} /></div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('createdAt')}>Time {sortField === 'createdAt' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}</div>
                        <div className="p-3">Fixture / Selection</div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('openLegs')}>Legs {sortField === 'openLegs' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}</div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('payoutMultiplier')}>Odds {sortField === 'payoutMultiplier' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}</div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('amount')}>Stake {sortField === 'amount' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}</div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('cashoutMultiplier')}>Cashout</div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('payout')}>Potential</div>
                        <div className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('status')}>Status</div>
                        <div className="p-3 text-right">Action</div>
                    </div>
                    <div style={{ height: sortedBets.length * ROW_HEIGHT, position: 'relative' }}>
                        {visibleBets.map((bet, i) => (
                            <div key={bet.id} role="button" tabIndex={0} onClick={() => setPreviewBet(bet)} onKeyDown={(e) => e.key === 'Enter' && setPreviewBet(bet)} className={`grid text-sm text-[#b1bad3] hover:bg-[#1a2c38]/50 border-b border-[#2f4553]/50 cursor-pointer ${selectedBetIds.has(bet.id) ? 'bg-[#1a2c38]' : ''}`} style={{ position: 'absolute', left: 0, right: 0, top: (virtualRange.start + i) * ROW_HEIGHT, height: ROW_HEIGHT, gridTemplateColumns: TABLE_GRID_COLS }} title="Klicken für Schein-Preview">
                                <div className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedBetIds.has(bet.id)} onChange={e => handleSelectBet(bet.id, e.target.checked)} className="cursor-pointer accent-[#00e701]" /></div>
                                <div className="p-3 whitespace-nowrap font-mono text-xs">{formatDate(bet.createdAt)}</div>
                                <div className="p-3 flex flex-col gap-1 min-w-0">
                                    {bet.outcomes?.length > 0 && (
                                        <>
                                            <span className="text-white font-bold text-xs truncate max-w-[200px]" title={bet.outcomes[0]?.fixture?.name}>{bet.outcomes[0]?.fixture?.name || 'Unknown'}</span>
                                            <span className="text-[#00e701] text-[11px] truncate max-w-[200px]">{bet.outcomes[0]?.outcome?.name || ''} <span className="text-[#55657e]">({bet.outcomes[0]?.market?.name})</span></span>
                                            {bet.outcomes[0]?.fixture?.eventStatus?.matchStatus === 'live' && <span className="text-[10px] text-[#ff4d4d] animate-pulse font-bold">LIVE {bet.outcomes[0]?.fixture?.eventStatus?.homeScore}-{bet.outcomes[0]?.fixture?.eventStatus?.awayScore}</span>}
                                        </>
                                    )}
                                    {bet.outcomes && bet.outcomes.length > 1 && <span className="text-[10px] italic">+ {bet.outcomes.length - 1} more</span>}
                                </div>
                                <div className="p-3 font-mono text-xs">{calculateOpenLegs(bet)}</div>
                                <div className="p-3 font-mono text-white">{(bet.potentialMultiplier || bet.payoutMultiplier || 0).toFixed(2)}x</div>
                                <div className="p-3 font-mono text-white">{formatCurrency(bet.amount, bet.currency)}</div>
                                <div className="p-3 font-mono text-[#00e701]">{getCashoutValue(bet) > 0 ? formatCurrency(getCashoutValue(bet), bet.currency) : '-'}</div>
                                <div className="p-3 font-mono text-[#b1bad3]">{formatCurrency((bet.payout && bet.payout > 0) ? bet.payout : (bet.amount * (bet.potentialMultiplier || bet.payoutMultiplier || 0)), bet.currency)}</div>
                                <div className="p-3">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${bet.status === 'active' ? 'bg-[#1475e1]/10 text-[#1475e1] border-[#1475e1]/30' : bet.status === 'won' ? 'bg-[#00e701]/10 text-[#00e701] border-[#00e701]/30' : bet.status === 'lost' ? 'bg-[#ff4d4d]/10 text-[#ff4d4d] border-[#ff4d4d]/30' : 'bg-[#2f4553] text-[#b1bad3] border-transparent'}`}>{bet.status}</span>
                                </div>
                                <div className="p-3 text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => copyLink(bet.id, bet.bet?.iid || bet.iid)} className="p-1.5 bg-[#2f4553] hover:bg-[#3d5566] rounded border min-w-[28px]" title="Copy Bet Link">{copiedId === bet.id ? <span className="text-[#00e701]">✓</span> : '⎘'}</button>
                                    {activeTab === 'active' && bet.status === 'active' && !bet.cashoutDisabled && bet.cashoutMultiplier && (
                                        <button onClick={() => handleCashout(bet.id, bet.cashoutMultiplier)} className="bg-[#2f4553] hover:bg-[#3d5566] text-white text-xs px-3 py-1.5 rounded border">Cashout</button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
            <table className="w-full text-left border-collapse">
            <thead className="bg-[#1a2c38] sticky top-0 z-10 text-xs font-bold text-[#b1bad3] uppercase tracking-wider shadow-sm select-none">
              <tr>
                <th className="p-3 border-b border-[#2f4553] w-10">
                    <input 
                        type="checkbox" 
                        className="cursor-pointer accent-[#00e701]"
                        checked={activeBets.length > 0 && selectedBetIds.size === activeBets.length}
                        onChange={e => handleSelectAll(e.target.checked)}
                    />
                </th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('createdAt')}>
                    Time {sortField === 'createdAt' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553]">Fixture / Selection</th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('openLegs')}>
                    Legs {sortField === 'openLegs' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('payoutMultiplier')}>
                    Odds {sortField === 'payoutMultiplier' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('amount')}>
                    Stake {sortField === 'amount' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('cashoutMultiplier')}>
                    Cashout {sortField === 'cashoutMultiplier' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('payout')}>
                    Potential {sortField === 'payout' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('status')}>
                    Status {sortField === 'status' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2f4553]">
              {sortedBets.map((bet) => (
                <tr key={bet.id} role="button" tabIndex={0} onClick={() => setPreviewBet(bet)} onKeyDown={(e) => e.key === 'Enter' && setPreviewBet(bet)} className={`hover:bg-[#1a2c38]/50 transition-colors group text-sm text-[#b1bad3] cursor-pointer ${selectedBetIds.has(bet.id) ? 'bg-[#1a2c38]' : ''}`} title="Klicken für Schein-Preview">
                  {/* Checkbox */}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedBetIds.has(bet.id)}
                        onChange={e => handleSelectBet(bet.id, e.target.checked)}
                        className="cursor-pointer accent-[#00e701]"
                      />
                  </td>

                  {/* Time */}
                  <td className="p-3 whitespace-nowrap font-mono text-xs">
                    {formatDate(bet.createdAt)}
                  </td>
                  
                  {/* Fixture / Selection - First only + count */}
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      {bet.outcomes && bet.outcomes.length > 0 && (
                        <div className="flex flex-col mb-1 last:mb-0">
                           <span className="text-white font-bold text-xs truncate max-w-[200px]" title={bet.outcomes[0]?.fixture?.name}>
                             {bet.outcomes[0]?.fixture?.name || 'Unknown Fixture'}
                           </span>
                           <span className="text-[#00e701] text-[11px] truncate max-w-[200px]" title={`${bet.outcomes[0]?.outcome?.name} (${bet.outcomes[0]?.market?.name})`}>
                             {bet.outcomes[0]?.outcome?.name || 'Unknown Outcome'} <span className="text-[#55657e]">({bet.outcomes[0]?.market?.name || 'Unknown Market'})</span>
                           </span>
                           {/* Simple Match Status if Live */}
                           {bet.outcomes[0]?.fixture?.eventStatus?.matchStatus === 'live' && (
                             <span className="text-[10px] text-[#ff4d4d] animate-pulse font-bold">
                               LIVE {bet.outcomes[0]?.fixture?.eventStatus?.homeScore}-{bet.outcomes[0]?.fixture?.eventStatus?.awayScore}
                             </span>
                           )}
                        </div>
                      )}
                      {bet.outcomes && bet.outcomes.length > 1 && (
                          <span className="text-[10px] text-[#b1bad3] italic">
                              + {bet.outcomes.length - 1} more selection{bet.outcomes.length > 2 ? 's' : ''}
                          </span>
                      )}
                    </div>
                  </td>

                  {/* Legs Status */}
                  <td className="p-3 font-mono text-xs text-[#b1bad3]">
                      {calculateOpenLegs(bet)}
                  </td>

                  {/* Odds */}
                  <td className="p-3 font-mono text-white">
                    {(bet.potentialMultiplier || bet.payoutMultiplier || 0).toFixed(2)}x
                  </td>

                  {/* Stake */}
                  <td className="p-3 font-mono text-white">
                     {formatCurrency(bet.amount, bet.currency)}
                  </td>

                  {/* Cashout Value */}
                  <td className="p-3 font-mono text-[#00e701]">
                    {(() => {
                      const val = getCashoutValue(bet);
                      return val > 0 ? formatCurrency(val, bet.currency) : '-';
                    })()}
                  </td>

                  {/* Potential / Payout */}
                  <td className="p-3 font-mono text-[#b1bad3]">
                    {(() => {
                        // Potential Payout = Stake * Odds (potentialMultiplier)
                        // Or use 'payout' field if set (usually 0 for active bets).
                        // If 'potentialMultiplier' is present, use it.
                        
                        const odds = bet.potentialMultiplier || bet.payoutMultiplier || 0;
                        const stake = bet.amount || 0;
                        const potential = stake * odds;
                        
                        // Use the calculated potential if payout is 0 or null
                        const displayValue = (bet.payout && bet.payout > 0) ? bet.payout : potential;
                        
                        return formatCurrency(displayValue, bet.currency);
                    })()}
                  </td>

                  {/* Status */}
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                        bet.status === 'active' ? 'bg-[#1475e1]/10 text-[#1475e1] border-[#1475e1]/30' : 
                        bet.status === 'won' ? 'bg-[#00e701]/10 text-[#00e701] border-[#00e701]/30' : 
                        bet.status === 'lost' ? 'bg-[#ff4d4d]/10 text-[#ff4d4d] border-[#ff4d4d]/30' :
                        'bg-[#2f4553] text-[#b1bad3] border-transparent'
                    }`}>
                        {bet.status}
                    </span>
                    {activeTab === 'finished' && Array.isArray(bet.outcomes) && (() => {
                      const wrongLegs = bet.outcomes.filter((o: any) => o?.status === 'lost').length;
                      return wrongLegs === 1 ? (
                        <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-[#ffb347]/10 text-[#ffb347] border border-[#ffb347]/30">
                          1 wrong
                        </span>
                      ) : null;
                    })()}
                  </td>

                  {/* Action (Cashout / Link) */}
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                        {/* Link Button */}
                        <button
                            onClick={() => copyLink(bet.id, bet.bet?.iid || bet.iid)}
                            className="p-1.5 bg-[#2f4553] hover:bg-[#3d5566] text-[#b1bad3] hover:text-white rounded border border-[#2f4553] hover:border-[#b1bad3] transition-all min-w-[28px]"
                            title="Copy Bet Link"
                        >
                            {copiedId === bet.id ? (
                                <svg className="w-4 h-4 text-[#00e701]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            )}
                        </button>

                        {activeTab === 'active' && bet.status === 'active' && !bet.cashoutDisabled && bet.cashoutMultiplier && (
                            <button
                                onClick={() => handleCashout(bet.id, bet.cashoutMultiplier)}
                                className="bg-[#2f4553] hover:bg-[#3d5566] text-white text-xs px-3 py-1.5 rounded border border-[#2f4553] hover:border-[#b1bad3] transition-all shadow-lg"
                            >
                                <div className="flex flex-col items-end">
                                    <span className="font-bold">Cashout</span>
                                    <span className="text-[10px] text-[#00e701] font-mono">
                                        {formatCurrency(bet.amount * bet.cashoutMultiplier, bet.currency)}
                                    </span>
                                </div>
                            </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
              
              {(activeTab === 'active' ? activeBets.length : finishedBets.length) === 0 && !(activeTab === 'active' ? isLoadingActive : isLoadingFinished) && (
                 <tr>
                    <td colSpan={9} className="p-8 text-center text-[#55657e]">
                        <div className="flex flex-col items-center">
                            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                            <span className="font-bold uppercase tracking-wide">{activeTab === 'active' ? 'No active bets found' : 'No finished bets found'}</span>
                        </div>
                    </td>
                 </tr>
              )}
            </tbody>
          </table>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#2f4553] bg-[#1a2c38] flex justify-between items-center text-xs text-[#b1bad3]">
            <span>{activeTab === 'active' ? `Total Active: ${activeBets.length}` : `Total Finished: ${finishedBets.length}`}</span>
        </div>
      </div>
    </div>
  );
}
