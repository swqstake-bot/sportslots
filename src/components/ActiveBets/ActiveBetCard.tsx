import React from 'react';
import { BetGraph } from './BetGraph';

interface ActiveBetCardProps {
  bet: any;
  onCashout: (betId: string, multiplier: number) => void;
}

// Sub-component for individual match visualization
const MatchTracker = ({ fixture }: { fixture: any }) => {
  const eventStatus = fixture?.eventStatus;
  const matchData = fixture?.data;
  const competitors = matchData?.competitors || [];

  if (!eventStatus) return null;

  // Calculate progress for match time (rough estimate)
  const getMatchProgress = (clock: any) => {
    if (!clock || !clock.matchTime) return 0;
    const timeStr = String(clock.matchTime).split('+')[0];
    const time = parseInt(timeStr, 10) || 0;
    // Assume 90 mins for soccer, but could be different per sport
    return Math.min(100, (time / 90) * 100);
  };

  const homeScore = eventStatus?.homeScore ?? '-';
  const awayScore = eventStatus?.awayScore ?? '-';
  const displayTime = eventStatus?.clock?.matchTime ?? eventStatus?.matchStatus ?? 'Upcoming';

  return (
    <div className="mb-2 bg-[#0f212e] rounded p-2 border border-[#2f4553] relative overflow-hidden shadow-inner">
      {/* Match Clock Progress Bar Background */}
      {eventStatus.clock && (
        <div 
          className="absolute top-0 left-0 h-full bg-[#1475e1] opacity-5 transition-all duration-1000" 
          style={{ width: `${getMatchProgress(eventStatus.clock)}%` }}
        />
      )}
      
      <div className="relative z-10 flex justify-between items-center text-xs">
        {/* Home Team */}
        <div className="flex-1 text-left truncate font-bold text-white pr-2">
          {competitors[0]?.name || fixture.name.split(' vs ')[0] || 'Home'}
        </div>

        {/* Score */}
        <div className="flex flex-col items-center">
          <div className="px-2 font-mono font-bold text-white bg-[#1a2c38] rounded mx-1 min-w-[3rem] text-center border border-[#2f4553] shadow-sm flex items-center justify-center gap-1">
            <span>{homeScore}</span>
            <span className="text-[#b1bad3] text-[10px]">-</span>
            <span>{awayScore}</span>
          </div>
          {/* Game Score (Tennis/Volleyball) */}
          {(eventStatus.homeGameScore || eventStatus.awayGameScore) && (
            <div className="text-[9px] text-[#ffd700] font-mono mt-0.5">
              {eventStatus.homeGameScore}-{eventStatus.awayGameScore}
            </div>
          )}
        </div>

        {/* Away Team */}
        <div className="flex-1 text-right truncate font-bold text-white pl-2">
           {competitors[1]?.name || fixture.name.split(' vs ')[1] || 'Away'}
        </div>
      </div>

      {/* Additional Stats / Period Scores */}
      <div className="relative z-10 flex justify-center items-center space-x-3 mt-1.5 text-[9px] text-[#55657e]">
        {/* Period Scores */}
        {eventStatus.periodScores && eventStatus.periodScores.length > 0 && (
          <div className="flex space-x-1 font-mono">
            {eventStatus.periodScores.map((p: any, idx: number) => (
              <span key={idx} className={p.matchStatus === 'current' ? 'text-white font-bold' : ''}>
                {p.homeScore}-{p.awayScore}
              </span>
            ))}
          </div>
        )}
        
        {/* Stats (Cards/Corners) */}
        {eventStatus.statistic && (
          <div className="flex space-x-2 border-l border-[#2f4553] pl-2 items-center">
            {/* Yellow Cards */}
            {(eventStatus.statistic.yellowCards?.home > 0 || eventStatus.statistic.yellowCards?.away > 0) && (
              <span className="text-[#ffd700] flex items-center gap-0.5" title="Yellow Cards">
                <span className="w-1.5 h-2 bg-[#ffd700] rounded-[1px]"></span>
                <span>{eventStatus.statistic.yellowCards?.home || 0}-{eventStatus.statistic.yellowCards?.away || 0}</span>
              </span>
            )}
            {/* Red Cards */}
            {(eventStatus.statistic.redCards?.home > 0 || eventStatus.statistic.redCards?.away > 0) && (
              <span className="text-[#ff4d4d] flex items-center gap-0.5" title="Red Cards">
                <span className="w-1.5 h-2 bg-[#ff4d4d] rounded-[1px]"></span>
                <span>{eventStatus.statistic.redCards?.home || 0}-{eventStatus.statistic.redCards?.away || 0}</span>
              </span>
            )}
            {/* Corners */}
            {(eventStatus.statistic.corners?.home > 0 || eventStatus.statistic.corners?.away > 0) && (
              <span className="text-[#b1bad3] flex items-center gap-0.5" title="Corners">
                <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M4 2v18h2v-8h10l-4-5 4-5H6V2H4z"/></svg>
                <span>{eventStatus.statistic.corners?.home || 0}-{eventStatus.statistic.corners?.away || 0}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Time */}
      <div className="relative z-10 text-center text-[9px] text-[#55657e] mt-1 font-mono uppercase tracking-wider font-bold">
        {eventStatus.matchStatus === 'live' || eventStatus.clock ? (
          <span className="text-[#00e701] animate-pulse flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e701]"></span>
            {displayTime}'
          </span>
        ) : (
          <span>{displayTime}</span>
        )}
      </div>
    </div>
  );
};

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
               maxValue={bet.potentialMultiplier}
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
                style={{ width: `${Math.min(100, (bet.cashoutMultiplier / bet.potentialMultiplier) * 100)}%` }}
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
