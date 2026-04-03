import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AutoBetSettings } from '../../store/autoBetStore';
import { resolveTournamentScope } from '../../utils/tournamentScope';
import {
  fetchFixtureMarketsSnapshot,
  loadTournamentFixturesForPreview,
  type SportGroupPreview,
} from '../../utils/fixtureMarkets';

type FixtureOption = {
  id: string;
  slug: string;
  name: string;
};

type Props = {
  settings: AutoBetSettings;
  selectClass: string;
  inputClass: string;
  inputSelectStyle: CSSProperties;
  labelClass: string;
  labelStyle: CSSProperties;
  variant?: 'app' | 'modal';
};

function groupLabel(g: SportGroupPreview): string {
  const t = g.translation?.trim();
  if (t) return t;
  return g.name || '—';
}

function marketMatchesFilter(
  marketName: string,
  specifiers: string | null | undefined,
  outcomes: { name: string }[],
  q: string
): boolean {
  if (!q) return true;
  const low = q.toLowerCase();
  if (marketName.toLowerCase().includes(low)) return true;
  if (specifiers && String(specifiers).toLowerCase().includes(low)) return true;
  return outcomes.some((o) => o.name.toLowerCase().includes(low));
}

export function EventMarketsScanner({
  settings,
  selectClass,
  inputClass,
  inputSelectStyle,
  labelClass,
  labelStyle,
  variant = 'app',
}: Props) {
  const tournamentParsed = useMemo(() => resolveTournamentScope(settings), [settings]);
  const [fixtures, setFixtures] = useState<FixtureOption[]>([]);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [selectedFixtureId, setSelectedFixtureId] = useState('');
  const [manualSlug, setManualSlug] = useState('');
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof fetchFixtureMarketsSnapshot>> | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const loadFixtures = useCallback(async () => {
    if (!tournamentParsed) {
      setFixtures([]);
      return;
    }
    setLoadingFixtures(true);
    setError(null);
    try {
      const raw = await loadTournamentFixturesForPreview({
        sport: tournamentParsed.sport,
        category: tournamentParsed.category,
        tournament: tournamentParsed.tournament,
        gameType: settings.gameType,
        scanLimit: settings.scanLimit,
      });
      const opts: FixtureOption[] = [];
      for (const f of raw) {
        const row = f as { id?: string; slug?: string; name?: string };
        if (!row.id || !row.slug) continue;
        opts.push({
          id: row.id,
          slug: row.slug,
          name: row.name || row.slug,
        });
      }
      setFixtures(opts);
      setSelectedFixtureId((prev) => {
        if (prev && opts.some((o) => o.id === prev)) return prev;
        return opts[0]?.id ?? '';
      });
    } catch (e) {
      console.error(e);
      setFixtures([]);
      setError(e instanceof Error ? e.message : 'Fixtures could not be loaded.');
    } finally {
      setLoadingFixtures(false);
    }
  }, [tournamentParsed, settings.gameType, settings.scanLimit]);

  useEffect(() => {
    void loadFixtures();
  }, [loadFixtures]);

  const selectedFixture = useMemo(
    () => fixtures.find((f) => f.id === selectedFixtureId),
    [fixtures, selectedFixtureId]
  );

  const effectiveSlug = manualSlug.trim() || selectedFixture?.slug || '';

  const scanMarkets = async () => {
    if (!effectiveSlug) {
      setError('Please select a game from the list or enter a fixture slug.');
      return;
    }
    setLoadingMarkets(true);
    setError(null);
    try {
      const snap = await fetchFixtureMarketsSnapshot(effectiveSlug);
      setSnapshot(snap);
    } catch (e) {
      console.error(e);
      setSnapshot(null);
      setError(e instanceof Error ? e.message : 'Markets could not be loaded.');
    } finally {
      setLoadingMarkets(false);
    }
  };

  const mutedStyle = variant === 'app' ? { color: 'var(--app-text-muted)' } : { color: '#9ca3af' };
  const cardBg = variant === 'app' ? 'var(--app-bg-deep)' : '#111827';
  const borderCol = variant === 'app' ? 'var(--app-border)' : '#374151';

  const stats = useMemo(() => {
    if (!snapshot) return { markets: 0, outcomes: 0, groups: 0 };
    let markets = 0;
    let outcomes = 0;
    for (const g of snapshot.groups) {
      for (const t of g.templates) {
        for (const m of t.markets) {
          markets++;
          outcomes += m.outcomes.length;
        }
      }
    }
    return { markets, outcomes, groups: snapshot.groups.length };
  }, [snapshot]);

  const q = filterText.trim().toLowerCase();

  return (
    <div
      className="mt-4 rounded-lg border p-3 space-y-3"
      style={{ borderColor: borderCol, background: cardBg }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider" style={variant === 'app' ? { color: 'var(--app-text)' } : { color: '#e5e7eb' }}>
            Betting markets (preview)
          </h4>
          <p className="text-[10px] mt-0.5" style={mutedStyle}>
            Only the main column is loaded - this is where the relevant markets (over/under, rounds, etc.) are for
            this match.
          </p>
        </div>
      </div>

      {tournamentParsed && (
        <div>
          <label className={labelClass} style={labelStyle}>
            Tournament game
          </label>
          <div className="relative">
            <select
              value={selectedFixtureId}
              onChange={(e) => setSelectedFixtureId(e.target.value)}
              disabled={loadingFixtures || fixtures.length === 0}
              className={selectClass}
              style={{
                ...inputSelectStyle,
                opacity: loadingFixtures || fixtures.length === 0 ? 0.65 : 1,
              }}
            >
              <option value="">
                {loadingFixtures ? 'Loading games...' : fixtures.length === 0 ? 'No games found' : '- Select game -'}
              </option>
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-xs"
              style={mutedStyle}
            >
              ▼
            </div>
          </div>
        </div>
      )}

      <div>
        <label className={labelClass} style={labelStyle}>
          Fixture-Slug (optional)
        </label>
        <input
          type="text"
          value={manualSlug}
          onChange={(e) => setManualSlug(e.target.value)}
          className={inputClass}
          style={inputSelectStyle}
          placeholder="Overrides the selection above, e.g. from the Stake URL"
        />
        <p className="text-[10px] mt-1" style={mutedStyle}>
          If empty, the selected game is used. Slug takes priority over the dropdown selection.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void scanMarkets()}
        disabled={loadingMarkets}
        className="w-full font-bold py-2 rounded-lg text-xs uppercase tracking-wider transition-opacity disabled:opacity-50"
        style={
          variant === 'app'
            ? { background: 'var(--app-accent)', color: 'var(--app-bg-deep)' }
            : { background: '#16a34a', color: '#fff' }
        }
      >
        {loadingMarkets ? 'Loading markets...' : 'Scan markets'}
      </button>

      {error && (
        <p className="text-xs rounded px-2 py-1.5" style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5' }}>
          {error}
        </p>
      )}

      {snapshot && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" style={mutedStyle}>
            <span className="font-mono" style={variant === 'app' ? { color: 'var(--app-text)' } : { color: '#d1d5db' }}>
              {snapshot.fixtureName}
            </span>
            <span>
              {stats.groups} groups · {stats.markets} markets · {stats.outcomes} outcomes
            </span>
          </div>
          <input
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className={inputClass}
            style={inputSelectStyle}
            placeholder="Filter (e.g. round, over, method)..."
          />

          <div className="max-h-[min(420px,50vh)] overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin" style={{ scrollbarColor: `${borderCol} transparent` }}>
            {snapshot.groups.map((g) => {
              const gLabel = groupLabel(g);
              const templatesWithHits = g.templates
                .map((t) => {
                  const markets = t.markets.filter((m) =>
                    marketMatchesFilter(m.name, m.specifiers, m.outcomes, q)
                  );
                  return { ...t, markets };
                })
                .filter((t) => t.markets.length > 0);

              if (q && templatesWithHits.length === 0) return null;

              return (
                <details
                  key={`${g.name}-${g.id ?? ''}`}
                  className="rounded border text-xs overflow-hidden"
                  style={{ borderColor: borderCol, background: variant === 'app' ? 'var(--app-bg-card)' : '#1f2937' }}
                >
                  <summary
                    className="cursor-pointer px-2 py-1.5 font-bold select-none"
                    style={variant === 'app' ? { color: 'var(--app-text)' } : { color: '#f3f4f6' }}
                  >
                    {gLabel}
                    <span className="font-normal opacity-70 ml-1">({g.name})</span>
                  </summary>
                  <div className="px-2 pb-2 space-y-2 border-t" style={{ borderColor: borderCol }}>
                    {(q ? templatesWithHits : g.templates).map((t) => (
                      <div key={`${t.name}-${t.extId ?? ''}`} className="pt-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80 mb-1" style={mutedStyle}>
                          {t.name}
                        </div>
                        {(q ? t.markets.filter((m) => marketMatchesFilter(m.name, m.specifiers, m.outcomes, q)) : t.markets).map((m) => (
                          <div
                            key={m.id}
                            className="mb-2 rounded border px-2 py-1.5"
                            style={{ borderColor: borderCol, background: variant === 'app' ? 'var(--app-bg-deep)' : '#111827' }}
                          >
                            <div className="flex flex-wrap justify-between gap-1">
                              <span style={variant === 'app' ? { color: 'var(--app-text)' } : { color: '#e5e7eb' }}>{m.name}</span>
                              <span className="font-mono opacity-70">{m.status}</span>
                            </div>
                            {m.specifiers ? (
                              <div className="text-[10px] opacity-60 mt-0.5 font-mono break-all">{m.specifiers}</div>
                            ) : null}
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                              {m.outcomes.map((o) => (
                                <span
                                  key={o.id}
                                  className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5"
                                  style={{
                                    background: variant === 'app' ? 'rgba(var(--app-accent-rgb), 0.12)' : 'rgba(22,163,74,0.2)',
                                    opacity: o.active ? 1 : 0.45,
                                  }}
                                >
                                  <span className="max-w-[140px] truncate" title={o.name}>
                                    {o.name}
                                  </span>
                                  <span className="font-mono font-bold" style={variant === 'app' ? { color: 'var(--app-accent)' } : { color: '#86efac' }}>
                                    {o.odds.toFixed(2)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
