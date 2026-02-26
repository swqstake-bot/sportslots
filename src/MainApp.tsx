import './index.css';
import { useState, useEffect, useCallback, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StakeApi } from './api/client';
import { Queries } from './api/queries';
import { Sidebar } from './components/Sidebar';
import { FixtureList } from './components/FixtureList';
import { RightSidebar } from './components/RightSidebar';
import { useUserStore } from './store/userStore';
import { useAutoBetStore } from './store/autoBetStore';
import { useUiStore } from './store/uiStore';
import { WalletSelector } from './components/WalletSelector';
import { AutoBetManager } from './components/AutoBet/AutoBetManager';
import CasinoView from './components/Casino/CasinoView';
import { KeyAuthLogin } from './components/KeyAuthLogin';
import { isKeyAuthEnabled } from './api/keyauth';
import { UpdaterNotification } from './components/UpdaterNotification';
import { ChangelogModal } from './components/ui/ChangelogModal';
import { GlobalToast } from './components/ui/GlobalToast';
import { getChangelogForVersion } from './constants/changelogs';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Changelog State
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogVersion, setChangelogVersion] = useState('');
  const [changelogContent, setChangelogContent] = useState<string[]>([]);

  useEffect(() => {
    // Check for version update
    const currentVersion = (window as any).electronAPI?.version;
    if (!currentVersion) return;

    const lastSeenVersion = localStorage.getItem('app_last_seen_version');

    if (currentVersion !== lastSeenVersion) {
      // Version changed!
      const changes = getChangelogForVersion(currentVersion);
      // Show modal even if no specific notes, just to announce update
      setChangelogVersion(currentVersion);
      setChangelogContent(changes || []);
      setShowChangelog(true);
      
      // Update last seen version
      localStorage.setItem('app_last_seen_version', currentVersion);
    }
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

      // 2. Fetch Balances & Active Bets
      try {
        const [balanceRes, betsRes] = await Promise.all([
          StakeApi.query(Queries.FetchBalances),
          StakeApi.query<any>(Queries.FetchActiveSportBets, {
            limit: 10,
            offset: 0,
            name: userData.name
          })
        ]);

        if (balanceRes.data?.user?.balances) {
          setBalancesFromApi(balanceRes.data.user.balances);
        } else {
            console.warn('Balances not found in response', balanceRes);
            // Don't set dummy balances, let store handle empty state
        }

        if (betsRes.data?.user?.activeSportBets) {
          setActiveBets(betsRes.data.user.activeSportBets);
        }
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

  if (!isAuthenticated) {
    return <KeyAuthLogin onSuccess={handleKeyAuthSuccess} />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0f212e] text-white font-sans overflow-hidden select-none">
      <GlobalToast />
      <UpdaterNotification />
      <ChangelogModal 
        isOpen={showChangelog} 
        onClose={() => setShowChangelog(false)} 
        version={changelogVersion} 
        changes={changelogContent} 
      />
      {/* Header - h-12 (48px) statt h-16 für mehr Platz im Content-Bereich */}
      <header className="bg-[#1a2c38] px-4 sm:px-6 h-12 sm:h-14 shadow-lg flex justify-between items-center shrink-0 z-50 border-b border-[#2f4553]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-[#00e701]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/>
            </svg>
            <h1 className="text-base sm:text-lg font-black text-white tracking-wider italic">STAKE<span className="text-[#00e701]">SPORTS</span></h1>
          </div>
          {user && (
            <div className="flex items-center gap-2 bg-[#0f212e] px-3 py-1.5 rounded-full border border-[#2f4553]">
              <div className="w-2 h-2 rounded-full bg-[#00e701]"></div>
              <span className="text-xs font-bold text-[#b1bad3] tracking-wide">
                {user.name}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-xs transition-all border ${
                  isRunning 
                  ? 'bg-[#00e701]/10 border-[#00e701] text-[#00e701] shadow-[0_0_10px_rgba(0,231,1,0.2)]' 
                  : 'bg-[#0f212e] border-[#2f4553] text-[#55657e]'
                }`}
              >
                <span className="uppercase tracking-wider">{isRunning ? 'Running' : 'Stopped'}</span>
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-[#00e701] animate-pulse' : 'bg-[#55657e]'}`}></span>
              </div>
              
              <div className="h-8 w-[1px] bg-[#2f4553] mx-2"></div>
              
              <WalletSelector />
              
              <button 
                onClick={fetchData} 
                disabled={isLoading}
                className={`text-[#b1bad3] hover:text-white transition-all p-2 rounded-full hover:bg-[#2f4553] ${isLoading ? 'animate-spin text-[#00e701]' : ''}`}
                title="Refresh Data"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
            </>
          ) : (
            <button 
              onClick={handleLogin}
              className="bg-[#1475e1] hover:bg-[#1464c0] text-white px-6 py-2 rounded font-bold text-sm transition-all shadow-lg hover:shadow-[#1475e1]/20"
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

        {/* Casino View */}
        {currentView === 'casino' && (
          <div className="flex-1 bg-[#0f212e] overflow-auto relative z-10">
            <CasinoView />
          </div>
        )}

        {/* Sports View & Right Sidebar */}
        {currentView !== 'casino' && (
          <>
            <div className="flex-1 bg-[#0f212e] overflow-hidden flex flex-col relative z-0">
              {user ? (
                selectedSport ? (
                  <FixtureList sportSlug={selectedSport} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-10 opacity-50">
                     <svg className="w-16 h-16 text-[#b1bad3] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                     <span className="text-[#b1bad3] font-bold text-lg">Select a sport to view fixtures</span>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-[#0f212e]">
                  <div className="w-20 h-20 bg-[#1a2c38] rounded-full flex items-center justify-center mb-6 shadow-lg border border-[#2f4553]">
                      <svg className="w-10 h-10 text-[#00e701]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/>
                      </svg>
                  </div>
                  <h2 className="text-2xl font-black text-white mb-3 tracking-wide uppercase italic">Welcome to STAKE<span className="text-[#00e701]">SPORTS</span></h2>
                  <p className="text-[#b1bad3] mb-8 max-w-md text-sm leading-relaxed">
                    Please login with your Stake.com account to view fixtures, place bets, and manage your portfolio.
                  </p>
                  <button 
                    onClick={handleLogin}
                    className="bg-[#1475e1] hover:bg-[#1464c0] text-white px-8 py-3 rounded font-bold text-sm shadow-lg hover:shadow-[#1475e1]/30 transform hover:-translate-y-0.5 transition-all uppercase tracking-wider"
                  >
                    Login to Stake
                  </button>
                </div>
              )}
            </div>
            
            <RightSidebar />
          </>
        )}
      </div>
      {/* AutoBet Manager (Headless) - Only in Sports Mode */}
      {currentView === 'sports' && <AutoBetManager />}
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
