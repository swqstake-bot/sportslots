import { useEffect, useState } from 'react'
import { ThemeAccentButton } from './ThemeAccentButton'
import { useUiStore } from '../../store/uiStore'
import { useStakeSiteStore } from '../../store/stakeSiteStore'
import type { WorkspaceDestination } from './workspaceNavigation'

interface WorkspaceSettingsProps {
  onNavigate: (destination: WorkspaceDestination) => void
  onLogin: (site?: 'com' | 'eu') => void
  onSessionRevalidate: () => void
  onRefresh: () => void
}

export function WorkspaceSettings({ onNavigate, onLogin, onSessionRevalidate, onRefresh }: WorkspaceSettingsProps) {
  const density = useUiStore(s => s.workspaceDensity)
  const setDensity = useUiStore(s => s.setWorkspaceDensity)
  const startPage = useUiStore(s => s.startPage)
  const setStartPage = useUiStore(s => s.setStartPage)
  const showToast = useUiStore(s => s.showToast)
  const preferredSite = useStakeSiteStore(s => s.preferredSite)
  const [version, setVersion] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.electronAPI?.getAppVersion?.().then(value => { if (!cancelled) setVersion(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const deleteCache = async () => {
    const api = window.electronAPI
    if (!api?.deleteCacheAndRelaunch) {
      showToast('Cache reset is available in the desktop app.', 'info')
      return
    }
    if (!window.confirm('Clear cache and sign-in data, then restart?\n\nThis removes Stake cookies, local settings and the Telegram session. Running sessions will be interrupted. Export anything you need before continuing.')) return
    setResetting(true)
    try {
      localStorage.clear()
      sessionStorage.clear()
      await api.deleteCacheAndRelaunch()
    } catch (error) {
      showToast(`Cache reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setResetting(false)
    }
  }

  return <div className="workspace-settings">
    <div className="workspace-page-intro"><span className="workspace-eyebrow">Make it yours</span><h2>Settings</h2><p>Connections, appearance and tools, together in one place.</p></div>
    <section className="workspace-settings-section" aria-labelledby="settings-connection">
      <div className="workspace-settings-description"><h3 id="settings-connection">Account & connection</h3><p>Stake.{preferredSite} is selected. Use the platform menu in the header to switch accounts or regions.</p></div>
      <div className="workspace-settings-controls"><div className="workspace-setting-row"><div><strong>Stake.{preferredSite}</strong><p>{preferredSite === 'eu' ? 'Casino with GC / SC currencies. Sports is not available on this platform.' : 'Casino, Sports and promotions.'}</p></div><button type="button" className="workspace-button" onClick={() => onLogin(preferredSite)}>Open sign-in</button></div><div className="workspace-setting-row"><div><strong>Connection status</strong><p>Validate the current session or refresh account balances.</p></div><div className="workspace-button-row"><button type="button" className="workspace-button" onClick={onSessionRevalidate}>Check connection</button><button type="button" className="workspace-button" onClick={onRefresh}>Refresh balances</button></div></div></div>
    </section>
    <section className="workspace-settings-section" aria-labelledby="settings-appearance">
      <div className="workspace-settings-description"><h3 id="settings-appearance">Appearance</h3><p>Keep the workspace comfortable at your preferred window size.</p></div>
      <div className="workspace-settings-controls">
        <div className="workspace-setting-row"><div><strong>Accent & brightness</strong><p>Your existing colors, presets and brightness controls.</p></div><ThemeAccentButton /></div>
        <label className="workspace-setting-row"><span><strong>Display density</strong><span className="workspace-setting-help">Comfortable spacing or a compact workspace.</span></span><select value={density} onChange={event => setDensity(event.target.value === 'compact' ? 'compact' : 'comfortable')}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        <label className="workspace-setting-row"><span><strong>Start page</strong><span className="workspace-setting-help">Applied the next time you open the app.</span></span><select value={startPage} onChange={event => setStartPage(event.target.value === 'overview' ? 'overview' : 'last')}><option value="last">Last workspace</option><option value="overview">Overview</option></select></label>
      </div>
    </section>
    <section className="workspace-settings-section" aria-labelledby="settings-data">
      <div className="workspace-settings-description"><h3 id="settings-data">Data & diagnostics</h3><p>Review imported files or open the technical tools for Casino.</p></div>
      <div className="workspace-settings-controls"><div className="workspace-setting-row"><div><strong>Import analysis</strong><p>Import JSONL sessions, filter Casino and Sports bets, and export results.</p></div><button type="button" className="workspace-button" onClick={() => onNavigate({ view: 'logger' })}>Open analysis</button></div><div className="workspace-setting-row"><div><strong>Casino diagnostics</strong><p>API details, logs and existing troubleshooting tools.</p></div><button type="button" className="workspace-button" onClick={() => onNavigate({ view: 'casino', casinoMode: 'logs' })}>Open diagnostics</button></div></div>
    </section>
    <section className="workspace-settings-section workspace-settings-reset" aria-labelledby="settings-reset"><div className="workspace-settings-description"><h3 id="settings-reset">Reset local data</h3><p>Only needed when troubleshooting persistent sign-in or cache problems.</p></div><div className="workspace-setting-row"><div><strong>Clear cache & sign-in data</strong><p>Removes local settings, Stake cookies and the Telegram session, then restarts the app.</p></div><button type="button" className="workspace-button is-danger" onClick={() => void deleteCache()} disabled={resetting}>{resetting ? 'Restarting…' : 'Clear cache & restart'}</button></div></section>
    <footer className="workspace-settings-footer">swqbot{version ? ` · Version ${version}` : ''}</footer>
  </div>
}
