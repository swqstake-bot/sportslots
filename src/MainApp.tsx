import './index.css';
import './components/Sports/sports.css';
import './components/AppShell/app-shell.css';
import { useState, useEffect, useCallback, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StakeApi } from './api/client';
import { Queries } from './api/queries';
import { AutoBetManager } from './components/AutoBet/AutoBetManager';
import { AutoBetView } from './components/AutoBet/AutoBetView';
import { useUserStore, type SportBet } from './store/userStore';
import { useAutoBetStore } from './store/autoBetStore';
import { useUiStore } from './store/uiStore';
import { useAccentInlineStyle } from './hooks/useAccentInlineStyle';
import CasinoView from './components/Casino/CasinoView';
import LoggerView from './components/Logger/LoggerView';
import { KeyAuthLogin } from './components/KeyAuthLogin';
import { isKeyAuthEnabled } from './api/keyauth';
import { UpdaterNotification } from './components/UpdaterNotification';
import { ChangelogModal } from './components/ui/ChangelogModal';
import { GlobalToast } from './components/ui/GlobalToast';
import { getChangelogForVersion } from './constants/changelogs';
import { AppHeader } from './components/AppShell/AppHeader';
import { AppBrandMark } from './components/AppShell/AppBrandMark';
import { WindowTitleBar } from './components/AppShell/WindowTitleBar';
import { APP_NAME, APP_TAGLINE } from './constants/branding';
import { refreshWalletBalances } from './utils/walletBalance';
import {
  ACTIVE_SPORT_BETS_MAX_TOTAL,
  ACTIVE_SPORT_BETS_PAGE_SIZE,
} from './constants/sportsBetLimits';

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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // If KeyAuth is not configured, skip login
    if (!isKeyAuthEnabled()) return true;
    // Check if already authenticated in this session
    return sessionStorage.getItem('keyauth_ok') === '1';
  });

  const { user, setUser, setActiveBets } = useUserStore();
  const { isRunning } = useAutoBetStore();
  const {
    currentView,
    setCurrentView,
  } = useUiStore();

  const accentInlineStyle = useAccentInlineStyle();
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
        localStorage.setItem('app_last_seen_version', currentVersion);
        if (changes.length > 0) {
          setChangelogVersion(currentVersion);
          setChangelogContent(changes);
          setShowChangelog(true);
        }
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
        window.dispatchEvent(new CustomEvent('stake-session-revalidated'));
        fetchData();
      } else {
        setError('Session not validated yet. Finish the login window first.');
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
        window.dispatchEvent(new CustomEvent('stake-session-revalidated'));
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

  const fetchActiveSportBets = useCallback(async (userName: string) => {
    const merged: SportBet[] = [];
    const seen = new Set<string>();
    for (let offset = 0; offset < ACTIVE_SPORT_BETS_MAX_TOTAL; offset += ACTIVE_SPORT_BETS_PAGE_SIZE) {
      const betsRes = await StakeApi.query<{
        user?: { activeSportBets?: SportBet[] };
      }>(Queries.FetchActiveSportBets, {
        limit: ACTIVE_SPORT_BETS_PAGE_SIZE,
        offset,
        name: userName,
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
  }, [setActiveBets]);

  const shouldFetchActiveSportBets = useCallback(() => {
    return useUiStore.getState().currentView === 'sports';
  }, []);

  const fetchData = useCallback(async (options?: { withActiveBets?: boolean }) => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const userRes = await StakeApi.query(Queries.UserDetails);
      if (!userRes.data?.user) {
        throw new Error('User not found. Please login.');
      }
      const userData = userRes.data.user;
      setUser(userData);

      try {
        await refreshWalletBalances();
        const withActiveBets = options?.withActiveBets ?? shouldFetchActiveSportBets();
        if (withActiveBets && userData.name) {
          await fetchActiveSportBets(userData.name);
        }
      } catch (innerErr) {
          console.error("Error fetching balances/bets", innerErr);
      }

    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      setError(err.message);
      if (err.message.includes('401') || err.message.includes('login')) {
        /* auth failure already surfaced via setError */
      }
    } finally {
      setIsLoading(false);
    }
  }, [setUser, fetchActiveSportBets, shouldFetchActiveSportBets, isAuthenticated]);

  const needsActiveSportBets = currentView === 'sports';

  // Initial load & polling (balances always; active sport bets only when sports UI needs them)
  useEffect(() => {
    fetchData({ withActiveBets: needsActiveSportBets });
    const interval = setInterval(() => {
        const currentUser = useUserStore.getState().user;
        if (currentUser) {
            fetchData({ withActiveBets: shouldFetchActiveSportBets() });
        }
    }, 10000);
    
    console.log(`MainApp mounted - ${APP_NAME} UI should be visible`);
    return () => clearInterval(interval);
  }, [fetchData, isAuthenticated, needsActiveSportBets, shouldFetchActiveSportBets]);

  useEffect(() => {
    if (!isAuthenticated || !needsActiveSportBets) return;
    const currentUser = useUserStore.getState().user;
    if (!currentUser?.name) return;
    void fetchActiveSportBets(currentUser.name);
  }, [fetchActiveSportBets, isAuthenticated, needsActiveSportBets]);

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
    return (
      <div
        className="flex flex-col h-screen overflow-hidden"
        style={{
          background: 'var(--app-bg-deep)',
          color: 'var(--app-text)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <WindowTitleBar />
        <KeyAuthLogin onSuccess={handleKeyAuthSuccess} />
      </div>
    );
  }

  const appHeaderProps = {
    currentView,
    onChangeView: setCurrentView,
    userName: user?.name,
    isChallengeRunning,
    isRunning,
    isLoading,
    onRefresh: fetchData,
    onLogin: handleLogin,
    onSessionRevalidate: handleSessionRevalidate,
  } as const

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
      <WindowTitleBar />
      <GlobalToast />
      <UpdaterNotification />
      <ChangelogModal 
        isOpen={showChangelog} 
        onClose={() => setShowChangelog(false)} 
        version={changelogVersion} 
        changes={changelogContent} 
      />

      <div className="flex flex-1 flex-col min-h-0 relative">
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

        {/* Casino: single rounded module = StakeSlots bar + Control center (CasinoView stays mounted when hidden) */}
        <div
          className={currentView === 'casino' ? 'flex flex-1 flex-col min-h-0' : 'hidden'}
          aria-hidden={currentView !== 'casino'}
        >
          <div className="app-casino-unified flex flex-1 flex-col min-h-0">
            <div className="app-casino-unified__header">
              <AppHeader {...appHeaderProps} />
            </div>
            <div className="app-view-casino app-casino-unified__scroll flex-1 min-h-0 overflow-auto">
              <CasinoView />
            </div>
          </div>
        </div>

        {/* Sports + Logger */}
        <div
          className={currentView === 'casino' ? 'hidden' : 'flex flex-1 flex-col min-h-0 overflow-hidden'}
          aria-hidden={currentView === 'casino'}
        >
          <AppHeader {...appHeaderProps} />
          <div className="app-main-layout flex-1">
            {currentView === 'sports' && (
              <div className="sports-bot-main sports-view sports-bot-main--full">
                  {user ? (
                    <AutoBetView layout="wide" />
                  ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center p-8" style={{ background: 'var(--app-bg-deep)' }}>
                      <div className="mb-8">
                        <AppBrandMark size={96} />
                      </div>
                      <h2 className="text-2xl font-black mb-3 tracking-wide" style={{ color: 'var(--app-text)', fontFamily: 'var(--font-heading)' }}>
                        Welcome to {APP_NAME}
                      </h2>
                      <p className="mb-8 max-w-md text-sm leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
                        {APP_TAGLINE}. Login with Stake.com to configure AutoBet and manage your sport bets.
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
            )}

            {currentView === 'logger' && (
              <div className="app-view-logger">
                <LoggerView />
              </div>
            )}
          </div>
        </div>
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
