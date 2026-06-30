import { WalletSelector } from '../WalletSelector'
import { PrimaryNav } from './PrimaryNav'
import { ThemeAccentButton } from './ThemeAccentButton'
import { HeaderAccountMeta } from './HeaderAccountMeta'
import { AppBrandMark, AppBrandTitle } from './AppBrandMark'
import { APP_VIEW_TITLES } from '../../constants/branding'

type AppView = 'casino' | 'sports' | 'logger'

interface AppHeaderProps {
  currentView: AppView
  onChangeView: (view: AppView) => void
  userName?: string
  isChallengeRunning: boolean
  isRunning: boolean
  isLoading: boolean
  onRefresh: () => void
  onLogin: () => void
  onSessionRevalidate?: () => void
}

export function AppHeader({
  currentView,
  onChangeView,
  userName,
  isChallengeRunning,
  isRunning,
  isLoading,
  onRefresh,
  onLogin,
  onSessionRevalidate,
}: AppHeaderProps) {
  const hasUser = Boolean(userName)
  return (
    <header className="app-header">
      <div className="app-header-left">
        <div className="app-header-brand-row">
          <AppBrandMark size={34} className="app-header-logo" />
          <h1 className="app-header-title">
            <AppBrandTitle suffix={APP_VIEW_TITLES[currentView]} />
          </h1>
        </div>
        {hasUser && (
          <div className="app-header-userpill">
            <span className="app-header-dot" />
            <span>{userName}</span>
          </div>
        )}
        {isChallengeRunning && <div className="app-header-alert">Challenge running</div>}
        <PrimaryNav currentView={currentView} onChangeView={onChangeView} />
      </div>

      <div className="app-header-right">
        {hasUser ? (
          <>
            <div className={`app-run-state ${isRunning ? 'is-running' : ''}`.trim()}>
              <span>{isRunning ? 'Running' : 'Stopped'}</span>
              <span className="app-run-state-dot" />
            </div>
            <HeaderAccountMeta enabled={hasUser} />
            <WalletSelector />
            <ThemeAccentButton />
            <button type="button" onClick={onRefresh} className={`app-header-refresh-btn ${isLoading ? 'is-loading' : ''}`.trim()}>
              Refresh
            </button>
            <button
              type="button"
              onClick={onSessionRevalidate}
              className="app-header-refresh-btn"
              aria-label="Revalidate Stake session"
            >
              Session
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
