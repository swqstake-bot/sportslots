import { useEffect, useMemo, useState } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { TournamentEventPickFields } from './TournamentEventPickFields';
import { ActiveBetsPanel } from '../ActiveBets/ActiveBetsPanel';
import { CopyBetPanel } from './CopyBetPanel';
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
    ? availableCurrencies
    : Object.keys(balances).length
      ? Object.keys(balances)
      : ['usd'];

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
      className={`autobet-start-btn transition-all shadow-lg transform active:scale-[0.98] flex justify-center items-center gap-2 ${isWide ? 'autobet-start-btn--wide' : ''}`}
      style={copyRunning
        ? { background: 'var(--app-error)', color: 'white', border: '2px solid rgba(255,51,102,0.5)' }
        : { background: 'var(--app-accent)', color: 'var(--app-bg-deep)', border: '2px solid rgba(var(--app-accent-rgb), 0.5)' }
      }
    >
      {copyRunning ? 'Stop copy feed' : 'Start copy feed'}
    </button>
  );

  const startButton = (
    <button
      onClick={handleStartStop}
      className={`autobet-start-btn transition-all shadow-lg transform active:scale-[0.98] flex justify-center items-center gap-2 ${isWide ? 'autobet-start-btn--wide' : ''}`}
      style={isRunning
        ? { background: 'var(--app-error)', color: 'white', border: '2px solid rgba(255,51,102,0.5)' }
        : { background: 'var(--app-accent)', color: 'var(--app-bg-deep)', border: '2px solid rgba(var(--app-accent-rgb), 0.5)' }
      }
    >
      {isRunning ? (
        <>
          <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span>
          Stop AutoBet
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Start AutoBet
        </>
      )}
    </button>
  );

  const settingsPane = (
    <div className={`copy-feed copy-feed--solo ${isWide ? '' : 'copy-feed--sidebar'}`.trim()}>
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
            <span className="copy-feed-kpi-label">Session</span>
            <strong>${investedUsd.toFixed(2)}</strong>
          </div>
        </div>

        <section className="copy-feed-block">
          <h3 className="copy-feed-kicker">Essentials</h3>
          <div className="copy-feed-fields copy-feed-fields--4">
            <label className="copy-feed-field">
              <span>Strategy</span>
              <select value={settings.strategy} onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Game type</span>
              <select value={settings.gameType} onChange={(e) => updateSettings({ gameType: e.target.value as 'live' | 'upcoming' | 'all' })}>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Sport</span>
              <select value={settings.sportSlug} onChange={(e) => setSharedSport(e.target.value)}>
                <option value="all">All sports</option>
                <option value="starting_soon">Starting Soon</option>
                {sports.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Currency</span>
              <select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} className="uppercase">
                {currencyOptions.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="copy-feed-field">
              <span>Amount</span>
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
              <span>Min legs</span>
              <input type="number" value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })} />
            </label>
            <label className="copy-feed-field">
              <span>Max legs</span>
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
          <div className="copy-feed-chips">
            <Chip on={!!settings.ignoreLiveGames} onClick={() => updateSettings({ ignoreLiveGames: !settings.ignoreLiveGames })}>
              Ignore live
            </Chip>
          </div>
        </section>

        <details
          className="copy-feed-block copy-feed-advanced"
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="copy-feed-kicker copy-feed-advanced-summary">
            Advanced · tournament, props, shield, scan
          </summary>
          <div className="copy-feed-fields copy-feed-fields--4" style={{ marginTop: '0.75rem' }}>
            <label className="copy-feed-field">
              <span>Max bets</span>
              <input type="number" value={settings.numberOfBets} onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })} />
            </label>
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

          <div className="mt-4">
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

          <div className="mt-4">
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

          <div className="mt-4">
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
            <h2 className="autobet-wide-title">{activeTab === 'copy' ? 'Copy Feed' : 'AutoBet Bot'}</h2>
            <span className={`autobet-status-pill ${(activeTab === 'copy' ? copyRunning : isRunning) ? 'is-running' : ''}`.trim()}>
              <span className="autobet-status-dot" />
              {(activeTab === 'copy' ? copyRunning : isRunning) ? 'Running' : 'Stopped'}
            </span>
            {activeTab !== 'copy' && copyRunning && (
              <span className="autobet-status-pill is-running">
                <span className="autobet-status-dot" />
                Copy
              </span>
            )}
            {activeTab === 'copy' && isRunning && (
              <span className="autobet-status-pill is-running">
                <span className="autobet-status-dot" />
                AutoBet
              </span>
            )}
          </div>
          <div className="autobet-wide-header-actions">
            {activeTab === 'copy' ? copyStartButton : startButton}
          </div>
        </div>
      )}

      <div className="autobet-tabs">
        <button
          className={`autobet-tab-btn ${activeTab === 'settings' ? 'is-active' : 'hover:opacity-90'}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        <button
          className={`autobet-tab-btn ${activeTab === 'copy' ? 'is-active' : 'hover:opacity-90'}`}
          onClick={() => setActiveTab('copy')}
        >
          Copy
        </button>
        <button
          className={`autobet-tab-btn ${activeTab === 'logs' ? 'is-active' : 'hover:opacity-90'}`}
          onClick={() => setActiveTab('logs')}
        >
          Logs <span className="autobet-tab-count">{logCount}</span>
        </button>
        {isWide && (
          <button
            className={`autobet-tab-btn ${activeTab === 'bets' ? 'is-active' : 'hover:opacity-90'}`}
            onClick={() => setActiveTab('bets')}
          >
            Bets <span className="autobet-tab-count">{activeBetCount}</span>
          </button>
        )}
      </div>

      <div className={`autobet-content scrollbar-thin ${activeTab === 'bets' ? 'autobet-content--bets' : ''} ${activeTab === 'copy' || activeTab === 'settings' ? 'autobet-content--copy' : ''}`.trim()} style={{ scrollbarColor: 'var(--app-border) transparent' }}>
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
                        Clear
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
                    {unifiedLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-60 py-16" style={{ color: 'var(--app-text-muted)' }}>
                            <span className="text-sm">No activity yet — start AutoBet or Copy to see logs.</span>
                        </div>
                    ) : (
                        unifiedLogs.map((log) => (
                            <div
                              key={`${log.channel}-${log.id}`}
                              className={`autobet-log-entry autobet-log-entry--${log.type}`}
                            >
                                <div className="flex flex-col items-center min-w-[52px] border-r pr-2 opacity-80" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                    <span className="font-mono text-[10px]">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    <span className="autobet-log-channel">{log.channel === 'copy' ? 'Copy' : 'Auto'}</span>
                                </div>
                                <div className="flex-1 break-words font-medium min-w-0">
                                  <div>{log.message}</div>
                                  {'source' in log && (log.source || log.correlationId) && (
                                    <div className="mt-1 text-[10px] opacity-75 truncate" title={`${log.source ? `src=${log.source}` : ''}${log.source && log.correlationId ? ' · ' : ''}${log.correlationId ? `corr=${log.correlationId}` : ''}`}>
                                      {log.source ? `src=${log.source}` : ''}{log.source && log.correlationId ? ' · ' : ''}{log.correlationId ? `corr=${log.correlationId}` : ''}
                                    </div>
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={`copy-feed-chip ${on ? 'is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  );
}
