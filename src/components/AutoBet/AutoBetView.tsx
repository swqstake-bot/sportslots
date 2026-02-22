import { useState, useEffect } from 'react';
import { useAutoBetStore, type AutoBetStrategy } from '../../store/autoBetStore';
import { useUserStore } from '../../store/userStore';
import { StakeApi } from '../../api/client';
import { Queries } from '../../api/queries';

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

  return (
    <div className="flex flex-col h-full bg-[#0f212e] text-[#b1bad3]">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-[#2f4553] bg-[#1a2c38]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00e701] animate-pulse"></span>
            AutoBet Configuration
          </h2>
      </div>

       {/* Tabs */}
        <div className="flex border-b border-[#2f4553] bg-[#0f212e]">
          <button 
            className={`flex-1 py-3 font-bold text-xs transition-colors relative uppercase tracking-wider ${
                activeTab === 'settings' 
                ? 'text-white bg-[#1a2c38]' 
                : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]/50'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
            {activeTab === 'settings' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00e701] shadow-[0_0_8px_rgba(0,231,1,0.6)]"></div>
            )}
          </button>
          <button 
            className={`flex-1 py-3 font-bold text-xs transition-colors relative uppercase tracking-wider ${
                activeTab === 'logs' 
                ? 'text-white bg-[#1a2c38]' 
                : 'text-[#b1bad3] hover:text-white hover:bg-[#1a2c38]/50'
            }`}
            onClick={() => setActiveTab('logs')}
          >
            Logs
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] ${logs.length > 0 ? 'bg-[#2f4553] text-white' : 'bg-[#1a2c38] text-[#55657e]'}`}>
                {logs.length}
            </span>
            {activeTab === 'logs' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00e701] shadow-[0_0_8px_rgba(0,231,1,0.6)]"></div>
            )}
          </button>
        </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-[#1a2c38] scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent">
          {activeTab === 'settings' ? (
              <div className="space-y-5">
                  {/* Strategy */}
                  <div className="group">
                    <label className="block text-xs font-bold text-[#b1bad3] mb-2 uppercase tracking-wider group-hover:text-white transition-colors">Strategy</label>
                    <div className="relative">
                        <select 
                        value={settings.strategy}
                        onChange={(e) => updateSettings({ strategy: e.target.value as AutoBetStrategy })}
                        className="w-full bg-[#0f212e] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-bold appearance-none transition-all shadow-inner cursor-pointer"
                        >
                        {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#b1bad3]">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                  </div>
                  
                  {/* Game Type & Sport */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="group">
                        <label className="block text-xs font-bold text-[#b1bad3] mb-2 uppercase tracking-wider group-hover:text-white transition-colors">Game Type</label>
                        <div className="relative">
                            <select
                                value={settings.gameType}
                                onChange={(e) => updateSettings({ gameType: e.target.value as any })}
                                className="w-full bg-[#0f212e] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-bold appearance-none transition-all shadow-inner cursor-pointer"
                            >
                                <option value="upcoming">Upcoming</option>
                                <option value="live">Live</option>
                                <option value="all">All</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#b1bad3]">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                             <input 
                                type="checkbox"
                                id="ignoreLiveGames"
                                checked={settings.ignoreLiveGames || false}
                                onChange={(e) => updateSettings({ ignoreLiveGames: e.target.checked })}
                                className="w-3.5 h-3.5 bg-[#1a2c38] border-[#2f4553] rounded text-[#00e701] focus:ring-[#00e701]/20 cursor-pointer"
                            />
                            <label htmlFor="ignoreLiveGames" className="text-[10px] text-[#b1bad3] cursor-pointer hover:text-white transition-colors select-none">
                                Ignore Live Games
                            </label>
                        </div>
                    </div>
                    <div className="group">
                        <label className="block text-xs font-bold text-[#b1bad3] mb-2 uppercase tracking-wider group-hover:text-white transition-colors">Sport</label>
                        <div className="relative">
                            <select
                                value={settings.sportSlug}
                                onChange={(e) => updateSettings({ sportSlug: e.target.value })}
                                className="w-full bg-[#0f212e] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-bold appearance-none transition-all shadow-inner cursor-pointer"
                            >
                                <option value="all">All Sports</option>
                                <option value="starting_soon">Starting Soon</option>
                                {sports.map(s => (
                                    <option key={s.slug} value={s.slug}>{s.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#b1bad3]">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                  </div>

                  {/* Wallet & Amount */}
                  <div className="p-4 bg-[#0f212e] rounded border border-[#2f4553]">
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-1 h-3 bg-[#00e701] rounded-full shadow-[0_0_5px_#00e701]"></span>
                        Wallet & Amount
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[#55657e] mb-1.5 uppercase tracking-wider">Currency</label>
                          <div className="relative">
                            <select 
                                value={settings.currency}
                                onChange={(e) => updateSettings({ currency: e.target.value })}
                                className="w-full bg-[#1a2c38] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-bold appearance-none transition-all shadow-inner cursor-pointer uppercase"
                            >
                                {availableCurrencies.length > 0 ? (
                                    availableCurrencies.map(c => (
                                        <option key={c} value={c}>{c.toUpperCase()}</option>
                                    ))
                                ) : (
                                    Object.keys(balances).length > 0 ? (
                                        Object.keys(balances).map(c => (
                                            <option key={c} value={c}>{c.toUpperCase()}</option>
                                        ))
                                    ) : (
                                        <option value="usd">USD</option>
                                    )
                                )}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[#b1bad3]">
                                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#55657e] mb-1.5 uppercase tracking-wider">Amount</label>
                          <input 
                            type="number" step="0.00000001" value={settings.amount}
                            onChange={(e) => updateSettings({ amount: parseFloat(e.target.value) })}
                            className="w-full bg-[#1a2c38] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-mono placeholder-[#55657e] transition-all font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                  </div>

                  {/* Odds Range */}
                  <div className="p-3 bg-[#0f212e] rounded border border-[#2f4553]">
                      <h3 className="text-[10px] font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-1 h-3 bg-[#00e701] rounded-full shadow-[0_0_5px_#00e701]"></span>
                        Odds Range
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-[#55657e] mb-1 uppercase tracking-wider">Min</label>
                          <input 
                            type="number" step="0.01" value={settings.minOdds}
                            onChange={(e) => updateSettings({ minOdds: parseFloat(e.target.value) })}
                            className="w-full bg-[#1a2c38] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-mono placeholder-[#55657e] transition-all font-bold"
                            placeholder="1.01"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[#55657e] mb-1 uppercase tracking-wider">Max</label>
                          <input 
                            type="number" step="0.01" value={settings.maxOdds}
                            onChange={(e) => updateSettings({ maxOdds: parseFloat(e.target.value) })}
                            className="w-full bg-[#1a2c38] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-mono placeholder-[#55657e] transition-all font-bold"
                            placeholder="100.00"
                          />
                        </div>
                      </div>
                  </div>

                  {/* Legs Range */}
                  <div className="p-3 bg-[#0f212e] rounded border border-[#2f4553]">
                      <h3 className="text-[10px] font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-1 h-3 bg-[#00e701] rounded-full shadow-[0_0_5px_#00e701]"></span>
                        Legs (Multi)
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-[#55657e] mb-1 uppercase tracking-wider">Min</label>
                          <input 
                            type="number" value={settings.minLegs}
                            onChange={(e) => updateSettings({ minLegs: parseInt(e.target.value) })}
                            className="w-full bg-[#1a2c38] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-mono placeholder-[#55657e] transition-all font-bold"
                            placeholder="1"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[#55657e] mb-1 uppercase tracking-wider">Max</label>
                          <input 
                            type="number" value={settings.maxLegs}
                            onChange={(e) => updateSettings({ maxLegs: parseInt(e.target.value) })}
                            className="w-full bg-[#1a2c38] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-mono placeholder-[#55657e] transition-all font-bold"
                            placeholder="10"
                          />
                        </div>
                      </div>
                  </div>

                  {/* Limits */}
                   <div className="group">
                      <label className="block text-[10px] font-bold text-[#b1bad3] mb-1.5 uppercase tracking-wider group-hover:text-white transition-colors">Max Number of Bets</label>
                      <input 
                        type="number" value={settings.numberOfBets}
                        onChange={(e) => updateSettings({ numberOfBets: parseInt(e.target.value) })}
                        className="w-full bg-[#0f212e] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-mono font-bold placeholder-[#55657e] transition-all shadow-inner"
                        placeholder="100"
                      />
                    </div>

                    {/* Scan Limit Slider */}
                    <div className="group">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-[10px] font-bold text-[#b1bad3] uppercase tracking-wider group-hover:text-white transition-colors">
                          Fixtures to Scan (Per Sport)
                        </label>
                        <span className="text-[#00e701] font-mono font-bold text-xs">
                          {settings.scanLimit || 50}
                        </span>
                      </div>
                      <div className="relative flex items-center">
                        <input 
                          type="range" 
                          min="10" 
                          max="200" 
                          step="10"
                          value={settings.scanLimit || 50}
                          onChange={(e) => updateSettings({ scanLimit: parseInt(e.target.value) })}
                          className="w-full h-1.5 bg-[#0f212e] rounded-lg appearance-none cursor-pointer accent-[#00e701] hover:bg-[#2f4553] transition-colors"
                        />
                      </div>
                    </div>

                    {/* Event Filter */}
                    <div className="group">
                      <label className="block text-[10px] font-bold text-[#b1bad3] mb-1.5 uppercase tracking-wider group-hover:text-white transition-colors">Event Filter (Keywords)</label>
                      <input 
                        type="text" value={settings.eventFilter || ''}
                        onChange={(e) => updateSettings({ eventFilter: e.target.value })}
                        className="w-full bg-[#0f212e] border border-[#2f4553] rounded hover:border-[#b1bad3] p-2.5 text-white focus:border-[#00e701] focus:shadow-[0_0_0_1px_rgba(0,231,1,0.2)] outline-none text-xs font-bold placeholder-[#55657e] transition-all shadow-inner"
                        placeholder="e.g. Night: Strickland"
                      />
                    </div>

                    {/* Stake Shield Settings */}
                    <div className="group border border-[#2f4553] p-3 rounded-lg bg-[#0f212e]/50">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-bold text-[#b1bad3] uppercase tracking-wider group-hover:text-white transition-colors flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-[#00e701]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                                Stake Shield
                            </label>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={settings.stakeShield?.enabled || false}
                                    onChange={(e) => updateSettings({ 
                                        stakeShield: { 
                                            ...(settings.stakeShield || { legsThatCanLose: 1, strictMode: false }), 
                                            enabled: e.target.checked 
                                        } 
                                    })}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-[#1a2c38] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#00e701]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00e701]"></div>
                            </label>
                        </div>

                        {settings.stakeShield?.enabled && (
                            <div className="space-y-3 mt-3 pt-3 border-t border-[#2f4553]/50">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-[#b1bad3] uppercase tracking-wider">Strict Mode</span>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={settings.stakeShield?.strictMode || false}
                                            onChange={(e) => updateSettings({ 
                                                stakeShield: { 
                                                    ...settings.stakeShield!, 
                                                    strictMode: e.target.checked 
                                                } 
                                            })}
                                            className="w-3.5 h-3.5 bg-[#1a2c38] border-[#2f4553] rounded text-[#00e701] focus:ring-[#00e701]/20"
                                        />
                                        <span className="text-[10px] text-[#55657e] hover:text-[#b1bad3] transition-colors">Skip if unavailable</span>
                                    </label>
                                </div>
                                
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-[10px] font-bold text-[#55657e] uppercase tracking-wider">Protection Level</label>
                                        <span className="text-[#00e701] font-mono font-bold text-xs">
                                            {settings.stakeShield.legsThatCanLose || 1} Legs
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="5" 
                                        step="1"
                                        value={settings.stakeShield.legsThatCanLose || 1}
                                        onChange={(e) => updateSettings({ 
                                            stakeShield: { 
                                                ...settings.stakeShield!, 
                                                legsThatCanLose: parseInt(e.target.value) 
                                            } 
                                        })}
                                        className="w-full h-1.5 bg-[#1a2c38] rounded-lg appearance-none cursor-pointer accent-[#00e701] hover:bg-[#2f4553] transition-colors"
                                    />
                                    <p className="text-[10px] text-[#55657e] mt-1 italic">
                                        Bet will win even if {settings.stakeShield.legsThatCanLose || 1} selection(s) lose.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Start/Stop Button */}
                    <div className="pt-6">
                        <button
                            onClick={handleStartStop}
                            className={`w-full font-bold py-5 rounded-lg text-base transition-all shadow-[0_4px_14px_0_rgba(0,0,0,0.39)] transform active:scale-[0.98] uppercase tracking-wider flex justify-center items-center gap-3 ${
                                isRunning 
                                ? 'bg-[#ff4d4d] hover:bg-[#ff3333] text-white shadow-red-900/20 border-b-4 border-[#cc0000]' 
                                : 'bg-[#00e701] hover:bg-[#00c201] text-[#0f212e] shadow-green-900/20 border-b-4 border-[#00b301]'
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
             <div className="flex flex-col h-full bg-[#1a2c38] rounded-lg overflow-hidden border border-[#2f4553]">
                 <div className="flex justify-between items-center p-3 border-b border-[#2f4553] bg-[#0f212e]">
                    <span className="text-white font-bold uppercase tracking-wider text-[10px] flex items-center gap-2">
                        <svg className="w-3 h-3 text-[#00e701]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Activity Log
                    </span>
                    <button 
                        onClick={clearLogs} 
                        className="text-[10px] text-[#b1bad3] hover:text-white hover:bg-[#2f4553] px-3 py-1.5 rounded transition-all uppercase tracking-wider font-bold flex items-center gap-1.5 group"
                    >
                        <svg className="w-3 h-3 text-[#b1bad3] group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Clear
                    </button>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-[#1a2c38]">
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#55657e] italic opacity-50 space-y-2">
                            <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                            <span>No logs yet</span>
                        </div>
                    ) : (
                        logs.map(log => (
                            <div key={log.id} className={`p-2.5 rounded border-l-[3px] text-[11px] leading-relaxed shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 flex gap-2 ${
                            log.type === 'error' ? 'bg-[#2f1a1a] border-[#ff4d4d] text-[#ffcccb]' :
                            log.type === 'success' ? 'bg-[#1a2f1a] border-[#00e701] text-[#ccffcc]' :
                            log.type === 'warning' ? 'bg-[#2f2f1a] border-[#ffd700] text-[#fffacd]' :
                            'bg-[#0f212e] border-[#2f4553] text-[#b1bad3]'
                            }`}>
                                <div className="flex flex-col items-center justify-start min-w-[55px] border-r border-white/10 pr-2 mr-1">
                                    <span className="font-mono text-[10px] opacity-70">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    {log.type === 'error' && <svg className="w-3 h-3 mt-1 text-[#ff4d4d]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                                    {log.type === 'success' && <svg className="w-3 h-3 mt-1 text-[#00e701]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                                    {log.type === 'warning' && <svg className="w-3 h-3 mt-1 text-[#ffd700]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>}
                                    {log.type === 'info' && <svg className="w-3 h-3 mt-1 text-[#b1bad3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                                </div>
                                <div className="flex-1 break-words font-medium">
                                    {log.message}
                                </div>
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
