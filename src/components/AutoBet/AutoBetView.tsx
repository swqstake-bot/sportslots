import { useState, useEffect } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { useUserStore } from '../../store/userStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { AccordionSection } from '../ui/AccordionSection';
import { TournamentEventPickFields } from './TournamentEventPickFields';
import { hasTournamentScope } from '../../utils/tournamentScope';

const STRATEGIES: AutoBetStrategy[] = [
  'Smart', 'Conservative', 'Aggressive', 'Balanced', 'Favorites', 'Underdogs', 'ValueHunter'
];

export function AutoBetView() {
  const { settings, logs, isRunning, updateSettings, start, stop, clearLogs } = useAutoBetStore();
  const { availableCurrencies, balances } = useUserStore();
  const [activeTab, setActiveTab] = useState<'settings' | 'logs'>('settings');
  const [sports, setSports] = useState<{name: string, slug: string}[]>([]);

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

  const selectClass = 'w-full rounded p-2 text-sm font-medium appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:border-[var(--app-accent)]';
  const inputClass = 'w-full rounded p-2 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-[var(--app-accent)] focus:border-[var(--app-accent)]';
  const inputSelectStyle = { background: 'var(--app-bg-deep)', border: '1px solid var(--app-border)', color: 'var(--app-text)' };
  const labelClass = 'block text-[11px] font-bold mb-1 uppercase tracking-wider';
  const labelStyle = { color: 'var(--app-text-muted)' };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--app-bg-deep)', color: 'var(--app-text-muted)' }}>
      <div className="flex border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
        <button
          className={`flex-1 py-3 font-bold text-sm transition-colors relative uppercase tracking-wider ${activeTab === 'settings' ? '' : 'hover:opacity-90'}`}
          style={activeTab === 'settings' ? { color: 'var(--app-text)', background: 'var(--app-bg-card)' } : { color: 'var(--app-text-muted)' }}
          onClick={() => setActiveTab('settings')}
        >
          Settings
          {activeTab === 'settings' && <div className="absolute bottom-0 left-0 w-full h-0.5" style={{ background: 'var(--app-accent)' }} />}
        </button>
        <button
          className={`flex-1 py-3 font-bold text-sm transition-colors relative uppercase tracking-wider ${activeTab === 'logs' ? '' : 'hover:opacity-90'}`}
          style={activeTab === 'logs' ? { color: 'var(--app-text)', background: 'var(--app-bg-card)' } : { color: 'var(--app-text-muted)' }}
          onClick={() => setActiveTab('logs')}
        >
          Logs
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${logs.length > 0 ? '' : ''}`} style={logs.length > 0 ? { background: 'var(--app-border)', color: 'var(--app-text)' } : { background: 'var(--app-bg-deep)', color: 'var(--app-text-muted)' }}>{logs.length}</span>
          {activeTab === 'logs' && <div className="absolute bottom-0 left-0 w-full h-0.5" style={{ background: 'var(--app-accent)' }} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-thin" style={{ background: 'var(--app-bg-card)', scrollbarColor: 'var(--app-border) transparent' }}>
          {activeTab === 'settings' ? (
              <div className="space-y-2.5">
                  <AccordionSection title="Strategy" defaultOpen={true}>
                    <div className="space-y-3">
                      <div>
                        <label className={labelClass} style={labelStyle}>Strategy</label>
                        <div className="relative">
                          <select value={settings.strategy} onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })} className={selectClass} style={inputSelectStyle}>
                            {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3" style={{ color: 'var(--app-text-muted)' }}>▼</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass} style={labelStyle}>Game Type</label>
                          <div className="relative">
                            <select value={settings.gameType} onChange={(e) => updateSettings({ gameType: e.target.value as any })} className={selectClass} style={inputSelectStyle}>
                              <option value="upcoming">Upcoming</option>
                              <option value="live">Live</option>
                              <option value="all">All</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3" style={{ color: 'var(--app-text-muted)' }}>▼</div>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass} style={labelStyle}>Sport</label>
                          <div className="relative">
                            <select value={settings.sportSlug} onChange={(e) => updateSettings({ sportSlug: e.target.value })} className={selectClass} style={inputSelectStyle}>
                              <option value="all">All Sports</option>
                              <option value="starting_soon">Starting Soon</option>
                              {sports.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3" style={{ color: 'var(--app-text-muted)' }}>▼</div>
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="ignoreLiveGames" checked={settings.ignoreLiveGames || false} onChange={(e) => updateSettings({ ignoreLiveGames: e.target.checked })} className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--app-accent)', borderColor: 'var(--app-border)' }} />
                        <span className="text-xs hover:opacity-90" style={{ color: 'var(--app-text-muted)' }}>Ignore Live Games</span>
                      </label>
                    </div>
                  </AccordionSection>

                  <AccordionSection title="Wallet" defaultOpen={true}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass} style={labelStyle}>Currency</label>
                        <div className="relative">
                          <select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} className={`${selectClass} uppercase`} style={inputSelectStyle}>
                            {availableCurrencies.length > 0 ? availableCurrencies.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>) : Object.keys(balances).length > 0 ? Object.keys(balances).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>) : <option value="usd">USD</option>}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2" style={{ color: 'var(--app-text-muted)' }}>▼</div>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Amount</label>
                        <input type="number" step="0.00000001" value={settings.amount} onChange={(e) => updateSettings({ amount: parseFloat(e.target.value) })} className={inputClass} style={inputSelectStyle} placeholder="0.00" />
                      </div>
                    </div>
                  </AccordionSection>

                  <AccordionSection title="Filters" defaultOpen={false}>
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--app-text)' }}>Odds Range</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className={labelClass} style={labelStyle}>Min</label><input type="number" step="0.01" value={settings.minOdds} onChange={(e) => updateSettings({ minOdds: parseFloat(e.target.value) })} className={inputClass} style={inputSelectStyle} placeholder="1.01" /></div>
                          <div><label className={labelClass} style={labelStyle}>Max</label><input type="number" step="0.01" value={settings.maxOdds} onChange={(e) => updateSettings({ maxOdds: parseFloat(e.target.value) })} className={inputClass} style={inputSelectStyle} placeholder="100" /></div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--app-text)' }}>Legs (Multi)</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className={labelClass} style={labelStyle}>Min</label><input type="number" value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })} className={inputClass} style={inputSelectStyle} placeholder="1" /></div>
                          <div><label className={labelClass} style={labelStyle}>Max</label><input type="number" value={settings.maxLegs} onChange={(e) => updateSettings({ maxLegs: parseInt(e.target.value) })} className={inputClass} style={inputSelectStyle} placeholder="10" /></div>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Max Number of Bets</label>
                        <input type="number" value={settings.numberOfBets} onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })} className={inputClass} style={inputSelectStyle} placeholder="100" />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className={labelClass} style={labelStyle}>Fixtures to Scan</label>
                          <span className="font-mono font-bold text-sm" style={{ color: 'var(--app-accent)' }}>{settings.scanLimit || 50}</span>
                        </div>
                        <input type="range" min="10" max={9999} step="10" value={settings.scanLimit || 50} onChange={(e) => updateSettings({ scanLimit: parseInt(e.target.value) })} className="w-full h-2 rounded-lg appearance-none cursor-pointer" style={{ background: 'var(--app-bg-deep)', accentColor: 'var(--app-accent)' }} />
                      </div>
                      <div>
                        <label className={labelClass} style={labelStyle}>Event Filter (Keywords)</label>
                        <input type="text" value={settings.eventFilter || ''} onChange={(e) => updateSettings({ eventFilter: e.target.value })} className={inputClass} style={inputSelectStyle} placeholder="e.g. Night: Strickland" disabled={hasTournamentScope(settings)} />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--app-text-muted)' }}>Aus bei festem Turnier (Sport + Event oder URL).</p>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold mb-2 uppercase tracking-wider" style={{ color: 'var(--app-text)' }}>Turnier / Event</h4>
                        <TournamentEventPickFields
                          settings={settings}
                          updateSettings={updateSettings}
                          selectClass={selectClass}
                          inputClass={inputClass}
                          inputSelectStyle={inputSelectStyle}
                          labelClass={labelClass}
                          labelStyle={labelStyle}
                          variant="app"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.fillUpEventMaxLegs || false}
                          onChange={(e) => updateSettings({ fillUpEventMaxLegs: e.target.checked })}
                          className="w-4 h-4 rounded cursor-pointer"
                          style={{ accentColor: 'var(--app-accent)', borderColor: 'var(--app-border)' }}
                          disabled={!hasTournamentScope(settings)}
                        />
                        <span className="text-xs hover:opacity-90" style={{ color: 'var(--app-text-muted)' }}>
                          Fill legs pro Event (alle verfügbaren Fights im Turnier, begrenzt durch Max Legs)
                        </span>
                      </label>
                    </div>
                  </AccordionSection>

                  <AccordionSection title="Advanced" defaultOpen={false}>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)' }}>
                        <input type="checkbox" checked={settings.fillUp || false} onChange={(e) => updateSettings({ fillUp: e.target.checked })} className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--app-accent)', borderColor: 'var(--app-border)' }} />
                        <div>
                          <span className="block text-sm font-bold" style={{ color: 'var(--app-text)' }}>Fill Up Mode</span>
                          <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Keep filling up to 150 bets. Retry every 3 mins if full.</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" style={{ background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)' }}>
                        <input type="checkbox" checked={settings.coverWithShield || false} onChange={(e) => updateSettings({ coverWithShield: e.target.checked })} className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--app-accent)', borderColor: 'var(--app-border)' }} />
                        <div>
                          <span className="block text-sm font-bold" style={{ color: 'var(--app-text)' }}>Cover with Shield</span>
                          <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>Place 2nd identical bet with Shield after success.</span>
                        </div>
                      </label>
                      <div className="p-3 rounded-lg border" style={{ background: 'rgba(15,15,25,0.5)', borderColor: 'var(--app-border)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--app-text-muted)' }}>
                            <svg className="w-4 h-4" style={{ color: 'var(--app-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            Stake Shield
                          </span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={settings.stakeShield?.enabled || false} onChange={(e) => updateSettings({ stakeShield: { ...(settings.stakeShield || { legsThatCanLose: 1, strictMode: false }), enabled: e.target.checked } })} className="sr-only peer" />
                            <div className="w-9 h-5 rounded-full bg-[var(--app-border)] peer-checked:bg-[var(--app-accent)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                          </label>
                        </div>
                        {settings.stakeShield?.enabled && (
                          <div className="space-y-3 mt-3 pt-3 border-t" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 50%, transparent)' }}>
                            <label className="flex items-center justify-between cursor-pointer">
                              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--app-text-muted)' }}>Strict Mode</span>
                              <input type="checkbox" checked={settings.stakeShield?.strictMode || false} onChange={(e) => updateSettings({ stakeShield: { ...settings.stakeShield!, strictMode: e.target.checked } })} className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: 'var(--app-accent)', borderColor: 'var(--app-border)' }} />
                            </label>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className={labelClass} style={labelStyle}>Protection Level</label>
                                <span className="font-mono font-bold text-sm" style={{ color: 'var(--app-accent)' }}>{settings.stakeShield.legsThatCanLose || 1} Legs</span>
                              </div>
                              <input type="range" min="1" max={5} step="1" value={settings.stakeShield.legsThatCanLose || 1} onChange={(e) => updateSettings({ stakeShield: { ...settings.stakeShield!, legsThatCanLose: parseInt(e.target.value) } })} className="w-full h-2 rounded-lg appearance-none cursor-pointer" style={{ background: 'var(--app-bg-deep)', accentColor: 'var(--app-accent)' }} />
                              <p className="text-xs mt-1" style={{ color: 'var(--app-text-muted)' }}>Bet wins even if {settings.stakeShield.legsThatCanLose || 1} selection(s) lose.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionSection>

                  <div className="pt-3">
                        <button
                            onClick={handleStartStop}
                            className="w-full font-bold py-3 rounded-lg text-xs transition-all shadow-lg transform active:scale-[0.98] uppercase tracking-wider flex justify-center items-center gap-2"
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
                    </div>

              </div>
          ) : (
             <div className="flex flex-col h-full rounded-lg overflow-hidden border" style={{ background: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }}>
                 <div className="flex justify-between items-center p-3 border-b" style={{ borderColor: 'var(--app-border)', background: 'var(--app-bg-deep)' }}>
                    <span className="font-bold uppercase tracking-wider text-xs flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                        <svg className="w-4 h-4" style={{ color: 'var(--app-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Activity Log
                    </span>
                    <button onClick={clearLogs} className="text-xs px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider font-bold flex items-center gap-2 hover:opacity-90" style={{ color: 'var(--app-text-muted)', background: 'var(--app-border)' }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Clear
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full italic opacity-70 space-y-2" style={{ color: 'var(--app-text-muted)' }}>
                            <svg className="w-12 h-12 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            <span className="text-sm">No logs yet</span>
                        </div>
                    ) : (
                        logs.map(log => {
                            const logStyle = log.type === 'error'
                                ? { background: 'rgba(255,51,102,0.1)', borderColor: 'var(--app-error)', color: 'var(--app-error)' }
                                : log.type === 'success'
                                    ? { background: 'rgba(var(--app-accent-rgb), 0.1)', borderColor: 'var(--app-accent)', color: 'var(--app-accent)' }
                                    : log.type === 'warning'
                                        ? { background: 'rgba(251,191,36,0.1)', borderColor: 'var(--app-warning)', color: 'var(--app-warning)' }
                                        : { background: 'var(--app-bg-deep)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' };
                            return (
                            <div key={log.id} className="p-3 rounded-lg border-l-4 text-xs leading-relaxed flex gap-2" style={logStyle}>
                                <div className="flex flex-col items-center min-w-[52px] border-r pr-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                                    <span className="font-mono text-[11px] opacity-80">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    {log.type === 'error' && <svg className="w-4 h-4 mt-1" style={{ color: 'var(--app-error)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                    {log.type === 'success' && <svg className="w-4 h-4 mt-1" style={{ color: 'var(--app-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                    {log.type === 'warning' && <svg className="w-4 h-4 mt-1" style={{ color: 'var(--app-warning)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                                    {log.type === 'info' && <svg className="w-4 h-4 mt-1" style={{ color: 'var(--app-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                </div>
                                <div className="flex-1 break-words font-medium">{log.message}</div>
                            </div>
                        );
                        })
                    )}
                 </div>
             </div>
          )}
      </div>
    </div>
  );
}
