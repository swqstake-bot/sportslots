import { WalletSelector } from '../WalletSelector'
import { PrimaryNav } from './PrimaryNav'

type AppView = 'casino' | 'sports' | 'logger'

interface AppHeaderProps {
  currentView: AppView
  onChangeView: (view: AppView) => void
  appTitle: string
  userName?: string
  isChallengeRunning: boolean
  isRunning: boolean
  isLoading: boolean
  onRefresh: () => void
  onLogin: () => void
}

export function AppHeader({
  currentView,
  onChangeView,
  appTitle,
  userName,
  isChallengeRunning,
  isRunning,
  isLoading,
  onRefresh,
  onLogin,
}: AppHeaderProps) {
  const hasUser = Boolean(userName)
  return (
    <header className="app-header">
      <div className="app-header-left">
        <div>
          <h1 className="app-header-title">
            STAKE<span>{appTitle.replace('STAKE', '')}</span>
          </h1>
        </div>
        {hasUser && (
          <div className="app-header-userpill">
            <span className="app-header-dot" />
            <span>{userName}</span>
          </div>
        )}
        {isChallengeRunning && <div className="app-header-alert">Challenge running</div>}
      </div>

      <PrimaryNav currentView={currentView} onChangeView={onChangeView} />

      <div className="app-header-right">
        {hasUser ? (
          <>
            <div className={`app-run-state ${isRunning ? 'is-running' : ''}`.trim()}>
              <span>{isRunning ? 'Running' : 'Stopped'}</span>
              <span className="app-run-state-dot" />
            </div>
            <WalletSelector />
            <button type="button" onClick={onRefresh} className={`app-header-refresh-btn ${isLoading ? 'is-loading' : ''}`.trim()}>
              Refresh
            </button>
          </>
        ) : (
          <button type="button" onClick={onLogin} className="app-header-login-btn">
            Login with Stake
          </button>
        )}
      </div>
    </header>
  )
}
