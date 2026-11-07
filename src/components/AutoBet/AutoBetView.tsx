import { useEffect, useMemo, useState } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { TournamentEventPickFields } from './TournamentEventPickFields';
import { ActiveBetsPanel } from '../ActiveBets/ActiveBetsPanel';
import { CopyBetPanel } from './CopyBetPanel';
import { ProfilesPanel } from './ProfilesPanel';
import { useCopyBetStore } from '../../store/copyBetStore';
import { hasTournamentScope } from '../../utils/tournamentScope';
import {
  MMA_MARKET_TYPE_PRESETS,
  parseMarketKeywords,
  toggleExcludeKeyword,
} from '../../utils/marketKeywordFilter';
import { ACTIVE_SPORT_BETS_MAX_TOTAL } from '../../constants/sportsBetLimits';
import './autobet.css';

const STRATEGIES: AutoBetStrategy[] = [
  'Smart',
  'Conservative',
  'Aggressive',
  'Balanced',
  'Favorites',
  'Underdogs',
  'ValueHunter',
  'RandomOdds',
];

type AutoBetViewProps = {
  layout?: 'sidebar' | 'wide';
};

type LogSource = 'autobet' | 'copy' | 'combined';

export function AutoBetView({ layout = 'sidebar' }: AutoBetViewProps) {
  const {
    settings,
    logs,
    isRunning,
    placedCount,
    skippedCount,
    scannedCount,
    investedUsd,
    lastScanAt,
    updateSettings,
    start,
    stop,
    clearLogs,
  } = useAutoBetStore();
  const { availableCurrencies, balances, activeBets } = useUserStore();
  const sportsCenterTab = useUiStore((s) => s.sportsCenterTab);
  const setSportsCenterTab = useUiStore((s) => s.setSportsCenterTab);
  const activeBetsPreviewBetId = useUiStore((s) => s.activeBetsPreviewBetId);
  const [localTab, setLocalTab] = useState<'settings' | 'logs' | 'bets' | 'copy'>('settings');
  const copyRunning = useCopyBetStore((s) => s.isRunning);
  const copyLogs = useCopyBetStore((s) => s.logs);
  const startCopyFeed = useCopyBetStore((s) => s.start);
  const stopCopyFeed = useCopyBetStore((s) => s.stop);
  const clearCopyLogs = useCopyBetStore((s) => s.clearLogs);
  const updateCopySettings = useCopyBetStore((s) => s.updateSettings);
  const [sports, setSports] = useState<{name: string, slug: string}[]>([]);
  const [logSource, setLogSource] = useState<LogSource>('combined');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isWide = layout === 'wide';
  const activeTab = isWide ? sportsCenterTab : localTab;
  const setActiveTab = isWide ? setSportsCenterTab : setLocalTab;

  useEffect(() => {
    async function fetchSports() {
        try {
            const typeParam = settings.gameType === 'live' ? 'live' : 'upcoming';
            const response = await StakeApi.query<any>(Queries.SportListMenu, {
                type: typeParam,
                limit: 100,
                offset: 0,
                liveRank: false,
                sportType: 'sport'
            });
            if (response.data?.sportList) {
                setSports(response.data.sportList);
            }
        } catch (e) {
            console.error(e);
        }
    }
    fetchSports();
  }, [settings.gameType]);

  const setSharedSport = (slug: string) => {
    updateSettings({ sportSlug: slug });
    updateCopySettings({ sportSlug: slug });
  };

  useEffect(() => {
    const copySlug = useCopyBetStore.getState().settings.sportSlug;
    if (settings.sportSlug && copySlug !== settings.sportSlug) {
      updateCopySettings({ sportSlug: settings.sportSlug });
    }
  }, [settings.sportSlug, updateCopySettings]);

  const confirmStartAlongside = (otherName: string, otherRunning: boolean) => {
    if (!otherRunning) return true;
    return window.confirm(`${otherName} is already running. Start this one too?`);
  };

  const handleStartStop = () => {
    if (isRunning) {
      stop();
      return;
    }
    if (!confirmStartAlongside('Copy', copyRunning)) return;
    start();
  };

  const activeBetCount = activeBets.length;
  const currencyOptions = availableCurrencies.length
    ? Array.from(new Set([settings.currency, ...availableCurrencies]))
    : Object.keys(balances).length
      ? Array.from(new Set([settings.currency, ...Object.keys(balances)]))
      : [settings.currency || 'usd'];

  const selectClass = 'autobet-control w-full px-3 py-2.5 text-sm font-medium appearance-none cursor-pointer';
  const inputClass = 'autobet-control w-full px-3 py-2.5 text-sm font-mono';
  const inputSelectStyle = { background: 'transparent', border: 'none', color: 'inherit' };
  const labelClass = 'autobet-field-label';

  const unifiedLogs = useMemo(() => {
    const auto = logs.map((log) => ({ ...log, channel: 'autobet' as const }));
    const copy = copyLogs.map((log) => ({ ...log, channel: 'copy' as const }));
    if (logSource === 'autobet') return auto;
    if (logSource === 'copy') return copy;
    return [...auto, ...copy].sort((a, b) => b.timestamp - a.timestamp);
  }, [logs, copyLogs, logSource]);

  const logCount = logs.length + copyLogs.length;
  const selectedSport = settings.sportSlug === 'all'
    ? 'All sports'
    : settings.sportSlug === 'starting_soon'
      ? 'Starting soon'
      : sports.find((sport) => sport.slug === settings.sportSlug)?.name || settings.sportSlug;
  const hasMarketFilters = Boolean(settings.marketIncludeKeywords || settings.marketExcludeKeywords || settings.outcomeIncludeKeywords);
  const taskDescription = activeTab === 'copy'
    ? 'Choose a source, define your filters and follow the incoming feed.'
    : activeTab === 'bets'
      ? 'Review active bet slips or open Finished to find settled bets and saved wins.'
      : activeTab === 'logs'
        ? 'Follow AutoBet and Copy events in one place.'
        : 'Choose events, set your stake and review the current configuration.';

  const copyStartButton = (
    <button
      onClick={() => {
        if (copyRunning) {
          stopCopyFeed();
          return;
        }
        if (!confirmStartAlongside('AutoBet', isRunning)) return;
        startCopyFeed();
      }}
      type="button"
      className={`autobet-start-btn flex justify-center items-center gap-2 ${isWide ? 'autobet-start-btn--wide' : ''}`}
      style={copyRunning
        ? { background: 'var(--app-error)', color: 'var(--app-bg-deep)' }
        : { background: 'var(--app-accent)', color: 'var(--app-bg-deep)' }
      }
    >
      <span className={`sports-action-mark ${copyRunning ? 'is-stop' : 'is-start'}`} aria-hidden="true" />
      {copyRunning ? 'Stop Copy' : 'Start Copy'}
    </button>
  );

  const startButton = (
    <button
      onClick={handleStartStop}
      type="button"
      className={`autobet-start-btn flex justify-center items-center gap-2 ${isWide ? 'autobet-start-btn--wide' : ''}`}
      style={isRunning
        ? { background: 'var(--app-error)', color: 'var(--app-bg-deep)' }
        : { background: 'var(--app-accent)', color: 'var(--app-bg-deep)' }
      }
    >
      {isRunning ? (
        <>
          <span className="sports-action-mark is-stop" aria-hidden="true" />
          Stop AutoBet
        </>
      ) : (
        <>
          <span className="sports-action-mark is-start" aria-hidden="true" />
          Start AutoBet
        </>
      )}
    </button>
  );

  const settingsPane = (
    <div className={`copy-feed copy-feed--solo sports-workbench ${isWide ? '' : 'copy-feed--sidebar'}`.trim()}>
      <div className="copy-feed-pane copy-feed-pane--setup">
        <div className="copy-feed-kpi">
          <div>
            <span className="copy-feed-kpi-label">Scanned</span>
            <strong>{scannedCount}</strong>
          </div>
          <div>
            <span className="copy-feed-kpi-label">Placed</span>
            <strong>{placedCount}</strong>
          </div>
          <div>
            <span className="copy-feed-kpi-label">Skipped</span>
            <strong>{skippedCount}</strong>
          </div>
          <div>
            <span className="copy-feed-kpi-label">Invested · USD</span>
            <strong>${investedUsd.toFixed(2)}</strong>
          </div>
          {isRunning && lastScanAt && (
            <LastScanIndicator lastScanAt={lastScanAt} />
          )}
        </div>

        <section className="copy-feed-block">
          <div className="sports-section-heading">
            <span className="sports-step">01</span>
            <div><h3 className="copy-feed-kicker">Event selection</h3><p className="sports-section-hint">Define which events AutoBet should consider.</p></div>
          </div>
          <div className="copy-feed-fields copy-feed-fields--4">
            <label className="copy-feed-field">
              <span>Strategy</span>
              <select aria-label="Strategy" value={settings.strategy} onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })}>
                {!STRATEGIES.includes(settings.strategy) && <option value={settings.strategy}>{settings.strategy} (saved)</option>}
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Game type</span>
              <select aria-label="Game type" value={settings.gameType} onChange={(e) => updateSettings({ gameType: e.target.value as 'live' | 'upcoming' | 'all' })}>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Sport</span>
              <select aria-label="Sport" value={settings.sportSlug} onChange={(e) => setSharedSport(e.target.value)}>
                <option value="all">All sports</option>
                <option value="starting_soon">Starting Soon</option>
                {sports.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Wallet currency</span>
              <select aria-label="Wallet currency" value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} className="uppercase">
                {currencyOptions.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="copy-feed-block">
          <div className="sports-section-heading">
            <span className="sports-step">02</span>
            <div><h3 className="copy-feed-kicker">Stake & bet selection</h3><p className="sports-section-hint">The stake is in USD and is converted to your wallet currency.</p></div>
          </div>
          <div className="copy-feed-fields copy-feed-fields--3">
            <label className="copy-feed-field">
              <span>Stake per bet · USD</span>
              <input type="number" step="0.00000001" value={settings.amount} onChange={(e) => updateSettings({ amount: parseFloat(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Min odds</span>
              <input type="number" step="0.01" value={settings.minOdds} onChange={(e) => updateSettings({ minOdds: parseFloat(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Max odds</span>
              <input type="number" step="0.01" value={settings.maxOdds} onChange={(e) => updateSettings({ maxOdds: parseFloat(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Minimum legs</span>
              <input type="number" value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Maximum legs</span>
              <input type="number" value={settings.maxLegs} onChange={(e) => updateSettings({ maxLegs: parseInt(e.target.value) })} />
            </label>
            <label className="copy-feed-field copy-feed-field--span2">
              <span>Event keywords</span>
              <input
                type="text"
                value={settings.eventFilter || ''}
                onChange={(e) => updateSettings({ eventFilter: e.target.value })}
                placeholder="Night, Strickland"
                disabled={hasTournamentScope(settings)}
              />
            </label>
          </div>
        </section>

        <section className="copy-feed-block">
          <div className="sports-section-heading">
            <span className="sports-step">03</span>
            <div><h3 className="copy-feed-kicker">Session limits & filters</h3><p className="sports-section-hint">Choose the bet target and the event date window.</p></div>
          </div>
          <div className="copy-feed-fields copy-feed-fields--3">
            <label className="copy-feed-field">
              <span>Bet target</span>
              <input type="number" value={settings.numberOfBets} onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })} />
            </label>
          </div>
          {settings.fillUp && <p className="sports-inline-note">Fill-up is enabled: the bet target does not stop this mode. AutoBet fills to the active-bet limit and checks again later.</p>}
          <div className="copy-feed-chips">
            <Chip on={!!settings.ignoreLiveGames} onClick={() => updateSettings({ ignoreLiveGames: !settings.ignoreLiveGames })}>
              Ignore live
            </Chip>
            <Chip
              on={!!settings.onlyToday}
              onClick={() =>
                updateSettings({
                  onlyToday: !settings.onlyToday,
                  ...(settings.onlyToday ? {} : { maxKickoffDate: '' }),
                })
              }
            >
              Only today
            </Chip>
          </div>
          <div className="copy-feed-fields copy-feed-fields--4" style={{ marginTop: '0.75rem' }}>
            <label className="copy-feed-field">
              <span>Until date (local)</span>
              <input
                type="date"
                value={settings.maxKickoffDate || ''}
                disabled={!!settings.onlyToday}
                onChange={(e) =>
                  updateSettings({
                    maxKickoffDate: e.target.value,
                    ...(e.target.value ? { onlyToday: false } : {}),
                  })
                }
              />
            </label>
          </div>
        </section>

        <ProfilesPanel mode="autobet" />

        <details
          className="copy-feed-block copy-feed-advanced"
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="copy-feed-kicker copy-feed-advanced-summary">
            Advanced options <span>Tournaments, player props, fill-up, shields & scanning</span>
          </summary>
          <div className="copy-feed-fields copy-feed-fields--4" style={{ marginTop: '0.75rem' }}>
            <label className="copy-feed-field">
              <span>Scan limit</span>
              <input
                type="number"
                min={10}
                max={9999}
                step={10}
                value={settings.scanLimit || 50}
                onChange={(e) => updateSettings({ scanLimit: parseInt(e.target.value) })}
              />
            </label>
          </div>

          <div className="sports-advanced-group">
            <h3 className="copy-feed-kicker">Tournament</h3>
            <TournamentEventPickFields
              settings={settings}
              updateSettings={updateSettings}
              selectClass={selectClass}
              inputClass={inputClass}
              inputSelectStyle={inputSelectStyle}
              labelClass={labelClass}
              labelStyle={{ color: 'var(--app-text-muted)' }}
              variant="app"
            />
            <div className="copy-feed-chips" style={{ marginTop: '0.7rem' }}>
              <Chip
                on={!!settings.fillUpEventMaxLegs}
                onClick={() => {
                  if (!hasTournamentScope(settings)) return;
                  updateSettings({ fillUpEventMaxLegs: !settings.fillUpEventMaxLegs });
                }}
              >
                Fill legs per event
              </Chip>
            </div>
          </div>

          <div className="sports-advanced-group">
            <h3 className="copy-feed-kicker">Player props</h3>
            <div className="copy-feed-fields copy-feed-fields--3">
              <label className="copy-feed-field">
                <span>Include markets</span>
                <input
                  type="text"
                  value={settings.marketIncludeKeywords || ''}
                  onChange={(e) => updateSettings({ marketIncludeKeywords: e.target.value })}
                  placeholder="McKinney, Royval"
                />
              </label>
              <label className="copy-feed-field">
                <span>Exclude markets</span>
                <input
                  type="text"
                  value={settings.marketExcludeKeywords || ''}
                  onChange={(e) => updateSettings({ marketExcludeKeywords: e.target.value })}
                  placeholder="total strikes landed"
                />
              </label>
              <label className="copy-feed-field">
                <span>Include outcomes</span>
                <input
                  type="text"
                  value={settings.outcomeIncludeKeywords || ''}
                  onChange={(e) => updateSettings({ outcomeIncludeKeywords: e.target.value })}
                  placeholder="over, über"
                />
              </label>
            </div>
            <div className="copy-feed-chips" style={{ marginTop: '0.7rem' }}>
              {MMA_MARKET_TYPE_PRESETS.map((preset) => {
                const active = !parseMarketKeywords(settings.marketExcludeKeywords).includes(preset.keyword);
                return (
                  <Chip
                    key={preset.id}
                    on={active}
                    onClick={() =>
                      updateSettings({
                        marketExcludeKeywords: toggleExcludeKeyword(
                          settings.marketExcludeKeywords,
                          preset.keyword,
                          !active
                        ),
                      })
                    }
                  >
                    {preset.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          <div className="sports-advanced-group">
            <h3 className="copy-feed-kicker">Fill-up & shield</h3>
            <div className="copy-feed-chips">
              <Chip on={!!settings.fillUp} onClick={() => updateSettings({ fillUp: !settings.fillUp })}>
                {`Fill up to ${ACTIVE_SPORT_BETS_MAX_TOTAL}`}
              </Chip>
              <Chip on={!!settings.coverWithShield} onClick={() => updateSettings({ coverWithShield: !settings.coverWithShield })}>
                Cover with shield
              </Chip>
              <Chip
                on={!!settings.stakeShield?.enabled}
                onClick={() =>
                  updateSettings({
                    stakeShield: {
                      ...(settings.stakeShield || { legsThatCanLose: 1, strictMode: false }),
                      enabled: !settings.stakeShield?.enabled,
                    },
                  })
                }
              >
                Stake Shield
              </Chip>
              {settings.stakeShield?.enabled && (
                <Chip
                  on={!!settings.stakeShield?.strictMode}
                  onClick={() =>
                    updateSettings({
                      stakeShield: { ...settings.stakeShield!, strictMode: !settings.stakeShield?.strictMode },
                    })
                  }
                >
                  Shield strict
                </Chip>
              )}
            </div>
            {settings.stakeShield?.enabled && (
              <label className="copy-feed-field" style={{ marginTop: '0.7rem', maxWidth: 220 }}>
                <span>Protection legs</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={settings.stakeShield.legsThatCanLose || 1}
                  onChange={(e) =>
                    updateSettings({
                      stakeShield: { ...settings.stakeShield!, legsThatCanLose: parseInt(e.target.value) },
                    })
                  }
                />
              </label>
            )}
          </div>
        </details>

        {!isWide && <div className="pt-3">{startButton}</div>}
      </div>
      <aside className="sports-config-summary" aria-label="Current AutoBet configuration">
        <div className="sports-summary-heading"><h3>Current configuration</h3><span className={`sports-summary-state ${isRunning ? 'is-running' : ''}`}><span aria-hidden="true" />{isRunning ? 'AutoBet running' : 'Ready to configure'}</span></div>
        <dl className="sports-summary-values">
          <div><dt>Strategy</dt><dd>{settings.strategy}</dd></div>
          <div><dt>Stake per bet</dt><dd>{formatConfigNumber(settings.amount)} USD</dd></div>
          <div><dt>Wallet currency</dt><dd>{settings.currency.toUpperCase()}</dd></div>
          <div><dt>Events</dt><dd>{settings.gameType === 'all' ? 'Live & upcoming' : settings.gameType === 'live' ? 'Live' : 'Upcoming'}</dd></div>
          <div><dt>Sport</dt><dd>{selectedSport}</dd></div>
          <div><dt>Odds per leg</dt><dd>{formatConfigNumber(settings.minOdds)} – {formatConfigNumber(settings.maxOdds)}</dd></div>
          <div><dt>Legs per bet</dt><dd>{settings.minLegs} – {settings.maxLegs}</dd></div>
          <div><dt>Run mode</dt><dd>{settings.fillUp ? `Fill up to ${ACTIVE_SPORT_BETS_MAX_TOTAL} active bets` : `${settings.numberOfBets} bets`}</dd></div>
        </dl>
        {(hasTournamentScope(settings) || settings.onlyToday || settings.maxKickoffDate || settings.eventFilter || hasMarketFilters || settings.stakeShield?.enabled || settings.coverWithShield || settings.ignoreLiveGames) && (
          <div className="sports-summary-filters">
            <h4>Additional rules</h4>
            {hasTournamentScope(settings) && <span>Fixed tournament{settings.fillUpEventMaxLegs ? ' · fill legs per event' : ''}</span>}
            {settings.onlyToday ? <span>Today only · local time</span> : settings.maxKickoffDate ? <span>Through {settings.maxKickoffDate} · local time</span> : null}
            {settings.ignoreLiveGames && <span>Live events excluded</span>}
            {settings.eventFilter && !hasTournamentScope(settings) && <span>Event keyword filter</span>}
            {hasMarketFilters && <span>Player prop filters</span>}
            {settings.stakeShield?.enabled && <span>Stake Shield{settings.stakeShield.strictMode ? ' · strict' : ''} · {settings.stakeShield.legsThatCanLose || 1} protected leg(s)</span>}
            {settings.coverWithShield && <span>Additional shield bet</span>}
          </div>
        )}
        <p className="sports-summary-note">{isRunning ? 'Changes to this configuration can affect the running AutoBet. Some event filters apply on the next scan.' : 'Review these values before starting. Advanced options remain available below the main configuration.'}</p>
        <button type="button" className="sports-secondary-btn" onClick={() => setActiveTab('logs')}>View activity <span aria-hidden="true">→</span></button>
      </aside>
    </div>
  );

  const handleClearLogs = () => {
    if (logSource === 'copy') clearCopyLogs();
    else if (logSource === 'autobet') clearLogs();
    else {
      clearLogs();
      clearCopyLogs();
    }
  };

  return (
    <div className={`autobet-view ${isWide ? 'autobet-view--wide' : ''}`.trim()}>
      {isWide && (
        <div className="autobet-wide-header">
          <div className="autobet-wide-header-main">
            <div className="sports-heading-copy"><h2 className="autobet-wide-title">{activeTab === 'copy' ? 'Copy' : activeTab === 'bets' ? 'Bet slips' : activeTab === 'logs' ? 'Activity' : 'AutoBet'}</h2><p>{taskDescription}</p></div>
            <span className={`autobet-status-pill ${(activeTab === 'copy' ? copyRunning : isRunning) ? 'is-running' : ''}`.trim()}>
              <span className="autobet-status-dot" />
              {activeTab === 'copy' ? 'Copy' : 'AutoBet'} · {(activeTab === 'copy' ? copyRunning : isRunning) ? 'Running' : 'Stopped'}
            </span>
            {activeTab !== 'copy' && copyRunning && (
              <span className="autobet-status-pill is-running">
                <span className="autobet-status-dot" />
                Copy · Running
              </span>
            )}
            {activeTab === 'copy' && isRunning && (
              <span className="autobet-status-pill is-running">
                <span className="autobet-status-dot" />
                AutoBet · Running
              </span>
            )}
          </div>
          <div className="autobet-wide-header-actions">
            {activeTab === 'copy' ? copyStartButton : startButton}
          </div>
        </div>
      )}

      <nav className="autobet-tabs" aria-label="Sports workspace">
        <button
          className={`autobet-tab-btn ${activeTab === 'settings' ? 'is-active' : 'hover:opacity-90'}`}
          onClick={() => setActiveTab('settings')}
          type="button"
          aria-current={activeTab === 'settings' ? 'page' : undefined}
        >
          AutoBet
        </button>
        <button
          className={`autobet-tab-btn ${activeTab === 'copy' ? 'is-active' : 'hover:opacity-90'}`}
          onClick={() => setActiveTab('copy')}
          type="button"
          aria-current={activeTab === 'copy' ? 'page' : undefined}
        >
          Copy
        </button>
        {isWide && (
          <button
            className={`autobet-tab-btn ${activeTab === 'bets' ? 'is-active' : 'hover:opacity-90'}`}
            onClick={() => setActiveTab('bets')}
            type="button"
            aria-current={activeTab === 'bets' ? 'page' : undefined}
          >
            Bet slips <span className="autobet-tab-count">{activeBetCount} active</span>
          </button>
        )}
        <button
          className={`autobet-tab-btn ${activeTab === 'logs' ? 'is-active' : 'hover:opacity-90'}`}
          onClick={() => setActiveTab('logs')}
          type="button"
          aria-current={activeTab === 'logs' ? 'page' : undefined}
        >
          Activity <span className="autobet-tab-count">{logCount}</span>
        </button>
      </nav>

      <div className={`autobet-content scrollbar-thin ${activeTab === 'bets' ? 'autobet-content--bets' : ''} ${activeTab === 'logs' ? 'autobet-content--logs' : ''} ${activeTab === 'copy' || activeTab === 'settings' ? 'autobet-content--copy' : ''}`.trim()} style={{ scrollbarColor: 'var(--app-border) transparent' }}>
          {activeTab === 'copy' ? (
            <CopyBetPanel sports={sports} onSportChange={setSharedSport} />
          ) : activeTab === 'settings' ? (
            settingsPane
          ) : activeTab === 'logs' ? (
             <div className="autobet-log-shell">
                 <div className="autobet-log-header">
                    <div className="copy-feed-seg autobet-log-source" role="tablist" aria-label="Log source">
                      {([
                        ['combined', 'Combined'],
                        ['autobet', 'AutoBet'],
                        ['copy', 'Copy'],
                      ] as const).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={logSource === id}
                          className={`copy-feed-seg-btn ${logSource === id ? 'is-on' : ''}`}
                          onClick={() => setLogSource(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={handleClearLogs} className="autobet-log-clear">
                        Clear activity
                    </button>
                 </div>
                 <div className="sports-activity-list scrollbar-thin" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
                    {unifiedLogs.length === 0 ? (
                        <div className="sports-activity-empty">
                            <span>No activity yet — AutoBet and Copy events will appear here.</span>
                        </div>
                    ) : (
                        unifiedLogs.map((log) => (
                            <div
                              key={`${log.channel}-${log.id}`}
                              className={`autobet-log-entry autobet-log-entry--${log.type}`}
                            >
                                <div className="flex flex-col items-center min-w-[52px] border-r pr-2 opacity-80" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                    <span className="sports-log-time">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    <span className="autobet-log-channel">{log.channel === 'copy' ? 'Copy' : 'AutoBet'}</span>
                                </div>
                                <div className="flex-1 break-words font-medium min-w-0">
                                  <div>{log.message}</div>
                                  {'source' in log && (log.source || log.correlationId) && (
                                    <details className="sports-log-details"><summary>Technical details</summary><div>{log.source ? `Source: ${log.source}` : ''}{log.source && log.correlationId ? ' · ' : ''}{log.correlationId ? `Reference: ${log.correlationId}` : ''}</div></details>
                                  )}
                                </div>
                            </div>
                        ))
                    )}
                 </div>
             </div>
          ) : (
            <ActiveBetsPanel
              embedded
              initialPreviewBetId={activeBetsPreviewBetId}
            />
          )}
      </div>
    </div>
  );
}

function formatConfigNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—';
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`copy-feed-chip ${on ? 'is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  );
}

function LastScanIndicator({ lastScanAt }: { lastScanAt: number }) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  
  useEffect(() => {
    const updateSeconds = () => setSecondsAgo(Math.floor((Date.now() - lastScanAt) / 1000));
    updateSeconds();
    const interval = setInterval(updateSeconds, 1000);
    return () => clearInterval(interval);
  }, [lastScanAt]);

  return (
    <div>
      <span className="copy-feed-kpi-label">Last Scan</span>
      <strong title={new Date(lastScanAt).toLocaleString()}>
        {secondsAgo}s ago
      </strong>
    </div>
  );
}
