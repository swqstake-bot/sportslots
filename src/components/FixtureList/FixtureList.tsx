import { useBetSlipStore } from '../../store/betSlipStore';
import type { Outcome } from '../../store/betSlipStore';
import { useLiveFixtures } from '../../hooks/useLiveFixtures';
import { useState } from 'react';
import { FixtureCard } from './FixtureCard';

interface FixtureListProps {
  sportSlug: string;
}

export function FixtureList({ sportSlug }: FixtureListProps) {
  const isSpecialCategory = sportSlug === 'live' || sportSlug === 'upcoming';
  const [filterType, setFilterType] = useState<'live' | 'upcoming'>('upcoming');
  const effectiveType = isSpecialCategory ? (sportSlug as 'live' | 'upcoming') : filterType;

  const { fixtures, loading, error } = useLiveFixtures(sportSlug, {
    pollingInterval: 5000,
    enabled: true,
    type: effectiveType,
  });

  const { addOutcome, outcomes } = useBetSlipStore();

  const handleOutcomeClick = (outcome: any, marketName: string, fixture: any) => {
    const outcomeData: Outcome = {
      id: outcome.id,
      odds: outcome.odds,
      name: outcome.name || marketName,
      marketName: marketName,
      fixtureName: fixture.name,
      fixtureId: fixture.id,
    };
    addOutcome(outcomeData);
  };

  const isSelected = (outcomeId: string) => outcomes.some((o) => o.id === outcomeId);
  const isLive = effectiveType === 'live';
  const displayTitle =
    isSpecialCategory ? (sportSlug === 'live' ? 'Live' : 'Starting Soon') : sportSlug.replace(/-/g, ' ');

  if (loading && fixtures.length === 0)
    return (
      <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-64px)] bg-stake-bg-deep">
        <div className="text-stake-text-muted animate-pulse flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-stake-success border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium tracking-wide">Loading {displayTitle}…</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-64px)] bg-stake-bg-deep">
        <div className="bg-stake-error/10 text-stake-error px-6 py-4 rounded-xl border border-stake-error/20 flex items-center gap-3">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Error: {error.message}</span>
        </div>
      </div>
    );

  if (!fixtures.length)
    return (
      <div className="flex-1 p-8 flex flex-col h-[calc(100vh-64px)] bg-stake-bg-deep">
        <div className="flex justify-between items-center w-full max-w-4xl mx-auto mb-6">
          <h2 className="text-xl font-bold capitalize text-white flex items-center gap-3 font-mono">
            <span className="w-1.5 h-6 bg-stake-success rounded-sm shadow-[0_0_10px_rgba(0,231,1,0.5)]" />
            {displayTitle}
          </h2>
          {!isSpecialCategory && (
            <div className="flex bg-stake-bg-deep p-1 rounded-full border border-stake-border">
              <button
                onClick={() => setFilterType('live')}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterType === 'live' ? 'bg-stake-bg-card text-white' : 'text-stake-text-muted hover:text-white'}`}
              >
                Live
              </button>
              <button
                onClick={() => setFilterType('upcoming')}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${filterType === 'upcoming' ? 'bg-stake-bg-card text-white' : 'text-stake-text-muted hover:text-white'}`}
              >
                Upcoming
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-stake-text-dim">
          <svg className="w-12 h-12 opacity-50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="font-medium">No fixtures for {displayTitle}</span>
        </div>
      </div>
    );

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-64px)] bg-stake-bg-deep scrollbar-thin scrollbar-thumb-stake-border scrollbar-track-transparent">
      <div className="sticky top-0 z-10 bg-stake-bg-deep/95 backdrop-blur border-b border-stake-border px-4 md:px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold capitalize text-white flex items-center gap-3 font-mono">
            <span className="w-2 h-7 md:h-8 bg-stake-success rounded-sm shadow-[0_0_10px_rgba(0,231,1,0.5)]" />
            {displayTitle}
          </h2>
          {!isSpecialCategory ? (
            <div className="flex bg-stake-bg-deep p-1.5 rounded-full border border-stake-border">
              <button
                onClick={() => setFilterType('live')}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${filterType === 'live' ? 'bg-stake-bg-card text-white shadow-sm' : 'text-stake-text-muted hover:text-white'}`}
              >
                Live
              </button>
              <button
                onClick={() => setFilterType('upcoming')}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${filterType === 'upcoming' ? 'bg-stake-bg-card text-white shadow-sm' : 'text-stake-text-muted hover:text-white'}`}
              >
                Upcoming
              </button>
            </div>
          ) : (
            isLive && (
              <div className="flex items-center gap-2 bg-stake-bg-card px-3 py-1.5 rounded-full border border-stake-border">
                <span className="h-2 w-2 rounded-full bg-stake-error animate-pulse shadow-[0_0_5px_rgba(255,77,77,0.6)]" />
                <span className="text-xs text-stake-error uppercase font-bold tracking-wider">Live</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Grid – keine endlose Liste, klare Karten-Übersicht */}
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
          {fixtures.map((fixture, index) => {
            if (!fixture.groups?.length) return null;
            const mainMarket = fixture.groups?.[0]?.templates?.[0]?.markets?.[0];
            if (!mainMarket) return null;
            return (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                sportSlug={sportSlug}
                mainMarket={mainMarket}
                isSelected={isSelected}
                onOutcomeClick={handleOutcomeClick}
                index={index}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
