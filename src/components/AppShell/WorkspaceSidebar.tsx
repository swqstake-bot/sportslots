import type { AppView, CasinoMode } from '../../store/uiStore'
import { AppBrandMark, AppBrandTitle } from './AppBrandMark'
import { WORKSPACE_NAVIGATION, isWorkspaceItemActive, type WorkspaceDestination, type WorkspaceIconName } from './workspaceNavigation'

export interface WorkspaceSidebarProps {
  currentView: AppView
  casinoMode: CasinoMode
  collapsed: boolean
  hideSports: boolean
  onToggleCollapsed: () => void
  onNavigate: (target: WorkspaceDestination) => void
}

export function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  const paths: Record<WorkspaceIconName, string> = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    casino: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8 8h.01 M16 8h.01 M12 12h.01 M8 16h.01 M16 16h.01',
    sports: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8 M18.4 5.6 5.6 18.4 M3 12h18 M12 3v18',
    challenges: 'M8 3h8v5a4 4 0 0 1-8 0V3z M8 5H4v2a4 4 0 0 0 4 4 M16 5h4v2a4 4 0 0 1-4 4 M12 12v6 M8 21h8 M9 18h6',
    analysis: 'M5 3h9l5 5v13H5z M14 3v5h5 M8 17v-4 M12 17v-6 M16 17v-2',
    settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  }
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export function WorkspaceSidebar({ currentView, casinoMode, collapsed, hideSports, onToggleCollapsed, onNavigate }: WorkspaceSidebarProps) {
  return (
    <aside className={`workspace-sidebar${collapsed ? ' is-collapsed' : ''}`} aria-label="Workspace sidebar">
      <div className="workspace-sidebar-brand">
        <AppBrandMark size={29} />
        {!collapsed && <AppBrandTitle />}
        <button type="button" className="workspace-sidebar-toggle" onClick={onToggleCollapsed} aria-expanded={!collapsed} aria-controls="workspace-navigation" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={collapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} /></svg>
        </button>
      </div>
      <nav id="workspace-navigation" className="workspace-sidebar-nav" aria-label="Main navigation">
        {!collapsed && <span className="workspace-sidebar-caption">Workspaces</span>}
        {WORKSPACE_NAVIGATION.filter((item) => !(hideSports && item.id === 'sports')).map((item) => {
          const active = isWorkspaceItemActive(item, currentView, casinoMode)
          return (
            <div key={item.id} className={`workspace-sidebar-group${active ? ' is-active' : ''}`}>
              <button type="button" className={`workspace-sidebar-item${active ? ' is-active' : ''}`} onClick={() => onNavigate(item.destination)} aria-current={active && !item.children ? 'page' : undefined} aria-label={item.label} title={collapsed ? item.label : item.description}>
                <WorkspaceIcon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}
              </button>
              {!collapsed && item.children && (
                <div className="workspace-sidebar-children">
                  {item.children.map((child) => {
                    const selected = currentView === child.destination.view && casinoMode === child.destination.casinoMode
                    return <button type="button" key={child.id} className={`workspace-sidebar-child${selected ? ' is-active' : ''}`} aria-current={selected ? 'page' : undefined} onClick={() => onNavigate(child.destination)}>{child.label}</button>
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="workspace-sidebar-footer">
        <button type="button" className={`workspace-sidebar-item${currentView === 'settings' ? ' is-active' : ''}`} aria-current={currentView === 'settings' ? 'page' : undefined} aria-label="Settings" title="Settings" onClick={() => onNavigate({ view: 'settings' })}>
          <WorkspaceIcon name="settings" />{!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  )
}
