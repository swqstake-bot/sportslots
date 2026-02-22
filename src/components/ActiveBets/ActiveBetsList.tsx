import React from 'react';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { ActiveBetCard } from './ActiveBetCard';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';

export const ActiveBetsList: React.FC = () => {
  const { activeBets, setActiveBets } = useUserStore();
  const { toggleActiveBetsModal } = useUiStore();

  const handleCashout = async (betId: string, multiplier: number) => {
    // In a real app, we might show a custom modal. For now, we'll skip the native confirm 
    // to keep the flow smooth, or use a very subtle indicator. 
    // Given the user's preference for autonomy, we'll assume the user knows what they are doing 
    // when clicking the button (which usually has a confirmation state in the button itself).
    // The ActiveBetCard might handle the "confirm" state internally (e.g. "Confirm Cashout").
    // If ActiveBetCard emits 'onCashout', we assume it's confirmed.
    
    try {
      const result = await StakeApi.mutate(Queries.CashoutSportBet, {
        betId,
        multiplier
      });
      if (result.data?.cashoutSportBet) {
        setActiveBets(activeBets.filter(b => b.id !== betId));
      }
    } catch (err) {
      console.error("Cashout failed", err);
    }
  };

  if (!activeBets) return null;

  return (
    <div className="flex flex-col h-full bg-[#0f212e] overflow-hidden">
      {/* View All Button */}
      <div className="p-2 border-b border-[#2f4553] bg-[#1a2c38]">
        <button 
          onClick={toggleActiveBetsModal}
          className="w-full bg-[#0f212e] hover:bg-[#2f4553] text-[#b1bad3] hover:text-white border border-[#2f4553] rounded py-1.5 px-3 text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
          Open Full Window
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0 scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
        {activeBets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#b1bad3] opacity-60">
            <svg className="w-16 h-16 mb-4 text-[#2f4553]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            <span className="text-sm font-bold uppercase tracking-wide">No Active Bets</span>
            <span className="text-xs mt-1">Your active bets will appear here.</span>
          </div>
        ) : (
          activeBets.map(bet => (
            <ActiveBetCard 
              key={bet.id} 
              bet={bet} 
              onCashout={handleCashout} 
            />
          ))
        )}
      </div>
    </div>
  );
};
