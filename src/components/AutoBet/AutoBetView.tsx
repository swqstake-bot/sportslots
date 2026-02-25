import { useState, useEffect } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { useUserStore } from '../../store/userStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';
import { TipMenu } from '../ui/TipMenu';
import { AccordionSection } from '../ui/AccordionSection';

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

  const selectClass = 'w-full bg-stake-bg-deep border border-stake-border rounded-lg hover:border-stake-text-muted p-2.5 text-white focus:border-stake-success focus:ring-1 focus:ring-stake-success/30 outline-none text-sm font-medium appearance-none cursor-pointer';
  const inputClass = 'w-full bg-stake-bg-deep border border-stake-border rounded-lg hover:border-stake-text-muted p-2.5 text-white focus:border-stake-success focus:ring-1 focus:ring-stake-success/30 outline-none text-sm font-mono placeholder-stake-text-dim';
  const labelClass = 'block text-xs font-bold text-stake-text-muted mb-1.5 uppercase tracking-wider';

  return (
    <div className="flex flex-col h-full bg-stake-bg-deep text-stake-text-muted">
      <div className="flex justify-between items-center p-4 border-b border-stake-border bg-stake-bg-card">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-stake-success animate-pulse" />
          AutoBet
        </h2>
      </div>

      <div className="flex border-b border-stake-border bg-stake-bg-deep">
        <button
          className={`flex-1 py-3 font-bold text-sm transition-colors relative uppercase tracking-wider ${activeTab === 'settings' ? 'text-white bg-stake-bg-card' : 'text-stake-text-muted hover:text-white hover:bg-stake-bg-card/50'}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
          {activeTab === 'settings' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-stake-success" />}
        </button>
        <button
          className={`flex-1 py-3 font-bold text-sm transition-colors relative uppercase tracking-wider ${activeTab === 'logs' ? 'text-white bg-stake-bg-card' : 'text-stake-text-muted hover:text-white hover:bg-stake-bg-card/50'}`}
          onClick={() => setActiveTab('logs')}
        >
          Logs
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${logs.length > 0 ? 'bg-stake-border text-white' : 'bg-stake-bg-deep text-stake-text-dim'}`}>{logs.length}</span>
          {activeTab === 'logs' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-stake-success" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-stake-bg-card scrollbar-thin scrollbar-thumb-stake-border scrollbar-track-transparent">
          {activeTab === 'settings' ? (
              <div className="space-y-3">
                  <div className="flex justify-end">
                    <TipMenu />
                  </div>

                  <AccordionSection title="Strategy" defaultOpen={true}>
                    <div className="space-y-4">
                      <div>
                        <label className={labelClass}>Strategy</label>
                        <div className="relative">
                          <select value={settings.strategy} onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })} className={selectClass}>
                            {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-stake-text-muted">▼</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Game Type</label>
                          <div className="relative">
                            <select value={settings.gameType} onChange={(e) => updateSettings({ gameType: e.target.value as any })} className={selectClass}>
                              <option value="upcoming">Upcoming</option>
                              <option value="live">Live</option>
                              <option value="all">All</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-stake-text-muted">▼</div>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Sport</label>
                          <div className="relative">
                            <select value={settings.sportSlug} onChange={(e) => updateSettings({ sportSlug: e.target.value })} className={selectClass}>
                              <option value="all">All Sports</option>
                              <option value="starting_soon">Starting Soon</option>
                              {sports.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-stake-text-muted">▼</div>
                          </div>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="ignoreLiveGames" checked={settings.ignoreLiveGames || false} onChange={(e) => updateSettings({ ignoreLiveGames: e.target.checked })} className="w-4 h-4 rounded border-stake-border text-stake-success focus:ring-stake-success/20 cursor-pointer" />
                        <span className="text-xs text-stake-text-muted hover:text-white">Ignore Live Games</span>
                      </label>
                    </div>
                  </AccordionSection>

                  <AccordionSection title="Wallet" defaultOpen={true}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Currency</label>
                        <div className="relative">
                          <select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })} className={`${selectClass} uppercase`}>
                            {availableCurrencies.length > 0 ? availableCurrencies.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>) : Object.keys(balances).length > 0 ? Object.keys(balances).map(c => <option key={c} value={c}>{c.toUpperCase()}</option>) : <option value="usd">USD</option>}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-stake-text-muted">▼</div>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Amount</label>
                        <input type="number" step="0.00000001" value={settings.amount} onChange={(e) => updateSettings({ amount: parseFloat(e.target.value) })} className={inputClass} placeholder="0.00" />
                      </div>
                    </div>
                  </AccordionSection>

                  <AccordionSection title="Filters" defaultOpen={false}>
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wider">Odds Range</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className={labelClass}>Min</label><input type="number" step="0.01" value={settings.minOdds} onChange={(e) => updateSettings({ minOdds: parseFloat(e.target.value) })} className={inputClass} placeholder="1.01" /></div>
                          <div><label className={labelClass}>Max</label><input type="number" step="0.01" value={settings.maxOdds} onChange={(e) => updateSettings({ maxOdds: parseFloat(e.target.value) })} className={inputClass} placeholder="100" /></div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wider">Legs (Multi)</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className={labelClass}>Min</label><input type="number" value={settings.minLegs} onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })} className={inputClass} placeholder="1" /></div>
                          <div><label className={labelClass}>Max</label><input type="number" value={settings.maxLegs} onChange={(e) => updateSettings({ maxLegs: parseInt(e.target.value) })} className={inputClass} placeholder="10" /></div>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Max Number of Bets</label>
                        <input type="number" value={settings.numberOfBets} onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })} className={inputClass} placeholder="100" />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className={labelClass}>Fixtures to Scan</label>
                          <span className="text-stake-success font-mono font-bold text-sm">{settings.scanLimit || 50}</span>
                        </div>
                        <input type="range" min="10" max="200" step="10" value={settings.scanLimit || 50} onChange={(e) => updateSettings({ scanLimit: parseInt(e.target.value) })} className="w-full h-2 bg-stake-bg-deep rounded-lg appearance-none cursor-pointer accent-stake-success" />
                      </div>
                      <div>
                        <label className={labelClass}>Event Filter (Keywords)</label>
                        <input type="text" value={settings.eventFilter || ''} onChange={(e) => updateSettings({ eventFilter: e.target.value })} className={inputClass} placeholder="e.g. Night: Strickland" />
                      </div>
                    </div>
                  </AccordionSection>

                  <AccordionSection title="Advanced" defaultOpen={false}>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 p-3 rounded-lg bg-stake-bg-deep border border-stake-border cursor-pointer hover:border-stake-text-muted/50 transition-colors">
                        <input type="checkbox" checked={settings.fillUp || false} onChange={(e) => updateSettings({ fillUp: e.target.checked })} className="w-4 h-4 rounded border-stake-border text-stake-success focus:ring-stake-success/20 cursor-pointer" />
                        <div>
                          <span className="block text-sm font-bold text-white">Fill Up Mode</span>
                          <span className="text-xs text-stake-text-muted">Keep filling up to 150 bets. Retry every 3 mins if full.</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 p-3 rounded-lg bg-stake-bg-deep border border-stake-border cursor-pointer hover:border-stake-text-muted/50 transition-colors">
                        <input type="checkbox" checked={settings.coverWithShield || false} onChange={(e) => updateSettings({ coverWithShield: e.target.checked })} className="w-4 h-4 rounded border-stake-border text-stake-success focus:ring-stake-success/20 cursor-pointer" />
                        <div>
                          <span className="block text-sm font-bold text-white">Cover with Shield</span>
                          <span className="text-xs text-stake-text-muted">Place 2nd identical bet with Shield after success.</span>
                        </div>
                      </label>
                      <div className="p-3 rounded-lg bg-stake-bg-deep/50 border border-stake-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-stake-text-muted uppercase tracking-wider flex items-center gap-2">
                            <svg className="w-4 h-4 text-stake-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            Stake Shield
                          </span>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={settings.stakeShield?.enabled || false} onChange={(e) => updateSettings({ stakeShield: { ...(settings.stakeShield || { legsThatCanLose: 1, strictMode: false }), enabled: e.target.checked } })} className="sr-only peer" />
                            <div className="w-9 h-5 bg-stake-border rounded-full peer peer-checked:bg-stake-success after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                          </label>
                        </div>
                        {settings.stakeShield?.enabled && (
                          <div className="space-y-3 mt-3 pt-3 border-t border-stake-border/50">
                            <label className="flex items-center justify-between cursor-pointer">
                              <span className="text-xs font-bold text-stake-text-muted uppercase tracking-wider">Strict Mode</span>
                              <input type="checkbox" checked={settings.stakeShield?.strictMode || false} onChange={(e) => updateSettings({ stakeShield: { ...settings.stakeShield!, strictMode: e.target.checked } })} className="w-4 h-4 rounded border-stake-border text-stake-success" />
                            </label>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className={labelClass}>Protection Level</label>
                                <span className="text-stake-success font-mono font-bold text-sm">{settings.stakeShield.legsThatCanLose || 1} Legs</span>
                              </div>
                              <input type="range" min="1" max="5" step="1" value={settings.stakeShield.legsThatCanLose || 1} onChange={(e) => updateSettings({ stakeShield: { ...settings.stakeShield!, legsThatCanLose: parseInt(e.target.value) } })} className="w-full h-2 bg-stake-bg-deep rounded-lg appearance-none cursor-pointer accent-stake-success" />
                              <p className="text-xs text-stake-text-dim mt-1">Bet wins even if {settings.stakeShield.legsThatCanLose || 1} selection(s) lose.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionSection>

                  <div className="pt-4">
                        <button
                            onClick={handleStartStop}
                            className={`w-full font-bold py-4 rounded-xl text-sm transition-all shadow-lg transform active:scale-[0.98] uppercase tracking-wider flex justify-center items-center gap-3 ${
                                isRunning
                                ? 'bg-stake-error hover:bg-stake-error/90 text-white border-2 border-stake-error/50'
                                : 'bg-stake-success hover:bg-stake-success/90 text-stake-bg-deep border-2 border-stake-success/50'
                            }`}
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
             <div className="flex flex-col h-full bg-stake-bg-card rounded-lg overflow-hidden border border-stake-border">
                 <div className="flex justify-between items-center p-3 border-b border-stake-border bg-stake-bg-deep">
                    <span className="text-white font-bold uppercase tracking-wider text-xs flex items-center gap-2">
                        <svg className="w-4 h-4 text-stake-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Activity Log
                    </span>
                    <button onClick={clearLogs} className="text-xs text-stake-text-muted hover:text-white hover:bg-stake-border px-3 py-1.5 rounded-lg transition-all uppercase tracking-wider font-bold flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Clear
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-stake-border scrollbar-track-transparent">
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-stake-text-dim italic opacity-70 space-y-2">
                            <svg className="w-12 h-12 mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            <span className="text-sm">No logs yet</span>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className={`p-3 rounded-lg border-l-4 text-xs leading-relaxed flex gap-2 ${
                            log.type === 'error' ? 'bg-stake-error/10 border-stake-error text-stake-error' :
                            log.type === 'success' ? 'bg-stake-success/10 border-stake-success text-stake-success' :
                            log.type === 'warning' ? 'bg-stake-warning/10 border-stake-warning text-stake-warning' :
                            'bg-stake-bg-deep border-stake-border text-stake-text-muted'
                            }`}>
                                <div className="flex flex-col items-center min-w-[52px] border-r border-white/10 pr-2">
                                    <span className="font-mono text-[11px] opacity-80">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    {log.type === 'error' && <svg className="w-4 h-4 mt-1 text-stake-error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                    {log.type === 'success' && <svg className="w-4 h-4 mt-1 text-stake-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                    {log.type === 'warning' && <svg className="w-4 h-4 mt-1 text-stake-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                                    {log.type === 'info' && <svg className="w-4 h-4 mt-1 text-stake-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                </div>
                                <div className="flex-1 break-words font-medium">{log.message}</div>
                            </div>
                        ))
                    )}
                 </div>
             </div>
          )}
      </div>
    </div>
  );
}
