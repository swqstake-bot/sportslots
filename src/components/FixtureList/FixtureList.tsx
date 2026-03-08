import { useMemo } from 'react';
import { useBetSlipStore } from '../../store/betSlipStore';
import type { Outcome } from '../../store/betSlipStore';
import { useLiveFixtures } from '../../hooks/useLiveFixtures';
import { useUiStore } from '../../store/uiStore';
import { FixtureCard } from './FixtureCard';

interface FixtureListProps {
  sportSlug: string;
}

export function FixtureList({ sportSlug }: FixtureListProps) {
  const isSpecialCategory = sportSlug === 'live' || sportSlug === 'upcoming';
  const { sportFilterType, setSportFilterType, fixtureSearchQuery } = useUiStore();
  const effectiveType = isSpecialCategory ? (sportSlug as 'live' | 'upcoming') : sportFilterType;

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

  const filteredFixtures = useMemo(() => {
    const q = (fixtureSearchQuery || '').trim().toLowerCase();
    if (!q) return fixtures;
    return fixtures.filter((f) => (f.name || '').toLowerCase().includes(q));
  }, [fixtures, fixtureSearchQuery]);

  const displayTitle =
    isSpecialCategory ? (sportSlug === 'live' ? 'Live' : 'Starting Soon') : sportSlug.replace(/-/g, ' ');

  if (loading && fixtures.length === 0)
    return (
      <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-80px)]" style={{ background: 'var(--app-bg-deep)' }}>
        <div className="flex flex-col items-center gap-5" style={{ color: 'var(--app-text-muted)' }}>
          <div className="w-10 h-10 rounded-full animate-spin border-2" style={{ borderColor: 'var(--app-accent)', borderTopColor: 'transparent', boxShadow: '0 0 12px var(--app-accent-glow)' }} />
          <span className="text-sm font-semibold tracking-wide">Lade {displayTitle}…</span>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex-1 p-8 flex items-center justify-center h-[calc(100vh-80px)]" style={{ background: 'var(--app-bg-deep)' }}>
        <div className="px-6 py-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(255,51,102,0.1)', color: 'var(--app-error)', border: '1px solid rgba(255,51,102,0.3)' }}>
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Fehler: {error.message}</span>
        </div>
      </div>
    );

  if (!fixtures.length) {
    return (
      <div className="flex-1 p-8 flex flex-col h-[calc(100vh-80px)]" style={{ background: 'var(--app-bg-deep)' }}>
        <div className="flex justify-between items-center w-full max-w-4xl mx-auto mb-6">
          <h2 className="text-xl font-bold capitalize flex items-center gap-3" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-heading)' }}>
            <span className="w-2 h-6 rounded-sm shrink-0" style={{ background: 'var(--app-accent)', boxShadow: '0 0 12px var(--app-accent-glow)' }} />
            {displayTitle}
          </h2>
          {!isSpecialCategory && (
            <div className="filter-toggle flex p-1">
              <button
                onClick={() => setSportFilterType('live')}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${sportFilterType === 'live' ? 'active' : ''}`}
                style={sportFilterType === 'live' ? {} : { color: 'var(--app-text-muted)' }}
              >
                Live
              </button>
              <button
                onClick={() => setSportFilterType('upcoming')}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${sportFilterType === 'upcoming' ? 'active' : ''}`}
                style={sportFilterType === 'upcoming' ? {} : { color: 'var(--app-text-muted)' }}
              >
                Upcoming
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--app-text-muted)' }}>
          <svg className="w-14 h-14 opacity-40 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="font-semibold text-base">Keine Fixtures für {displayTitle}</span>
        </div>
      </div>
    );
  }

  const emptySearch = fixtureSearchQuery.trim() && !filteredFixtures.length;
  if (emptySearch) {
    return (
      <div className="flex-1 p-8 flex flex-col h-[calc(100vh-80px)]" style={{ background: 'var(--app-bg-deep)' }}>
        <div className="flex justify-between items-center w-full max-w-4xl mx-auto mb-6">
          <h2 className="text-xl font-bold capitalize flex items-center gap-3" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-heading)' }}>
            <span className="w-2 h-6 rounded-sm shrink-0" style={{ background: 'var(--app-accent)', boxShadow: '0 0 12px var(--app-accent-glow)' }} />
            {displayTitle}
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--app-text-muted)' }}>
          <svg className="w-14 h-14 opacity-40 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="font-semibold text-base">Keine Treffer für „{fixtureSearchQuery.trim()}“</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto h-[calc(100vh-80px)] scrollbar-thin" style={{ background: 'var(--app-bg-deep)', scrollbarColor: 'var(--app-border) transparent' }}>
      <div className="sports-header sticky top-0 z-10 px-3 md:px-4 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h2 className="text-lg md:text-xl font-bold capitalize flex items-center gap-2" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-heading)' }}>
            <span className="w-1.5 h-5 md:h-6 rounded-sm shrink-0" style={{ background: 'var(--app-accent)', boxShadow: '0 0 10px var(--app-accent-glow)' }} />
            {displayTitle}
          </h2>
          {!isSpecialCategory ? (
            <div className="filter-toggle flex p-1.5">
              <button
                onClick={() => setSportFilterType('live')}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${sportFilterType === 'live' ? 'active' : ''}`}
                style={sportFilterType === 'live' ? {} : { color: 'var(--app-text-muted)' }}
              >
                Live
              </button>
              <button
                onClick={() => setSportFilterType('upcoming')}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${sportFilterType === 'upcoming' ? 'active' : ''}`}
                style={sportFilterType === 'upcoming' ? {} : { color: 'var(--app-text-muted)' }}
              >
                Upcoming
              </button>
            </div>
          ) : (
            isLive && (
              <div className="live-badge flex items-center gap-2 px-3 py-1.5 rounded-full">
                <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--app-error)' }} />
                <span className="text-xs uppercase font-bold tracking-wider">Live</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Grid – kompakt für Bot-Übersicht */}
      <div className="max-w-7xl mx-auto px-3 py-3 md:px-4 md:py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 md:gap-2">
          {filteredFixtures.map((fixture, index) => {
            if (!fixture.groups?.length) return null;
            const markets = fixture.groups?.[0]?.templates?.[0]?.markets ?? [];
            const mainMarket = markets[0];
            const extraMarkets = markets.slice(1);
            if (!mainMarket) return null;
            return (
              <FixtureCard
                key={fixture.id}
                fixture={fixture}
                sportSlug={sportSlug}
                mainMarket={mainMarket}
                extraMarkets={extraMarkets}
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
