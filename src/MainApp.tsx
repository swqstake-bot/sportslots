import './index.css';
import './components/Sports/sports.css';
import './components/AppShell/app-shell.css';
import './components/AppShell/workspace.css';
import { useState, useEffect, useCallback, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StakeApi } from './api/client';
import { Queries } from './api/queries';
import { AutoBetManager } from './components/AutoBet/AutoBetManager';
import { CopyBetManager } from './components/AutoBet/CopyBetManager';
import { AutoBetView } from './components/AutoBet/AutoBetView';
import { useUserStore, type SportBet } from './store/userStore';
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
import { WorkspaceSidebar } from './components/AppShell/WorkspaceSidebar';
import { WorkspaceOverview } from './components/AppShell/WorkspaceOverview';
import { WorkspaceSettings } from './components/AppShell/WorkspaceSettings';
import type { WorkspaceDestination } from './components/AppShell/workspaceNavigation';
import { AppBrandMark } from './components/AppShell/AppBrandMark';
import { WindowTitleBar } from './components/AppShell/WindowTitleBar';
import { APP_NAME, APP_TAGLINE } from './constants/branding';
import { refreshWalletBalances } from './utils/walletBalance';
import { refreshStakeSiteFromMain, useStakeSiteStore } from './store/stakeSiteStore';
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
  const showToast = useUiStore((s) => s.showToast);
  const {
    currentView,
    setCurrentView,
    casinoMode,
    sidebarCollapsed,
    setSidebarCollapsed,
    workspaceDensity,
  } = useUiStore();

  const accentInlineStyle = useAccentInlineStyle();
  const preferredSite = useStakeSiteStore((s) => s.preferredSite);
  const [isLoading, setIsLoading] = useState(false);
  // Keep visited workspaces in place: switching pages must not clear imported
  // files, local configuration, or a mounted Casino runtime.
  const [visitedViews, setVisitedViews] = useState(() => new Set([currentView]));
  if (!visitedViews.has(currentView)) setVisitedViews(new Set([...visitedViews, currentView]));

  const navigate = useCallback((target: WorkspaceDestination) => {
    if (target.view === 'sports' && preferredSite === 'eu') {
      useUiStore.setState({ currentView: 'casino', casinoMode: 'play' });
      return;
    }
    useUiStore.setState(state => ({
      currentView: target.view,
      ...(target.casinoMode ? { casinoMode: target.casinoMode } : {}),
      ...(target.sportsTab ? { sportsCenterTab: target.sportsTab } : {}),
      ...(target.hubTab ? { challengeHubTab: target.hubTab } : {}),
      ...(target.promotionsTab ? { promotionsHubTab: target.promotionsTab } : {}),
      ...(target.slotInstanceId ? { slotWorkbenchFocus: { instanceId: target.slotInstanceId, revision: (state.slotWorkbenchFocus?.revision || 0) + 1 } } : {}),
    }));
  }, [preferredSite]);

  // Changelog State
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogVersion, setChangelogVersion] = useState('');
  const [changelogContent, setChangelogContent] = useState<string[]>([]);

  useEffect(() => {
    void refreshStakeSiteFromMain();
    const onRevalidated = () => {
      void refreshStakeSiteFromMain();
    };
    window.addEventListener('stake-session-revalidated', onRevalidated);
    return () => window.removeEventListener('stake-session-revalidated', onRevalidated);
  }, []);

  useEffect(() => {
    if (preferredSite === 'eu' && currentView === 'sports') {
      setCurrentView('casino');
    }
  }, [preferredSite, currentView, setCurrentView]);

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

  const handleLogin = async (site?: 'com' | 'eu') => {
    try {
      await window.electronAPI.login(site ? { site } : undefined);
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
        showToast('Session not validated yet. Finish the login window first.', 'error');
      }
    } catch (err: any) {
      console.error(`Login error: ${err.message}`);
      showToast(err.message, 'error');
    }
  };

  const handleSiteChanged = () => {
    window.dispatchEvent(new CustomEvent('stake-session-revalidated'));
    void fetchData();
  };

  const handleSessionRevalidate = async () => {
    try {
      const status = await window.electronAPI.revalidateStakeSession();
      if (status?.valid) {
        window.dispatchEvent(new CustomEvent('stake-session-revalidated'));
        showToast('Session valid', 'success');
      } else {
        const reason =
          status?.missingCookies?.length
            ? `missing: ${status.missingCookies.join(', ')}`
            : status?.expiredCookies?.length
              ? `expired: ${status.expiredCookies.join(', ')}`
              : (status?.reasons?.[0] || 'unknown');
        showToast(`Session rejected - ${reason}`, 'error');
      }
    } catch (err: any) {
      showToast(`Session check failed: ${err?.message || 'unknown error'}`, 'error');
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

  const fetchData = useCallback(async (options?: { withActiveBets?: boolean; silent?: boolean }) => {
    if (!isAuthenticated) return;
    setIsLoading(true);
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
      if (!options?.silent) {
        showToast(err.message, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [setUser, fetchActiveSportBets, shouldFetchActiveSportBets, isAuthenticated, showToast]);

  const needsActiveSportBets = currentView === 'sports';

  // Initial load & polling (balances always; active sport bets only when sports UI needs them)
  useEffect(() => {
    fetchData({ withActiveBets: needsActiveSportBets });
    const interval = setInterval(() => {
        const currentUser = useUserStore.getState().user;
        if (currentUser) {
            fetchData({ withActiveBets: shouldFetchActiveSportBets(), silent: true });
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
    casinoMode,
    onNavigate: navigate,
    userName: user?.name,
    isLoading,
    onRefresh: () => { void fetchData() },
    onLogin: handleLogin,
    onSessionRevalidate: handleSessionRevalidate,
    onSiteChanged: handleSiteChanged,
  } as const

  return (
    <div 
      className="workspace-app flex flex-col h-screen overflow-hidden"
      style={{
        background: 'var(--app-bg-deep)',
        color: 'var(--app-text)',
        fontFamily: 'var(--font-body)',
        ...(accentInlineStyle || {}),
      }}
      data-app-mode={currentView}
      data-density={workspaceDensity}
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

      <div className="workspace-layout">
        <WorkspaceSidebar currentView={currentView} casinoMode={casinoMode} collapsed={sidebarCollapsed} hideSports={preferredSite === 'eu'} onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)} onNavigate={navigate} />
        <div className="workspace-content">
          <AppHeader {...appHeaderProps} />
          <main className="workspace-pages" id="workspace-main">
            <section className="workspace-page workspace-page-casino" hidden={currentView !== 'casino'} aria-label="Casino workspace">
              <CasinoView />
            </section>
            {visitedViews.has('sports') && <section className="workspace-page workspace-page-sports" hidden={currentView !== 'sports'} aria-label="Sports workspace">
              <div className="sports-bot-main sports-view sports-bot-main--full">
                  {user ? (
                    <AutoBetView layout="wide" />
                  ) : (
                      <div className="app-login-empty" style={{ minHeight: '100%' }}>
                      <AppBrandMark size={56} />
                      <h2>Welcome to {APP_NAME}</h2>
                      <p>
                        {APP_TAGLINE}. Login with Stake.com to configure AutoBet and manage your sport bets.
                      </p>
                      <button type="button" onClick={() => void handleLogin()}>
                        Login with Stake
                      </button>
                    </div>
                  )}
              </div>
            </section>}

            {visitedViews.has('logger') && (
              <section className="workspace-page app-view-logger" hidden={currentView !== 'logger'} aria-label="Import analysis">
                <LoggerView />
              </section>
            )}
            {currentView === 'overview' && <section className="workspace-page"><WorkspaceOverview userName={user?.name} onNavigate={navigate} /></section>}
            {currentView === 'settings' && <section className="workspace-page"><WorkspaceSettings onNavigate={navigate} onLogin={handleLogin} onSessionRevalidate={handleSessionRevalidate} onRefresh={() => { void fetchData() }} /></section>}
          </main>
        </div>
      </div>
      {/* AutoBet Manager (Headless): always mounted to avoid remount restarts */}
      <AutoBetManager />
      <CopyBetManager />
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
