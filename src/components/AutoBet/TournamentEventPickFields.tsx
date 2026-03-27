import { useEffect, useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import type { AutoBetSettings } from '../../store/autoBetStore';

const SEP = '\x1f';

export type TournamentEventOption = {
  categorySlug: string;
  tournamentSlug: string;
  label: string;
  fixtureCount: number;
};

type Props = {
  settings: AutoBetSettings;
  updateSettings: (p: Partial<AutoBetSettings>) => void;
  selectClass: string;
  inputClass: string;
  inputSelectStyle: CSSProperties;
  labelClass: string;
  labelStyle: CSSProperties;
  variant?: 'app' | 'modal';
};

export function flattenTournamentOptions(data: unknown): TournamentEventOption[] {
  const slugSport = (data as { slugSport?: { categoryList?: any[] } })?.slugSport;
  if (!slugSport?.categoryList) return [];
  const out: TournamentEventOption[] = [];
  for (const cat of slugSport.categoryList) {
    const catSlug = cat.slug || '';
    const catName = cat.name || catSlug;
    for (const tour of cat.tournamentList || []) {
      const slug = tour.slug || '';
      if (!slug) continue;
      const n = (tour.fixtureCount as number) ?? 0;
      out.push({
        categorySlug: catSlug,
        tournamentSlug: slug,
        label: `${catName} · ${tour.name || slug}${n > 0 ? ` (${n})` : ''}`,
        fixtureCount: n,
      });
    }
  }
  out.sort((a, b) => b.fixtureCount - a.fixtureCount || a.label.localeCompare(b.label));
  return out;
}

export function TournamentEventPickFields({
  settings,
  updateSettings,
  selectClass,
  inputClass,
  inputSelectStyle,
  labelClass,
  labelStyle,
  variant = 'app',
}: Props) {
  const [sports, setSports] = useState<{ name: string; slug: string }[]>([]);
  const [tournamentOptions, setTournamentOptions] = useState<TournamentEventOption[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const arrowClass = variant === 'modal' ? 'text-gray-500' : '';

  useEffect(() => {
    let cancelled = false;
    async function fetchSports() {
      try {
        const typeParam = settings.gameType === 'live' ? 'live' : 'upcoming';
        const response = await StakeApi.query<any>(Queries.SportListMenu, {
          type: typeParam,
          limit: 100,
          offset: 0,
          liveRank: false,
          sportType: 'sport',
        });
        if (!cancelled && response.data?.sportList) {
          setSports(response.data.sportList);
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchSports();
    return () => {
      cancelled = true;
    };
  }, [settings.gameType]);

  const pickerSport = settings.eventTournamentSport || '';

  useEffect(() => {
    if (!pickerSport) {
      setTournamentOptions([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoadingEvents(true);
      try {
        const res = await StakeApi.query<any>(Queries.TournamentTableList, { sport: pickerSport });
        if (cancelled) return;
        setTournamentOptions(flattenTournamentOptions(res.data));
      } catch (e) {
        console.error(e);
        if (!cancelled) setTournamentOptions([]);
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [pickerSport]);

  const selectedEventKey = useMemo(() => {
    const c = settings.eventTournamentCategory?.trim();
    const t = settings.eventTournamentSlug?.trim();
    if (!c || !t) return '';
    return `${c}${SEP}${t}`;
  }, [settings.eventTournamentCategory, settings.eventTournamentSlug]);

  const helpStyle = variant === 'app' ? { color: 'var(--app-text-muted)' } : undefined;

  const onSportChange = (slug: string) => {
    updateSettings({
      eventTournamentSport: slug,
      eventTournamentCategory: '',
      eventTournamentSlug: '',
      eventTournamentUrl: '',
    });
  };

  const onEventChange = (key: string) => {
    if (!key) {
      updateSettings({
        eventTournamentCategory: '',
        eventTournamentSlug: '',
      });
      return;
    }
    const i = key.indexOf(SEP);
    if (i <= 0) return;
    updateSettings({
      eventTournamentCategory: key.slice(0, i),
      eventTournamentSlug: key.slice(i + SEP.length),
      eventTournamentUrl: '',
    });
  };

  const onUrlChange = (v: string) => {
    if (v.trim()) {
      updateSettings({
        eventTournamentUrl: v,
        eventTournamentSport: '',
        eventTournamentCategory: '',
        eventTournamentSlug: '',
      });
    } else {
      updateSettings({ eventTournamentUrl: '' });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} style={labelStyle}>
          Event-Sport
        </label>
        <div className="relative">
          <select
            value={pickerSport}
            onChange={(e) => onSportChange(e.target.value)}
            className={selectClass}
            style={inputSelectStyle}
          >
            <option value="">— Kein festes Turnier (normaler Scan) —</option>
            {sports.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          <div
            className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 ${arrowClass}`}
            style={variant === 'app' ? { color: 'var(--app-text-muted)' } : undefined}
          >
            ▼
          </div>
        </div>
        <p className="text-[10px] mt-1" style={helpStyle}>
          {variant === 'modal' ? (
            <span className="text-gray-500">Sport wählen, dann erscheinen aktive Turniere.</span>
          ) : (
            'Sport wählen, dann erscheinen aktive Turniere / Fight Cards.'
          )}
        </p>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>
          Turnier / Event
        </label>
        <div className="relative">
          <select
            value={selectedEventKey}
            onChange={(e) => onEventChange(e.target.value)}
            disabled={!pickerSport || loadingEvents}
            className={selectClass}
            style={{
              ...inputSelectStyle,
              opacity: !pickerSport || loadingEvents ? 0.6 : 1,
            }}
          >
            <option value="">
              {loadingEvents
                ? 'Lade Events…'
                : !pickerSport
                  ? 'Zuerst Sport wählen'
                  : tournamentOptions.length === 0
                    ? 'Keine Events gefunden'
                    : '— Event wählen —'}
            </option>
            {tournamentOptions.map((o) => (
              <option key={`${o.categorySlug}${SEP}${o.tournamentSlug}`} value={`${o.categorySlug}${SEP}${o.tournamentSlug}`}>
                {o.label}
              </option>
            ))}
          </select>
          <div
            className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 ${arrowClass}`}
            style={variant === 'app' ? { color: 'var(--app-text-muted)' } : undefined}
          >
            ▼
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass} style={labelStyle}>
          Event-URL (optional)
        </label>
        <input
          type="text"
          value={settings.eventTournamentUrl || ''}
          onChange={(e) => onUrlChange(e.target.value)}
          className={inputClass}
          style={inputSelectStyle}
          placeholder="https://stake.com/.../sports/..."
        />
        <p className="text-[10px] mt-1" style={helpStyle}>
          {variant === 'modal' ? (
            <span className="text-gray-500">Alternativ zur Auswahl: Link einfügen (überschreibt Sport/Event).</span>
          ) : (
            'Alternativ zur Auswahl: Stake-Link einfügen (setzt die Auswahl oben zurück).'
          )}
        </p>
      </div>
    </div>
  );
}
