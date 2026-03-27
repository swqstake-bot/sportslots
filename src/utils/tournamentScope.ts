import type { AutoBetSettings } from '../store/autoBetStore';
import { parseStakeSportsTournamentUrl } from './stakeSportsUrl';

/** Resolved Stake tournament path for slugTournament (sport + category + tournament slugs). */
export function resolveTournamentScope(settings: AutoBetSettings): {
  sport: string;
  category: string;
  tournament: string;
} | null {
  const sport = settings.eventTournamentSport?.trim();
  const category = settings.eventTournamentCategory?.trim();
  const tournament = settings.eventTournamentSlug?.trim();
  if (sport && category && tournament) {
    return { sport, category, tournament };
  }
  return parseStakeSportsTournamentUrl(settings.eventTournamentUrl || '');
}

export function hasTournamentScope(settings: AutoBetSettings): boolean {
  return resolveTournamentScope(settings) !== null;
}
