import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { MAIN_FIXTURE_MARKET_GROUP_SLUGS } from '../constants/fixtureMarketGroups';

export type SportMarketOutcomePreview = {
  id: string;
  name: string;
  odds: number;
  active: boolean;
};

export type SportMarketPreview = {
  id: string;
  name: string;
  status: string;
  extId?: string;
  specifiers?: string | null;
  outcomes: SportMarketOutcomePreview[];
};

export type SportGroupTemplatePreview = {
  extId?: string;
  name: string;
  markets: SportMarketPreview[];
};

export type SportGroupPreview = {
  id?: string;
  name: string;
  translation?: string | null;
  rank?: number;
  templates: SportGroupTemplatePreview[];
};

function fixtureStartTimeMs(fixture: { data?: unknown }): number {
  const d = fixture?.data;
  if (!d || typeof d !== 'object') return Number.MAX_SAFE_INTEGER;
  const raw =
    (d as { startTime?: unknown; endTime?: unknown }).startTime ??
    (d as { endTime?: unknown }).endTime;
  if (raw == null || raw === '') return Number.MAX_SAFE_INTEGER;
  const ms = typeof raw === 'number' ? raw : Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

function mapTournamentFixtureListType(scanType: string): string {
  if (scanType === 'live') return 'live';
  return 'active';
}

const TOURNAMENT_FIXTURE_LIMIT_CAP = 50;

function clampTournamentFixtureLimit(scanLimit: number | undefined): number {
  const n = scanLimit && scanLimit > 0 ? scanLimit : 50;
  return Math.min(Math.max(1, n), TOURNAMENT_FIXTURE_LIMIT_CAP);
}

/**
 * Fixtures for a tournament (main + threeway, deduped), sorted by start time.
 * Mirrors AutoBet tournament loading so the picker matches what the bot can see.
 */
export async function loadTournamentFixturesForPreview(params: {
  sport: string;
  category: string;
  tournament: string;
  gameType: 'live' | 'upcoming' | 'all';
  scanLimit?: number;
}): Promise<unknown[]> {
  const { sport, category, tournament, gameType } = params;
  const typesToFetch = gameType === 'all' ? (['live', 'upcoming'] as const) : ([gameType] as const);
  const limit = clampTournamentFixtureLimit(params.scanLimit);
  const map = new Map<string, Record<string, unknown>>();
  for (const t of typesToFetch) {
    const apiType = mapTournamentFixtureListType(t);
    for (const group of ['main', 'threeway'] as const) {
      const res = await StakeApi.query<{
        slugTournament?: { fixtureList?: Array<Record<string, unknown> & { id?: string }> };
      }>(Queries.SlugTournamentFixtureList, {
        sport,
        category,
        tournament,
        group,
        type: apiType,
        limit,
      });
      for (const f of res.data?.slugTournament?.fixtureList || []) {
        if (f?.id) map.set(f.id, f as Record<string, unknown>);
      }
    }
  }
  const list = Array.from(map.values());
  list.sort((a, b) => fixtureStartTimeMs(a) - fixtureStartTimeMs(b));
  return list;
}

function normalizeGroups(raw: unknown): SportGroupPreview[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g: Record<string, unknown>) => ({
    id: g.id as string | undefined,
    name: (g.name as string) ?? '',
    translation: g.translation as string | null | undefined,
    rank: g.rank as number | undefined,
    templates: Array.isArray(g.templates)
      ? (g.templates as Record<string, unknown>[]).map((t) => ({
          extId: t.extId as string | undefined,
          name: (t.name as string) ?? '',
          markets: Array.isArray(t.markets)
            ? (t.markets as Record<string, unknown>[]).map((m) => ({
                id: (m.id as string) ?? '',
                name: (m.name as string) ?? '',
                status: (m.status as string) ?? '',
                extId: m.extId as string | undefined,
                specifiers: m.specifiers as string | null | undefined,
                outcomes: Array.isArray(m.outcomes)
                  ? (m.outcomes as Record<string, unknown>[]).map((o) => ({
                      id: (o.id as string) ?? '',
                      name: (o.name as string) ?? '',
                      odds: typeof o.odds === 'number' ? o.odds : 0,
                      active: Boolean(o.active),
                    }))
                  : [],
              }))
            : [],
        }))
      : [],
  }));
}

export async function fetchFixtureMarketsSnapshot(
  fixtureSlug: string,
  groupSlugs: readonly string[] = MAIN_FIXTURE_MARKET_GROUP_SLUGS
): Promise<{ fixtureName: string; fixtureSlug: string; groups: SportGroupPreview[] }> {
  const groups = [...groupSlugs];
  const res = await StakeApi.query<{
    slugFixture?: { name?: string; slug?: string; groups?: unknown };
  }>(Queries.FetchFixtureMarkets, { fixture: fixtureSlug, groups });

  const sf = res.data?.slugFixture;
  if (!sf) {
    throw new Error('Fixture not found (check slug or login).');
  }
  return {
    fixtureName: sf.name || fixtureSlug,
    fixtureSlug: sf.slug || fixtureSlug,
    groups: normalizeGroups(sf.groups),
  };
}
