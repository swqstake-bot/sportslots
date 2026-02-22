import { useState, useEffect } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { useUiStore } from '../store/uiStore';

interface Sport {
  id: string;
  name: string;
  slug: string;
  fixtureCount: number;
}

export function Sidebar() {
  const { currentView, setCurrentView, selectedSport, setSelectedSport, casinoMode, setCasinoMode } = useUiStore();
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSports() {
      try {
        const response = await StakeApi.query<any>(Queries.SportListMenu, {
          type: 'upcoming',
          limit: 100,
          offset: 0,
          liveRank: false,
          sportType: 'sport'
        });

        if (response.data?.sportList) {
          setSports(response.data.sportList);
        }
      } catch (err) {
        console.error('Failed to fetch sports', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSports();
  }, []);

  return (
    <div className="w-[280px] bg-[#0f212e] border-r border-[#2f4553] h-[calc(100vh-64px)] flex flex-col shadow-2xl z-20 transition-all duration-300">
      <div className="p-4 border-b border-[#2f4553] flex flex-col gap-4 bg-[#0f212e]">
        <div className="bg-[#071d2a] rounded-full p-1.5 flex relative items-center justify-between shadow-md">
            <button 
              onClick={() => setCurrentView('casino')}
              className={`flex-1 text-sm font-bold py-2.5 text-center transition-all uppercase tracking-wide ${
                currentView === 'casino' 
                  ? 'text-[#0f212e] bg-[#00e701] rounded-full shadow-lg transform scale-105' 
                  : 'text-[#b1bad3] hover:text-white'
              }`}
            >
              Casino
            </button>
            <button 
              onClick={() => setCurrentView('sports')}
              className={`flex-1 text-sm font-bold py-2.5 text-center transition-all uppercase tracking-wide ${
                currentView === 'sports' 
                  ? 'text-[#0f212e] bg-[#00e701] rounded-full shadow-lg transform scale-105' 
                  : 'text-[#b1bad3] hover:text-white'
              }`}
            >
              Sports
            </button>
        </div>
        
        {currentView === 'sports' && (
          <div className="relative group">
               <input 
                  type="text" 
                  placeholder="Search" 
                  className="w-full bg-[#071d2a] text-white text-sm rounded-full py-2.5 pl-10 pr-4 border border-transparent focus:border-[#2f4553] group-hover:bg-[#0b2434] focus:outline-none transition-all placeholder-[#55657e] font-medium shadow-inner"
               />
               <svg className="w-4 h-4 text-[#55657e] absolute left-4 top-1/2 -translate-y-1/2 group-hover:text-[#b1bad3] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        )}
      </div>
      
      {currentView === 'sports' && (
        <>
          <div className="px-6 py-4 font-bold text-white uppercase text-xs tracking-wider flex items-center gap-2 opacity-90">
            <span className="text-[#b1bad3]">Browse</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent px-4 pb-4 space-y-2">
            {loading ? (
              <div className="flex flex-col gap-3 p-1">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-10 bg-[#1a2c38] rounded-lg animate-pulse opacity-50"></div>
                ))}
              </div>
            ) : (
              <>
                 <button
                    onClick={() => setSelectedSport('live')}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all flex justify-between items-center group shadow-sm ${
                      selectedSport === 'live' 
                      ? 'bg-[#2f4553] text-white shadow-[inset_3px_0_0_0_#00e701]' 
                      : 'text-[#b1bad3] hover:bg-[#1a2c38] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                       <div className="relative flex items-center justify-center w-4 h-4">
                          <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-[#ff4d4d] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff4d4d]"></span>
                       </div>
                       <span className="text-sm font-medium">Live Events</span>
                    </span>
                    <span className="text-xs font-bold bg-[#213743] text-[#b1bad3] px-2 py-1 rounded group-hover:bg-[#0f212e] group-hover:text-white transition-colors">
                        12
                    </span>
                  </button>

                 <button
                    onClick={() => setSelectedSport('upcoming')}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all flex justify-between items-center group ${
                      selectedSport === 'upcoming' 
                      ? 'bg-[#2f4553] text-white shadow-[inset_3px_0_0_0_#00e701]' 
                      : 'text-[#b1bad3] hover:bg-[#1a2c38] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                       <svg className="w-5 h-5 text-[#b1bad3] group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                       <span className="text-sm font-medium">Starting Soon</span>
                    </span>
                  </button>

                 <div className="px-2 py-3 text-xs font-bold text-[#55657e] uppercase tracking-wider">All Sports</div>
                 
                 <ul className="space-y-1">
                  {sports.map(sport => (
                    <li key={sport.id}>
                      <button
                        onClick={() => setSelectedSport(sport.slug)}
                        className={`w-full text-left px-4 py-3 rounded-lg transition-all flex justify-between items-center group ${
                          selectedSport === sport.slug 
                          ? 'bg-[#2f4553] text-white shadow-[inset_3px_0_0_0_#00e701]' 
                          : 'text-[#b1bad3] hover:bg-[#1a2c38] hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                            {/* Generic Sport Icon */}
                           <svg className={`w-5 h-5 ${selectedSport === sport.slug ? 'text-white' : 'text-[#b1bad3] group-hover:text-white'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                           <span className="text-sm font-medium truncate">{sport.name}</span>
                        </span>
                        {sport.fixtureCount > 0 && (
                            <span className={`text-xs font-bold px-2 py-1 rounded transition-colors ${
                                 selectedSport === sport.slug 
                                 ? 'bg-[#0f212e] text-[#00e701]'
                                 : 'bg-[#213743] text-[#b1bad3] group-hover:bg-[#0f212e] group-hover:text-white'
                            }`}>
                              {sport.fixtureCount}
                            </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
      {currentView === 'casino' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#2f4553] scrollbar-track-transparent p-6 space-y-4">
          <div className="p-8 pb-5 font-bold text-white uppercase text-lg tracking-wider flex items-center gap-3 opacity-90">
            <span className="text-[#b1bad3]">Menu</span>
          </div>
          {['play', 'challenges', 'bonushunt', 'forum', 'logs'].map((m) => {
            const labels: Record<string, string> = {
              play: 'Play',
              challenges: 'Challenges',
              bonushunt: 'Bonus Hunt',
              forum: 'Forum',
              logs: 'Logs'
            }
            return (
            <button
              key={m}
              onClick={() => setCasinoMode(m as any)}
              className={`w-full text-left px-6 py-5 rounded-xl transition-all flex justify-between items-center group ${
                casinoMode === m
                  ? 'bg-[#2f4553] text-white shadow-[inset_4px_0_0_0_#00e701]'
                  : 'text-[#b1bad3] hover:bg-[#1a2c38] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-5">
                <span className="text-lg font-medium">{labels[m]}</span>
              </span>
            </button>
          )})}
        </div>
      )}
    </div>
  );
}
