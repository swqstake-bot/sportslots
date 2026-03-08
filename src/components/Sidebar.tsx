import { useState, useEffect } from 'react';
import { StakeApi } from '../api/client';
import { Queries } from '../api/queries';
import { useUiStore } from '../store/uiStore';
import { useLiveFixtureCount } from '../hooks/useLiveFixtureCount';

interface Sport {
  id: string;
  name: string;
  slug: string;
  fixtureCount: number;
}

export function Sidebar() {
  const { currentView, setCurrentView, selectedSport, setSelectedSport, casinoMode, setCasinoMode, fixtureSearchQuery, setFixtureSearchQuery } = useUiStore();
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const liveCount = useLiveFixtureCount(currentView === 'sports', 15000);

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
    <div 
      className="w-[280px] border-r h-[calc(100vh-80px)] flex flex-col z-20 transition-all duration-300"
      style={{ background: 'rgba(10, 10, 20, 0.9)', backdropFilter: 'blur(8px)', borderColor: 'rgba(0, 240, 255, 0.15)' }}
    >
      <div className="p-4 border-b flex flex-col gap-4" style={{ borderColor: 'rgba(0, 240, 255, 0.15)' }}>
        <div 
          className="rounded-lg p-1 flex relative items-center justify-between"
          style={{ background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(0, 240, 255, 0.1)' }}
        >
            <button 
              onClick={() => setCurrentView('casino')}
              className={`flex-1 text-xs font-bold py-2.5 text-center transition-all uppercase tracking-widest rounded-md ${
                currentView === 'casino' ? 'shadow-[0_0_16px_rgba(0,240,255,0.4)]' : ''
              }`}
              style={currentView === 'casino' 
                ? { color: '#0A0A0F', background: 'var(--app-accent)', boxShadow: '0 0 16px rgba(0, 240, 255, 0.4)' } 
                : { color: 'var(--app-text-muted)' }
              }
            >
              Casino
            </button>
            <button 
              onClick={() => setCurrentView('sports')}
              className={`flex-1 text-xs font-bold py-2.5 text-center transition-all uppercase tracking-widest rounded-md ${
                currentView === 'sports' ? 'shadow-[0_0_16px_rgba(0,255,136,0.4)]' : ''
              }`}
              style={currentView === 'sports' 
                ? { color: '#0A0A0F', background: 'var(--app-accent)', boxShadow: '0 0 16px rgba(0, 255, 136, 0.4)' } 
                : { color: 'var(--app-text-muted)' }
              }
            >
              Sports
            </button>
        </div>
        
        {currentView === 'sports' && (
          <div className="relative group">
               <input 
                  type="text" 
                  placeholder="Suche Teams oder Events…" 
                  value={fixtureSearchQuery}
                  onChange={(e) => setFixtureSearchQuery(e.target.value)}
                  className="w-full text-white text-sm rounded-full py-2.5 pl-10 pr-4 border border-transparent focus:outline-none transition-all font-medium shadow-inner"
                  style={{ 
                    background: 'color-mix(in srgb, var(--app-bg-deep) 90%, black)', 
                    borderColor: 'var(--app-border)'
                  }}
               />
               <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--app-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        )}
      </div>
      
      {currentView === 'sports' && (
        <>
          <div className="px-4 py-3 font-semibold text-[10px] uppercase tracking-widest" style={{ color: 'var(--app-text-muted)', opacity: 0.9 }}>
            Browse
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-0.5" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
            {loading ? (
              <div className="flex flex-col gap-3 p-1">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="h-12 rounded-xl animate-pulse opacity-40" style={{ background: 'var(--app-bg-card)' }} />
                ))}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSelectedSport('live')}
                  className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex justify-between items-center group text-base font-semibold ${
                    selectedSport === 'live' ? '' : 'hover:bg-[var(--app-bg-card)]/80'
                  }`}
                  style={selectedSport === 'live' 
                    ? { background: 'rgba(var(--app-accent-rgb), 0.12)', boxShadow: 'inset 3px 0 0 0 var(--app-accent)', color: 'var(--app-accent)' } 
                    : { color: 'var(--app-text-muted)' }
                  }
                >
                  <span className="flex items-center gap-4">
                    <div className="relative flex items-center justify-center w-4 h-4">
                      <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-[#ff4d4d] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff4d4d]" />
                    </div>
                    <span>Live Events</span>
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--app-bg-elevated)', color: 'var(--app-text-muted)' }}>
                    {liveCount != null ? liveCount : '–'}
                  </span>
                </button>

                <button
                  onClick={() => setSelectedSport('upcoming')}
                  className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-center gap-4 group text-base font-semibold ${
                    selectedSport === 'upcoming' ? '' : 'hover:bg-[var(--app-bg-card)]/80'
                  }`}
                  style={selectedSport === 'upcoming' 
                    ? { background: 'rgba(var(--app-accent-rgb), 0.12)', boxShadow: 'inset 3px 0 0 0 var(--app-accent)', color: 'var(--app-accent)' } 
                    : { color: 'var(--app-text-muted)' }
                  }
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>Starting Soon</span>
                </button>

                <div className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--app-text-muted)' }}>All Sports</div>
                 
                <ul className="space-y-0.5">
                  {sports.map(sport => (
                    <li key={sport.id}>
                      <button
                        onClick={() => setSelectedSport(sport.slug)}
                        className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex justify-between items-center group text-base font-semibold ${
                          selectedSport === sport.slug ? '' : 'hover:bg-[var(--app-bg-card)]/80'
                        }`}
                        style={selectedSport === sport.slug 
                          ? { background: 'rgba(var(--app-accent-rgb), 0.12)', boxShadow: 'inset 3px 0 0 0 var(--app-accent)', color: 'var(--app-accent)' } 
                          : { color: 'var(--app-text-muted)' }
                        }
                      >
                        <span className="flex items-center gap-4">
                          <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                          <span className="truncate">{sport.name}</span>
                        </span>
                        {sport.fixtureCount > 0 && (
                          <span 
                            className="text-xs font-bold px-2.5 py-1 rounded-lg"
                            style={selectedSport === sport.slug 
                              ? { background: 'var(--app-bg-deep)', color: 'var(--app-accent)' }
                              : { background: 'var(--app-bg-elevated)', color: 'var(--app-text-muted)' }
                            }
                          >
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
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5" style={{ scrollbarColor: 'var(--app-border) transparent' }}>
          <div className="px-3 py-2 font-semibold text-[10px] uppercase tracking-widest" style={{ color: 'var(--app-text-muted)', opacity: 0.9 }}>
            Menu
          </div>
          {[
            { id: 'play', label: 'Play', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z' },
            { id: 'challenges', label: 'Challenges', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { id: 'bonushunt', label: 'Bonus Hunt', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
            { id: 'forum', label: 'Forum', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
            { id: 'logs', label: 'Logs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' }
          ].map(({ id, label, icon }) => {
            const isActive = casinoMode === id
            return (
              <button
                key={id}
                onClick={() => setCasinoMode(id as any)}
                className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-center gap-4 group text-base font-semibold ${
                  isActive ? '' : 'hover:bg-[var(--app-bg-card)]/80'
                }`}
                style={isActive
                  ? { background: 'rgba(var(--app-accent-rgb), 0.12)', boxShadow: 'inset 3px 0 0 0 var(--app-accent)', color: 'var(--app-accent)' }
                  : { color: 'var(--app-text-muted)' }
                }
              >
                <svg className="w-5 h-5 shrink-0 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} /></svg>
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  );
}
