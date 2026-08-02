import { useCallback, useEffect, useState } from 'react'
import { WalletSelector } from '../WalletSelector'
import { PrimaryNav } from './PrimaryNav'
import { ThemeAccentButton } from './ThemeAccentButton'
import { HeaderAccountMeta } from './HeaderAccountMeta'
import { AppBrandMark, AppBrandTitle } from './AppBrandMark'
import { APP_VIEW_TITLES } from '../../constants/branding'
import { useStakeSiteStore } from '../../store/stakeSiteStore'

type AppView = 'casino' | 'sports' | 'logger'
type StakeSite = 'com' | 'eu'

interface SiteStatuses {
  preferredSite: StakeSite
  activeOrigin: string
  com: { site: 'com'; origin: string; valid: boolean }
  eu: { site: 'eu'; origin: string; valid: boolean }
}

interface AppHeaderProps {
  currentView: AppView
  onChangeView: (view: AppView) => void
  userName?: string
  isChallengeRunning: boolean
  isRunning: boolean
  isLoading: boolean
  onRefresh: () => void
  onLogin: (site?: StakeSite) => void
  onSessionRevalidate?: () => void
  onSiteChanged?: () => void
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
  onSiteChanged,
}: AppHeaderProps) {
  const hasUser = Boolean(userName)
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const setPreferredSite = useStakeSiteStore((s) => s.setPreferredSite)
  const [siteStatuses, setSiteStatuses] = useState<SiteStatuses | null>(null)
  const [switching, setSwitching] = useState(false)

  const refreshSiteState = useCallback(async () => {
    try {
      const api = window.electronAPI
      if (!api?.getStakeSiteStatuses) return
      const statuses = await api.getStakeSiteStatuses()
      setSiteStatuses(statuses)
      setPreferredSite(statuses.preferredSite || 'com')
    } catch (err) {
      console.warn('[AppHeader] Failed to load stake site status', err)
    }
  }, [setPreferredSite])

  useEffect(() => {
    void refreshSiteState()
    const onRevalidated = () => {
      void refreshSiteState()
    }
    window.addEventListener('stake-session-revalidated', onRevalidated)
    return () => window.removeEventListener('stake-session-revalidated', onRevalidated)
  }, [refreshSiteState])

  const handleSiteSwitch = async (site: StakeSite) => {
    if (site === preferredSite || switching) return
    setSwitching(true)
    try {
      const result = await window.electronAPI.setStakeSite(site)
      setPreferredSite(result.preferredSite)
      setSiteStatuses(result.statuses)
      if (result.preferredSite === 'eu' && currentView === 'sports') {
        onChangeView('casino')
      }
      if (!result.status?.valid) {
        onLogin(site)
      } else {
        window.dispatchEvent(new CustomEvent('stake-session-revalidated'))
        onSiteChanged?.()
      }
    } catch (err) {
      console.error('[AppHeader] Site switch failed', err)
    } finally {
      setSwitching(false)
    }
  }

  const loginLabel = preferredSite === 'eu' ? 'Login Stake.eu' : 'Login with Stake'

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
        <PrimaryNav
          currentView={currentView}
          onChangeView={onChangeView}
          hideSports={preferredSite === 'eu'}
        />
      </div>

      <div className="app-header-right">
        <div className="app-site-switch" role="group" aria-label="Stake site">
          <button
            type="button"
            className={`app-site-switch-btn ${preferredSite === 'com' ? 'is-active' : ''}`.trim()}
            onClick={() => void handleSiteSwitch('com')}
            disabled={switching}
            aria-pressed={preferredSite === 'com'}
          >
            <span
              className={`app-site-switch-dot ${siteStatuses?.com?.valid ? 'is-valid' : ''}`.trim()}
              aria-hidden
            />
            .com
          </button>
          <button
            type="button"
            className={`app-site-switch-btn ${preferredSite === 'eu' ? 'is-active' : ''}`.trim()}
            onClick={() => void handleSiteSwitch('eu')}
            disabled={switching}
            aria-pressed={preferredSite === 'eu'}
          >
            <span
              className={`app-site-switch-dot ${siteStatuses?.eu?.valid ? 'is-valid' : ''}`.trim()}
              aria-hidden
            />
            .eu
          </button>
        </div>
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
          <button type="button" onClick={() => onLogin(preferredSite)} className="app-header-login-btn">
            {loginLabel}
          </button>
        )}
      </div>
    </header>
  )
}
