import { useCallback, useEffect, useRef, useState } from 'react'
import { WalletSelector } from '../WalletSelector'
import { useStakeSiteStore } from '../../store/stakeSiteStore'
import type { AppView, CasinoMode } from '../../store/uiStore'
import { workspacePageTitle, type WorkspaceDestination } from './workspaceNavigation'
import { WorkspaceSessions } from './WorkspaceSessions'
import { MirrorSelect } from './MirrorSelect'

type StakeSite = 'com' | 'eu'
type SiteStatuses = Awaited<ReturnType<Window['electronAPI']['getStakeSiteStatuses']>>

interface AppHeaderProps {
  currentView: AppView
  casinoMode: CasinoMode
  userName?: string
  isLoading: boolean
  onRefresh: () => void
  onLogin: (site?: StakeSite) => void
  onSessionRevalidate: () => void
  onSiteChanged: () => void
  onNavigate: (destination: WorkspaceDestination) => void
}

export function AppHeader({ currentView, casinoMode, userName, isLoading, onRefresh, onLogin, onSessionRevalidate, onSiteChanged, onNavigate }: AppHeaderProps) {
  const preferredSite = useStakeSiteStore(s => s.preferredSite)
  const setPreferredSite = useStakeSiteStore(s => s.setPreferredSite)
  const mirror = useStakeSiteStore(s => s.mirror)
  const showConnection = useRef<HTMLDetailsElement>(null)
  const [statuses, setStatuses] = useState<SiteStatuses | null>(null)
  const [switching, setSwitching] = useState(false)
  const [connectionError, setConnectionError] = useState('')

  const refreshStatus = useCallback(async () => {
    if (!window.electronAPI?.getStakeSiteStatuses) return
    try {
      const next = await window.electronAPI.getStakeSiteStatuses()
      setStatuses(next)
      setPreferredSite(next.preferredSite || 'com')
      setConnectionError('')
    } catch {
      setStatuses(null)
      setConnectionError('Connection status unavailable')
    }
  }, [setPreferredSite])

  useEffect(() => {
    void refreshStatus()
    const refresh = () => { void refreshStatus() }
    window.addEventListener('stake-session-revalidated', refresh)
    return () => window.removeEventListener('stake-session-revalidated', refresh)
  }, [refreshStatus])

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (showConnection.current?.open && !showConnection.current.contains(event.target as Node)) showConnection.current.open = false
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showConnection.current?.open) {
        showConnection.current.open = false
        showConnection.current.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const switchSite = async (site: StakeSite) => {
    if (site === preferredSite || switching) return
    setSwitching(true)
    setConnectionError('')
    try {
      const result = await window.electronAPI.setStakeSite(site)
      setPreferredSite(result.preferredSite)
      setStatuses(result.statuses)
      if (result.preferredSite === 'eu' && currentView === 'sports') onNavigate({ view: 'casino', casinoMode: 'play' })
      if (!result.status?.valid) onLogin(site)
      else onSiteChanged()
      if (showConnection.current) showConnection.current.open = false
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : 'Could not switch platform')
    } finally {
      setSwitching(false)
    }
  }

  const valid = statuses?.[preferredSite]?.valid
  const siteLabel = preferredSite === 'com' && mirror !== 'auto' ? mirror : `Stake.${preferredSite}`
  const connectionLabel = connectionError ? 'Status unavailable' : statuses ? (valid ? 'Connected' : 'Sign in required') : 'Checking connection'

  return (
    <header className="workspace-header">
      <div className="workspace-header-context">
        <span className="workspace-eyebrow">{currentView === 'casino' && (casinoMode === 'challengeHub' || casinoMode === 'promotions') ? 'Challenges & promotions' : 'Workspace'}</span>
        <h1>{workspacePageTitle(currentView, casinoMode)}</h1>
      </div>
      <div className="workspace-header-actions">
        <details className="workspace-connection" ref={showConnection}>
          <summary className="workspace-connection-trigger" aria-label={`${siteLabel}: ${connectionLabel}. Connection options`}>
            <span className={`workspace-status-dot ${valid ? 'is-connected' : ''}`} aria-hidden="true" />
            <span>{siteLabel}</span><span className="workspace-connection-label">{connectionLabel}</span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="workspace-connection-menu">
            <div className="workspace-section-heading"><strong>Platform & connection</strong><span className="workspace-muted">{userName || 'No account connected'}</span></div>
            <div className="workspace-platforms" role="group" aria-label="Stake platform">
              {(['com', 'eu'] as const).map(site => <button type="button" key={site} aria-pressed={site === preferredSite} disabled={switching} onClick={() => void switchSite(site)}><span>Stake.{site}</span><small>{statuses ? (statuses[site]?.valid ? 'Connected' : 'Sign in required') : 'Not checked'}</small></button>)}
            </div>
            {preferredSite === 'com' && (
              <MirrorSelect onChanged={state => {
                void refreshStatus()
                if (!state.valid) onLogin('com')
                else onSiteChanged()
              }} />
            )}
            {connectionError && <p className="workspace-inline-error" role="alert">{connectionError}</p>}
            {!valid && <button type="button" className="workspace-button is-primary" onClick={() => onLogin(preferredSite)}>Sign in to Stake.{preferredSite}</button>}
            <button type="button" className="workspace-button" onClick={async () => { await onSessionRevalidate(); void refreshStatus() }}>Check connection</button>
            <button type="button" className="workspace-text-button" onClick={() => { if (showConnection.current) showConnection.current.open = false; onNavigate({ view: 'settings' }) }}>Connection settings →</button>
          </div>
        </details>
        <WorkspaceSessions onNavigate={onNavigate} />
        {userName && <div className="workspace-header-wallet"><WalletSelector /></div>}
        <button type="button" className={`workspace-header-refresh ${isLoading ? 'is-loading' : ''}`} onClick={onRefresh} disabled={isLoading} aria-label="Refresh account and balances" title="Refresh account and balances">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/></svg>
        </button>
        <button type="button" className="workspace-account-button" onClick={() => onNavigate({ view: 'overview' })} title={userName ? `${userName} · Account overview` : 'Open overview'} aria-label={userName ? `${userName}: account overview` : 'Open overview'}>{userName ? userName.slice(0, 2).toUpperCase() : 'SW'}</button>
      </div>
    </header>
  )
}
