import type { ReactNode } from 'react'
import './slot-workbench.css'

export type SlotWorkspaceView = 'focus' | 'all'

export type SlotWorkbenchInstance = {
  id: string
  slug: string
  label: string
  running?: boolean
  number?: number
}

type SlotWorkbenchProps = {
  instances: SlotWorkbenchInstance[]
  activeInstanceId: string
  onActiveInstanceChange: (id: string) => void
  onRemoveInstance: (id: string) => void
  fleet: ReactNode
  stats: ReactNode
  view: SlotWorkspaceView
  onViewChange: (view: SlotWorkspaceView) => void
  overview: ReactNode
  children: ReactNode
}

export function SlotWorkbench({
  instances,
  activeInstanceId,
  onActiveInstanceChange,
  onRemoveInstance,
  fleet,
  stats,
  view,
  onViewChange,
  overview,
  children,
}: SlotWorkbenchProps) {
  return (
    <div className="slot-workbench">
      <div className="slot-wb-header">
        <div className="slot-wb-heading">
          <div className="slot-wb-heading-copy">
            <h2>Slot workspace</h2>
            <span>{instances.length} selected · {instances.filter((inst) => inst.running).length} running</span>
          </div>
          <div className="slot-wb-view-switch" role="group" aria-label="Slot workspace view">
            <button type="button" aria-pressed={view === 'focus'} aria-controls="slot-workbench-focus" onClick={() => onViewChange('focus')}>Focus</button>
            <button type="button" aria-pressed={view === 'all'} aria-controls="slot-workbench-overview" disabled={instances.length < 2} onClick={() => onViewChange('all')}>All slots <span>{instances.length}</span></button>
          </div>
        </div>
        <div className="slot-wb-tabs" role="tablist" aria-label="Selected slots" hidden={view !== 'focus'}>
          {instances.map((inst, index) => {
            const active = inst.id === activeInstanceId
            return (
              <div
                key={inst.id}
                role="presentation"
                className={`slot-wb-tab${active ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  id={`slot-wb-instance-${inst.id}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls="slot-workbench-active-panel"
                  aria-label={`${inst.label}, instance ${inst.number || index + 1}, ${inst.running ? 'running' : 'idle'}`}
                  tabIndex={active ? 0 : -1}
                  className="slot-wb-tab-select"
                  onClick={() => onActiveInstanceChange(inst.id)}
                  onKeyDown={(event) => {
                    const nextIndex = event.key === 'ArrowRight'
                      ? (index + 1) % instances.length
                      : event.key === 'ArrowLeft'
                        ? (index + instances.length - 1) % instances.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? instances.length - 1
                            : -1
                    if (nextIndex < 0) return
                    event.preventDefault()
                    const next = instances[nextIndex]
                    onActiveInstanceChange(next.id)
                    document.getElementById(`slot-wb-instance-${next.id}`)?.focus()
                  }}
                >
                  <span className={`slot-wb-tab-dot${inst.running ? ' is-running' : ''}`} aria-hidden />
                  <span className="slot-wb-tab-number">#{String(inst.number || index + 1).padStart(2, '0')}</span>
                  <span className="slot-wb-tab-label" title={inst.label}>{inst.label}</span>
                </button>
                <button
                  type="button"
                  className="slot-wb-tab-remove"
                  title={`Remove ${inst.label}`}
                  aria-label={`Remove ${inst.label}`}
                  tabIndex={active ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveInstance(inst.id)
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
        <div className="slot-wb-fleet">
          {fleet}
        </div>
      </div>
      <div id="slot-workbench-focus" className="slot-wb-shell" hidden={view !== 'focus'}>
        <div
          id="slot-workbench-active-panel"
          className="slot-wb-canvas"
          role="tabpanel"
          aria-labelledby={`slot-wb-instance-${activeInstanceId}`}
        >
          {children}
        </div>
        {stats}
      </div>
      <div id="slot-workbench-overview" className="slot-wb-overview" hidden={view !== 'all'} aria-label="All selected slots" role="region">
        {overview}
      </div>
    </div>
  )
}
