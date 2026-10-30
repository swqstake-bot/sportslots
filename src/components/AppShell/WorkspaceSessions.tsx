import { useEffect, useId, useRef, useState } from 'react'
import { useWorkspaceSessions } from '../../hooks/useWorkspaceSessions'
import type { WorkspaceSession, WorkspaceSessionState } from '../../store/workspaceSessionStore'
import type { WorkspaceDestination } from './workspaceNavigation'

const WORKSPACE_SESSION_STATE_LABELS: Record<WorkspaceSessionState, string> = {
  running: 'Running', waiting: 'Waiting', paused: 'Paused', stopped: 'Stopped', error: 'Needs attention',
}

export function WorkspaceSessionRow({ session, onNavigate }: { session: WorkspaceSession; onNavigate: (target: WorkspaceDestination) => void }) {
  return (
    <button type="button" className={`workspace-session-row is-${session.state}`} onClick={() => onNavigate(session.destination)}>
      <span className={`workspace-session-dot is-${session.state}`} aria-hidden="true" />
      <span className="workspace-session-main">
        <span className="workspace-session-name">{session.label}{session.currency && <span className="workspace-session-currency">{session.currency.toUpperCase()}</span>}</span>
        {session.detail && <span className="workspace-session-detail">{session.detail}</span>}
        {session.updatedAt > 0 && <time className="workspace-session-time" dateTime={new Date(session.updatedAt).toISOString()}>Status updated {new Date(session.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}
      </span>
      <span className={`workspace-session-state is-${session.state}`}>{WORKSPACE_SESSION_STATE_LABELS[session.state]}</span>
    </button>
  )
}

export function WorkspaceSessions({ onNavigate, className = '' }: { onNavigate: (target: WorkspaceDestination) => void; className?: string }) {
  const { sessions, activeCount, errorCount } = useWorkspaceSessions()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={`workspace-sessions ${className}`.trim()} onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <button ref={triggerRef} type="button" className={`workspace-sessions-trigger${activeCount ? ' is-active' : ''}${errorCount ? ' has-error' : ''}`} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <span className={`workspace-session-dot${errorCount ? ' is-error' : activeCount ? ' is-running' : ' is-stopped'}`} aria-hidden="true" />
        <span>{activeCount} active {activeCount === 1 ? 'session' : 'sessions'}</span>
        {errorCount > 0 && <span className="workspace-sessions-error-count">{errorCount} {errorCount === 1 ? 'issue' : 'issues'}</span>}
      </button>
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label="Workspace session status" tabIndex={-1} className="workspace-sessions-popover">
          <div className="workspace-sessions-heading">
            <h2>Session status</h2>
            <button type="button" className="workspace-sessions-close" aria-label="Close session status" onClick={() => { setOpen(false); triggerRef.current?.focus() }}>×</button>
          </div>
          <p className="workspace-sessions-note">Status reported by each workspace. Open a session to view its controls.</p>
          {sessions.length ? (
            <div className="workspace-session-list">
              {sessions.map((session) => <WorkspaceSessionRow key={session.id} session={session} onNavigate={(target) => { setOpen(false); onNavigate(target) }} />)}
            </div>
          ) : <p className="workspace-sessions-empty">No active sessions reported.</p>}
        </div>
      )}
    </div>
  )
}
