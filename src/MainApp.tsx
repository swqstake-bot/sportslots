import './index.css';
import './components/Sports/sports.css';
import { useState, useEffect, useCallback, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StakeApi } from './api/client';
import { Queries } from './api/queries';
import { Sidebar } from './components/Sidebar';
import { FixtureList } from './components/FixtureList';
import { RightSidebar } from './components/RightSidebar';
import { useUserStore, type SportBet } from './store/userStore';
import { useAutoBetStore } from './store/autoBetStore';
import { useUiStore } from './store/uiStore';
import { WalletSelector } from './components/WalletSelector';
import { AutoBetManager } from './components/AutoBet/AutoBetManager';
import CasinoView from './components/Casino/CasinoView';
import LoggerView from './components/Logger/LoggerView';
import LoggerBackgroundCollector from './components/Logger/LoggerBackgroundCollector';
import { KeyAuthLogin } from './components/KeyAuthLogin';
import { isKeyAuthEnabled } from './api/keyauth';
import { UpdaterNotification } from './components/UpdaterNotification';
import { ChangelogModal } from './components/ui/ChangelogModal';
import { GlobalToast } from './components/ui/GlobalToast';
import { getChangelogForVersion } from './constants/changelogs';

/** Pro GraphQL-Request: Stake validiert `activeSportBets(limit)` mit Obergrenze (typisch ≤50; höhere Werte → error.number_less_equal). */
const ACTIVE_SPORT_BETS_PAGE_SIZE = 50;
/** Max. Anzahl Einträge für Header/Sidebar (mehrere Seiten à PAGE_SIZE). */
const ACTIVE_SPORT_BETS_MAX_TOTAL = 150;

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', background: 'black', height: '100vh' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Types
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // If KeyAuth is not configured, skip login
    if (!isKeyAuthEnabled()) return true;
    // Check if already authenticated in this session
    return sessionStorage.getItem('keyauth_ok') === '1';
  });

  const { user, setUser, setBalancesFromApi, setActiveBets } = useUserStore();
  const { isRunning } = useAutoBetStore();
  const { currentView, selectedSport } = useUiStore();
  const [isChallengeRunning, setIsChallengeRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Changelog State
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogVersion, setChangelogVersion] = useState('');
  const [changelogContent, setChangelogContent] = useState<string[]>([]);

  useEffect(() => {
    // Version vom Main-Prozess (app.getVersion()) – stimmt auch nach Auto-Update
    const api = (window as any).electronAPI;
    const fetchVersion = api?.getAppVersion ? api.getAppVersion() : Promise.resolve(api?.version ?? '');
    fetchVersion.then((currentVersion: string) => {
      if (!currentVersion) return;
      const lastSeenVersion = localStorage.getItem('app_last_seen_version');
      if (currentVersion !== lastSeenVersion) {
        const changes = getChangelogForVersion(currentVersion);
        setChangelogVersion(currentVersion);
        setChangelogContent(changes || []);
        setShowChangelog(true);
        localStorage.setItem('app_last_seen_version', currentVersion);
      }
    });
  }, []);

  const handleKeyAuthSuccess = () => {
    sessionStorage.setItem('keyauth_ok', '1');
    setIsAuthenticated(true);
  };

  const handleLogin = async () => {
    try {
      await window.electronAPI.login();
      setTimeout(fetchData, 2000);
    } catch (err: any) {
      console.error(`Login error: ${err.message}`);
      setError(err.message);
    }
  };

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch User Details
      const userRes = await StakeApi.query(Queries.UserDetails);
      if (!userRes.data?.user) {
        throw new Error('User not found. Please login.');
      }
      const userData = userRes.data.user;
      setUser(userData);

      // 2. Balances + aktive Wetten (Wetten in Seiten à max. ACTIVE_SPORT_BETS_PAGE_SIZE — sonst number_less_equal)
      try {
        const balanceRes = await StakeApi.query(Queries.FetchBalances);

        if (balanceRes.data?.user?.balances) {
          setBalancesFromApi(balanceRes.data.user.balances);
        } else {
            console.warn('Balances not found in response', balanceRes);
            // Don't set dummy balances, let store handle empty state
        }

        const merged: SportBet[] = [];
        const seen = new Set<string>();
        for (let offset = 0; offset < ACTIVE_SPORT_BETS_MAX_TOTAL; offset += ACTIVE_SPORT_BETS_PAGE_SIZE) {
          const betsRes = await StakeApi.query<{
            user?: { activeSportBets?: SportBet[] };
          }>(Queries.FetchActiveSportBets, {
            limit: ACTIVE_SPORT_BETS_PAGE_SIZE,
            offset,
            name: userData.name,
          });
          const batch = betsRes.data?.user?.activeSportBets ?? [];
          for (const b of batch) {
            if (b?.id && !seen.has(b.id)) {
              seen.add(b.id);
              merged.push(b);
            }
          }
          if (batch.length < ACTIVE_SPORT_BETS_PAGE_SIZE) break;
        }
        setActiveBets(merged);
      } catch (innerErr) {
          console.error("Error fetching balances/bets", innerErr);
      }

    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      setError(err.message);
      if (err.message.includes('401') || err.message.includes('login')) {
        // useUserStore.getState().logout(); // Can't access getState inside component easily, but setUser(null) works
        // But we already have setUser from hook
        // setUser(null); // Type mismatch in store? No, setUser expects User | null
        // Actually setUser expects User object. Logout sets it to null.
        // Let's ignore logout for now or handle it better.
      }
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setBalancesFromApi, setActiveBets, isAuthenticated]);

  // Initial load & Polling
  useEffect(() => {
    fetchData();
    // Poll for updates every 10 seconds to keep match tracker live
    const interval = setInterval(() => {
        const currentUser = useUserStore.getState().user;
        if (currentUser) {
            fetchData();
        }
    }, 10000);
    
    console.log('MainApp mounted - StakeSports UI should be visible');
    return () => clearInterval(interval);
  }, [fetchData, isAuthenticated]);

  useEffect(() => {
    const handler = (event: Event) => {
      const e = event as CustomEvent<{ running?: boolean }>;
      setIsChallengeRunning(Boolean(e?.detail?.running));
    };
    window.addEventListener('challenge-running-status', handler as EventListener);
    return () => {
      window.removeEventListener('challenge-running-status', handler as EventListener);
    };
  }, []);

  if (!isAuthenticated) {
    return <KeyAuthLogin onSuccess={handleKeyAuthSuccess} />;
  }

  const appTitle = currentView === 'casino' ? 'STAKESLOTS' : currentView === 'logger' ? 'STAKELOGGER' : 'STAKESPORTS';

  return (
    <div 
      className="flex flex-col h-screen overflow-hidden select-none"
      style={{ background: 'var(--app-bg-deep)', color: 'var(--app-text)', fontFamily: 'var(--font-body)' }}
      data-app-mode={currentView}
    >
      <GlobalToast />
      <LoggerBackgroundCollector />
      <UpdaterNotification />
      <ChangelogModal 
        isOpen={showChangelog} 
        onClose={() => setShowChangelog(false)} 
        version={changelogVersion} 
        changes={changelogContent} 
      />
      {/* HUD – Floating semi-transparentes Panel mit Neon-Glow */}
      <header 
        className="mx-4 mt-3 mb-0 px-5 py-3 flex justify-between items-center z-50 rounded-xl transition-all duration-300 border-b-0"
        style={{ 
          background: 'rgba(10, 10, 20, 0.82)', 
          backdropFilter: 'blur(14px)', 
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(0, 240, 255, 0.18)',
          borderBottom: '1px solid rgba(0, 240, 255, 0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 0 24px rgba(0, 240, 255, 0.06), inset 0 1px 0 rgba(255,255,255,0.02)'
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 shrink-0" style={{ color: 'var(--app-accent)', filter: 'drop-shadow(0 0 6px var(--app-accent))' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/>
            </svg>
            <h1 className="text-base sm:text-lg font-bold tracking-widest uppercase" style={{ fontFamily: 'var(--font-heading)', color: 'var(--app-text)' }}>
              STAKE<span style={{ color: 'var(--app-accent)', textShadow: '0 0 12px var(--app-accent)' }}>{appTitle.replace('STAKE', '')}</span>
            </h1>
          </div>
          {user && (
            <div className="flex items-center gap-2">
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all"
                style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(0, 240, 255, 0.2)' }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--app-accent)', boxShadow: '0 0 6px var(--app-accent)' }}></div>
                <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--app-text-muted)' }}>
                  {user.name}
                </span>
              </div>
              {isChallengeRunning && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                  style={{ background: 'rgba(255, 122, 26, 0.12)', borderColor: 'rgba(255, 122, 26, 0.35)', color: '#ffbc90' }}
                  title="Challenge Hunter is still running in background"
                >
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ff7a1a', boxShadow: '0 0 8px rgba(255,122,26,0.7)' }}></span>
                  <span className="text-[11px] font-bold uppercase tracking-wider">Challenge running</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all border ${
                  isRunning ? 'animate-pulse-glow' : ''
                }`}
                style={isRunning 
                  ? { background: 'rgba(0, 240, 255, 0.12)', borderColor: 'var(--app-accent)', color: 'var(--app-accent)', boxShadow: '0 0 16px rgba(0, 240, 255, 0.3)' } 
                  : { background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--app-text-muted)' }
                }
              >
                <span className="uppercase tracking-widest">{isRunning ? 'Running' : 'Stopped'}</span>
                <span 
                  className={`w-2 h-2 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
                  style={{ background: isRunning ? 'var(--app-accent)' : 'var(--app-text-muted)', boxShadow: isRunning ? '0 0 8px var(--app-accent)' : 'none' }}
                ></span>
              </div>
              
              <div className="h-8 w-px" style={{ background: 'rgba(0, 240, 255, 0.3)' }}></div>
              
              <WalletSelector />
              
              <button 
                onClick={fetchData} 
                disabled={isLoading}
                className="transition-all p-2 rounded-lg hover:bg-white/5"
                style={{ color: isLoading ? 'var(--app-accent)' : 'var(--app-text-muted)' }}
                title="Refresh Data"
              >
                <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
            </>
          ) : (
            <button 
              onClick={handleLogin}
              className="text-white px-6 py-2 rounded-lg font-bold text-sm transition-all"
              style={{ background: 'var(--app-accent)', color: '#0A0A0F', boxShadow: '0 0 20px rgba(0, 240, 255, 0.4)' }}
            >
              Login with Stake
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Error Toast */}
        {error && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 bg-[#ff4d4d] text-white px-6 py-3 rounded shadow-2xl flex items-center gap-4 border border-white/10 animate-bounce">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="font-bold text-sm">{error}</span>
            <button onClick={() => setError(null)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        )}

        {/* Sidebar */}
        <Sidebar />

        {/* Casino View stays mounted so challenge/hunter processes keep running across tab switches */}
        <div
          className="flex-1 overflow-auto relative z-10"
          style={{ background: 'var(--app-bg-deep)', display: currentView === 'casino' ? 'block' : 'none' }}
        >
          <CasinoView />
        </div>

        {/* Sports View & Right Sidebar */}
        {currentView === 'sports' && (
          <>
            <div className="sports-view flex-1 overflow-hidden flex flex-col relative z-0">
              {user ? (
                selectedSport ? (
                  <FixtureList sportSlug={selectedSport} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-12">
                    <div 
                      className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                      style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)', boxShadow: '0 0 24px var(--app-accent-glow)' }}
                    >
                      <svg className="w-10 h-10" style={{ color: 'var(--app-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <span className="font-bold text-lg" style={{ color: 'var(--app-text-muted)' }}>Sport wählen für Fixtures</span>
                    <span className="text-sm mt-2" style={{ color: 'var(--app-text-muted)', opacity: 0.8 }}>Live Events, Starting Soon oder Sport aus der Liste</span>
                  </div>
                )
              ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-8" style={{ background: 'var(--app-bg-deep)' }}>
                  <div 
                    className="w-24 h-24 rounded-2xl flex items-center justify-center mb-8"
                    style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)', boxShadow: '0 0 32px var(--app-accent-glow)' }}
                  >
                    <svg className="w-12 h-12" style={{ color: 'var(--app-accent)' }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/>
                    </svg>
                  </div>
                  <h2 className="text-2xl font-black mb-3 tracking-wide uppercase" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-heading)' }}>
                    Willkommen bei STAKE<span style={{ color: 'var(--app-accent)' }}>SPORTS</span>
                  </h2>
                  <p className="mb-8 max-w-md text-sm leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
                    Mit Stake.com anmelden, um Fixtures anzuzeigen, Wetten zu platzieren und dein Portfolio zu verwalten.
                  </p>
                  <button 
                    onClick={handleLogin}
                    className="px-8 py-3.5 rounded-xl font-bold text-sm transition-all uppercase tracking-wider hover:-translate-y-0.5"
                    style={{ background: 'var(--app-accent)', color: 'var(--app-bg-deep)', boxShadow: '0 0 24px var(--app-accent-glow)' }}
                  >
                    Mit Stake anmelden
                  </button>
                </div>
              )}
            </div>
            
            <RightSidebar />
          </>
        )}

        {/* Logger View */}
        {currentView === 'logger' && (
          <div className="flex-1 overflow-auto relative z-10" style={{ background: 'var(--app-bg-deep)' }}>
            <LoggerView />
          </div>
        )}
      </div>
      {/* AutoBet Manager (Headless): always mounted to avoid remount restarts */}
      <AutoBetManager />
    </div>
  );
}

export default function WrappedApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
