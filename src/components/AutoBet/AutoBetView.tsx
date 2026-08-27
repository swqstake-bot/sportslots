import { useState, useEffect } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { useUserStore } from '../../store/userStore';
import { useUiStore } from '../../store/uiStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { AccordionSection } from '../ui/AccordionSection';
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

export function AutoBetView({ layout = 'sidebar' }: AutoBetViewProps) {
  const { settings, logs, isRunning, updateSettings, start, stop, clearLogs } = useAutoBetStore();
  const { availableCurrencies, balances, activeBets } = useUserStore();
  const sportsCenterTab = useUiStore((s) => s.sportsCenterTab);
  const setSportsCenterTab = useUiStore((s) => s.setSportsCenterTab);
  const activeBetsPreviewBetId = useUiStore((s) => s.activeBetsPreviewBetId);
  const [localTab, setLocalTab] = useState<'settings' | 'logs' | 'bets' | 'copy'>('settings');
  const copyRunning = useCopyBetStore((s) => s.isRunning);
  const startCopyFeed = useCopyBetStore((s) => s.start);
  const stopCopyFeed = useCopyBetStore((s) => s.stop);
  const [sports, setSports] = useState<{name: string, slug: string}[]>([]);

  const isWide = layout === 'wide';
  const activeTab = isWide ? sportsCenterTab : localTab;
  const setActiveTab = isWide ? setSportsCenterTab : setLocalTab;

  useEffect(() => {
    async function fetchSports() {
        try {
            // Determine type based on settings
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

  const handleStartStop = () => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  };

  const labelClass = 'autobet-field-label';
  const activeBetCount = activeBets.length;

  const panel = (title: string, subtitle?: string, icon?: string) => ({
    title,
    subtitle,
    icon: icon ? <span aria-hidden>{icon}</span> : undefined,
    collapsible: !isWide,
    defaultOpen: true,
    variant: (isWide ? 'glass' : 'default') as 'default' | 'glass',
  });

  const selectClass = 'autobet-control w-full px-3 py-2.5 text-sm font-medium appearance-none cursor-pointer';
  const inputClass = 'autobet-control w-full px-3 py-2.5 text-sm font-mono';
  const inputSelectStyle = { background: 'transparent', border: 'none', color: 'inherit' };

  const strategyBlock = (
    <AccordionSection {...panel('Strategy', 'Scan mode & sport scope', '⚡')}>
      <div className="space-y-4">
        <div className="autobet-field">
          <label className={labelClass}>Strategy</label>
          <div className="relative">
            <select value={settings.strategy} onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })} className={selectClass}>
              {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 opacity-50">▼</div>
          </div>
        </div>
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Game Type</label>
            <div className="relative">
              <select value={settings.gameType} onChange={(e) => updateSettings({ gameType: e.target.value as any })} className={selectClass}>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="all">All</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 opacity-50">▼</div>
            </div>
          </div>
          <div className="autobet-field">
            <label className={labelClass}>Sport</label>
            <div className="relative">
              <select value={settings.sportSlug} onChange={(e) => updateSettings({ sportSlug: e.target.value })} className={selectClass}>
                <option value="all">All Sports</option>
                <option value="starting_soon">Starting Soon</option>
                {sports.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 opacity-50">▼</div>
            </div>
          </div>
        </div>
        <label className="autobet-check-card">
          <input type="checkbox" checked={settings.ignoreLiveGames || false} onChange={(e) => updateSettings({ ignoreLiveGames: e.target.checked })} />
          <span>
            <span className="autobet-check-card-title">Ignore live games</span>
            <span className="autobet-check-card-desc">Only scan upcoming fixtures when enabled.</span>
          </span>
        </label>
      </div>
    </AccordionSection>
  );

  const walletBlock = (
    <AccordionSection {...panel('Wallet', 'Stake & currency per bet', '💰')}>
      <div className="autobet-field-row">
        <div className="autobet-field">
          <label className={labelClass}>Currency</label>
          <div className="relative">
            <select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} className={`${selectClass} uppercase`}>
              {availableCurrencies.length > 0 ? availableCurrencies.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>) : Object.keys(balances).length > 0 ? Object.keys(balances).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>) : <option value="usd">USD</option>}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 opacity-50">▼</div>
          </div>
        </div>
        <div className="autobet-field">
          <label className={labelClass}>Amount</label>
          <input type="number" step="0.00000001" value={settings.amount} onChange={(e) => updateSettings({ amount: parseFloat(e.target.value) })} className={inputClass} placeholder="0.00" />
        </div>
      </div>
    </AccordionSection>
  );

  const filtersBlock = (
    <AccordionSection {...panel('Filters & Limits', 'Odds, legs & scan volume', '🎯')}>
      <div className="space-y-4">
        <div className="autobet-field-row">
          <div>
            <div className="autobet-section-label">Odds range</div>
            <div className="autobet-field-row">
              <div className="autobet-field">
                <label className={labelClass}>Min</label>
                <input type="number" step="0.01" value={settings.minOdds} onChange={(e) => updateSettings({ minOdds: parseFloat(e.target.value) })} className={inputClass} placeholder="1.01" />
              </div>
              <div className="autobet-field">
                <label className={labelClass}>Max</label>
                <input type="number" step="0.01" value={settings.maxOdds} onChange={(e) => updateSettings({ maxOdds: parseFloat(e.target.value) })} className={inputClass} placeholder="100" />
              </div>
            </div>
          </div>
          <div>
            <div className="autobet-section-label">Legs (multi)</div>
            <div className="autobet-field-row">
              <div className="autobet-field">
                <label className={labelClass}>Min</label>
                <input type="number" value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })} className={inputClass} placeholder="1" />
              </div>
              <div className="autobet-field">
                <label className={labelClass}>Max</label>
                <input type="number" value={settings.maxLegs} onChange={(e) => updateSettings({ maxLegs: parseInt(e.target.value) })} className={inputClass} placeholder="10" />
              </div>
            </div>
          </div>
        </div>
        <div className="autobet-field-row">
          <div className="autobet-field">
            <label className={labelClass}>Max number of bets</label>
            <input type="number" value={settings.numberOfBets} onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })} className={inputClass} placeholder="100" />
          </div>
          <div className="autobet-field">
            <div className="autobet-range-row">
              <label className={labelClass}>Max events to scan</label>
              <span className="autobet-range-value">{settings.scanLimit || 50}</span>
            </div>
            <input type="range" min="10" max={9999} step="10" value={settings.scanLimit || 50} onChange={(e) => updateSettings({ scanLimit: parseInt(e.target.value) })} className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
          </div>
        </div>
        <div className="autobet-field">
          <label className={labelClass}>Event filter (keywords)</label>
          <input type="text" value={settings.eventFilter || ''} onChange={(e) => updateSettings({ eventFilter: e.target.value })} className={inputClass} placeholder="e.g. Night: Strickland" disabled={hasTournamentScope(settings)} />
          <p className="autobet-field-hint mt-1">Disabled when a fixed tournament scope is set (sport + event or URL).</p>
        </div>
      </div>
    </AccordionSection>
  );

  const eventBlock = (
    <AccordionSection {...panel('Tournament / Event', 'UFC card or paste Stake URL', '🥊')}>
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
      <label className="autobet-check-card mt-4">
        <input
          type="checkbox"
          checked={settings.fillUpEventMaxLegs || false}
          onChange={(e) => updateSettings({ fillUpEventMaxLegs: e.target.checked })}
          disabled={!hasTournamentScope(settings)}
        />
        <span>
          <span className="autobet-check-card-title">Fill legs per event</span>
          <span className="autobet-check-card-desc">One leg per fight on the card, up to Max Legs.</span>
        </span>
      </label>
    </AccordionSection>
  );

  const marketKeywordsBlock = (
    <AccordionSection {...panel('Player props', 'MMA markets & over/under filter', '📊')}>
      <div className="space-y-4">
        <div className="autobet-field">
          <label className={labelClass}>Include markets</label>
          <input
            type="text"
            value={settings.marketIncludeKeywords || ''}
            onChange={(e) => updateSettings({ marketIncludeKeywords: e.target.value })}
            className={inputClass}
            placeholder="McKinney, Royval, Sandhagen, Saint Denis"
          />
          <p className="autobet-field-hint mt-1">Comma-separated fighter or market keywords. Empty = all.</p>
        </div>
        <div className="autobet-field">
          <label className={labelClass}>Exclude markets</label>
          <input
            type="text"
            value={settings.marketExcludeKeywords || ''}
            onChange={(e) => updateSettings({ marketExcludeKeywords: e.target.value })}
            className={inputClass}
            placeholder="total strikes landed, takedown"
          />
          <p className="autobet-field-hint mt-1">Skip props containing any keyword.</p>
        </div>
        <div className="autobet-field">
          <label className={labelClass}>Include outcomes</label>
          <input
            type="text"
            value={settings.outcomeIncludeKeywords || ''}
            onChange={(e) => updateSettings({ outcomeIncludeKeywords: e.target.value })}
            className={inputClass}
            placeholder="over, über"
          />
          <p className="autobet-field-hint mt-1">Only Over/Über when set. Empty = both sides. Tip: use <code className="opacity-80">over, unter</code> if needed.</p>
        </div>
        <div className="autobet-field">
          <label className={labelClass}>MMA prop types</label>
          <div className="autobet-chip-grid">
            {MMA_MARKET_TYPE_PRESETS.map((preset) => {
              const active = !parseMarketKeywords(settings.marketExcludeKeywords).includes(preset.keyword);
              return (
                <label
                  key={preset.id}
                  className={`autobet-chip ${active ? 'is-active' : ''}`.trim()}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) =>
                      updateSettings({
                        marketExcludeKeywords: toggleExcludeKeyword(
                          settings.marketExcludeKeywords,
                          preset.keyword,
                          e.target.checked
                        ),
                      })
                    }
                  />
                  {preset.label}
                </label>
              );
            })}
          </div>
          <p className="autobet-field-hint mt-2">Tap to include/exclude prop categories from scans.</p>
        </div>
      </div>
    </AccordionSection>
  );

  const advancedBlock = (
    <AccordionSection {...panel('Advanced', 'Fill-up, shield & protection', '🛡️')}>
      <div className="space-y-3">
        <label className="autobet-check-card">
          <input type="checkbox" checked={settings.fillUp || false} onChange={(e) => updateSettings({ fillUp: e.target.checked })} />
          <span>
            <span className="autobet-check-card-title">Fill up mode</span>
            <span className="autobet-check-card-desc">Keep filling up to {ACTIVE_SPORT_BETS_MAX_TOTAL} bets. Retry every 3 min if full.</span>
          </span>
        </label>
        <label className="autobet-check-card">
          <input type="checkbox" checked={settings.coverWithShield || false} onChange={(e) => updateSettings({ coverWithShield: e.target.checked })} />
          <span>
            <span className="autobet-check-card-title">Cover with shield</span>
            <span className="autobet-check-card-desc">Duplicate bet with Stake Shield after success.</span>
          </span>
        </label>
        <div className="autobet-advanced-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="autobet-panel-title">Stake Shield</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.stakeShield?.enabled || false} onChange={(e) => updateSettings({ stakeShield: { ...(settings.stakeShield || { legsThatCanLose: 1, strictMode: false }), enabled: e.target.checked } })} className="sr-only peer" />
              <div className="w-9 h-5 rounded-full bg-[var(--app-border)] peer-checked:bg-[var(--app-accent)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>
          {settings.stakeShield?.enabled && (
            <div className="space-y-3 mt-3 pt-3 border-t border-[color-mix(in_srgb,var(--app-border)_50%,transparent)]">
              <label className="autobet-check-card py-2">
                <input type="checkbox" checked={settings.stakeShield?.strictMode || false} onChange={(e) => updateSettings({ stakeShield: { ...settings.stakeShield!, strictMode: e.target.checked } })} />
                <span>
                  <span className="autobet-check-card-title">Strict mode</span>
                  <span className="autobet-check-card-desc">Skip bet if shield unavailable.</span>
                </span>
              </label>
              <div className="autobet-field">
                <div className="autobet-range-row">
                  <label className={labelClass}>Protection level</label>
                  <span className="autobet-range-value">{settings.stakeShield.legsThatCanLose || 1} legs</span>
                </div>
                <input type="range" min="1" max={5} step="1" value={settings.stakeShield.legsThatCanLose || 1} onChange={(e) => updateSettings({ stakeShield: { ...settings.stakeShield!, legsThatCanLose: parseInt(e.target.value) } })} className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[var(--app-accent)]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </AccordionSection>
  );

  const copyStartButton = (
    <button
      onClick={() => (copyRunning ? stopCopyFeed() : startCopyFeed())}
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
          Logs <span className="autobet-tab-count">{logs.length}</span>
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

      <div className={`autobet-content scrollbar-thin ${activeTab === 'bets' ? 'autobet-content--bets' : ''}`.trim()} style={{ scrollbarColor: 'var(--app-border) transparent' }}>
          {activeTab === 'copy' ? (
            <CopyBetPanel />
          ) : activeTab === 'settings' ? (
              isWide ? (
                <div className="autobet-wide-grid">
                  <div className="autobet-wide-col">{strategyBlock}{walletBlock}</div>
                  <div className="autobet-wide-col">{filtersBlock}{eventBlock}</div>
                  <div className="autobet-wide-col">{marketKeywordsBlock}{advancedBlock}</div>
                </div>
              ) : (
              <div className="space-y-2.5">
                  {strategyBlock}
                  {walletBlock}
                  {filtersBlock}
                  {eventBlock}
                  {marketKeywordsBlock}
                  {advancedBlock}
                  <div className="pt-3">{startButton}</div>
              </div>
              )
          ) : activeTab === 'logs' ? (
             <div className="autobet-log-shell">
                 <div className="autobet-log-header">
                    <span className="autobet-log-title">
                        Activity log
                    </span>
                    <button type="button" onClick={clearLogs} className="autobet-log-clear">
                        Clear
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-60 py-16" style={{ color: 'var(--app-text-muted)' }}>
                            <span className="text-sm">No activity yet — start AutoBet to see logs.</span>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div
                              key={log.id}
                              className={`autobet-log-entry autobet-log-entry--${log.type}`}
                            >
                                <div className="flex flex-col items-center min-w-[52px] border-r pr-2 opacity-80" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                                    <span className="font-mono text-[10px]">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                </div>
                                <div className="flex-1 break-words font-medium min-w-0">
                                  <div>{log.message}</div>
                                  {(log.source || log.correlationId) && (
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
