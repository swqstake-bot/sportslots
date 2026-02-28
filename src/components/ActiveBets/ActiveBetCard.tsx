import React from 'react';
import { BetGraph } from './BetGraph';
import { MatchTracker } from './MatchTracker';
import { getEffectiveOdds } from '../../services/cashoutService';

interface ActiveBetCardProps {
  bet: any;
  onCashout: (betId: string, multiplier: number) => void;
}

export function ActiveBetCard({ bet, onCashout }: ActiveBetCardProps) {
  const [isCashingOut, setIsCashingOut] = React.useState(false);

  const formatCurrency = (amount: number, currency: string) => {
    return `${amount.toFixed(8)} ${currency.toUpperCase()}`;
  };

  const handleCashoutClick = async () => {
    setIsCashingOut(true);
    try {
        await onCashout(bet.id, bet.cashoutMultiplier);
    } finally {
        setIsCashingOut(false);
    }
  };

  return (
    <div className="bg-[#1a2c38] p-3 rounded-lg border border-[#2f4553] hover:border-[#b1bad3] transition-colors mb-2 shadow-lg group relative overflow-hidden">
      {/* Background Gradient for Active State */}
      {bet.status === 'active' && (
         <div className="absolute top-0 left-0 w-1 h-full bg-[#00e701]"></div>
      )}

      {/* Header: Amount & Potential Payout */}
      <div className="flex justify-between items-center mb-2 pl-2">
        <div>
          <span className="text-white font-bold text-sm block font-mono">
            {formatCurrency(bet.amount, bet.currency)}
          </span>
          <div className="flex items-center gap-1 text-[#b1bad3] text-[10px] uppercase tracking-wider font-bold">
            <span>Potential:</span>
            <span className="text-[#00e701] font-mono text-xs">{formatCurrency(bet.payout, bet.currency)}</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border ${
            bet.status === 'active' ? 'bg-[#1475e1]/10 text-[#1475e1] border-[#1475e1]/30' : 
            bet.status === 'won' ? 'bg-[#00e701]/10 text-[#00e701] border-[#00e701]/30' : 
            bet.status === 'lost' ? 'bg-[#ff4d4d]/10 text-[#ff4d4d] border-[#ff4d4d]/30' :
            'bg-[#2f4553] text-[#b1bad3] border-transparent'
          }`}>
            {bet.status}
          </span>
        </div>
      </div>

      {/* Outcomes List with Trackers */}
      <div className="space-y-3 mb-2 border-t border-[#2f4553] pt-2 pl-2">
        {bet.outcomes.map((o: any, i: number) => (
          <div key={i} className="flex flex-col">
            {/* Show Match Tracker if available */}
            {o.fixture?.eventStatus && (
              <MatchTracker fixture={o.fixture} />
            )}
            
            {/* Outcome Details */}
            <div className="flex justify-between items-center text-xs text-[#b1bad3] px-1">
              <span className="truncate flex-1 font-medium text-white group-hover:text-[#00e701] transition-colors" title={o.outcome.name}>
                 {o.outcome.name}
              </span>
              <span className="text-[#00e701] ml-2 font-mono bg-[#0f212e] px-1.5 py-0.5 rounded border border-[#2f4553]">
                {(o.odds ?? o.outcome?.odds ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="text-[10px] text-[#8899a6] px-1 truncate mt-0.5">
                {o.market.name} • {o.fixture.name}
            </div>
          </div>
        ))}
      </div>

      {/* Cashout Button with "Graph" style progress */}
      {bet.status === 'active' && !bet.cashoutDisabled && bet.cashoutMultiplier && (
        <div className="mt-3 border-t border-[#2f4553] pt-3 pl-2">
          {/* Bet Graph Visualization */}
          <div className="mb-2 h-16 w-full bg-[#0f212e] rounded overflow-hidden border border-[#2f4553] relative shadow-inner group-hover:border-[#b1bad3] transition-colors">
             <div className="absolute top-1 left-2 text-[9px] font-bold text-[#55657e] z-10 font-mono uppercase tracking-wider">
               Multiplier Performance
             </div>
             <BetGraph 
               currentValue={bet.cashoutMultiplier} 
               maxValue={getEffectiveOdds(bet)}
               label=""
               color={bet.cashoutMultiplier > 1 ? '#00e701' : '#ffd700'} 
               height={64}
             />
          </div>

          <button 
            onClick={handleCashoutClick}
            disabled={isCashingOut}
            className={`w-full bg-[#2f4553] hover:bg-[#3d5566] text-white text-xs rounded overflow-hidden relative group transition-all h-11 shadow-lg border border-transparent hover:border-[#b1bad3] ${isCashingOut ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
             {/* Cashout Value Progress Bar (Visualizing value vs potential) */}
             <div 
                className="absolute top-0 left-0 h-full bg-[#00e701] opacity-10 transition-all duration-500 group-hover:opacity-20"
                style={{ width: `${Math.min(100, (bet.cashoutMultiplier / (getEffectiveOdds(bet) || 1)) * 100)}%` }}
             />
             
             <div className="relative z-10 flex justify-between items-center px-3 h-full w-full">
                <span className="font-bold text-[#b1bad3] group-hover:text-white transition-colors uppercase tracking-wider text-[10px]">
                    {isCashingOut ? 'Cashing Out...' : 'Cashout'}
                </span>
                <div className="flex flex-col items-end justify-center leading-tight">
                    {isCashingOut ? (
                        <div className="h-4 w-4 border-2 border-[#00e701] border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-white group-hover:text-[#00e701] transition-colors text-sm">
                                {formatCurrency(bet.amount * bet.cashoutMultiplier, bet.currency)}
                                </span>
                            </div>
                            <span className="text-[10px] text-[#00e701] font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                                {bet.cashoutMultiplier.toFixed(2)}x
                            </span>
                        </>
                    )}
                </div>
             </div>
          </button>
        </div>
      )}
    </div>
  );
}
