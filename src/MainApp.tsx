import './index.css';
import './components/Sports/sports.css';
import './components/AppShell/app-shell.css';
import { useState, useEffect, useCallback, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StakeApi } from './api/client';
import { Queries } from './api/queries';
import { FixtureList } from './components/FixtureList';
import { RightSidebar } from './components/RightSidebar';
import { useUserStore, type SportBet } from './store/userStore';
import { useAutoBetStore } from './store/autoBetStore';
import { useUiStore } from './store/uiStore';
import { useAccentInlineStyle } from './hooks/useAccentInlineStyle';
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
import { AppHeader } from './components/AppShell/AppHeader';
import { SportsSubbar } from './components/AppShell/SportsSubbar';

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

interface SportMenuItem {
  id: string;
  name: string;
  slug: string;
  fixtureCount: number;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // If KeyAuth is not configured, skip login
    if (!isKeyAuthEnabled()) return true;
    // Check if already authenticated in this session
    return sessionStorage.getItem('keyauth_ok') === '1';
  });

  const { user, setUser, setBalancesFromApi, setActiveBets } = useUserStore();
  const { isRunning } = useAutoBetStore();
  const {
    currentView,
    setCurrentView,
    selectedSportSlug,
    setSelectedSportSlug,
    sportFilterType,
    setSportFilterType,
    fixtureSearchQuery,
    setFixtureSearchQuery,
  } = useUiStore();

  const accentInlineStyle = useAccentInlineStyle();
  const [isChallengeRunning, setIsChallengeRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sportsMenu, setSportsMenu] = useState<SportMenuItem[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    async function fetchSportsMenu() {
      try {
        const response = await StakeApi.query<any>(Queries.SportListMenu, {
          type: 'upcoming',
          limit: 100,
          offset: 0,
          liveRank: false,
          sportType: 'sport',
        });
        if (cancelled) return;
        const list = response?.data?.sportList || [];
        setSportsMenu(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setSportsMenu([]);
      }
    }
    fetchSportsMenu();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleKeyAuthSuccess = () => {
    sessionStorage.setItem('keyauth_ok', '1');
    setIsAuthenticated(true);
  };

  const handleLogin = async () => {
    try {
      await window.electronAPI.login();
      // Verhindert Race Condition: nicht blind nach 2s pollen,
      // sondern warten bis Session wirklich validiert ist.
      let resolved = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await window.electronAPI.getStakeSessionStatus();
        if (status?.valid) {
          resolved = true;
          break;
        }
      }
      if (resolved) {
        fetchData();
      } else {
        setError('Session noch nicht validiert. Bitte Login-Fenster abschließen.');
      }
    } catch (err: any) {
      console.error(`Login error: ${err.message}`);
      setError(err.message);
    }
  };

  const handleSessionRevalidate = async () => {
    try {
      const status = await window.electronAPI.revalidateStakeSession();
      if (status?.valid) {
        setError('Session valid');
        setTimeout(() => setError(null), 2200);
      } else {
        const reason =
          status?.missingCookies?.length
            ? `missing: ${status.missingCookies.join(', ')}`
            : status?.expiredCookies?.length
              ? `expired: ${status.expiredCookies.join(', ')}`
              : (status?.reasons?.[0] || 'unknown');
        setError(`Session rejected - ${reason}`);
      }
    } catch (err: any) {
      setError(`Session check failed: ${err?.message || 'unknown error'}`);
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
      style={{
        background: 'var(--app-bg-deep)',
        color: 'var(--app-text)',
        fontFamily: 'var(--font-body)',
        ...(accentInlineStyle || {}),
      }}
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
      <AppHeader
        currentView={currentView}
        onChangeView={setCurrentView}
        appTitle={appTitle}
        userName={user?.name}
        isChallengeRunning={isChallengeRunning}
        isRunning={isRunning}
        isLoading={isLoading}
        onRefresh={fetchData}
        onLogin={handleLogin}
        onSessionRevalidate={handleSessionRevalidate}
      />

      {currentView === 'sports' && (
        <SportsSubbar
          sportFilterType={sportFilterType}
          onChangeFilter={setSportFilterType}
          selectedSportSlug={selectedSportSlug || 'soccer'}
          onChangeSportSlug={setSelectedSportSlug}
          fixtureSearchQuery={fixtureSearchQuery}
          onChangeSearch={setFixtureSearchQuery}
          sportsMenu={sportsMenu}
        />
      )}

      {/* Main Content */}
      <div className="app-main-layout">
        {/* Error Toast */}
        {error && (
          <div
            className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow-2xl flex items-center gap-4 border"
            style={{
              background: 'rgba(255, 51, 102, 0.16)',
              color: 'var(--app-error)',
              borderColor: 'rgba(255, 51, 102, 0.4)',
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span className="font-bold text-sm">{error}</span>
            <button onClick={() => setError(null)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        )}

        {/* Casino View stays mounted so challenge/hunter processes keep running across tab switches */}
        <div
          className="app-view-casino"
          style={{
            display: currentView === 'casino' ? 'block' : 'none',
          }}
        >
          <CasinoView />
        </div>

        {currentView === 'sports' && (
              <>
                <div className="sports-view app-view-sports">
                  {user ? (
                    selectedSportSlug ? (
                      <FixtureList sportSlug={selectedSportSlug} />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center p-12">
                        <div 
                          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                          style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)', boxShadow: '0 0 24px var(--app-accent-glow)' }}
                        >
                          <svg className="w-10 h-10" style={{ color: 'var(--app-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <span className="font-bold text-lg" style={{ color: 'var(--app-text-muted)' }}>Select a sport for fixtures</span>
                        <span className="text-sm mt-2" style={{ color: 'var(--app-text-muted)', opacity: 0.8 }}>Live events, starting soon, or pick a sport from the list</span>
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
                        Welcome to STAKE<span style={{ color: 'var(--app-accent)' }}>SPORTS</span>
                      </h2>
                      <p className="mb-8 max-w-md text-sm leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
                        Login with Stake.com to view fixtures, place bets, and manage your portfolio.
                      </p>
                      <button 
                        onClick={handleLogin}
                        className="px-8 py-3.5 rounded-xl font-bold text-sm transition-all uppercase tracking-wider hover:-translate-y-0.5"
                        style={{ background: 'var(--app-accent)', color: 'var(--app-bg-deep)', boxShadow: '0 0 24px var(--app-accent-glow)' }}
                      >
                        Login with Stake
                      </button>
                    </div>
                  )}
                </div>
                
                <RightSidebar />
              </>
        )}

        {currentView === 'logger' && (
          <div className="app-view-logger">
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
