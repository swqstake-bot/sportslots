import { useBetSlipStore } from '../store/betSlipStore';
import type { Outcome } from '../store/betSlipStore';
import { useLiveFixtures, type Fixture } from '../hooks/useLiveFixtures';
import { useState } from 'react';

interface FixtureListProps {
  sportSlug: string;
}

export function FixtureList({ sportSlug }: FixtureListProps) {
  const isSpecialCategory = sportSlug === 'live' || sportSlug === 'upcoming';
  // Default to upcoming for non-special categories if not specified
  const [filterType, setFilterType] = useState<'live' | 'upcoming'>('upcoming');
  
  // Determine effective type: if special category, use it; otherwise use local filter
  const effectiveType = isSpecialCategory ? (sportSlug as 'live' | 'upcoming') : filterType;

  const { fixtures, loading, error } = useLiveFixtures(sportSlug, { 
    pollingInterval: 5000, // 5 seconds polling for "live" feel
    enabled: true,
    type: effectiveType
  });
  
  const { addOutcome, outcomes } = useBetSlipStore();

  const handleOutcomeClick = (outcome: any, marketName: string, fixture: Fixture) => {
    const outcomeData: Outcome = {
      id: outcome.id,
      odds: outcome.odds,
      name: outcome.name || marketName,
      marketName: marketName,
      fixtureName: fixture.name,
      fixtureId: fixture.id
    };
    addOutcome(outcomeData);
  };

  const isSelected = (outcomeId: string) => outcomes.some(o => o.id === outcomeId);
  const isLive = effectiveType === 'live';
  const displayTitle = isSpecialCategory ? (sportSlug === 'live' ? 'Live Events' : 'Starting Soon') : sportSlug.replace('-', ' ');

    if (loading && fixtures.length === 0) return (
      <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-64px)] bg-[#0f212e]">
          <div className="text-[#b1bad3] animate-pulse flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-[#00e701] border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium tracking-wide">Loading {displayTitle}...</span>
          </div>
      </div>
    );

    if (error) return (
        <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-64px)] bg-[#0f212e]">
            <div className="bg-[#ff4d4d]/10 text-[#ff4d4d] px-6 py-4 rounded-lg border border-[#ff4d4d]/20 flex items-center gap-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <span>Error loading fixtures: {error.message}</span>
            </div>
        </div>
    );

    if (!fixtures.length) return (
        <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-64px)] bg-[#0f212e]">
             <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
                {/* Header even if empty, to allow switching back */}
                <div className="flex justify-between items-center w-full mb-8">
                     <h2 className="text-xl font-bold capitalize text-white flex items-center gap-3 font-mono">
                        <span className="w-1.5 h-6 bg-[#00e701] rounded-sm shadow-[0_0_10px_#00e701]"></span>
                        {displayTitle}
                    </h2>
                    {!isSpecialCategory && (
                        <div className="flex bg-[#0f212e] p-1 rounded-full border border-[#2f4553]">
                            <button 
                                onClick={() => setFilterType('live')}
                                className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterType === 'live' ? 'bg-[#1a2c38] text-white shadow-sm' : 'text-[#b1bad3] hover:text-white'}`}
                            >
                                Live
                            </button>
                            <button 
                                onClick={() => setFilterType('upcoming')}
                                className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterType === 'upcoming' ? 'bg-[#1a2c38] text-white shadow-sm' : 'text-[#b1bad3] hover:text-white'}`}
                            >
                                Upcoming
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="text-[#55657e] flex flex-col items-center gap-2 mt-12">
                    <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    <span className="font-medium">No fixtures found for {displayTitle} ({effectiveType})</span>
                </div>
             </div>
        </div>
    );

  return (
    <div className="flex-1 p-10 overflow-y-auto h-[calc(100vh-64px)] bg-[#0f212e] scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
      <div className="flex justify-between items-center mb-10">
        <h2 className="text-3xl font-bold capitalize text-white flex items-center gap-5 font-mono">
            <span className="w-2.5 h-10 bg-[#00e701] rounded-sm shadow-[0_0_10px_#00e701]"></span>
            {displayTitle}
        </h2>
        
        {/* Toggle for specific sports */}
        {!isSpecialCategory ? (
            <div className="flex bg-[#0f212e] p-2 rounded-full border border-[#2f4553]">
                <button 
                    onClick={() => setFilterType('live')}
                    className={`px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${filterType === 'live' ? 'bg-[#1a2c38] text-white shadow-sm' : 'text-[#b1bad3] hover:text-white'}`}
                >
                    Live
                </button>
                <button 
                    onClick={() => setFilterType('upcoming')}
                    className={`px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider transition-all ${filterType === 'upcoming' ? 'bg-[#1a2c38] text-white shadow-sm' : 'text-[#b1bad3] hover:text-white'}`}
                >
                    Upcoming
                </button>
            </div>
        ) : (
            isLive && (
                <div className="flex items-center gap-3 bg-[#1a2c38] px-4 py-2 rounded-full border border-[#2f4553] shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-[#00e701] animate-pulse shadow-[0_0_5px_#00e701]"></span>
                <span className="text-xs text-[#00e701] uppercase font-bold tracking-wider">Live</span>
                </div>
            )
        )}
      </div>

      <div className="space-y-2">
        {fixtures.map(fixture => {
          // Safety check for empty groups/markets
          if (!fixture.groups || fixture.groups.length === 0) return null;
          
          const mainMarket = fixture.groups?.[0]?.templates?.[0]?.markets?.[0];
          
          return (
            <div key={fixture.id} className="bg-[#1a2c38] hover:bg-[#213743] transition-colors p-6 flex items-center gap-6 group relative border-b border-[#0f212e] last:border-0 rounded-[8px]">
               {/* Live Indicator Strip */}
               {fixture.eventStatus?.matchStatus === 'live' && (
                  <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-[#ff4d4d]"></div>
               )}

              <div className="flex flex-col items-center w-24 shrink-0">
                  {fixture.eventStatus?.matchStatus === 'live' ? (
                        <div className="flex flex-col items-center text-[#ff4d4d]">
                            <span className="text-sm font-bold animate-pulse">LIVE</span>
                            <span className="text-base font-mono">{fixture.eventStatus.clock?.matchTime ? `${fixture.eventStatus.clock.matchTime}'` : ''}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center text-[#b1bad3]">
                            <span className="text-base font-mono font-bold text-white">{new Date(fixture.data.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            <span className="text-sm opacity-70">{new Date(fixture.data.startTime).toLocaleDateString([], {month: 'short', day: 'numeric'})}</span>
                        </div>
                    )}
              </div>

              <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-xl text-white truncate group-hover:text-[#00e701] transition-colors" title={fixture.name}>
                          {fixture.name}
                      </h3>
                  </div>
                  <div className="text-sm text-[#b1bad3] font-medium uppercase tracking-wider flex items-center gap-3">
                    {fixture.sport?.name || sportSlug}
                    {fixture.eventStatus?.homeScore !== undefined && (
                        <span className="text-white font-mono bg-[#0f212e] px-3 py-0.5 rounded ml-2">
                            {fixture.eventStatus.homeScore} - {fixture.eventStatus.awayScore}
                        </span>
                    )}
                  </div>
              </div>

              {/* Markets Grid */}
              {mainMarket && (
                <div className="flex items-center gap-3 shrink-0">
                  {mainMarket.outcomes.slice(0, 3).map((outcome: any) => { // Limit to 3 outcomes (1x2)
                      // Fix: Handle null outcome names by inferring from position or market
                      let outcomeName = outcome.name;
                      if (!outcomeName) {
                          if (outcome.id.includes('home') || outcome.id.includes('1')) outcomeName = '1';
                          else if (outcome.id.includes('draw') || outcome.id.includes('x')) outcomeName = 'X';
                          else if (outcome.id.includes('away') || outcome.id.includes('2')) outcomeName = '2';
                          else outcomeName = '-';
                      }
                      
                      const selected = isSelected(outcome.id);
                      
                      return (
                        <button
                        key={outcome.id}
                        onClick={() => handleOutcomeClick(outcome, mainMarket.name, fixture)}
                        className={`w-[90px] h-[54px] rounded-[8px] flex flex-col items-center justify-center transition-all relative overflow-hidden group/btn ${
                            selected 
                            ? 'bg-[#2f4553] text-white shadow-[inset_0_0_0_2px_#00e701]' 
                            : 'bg-[#2f4553] hover:bg-[#3d5566] text-white'
                        }`}
                        >
                        <span className={`text-xs font-bold opacity-60 leading-none mb-1.5 group-hover/btn:text-white transition-colors ${selected ? 'text-white' : 'text-[#b1bad3]'}`}>
                            {outcomeName}
                        </span>
                        <span className={`font-mono font-bold text-[16px] leading-none ${selected ? 'text-[#00e701]' : 'text-white'}`}>
                            {outcome.odds.toFixed(2)}
                        </span>
                        </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
