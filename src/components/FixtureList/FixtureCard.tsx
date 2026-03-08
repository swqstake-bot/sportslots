import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Fixture } from '../../hooks/useLiveFixtures';

const SPORT_ICONS: Record<string, string> = {
  soccer: '⚽',
  football: '🏈',
  'american-football': '🏈',
  tennis: '🎾',
  basketball: '🏀',
  'ice-hockey': '🏒',
  hockey: '🏒',
  esports: '🎮',
  'e-sports': '🎮',
  volleyball: '🏐',
  handball: '🤾',
  baseball: '⚾',
  mma: '🥊',
  boxing: '🥊',
  snooker: '🎱',
  darts: '🎯',
  'table-tennis': '🏓',
  cricket: '🏏',
  rugby: '🏉',
  'rugby-union': '🏉',
  default: '🏟️',
};

function normalizeSportKey(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function getSportIcon(slug: string | undefined, name: string | undefined): string {
  for (const raw of [slug, name].filter(Boolean)) {
    const key = normalizeSportKey(raw!);
    if (SPORT_ICONS[key]) return SPORT_ICONS[key];
    if (key.includes('football') && !key.includes('american')) return SPORT_ICONS.soccer;
    if (key.includes('ice') && key.includes('hockey')) return SPORT_ICONS['ice-hockey'];
    if (key.includes('hockey')) return SPORT_ICONS.hockey;
    if (key.includes('snooker')) return SPORT_ICONS.snooker;
    if (key.includes('tennis') && !key.includes('table')) return SPORT_ICONS.tennis;
    if (key.includes('table') && key.includes('tennis')) return SPORT_ICONS['table-tennis'];
    if (key.includes('esport') || key.includes('e-sport')) return SPORT_ICONS.esports;
  }
  return SPORT_ICONS.default;
}

interface Market {
  id?: string;
  name?: string;
  outcomes?: Array<{ id: string; name?: string; odds: number }>;
}

interface FixtureCardProps {
  fixture: Fixture;
  sportSlug: string;
  mainMarket: Market;
  extraMarkets?: Market[];
  isSelected: (outcomeId: string) => boolean;
  onOutcomeClick: (outcome: any, marketName: string, fixture: Fixture) => void;
  index?: number;
}

function outcomeLabel(outcome: { id: string; name?: string }): string {
  if (outcome.name) return outcome.name;
  if (outcome.id.includes('home') || outcome.id.includes('1')) return '1';
  if (outcome.id.includes('draw') || outcome.id.includes('x')) return 'X';
  if (outcome.id.includes('away') || outcome.id.includes('2')) return '2';
  return '–';
}

export function FixtureCard({
  fixture,
  sportSlug,
  mainMarket,
  extraMarkets = [],
  isSelected,
  onOutcomeClick,
  index = 0,
}: FixtureCardProps) {
  const [showMore, setShowMore] = useState(false);
  const ms = String(fixture.eventStatus?.matchStatus ?? '').toLowerCase();
  const isLiveMatch = ms === 'live' || ms === 'in_play' || ms === 'inplay';
  const sportIcon = getSportIcon(
    fixture.sport?.slug ?? sportSlug,
    fixture.sport?.name
  );

  const outcomes = mainMarket?.outcomes?.slice(0, 3) ?? [];
  const hasMoreMarkets = extraMarkets.length > 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="fixture-card relative overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between px-1.5 pt-1.5 pb-0.5">
        <span
          className="flex items-center justify-center w-5 h-5 rounded text-sm shrink-0"
          style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--app-border)' }}
          aria-hidden
        >
          {sportIcon}
        </span>
        {isLiveMatch ? (
          <div className="live-badge flex items-center gap-1 px-1.5 py-0.5">
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--app-error)' }} />
            <span className="text-[10px] font-black uppercase tracking-wider">
              Live
            </span>
            {fixture.eventStatus?.homeScore != null && (
              <span className="text-xs font-mono font-bold" style={{ color: 'var(--app-text)' }}>
                {fixture.eventStatus.homeScore}–{fixture.eventStatus.awayScore}
              </span>
            )}
            {fixture.eventStatus?.clock?.matchTime != null && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--app-text-muted)' }}>
                {fixture.eventStatus.clock.matchTime}'
              </span>
            )}
          </div>
        ) : (
          <div className="text-right">
            <div className="text-xs font-mono font-bold" style={{ color: 'var(--app-text)' }}>
              {new Date(fixture.data.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
              {new Date(fixture.data.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      <h3
        className="px-1.5 pb-1 text-[11px] font-bold leading-tight line-clamp-2 text-center"
        style={{ color: 'var(--app-text)' }}
        title={fixture.name}
      >
        {fixture.name}
      </h3>

      <div className="px-1.5 pb-1.5 flex gap-1">
        {outcomes.map((outcome: any) => {
          const label = outcomeLabel(outcome);
          const selected = isSelected(outcome.id);
          return (
            <button
              key={outcome.id}
              type="button"
              onClick={() => onOutcomeClick(outcome, mainMarket.name ?? '', fixture)}
              className={`odds-btn flex-1 min-w-0 py-1 rounded flex flex-col items-center justify-center ${selected ? 'selected' : ''}`}
            >
              <span className="text-[7px] font-bold uppercase tracking-wider opacity-90">
                {label}
              </span>
              <span className="font-mono font-bold text-[10px] leading-none">
                {outcome.odds.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>

      {hasMoreMarkets && (
        <>
          <button
            type="button"
            onClick={() => setShowMore((m) => !m)}
            className="w-full py-0.5 text-[7px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center"
            style={{ borderTop: '1px solid var(--app-border)', color: 'var(--app-text-muted)' }}
          >
            {showMore ? '−' : `+ ${extraMarkets.length} Märkte`}
          </button>
          {showMore && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ borderTop: '1px solid var(--app-border)' }}
              className="overflow-hidden"
            >
              <div className="px-1.5 py-1.5 space-y-1 max-h-28 overflow-y-auto">
                {extraMarkets.map((market) => (
                    <div key={market.id || market.name || Math.random()} className="space-y-1">
                      <div className="text-[8px] font-bold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>
                        {market.name || 'Market'}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(market.outcomes || []).slice(0, 6).map((outcome: any) => (
                          <button
                            key={outcome.id}
                            type="button"
                            onClick={() => onOutcomeClick(outcome, market.name || '', fixture)}
                            className={`px-2 py-1 rounded text-[9px] font-mono font-bold transition-all odds-btn ${isSelected(outcome.id) ? 'selected' : ''}`}
                          style={!isSelected(outcome.id) ? { background: 'rgba(0,0,0,0.35)', border: '1px solid var(--app-border)', color: 'var(--app-text)' } : undefined}
                        >
                          {outcomeLabel(outcome)} {outcome.odds?.toFixed(2)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.article>
  );
}
