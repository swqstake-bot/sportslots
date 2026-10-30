import { useWorkspaceSessions } from '../../hooks/useWorkspaceSessions'
import { useStakeSiteStore } from '../../store/stakeSiteStore'
import { useUserStore } from '../../store/userStore'
import { formatWalletBalanceAmount } from '../../utils/walletBalance'
import { getCurrencyLabel } from '../Casino/utils/currencyMeta'
import { HeaderAccountMeta } from './HeaderAccountMeta'
import { WorkspaceIcon } from './WorkspaceSidebar'
import { WorkspaceSessionRow } from './WorkspaceSessions'
import { WORKSPACE_NAVIGATION, type WorkspaceDestination } from './workspaceNavigation'

export function WorkspaceOverview({ userName, onNavigate }: { userName?: string; onNavigate: (target: WorkspaceDestination) => void }) {
  const preferredSite = useStakeSiteStore((state) => state.preferredSite)
  const currency = useUserStore(state => state.selectedCurrency)
  const balance = useUserStore(state => state.balances[currency])
  const { sessions, activeCount, errorCount } = useWorkspaceSessions()
  const visibleSessions = sessions.filter((session) => session.state !== 'stopped')
  const workspaces = WORKSPACE_NAVIGATION.filter((item) => item.id !== 'overview' && !(preferredSite === 'eu' && item.id === 'sports'))

  return (
    <div className="workspace-overview">
      <section className="workspace-overview-intro" aria-labelledby="workspace-overview-title">
        <span className="workspace-eyebrow">Your workspace</span>
        <h1 id="workspace-overview-title">{userName ? `Welcome back, ${userName}` : 'Workspace overview'}</h1>
        <p>Choose a workspace, check your sessions and keep your setup in view.</p>
      </section>
      <div className="workspace-overview-summary">
        <section className="workspace-overview-account" aria-labelledby="workspace-account-title">
          <div className="workspace-section-heading"><h2 id="workspace-account-title">Account</h2><span className="workspace-muted">Stake.{preferredSite}</span></div>
          {userName ? (
            <><div className="workspace-overview-balance"><div><span>Selected wallet</span><strong>{balance == null ? '—' : formatWalletBalanceAmount(balance, currency)} <small>{getCurrencyLabel(currency)}</small></strong></div><span className="workspace-muted">{userName}</span></div><HeaderAccountMeta enabled={Boolean(userName)} /><p className="workspace-overview-caption">Choose a different currency from the wallet menu in the header.</p></>
          ) : <p className="workspace-muted">Sign in from the header to connect your Stake account.</p>}
        </section>
        <section className="workspace-overview-status" aria-labelledby="workspace-status-title">
          <div className="workspace-section-heading"><h2 id="workspace-status-title">Session status</h2><span className="workspace-count">{activeCount} active</span></div>
          {errorCount > 0 && <p className="workspace-overview-attention">{errorCount} {errorCount === 1 ? 'session needs' : 'sessions need'} attention.</p>}
          {visibleSessions.length ? (
            <div className="workspace-session-list">{visibleSessions.map((session) => <WorkspaceSessionRow key={session.id} session={session} onNavigate={onNavigate} />)}</div>
          ) : <p className="workspace-muted">No active sessions reported. Open a workspace to configure a run.</p>}
          <p className="workspace-overview-caption">Running, waiting and paused sessions appear here. Open a session to return to its controls.</p>
        </section>
      </div>
      <section className="workspace-overview-workspaces" aria-labelledby="workspace-workspaces-title">
        <div className="workspace-section-heading"><h2 id="workspace-workspaces-title">Open a workspace</h2><span className="workspace-muted">Your tools, grouped by task</span></div>
        <div className="workspace-overview-links">
          {workspaces.map((item) => <button type="button" key={item.id} className="workspace-overview-link" onClick={() => onNavigate(item.destination)}><WorkspaceIcon name={item.icon} /><span><strong>{item.label}</strong><span>{item.description}</span></span><span className="workspace-overview-arrow" aria-hidden="true">→</span></button>)}
        </div>
      </section>
      <section className="workspace-overview-note" aria-label="About imported data">
        <WorkspaceIcon name="analysis" /><p><strong>Review an exported session</strong><span>Import analysis opens saved files. It does not record runs in the background; imported data stays in memory until the app is closed.</span></p><button type="button" onClick={() => onNavigate({ view: 'logger' })}>Open import analysis</button>
      </section>
    </div>
  )
}
