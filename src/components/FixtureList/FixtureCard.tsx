import React, { useState } from 'react';
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

interface FixtureCardProps {
  fixture: Fixture;
  sportSlug: string;
  mainMarket: any;
  isSelected: (outcomeId: string) => boolean;
  onOutcomeClick: (outcome: any, marketName: string, fixture: Fixture) => void;
  index?: number;
}

export function FixtureCard({
  fixture,
  sportSlug,
  mainMarket,
  isSelected,
  onOutcomeClick,
  index = 0,
}: FixtureCardProps) {
  const [showMore, setShowMore] = useState(false);
  const isLiveMatch =
    String(fixture.eventStatus?.matchStatus ?? '').toLowerCase() === 'live' ||
    !!fixture.eventStatus?.clock;
  const sportIcon = getSportIcon(
    fixture.sport?.slug ?? sportSlug,
    fixture.sport?.name
  );

  const outcomes = mainMarket?.outcomes?.slice(0, 3) ?? [];
  const hasMoreMarkets =
    fixture.groups?.[0]?.templates?.[0]?.markets?.length > 1;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="relative rounded-2xl border border-stake-border bg-stake-bg-card overflow-hidden hover:border-stake-text-muted/50 hover:shadow-lg hover:shadow-black/20 transition-all flex flex-col"
    >
      {/* Live strip + Sport icon row */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-stake-bg-deep border border-stake-border text-xl"
          aria-hidden
        >
          {sportIcon}
        </span>
        {isLiveMatch ? (
          <div className="flex items-center gap-1.5 rounded-full bg-stake-error/15 px-2.5 py-1 border border-stake-error/40">
            <span className="h-1.5 w-1.5 rounded-full bg-stake-error animate-pulse shadow-[0_0_4px_rgba(255,77,77,0.8)]" />
            <span className="text-[10px] font-black text-stake-error uppercase tracking-wider">
              Live
            </span>
            {fixture.eventStatus?.homeScore != null && (
              <span className="text-xs font-mono font-bold text-white">
                {fixture.eventStatus.homeScore}–{fixture.eventStatus.awayScore}
              </span>
            )}
            {fixture.eventStatus?.clock?.matchTime != null && (
              <span className="text-[10px] font-mono text-stake-text-muted">
                {fixture.eventStatus.clock.matchTime}'
              </span>
            )}
          </div>
        ) : (
          <div className="text-right">
            <div className="text-xs font-mono font-bold text-white">
              {new Date(fixture.data.startTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            <div className="text-[9px] text-stake-text-dim uppercase tracking-wider">
              {new Date(fixture.data.startTime).toLocaleDateString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        )}
      </div>

      {/* Fixture name – mittig wie die Odds */}
      <h3
        className="px-3 pb-2 text-sm font-bold text-white leading-tight line-clamp-2 min-h-[2.25rem] text-center"
        title={fixture.name}
      >
        {fixture.name}
      </h3>

      {/* Odds – kompaktere Buttons */}
      <div className="px-3 pb-3 flex gap-1.5">
        {outcomes.map((outcome: any) => {
          let label = outcome.name;
          if (!label) {
            if (outcome.id.includes('home') || outcome.id.includes('1')) label = '1';
            else if (outcome.id.includes('draw') || outcome.id.includes('x')) label = 'X';
            else if (outcome.id.includes('away') || outcome.id.includes('2')) label = '2';
            else label = '–';
          }
          const selected = isSelected(outcome.id);
          return (
            <button
              key={outcome.id}
              type="button"
              onClick={() => onOutcomeClick(outcome, mainMarket.name, fixture)}
              className={`flex-1 min-w-0 py-2 rounded-lg flex flex-col items-center justify-center transition-all ${
                selected
                  ? 'bg-stake-success/20 text-stake-success ring-2 ring-stake-success ring-inset'
                  : 'bg-stake-border hover:bg-stake-border-hover text-white'
              }`}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">
                {label}
              </span>
              <span className="font-mono font-bold text-sm leading-none mt-0.5">
                {outcome.odds.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Swipe / Mehr Infos */}
      {hasMoreMarkets && (
        <button
          type="button"
          onClick={() => setShowMore((m) => !m)}
          className="w-full py-1.5 border-t border-stake-border/60 text-[9px] font-bold text-stake-text-dim hover:text-stake-text-muted uppercase tracking-wider transition-colors"
        >
          {showMore ? 'Weniger' : 'Mehr Märkte'}
        </button>
      )}
    </motion.article>
  );
}
