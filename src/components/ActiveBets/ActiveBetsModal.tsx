import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '../../store/userStore';
import type { SportBet } from '../../store/userStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { formatAmount } from '../Casino/utils/formatAmount';

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

  // New: Fetch all bets function
  const fetchActiveBets = useCallback(async () => {
    if (!userName) {
        console.error("No user found in store");
        return;
    }
    
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
          }
        } else {
          keepFetching = false;
        }
      }
      
      // Update state once with all bets
      // Deduplicate just in case
      const uniqueBets = Array.from(new Map(allFetchedBets.map(item => [item.id, item])).values());
      setActiveBets(uniqueBets);

    } catch (err) {
      console.error("Error fetching all active bets:", err);
    } finally {
      setIsLoadingActive(false);
    }
  }, [userName, isLoadingActive]);

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
  }, [userName, isLoadingFinished]);

  // Initial load - now calls fetchAllBets instead of paginated fetch
  useEffect(() => {
    fetchActiveBets();
    fetchFinishedBets();
  }, [fetchActiveBets, fetchFinishedBets]);

  // Refresh interval (optional, every 60s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchActiveBets();
      fetchFinishedBets();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchActiveBets, fetchFinishedBets]);

  const handleCashout = async (betId: string, multiplier: number) => {
    try {
      const result = await StakeApi.mutate(Queries.CashoutSportBet, {
        betId,
        multiplier
      });
      if (result.data?.cashoutSportBet) {
        // Remove from list or mark as cashed out
        setBets(prev => prev.filter(b => b.id !== betId));
      }
    } catch (err) {
      console.error("Cashout failed", err);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${formatAmount(amount, currency)} ${(currency || 'UNK').toUpperCase()}`;
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

  const getCashoutValue = (bet: SportBet) => {
    if (bet.status !== 'active' || bet.cashoutDisabled || !bet.cashoutMultiplier) return 0;
    return bet.amount * bet.cashoutMultiplier;
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
    
    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
        setCopiedId(betId);
        setTimeout(() => setCopiedId(null), 2000);
    }).catch(err => {
        console.error("Failed to copy link", err);
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

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm">
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
        <div className="flex-1 overflow-auto bg-[#0f212e] scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
            {(activeTab === 'active' ? isLoadingActive : isLoadingFinished) && (activeTab === 'active' ? activeBets.length : finishedBets.length) === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-[#b1bad3]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00e701]"></div>
                    <p className="animate-pulse">{activeTab === 'active' ? 'Loading all active bets...' : 'Loading finished bets...'}</p>
                </div>
            ) : (
            <table className="w-full text-left border-collapse">
            <thead className="bg-[#1a2c38] sticky top-0 z-10 text-xs font-bold text-[#b1bad3] uppercase tracking-wider shadow-sm select-none">
              <tr>
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
                <th className="p-3 border-b border-[#2f4553] cursor-pointer hover:text-white" onClick={() => handleSort('payout')}>
                    Potential {sortField === 'payout' && <span className="text-[#00e701]">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th className="p-3 border-b border-[#2f4553]">Status</th>
                <th className="p-3 border-b border-[#2f4553] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2f4553]">
              {sortedBets.map((bet) => (
                <tr key={bet.id} className="hover:bg-[#1a2c38]/50 transition-colors group text-sm text-[#b1bad3]">
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
                    {getCashoutValue(bet) > 0 ? formatCurrency(getCashoutValue(bet), bet.currency) : '-'}
                  </td>

                  {/* Potential */}
                  <td className="p-3 font-mono text-[#b1bad3]">
                    {formatCurrency(bet.payout, bet.currency)}
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
                  <td className="p-3 text-right">
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
          )}
        </div>

        <div className="p-4 border-t border-[#2f4553] bg-[#1a2c38] flex justify-between items-center text-xs text-[#b1bad3]">
            <span>{activeTab === 'active' ? `Total Active: ${activeBets.length}` : `Total Finished: ${finishedBets.length}`}</span>
        </div>
      </div>
    </div>
  );
}
