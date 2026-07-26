import type { ReactNode } from 'react'
import './slot-workbench.css'

export type SlotWorkbenchInstance = {
  id: string
  slug: string
  label: string
  running?: boolean
}

type SlotWorkbenchProps = {
  instances: SlotWorkbenchInstance[]
  activeInstanceId: string
  onActiveInstanceChange: (id: string) => void
  onRemoveInstance: (id: string) => void
  fleet: ReactNode
  stats: ReactNode
  children: ReactNode
}

export function SlotWorkbench({
  instances,
  activeInstanceId,
  onActiveInstanceChange,
  onRemoveInstance,
  fleet,
  stats,
  children,
}: SlotWorkbenchProps) {
  return (
    <div className="slot-workbench">
      <div className="slot-wb-header">
        <div className="slot-wb-tabs" role="tablist" aria-label="Selected slots">
          {instances.map((inst) => {
            const active = inst.id === activeInstanceId
            return (
              <div
                key={inst.id}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                className={`slot-wb-tab${active ? ' is-active' : ''}`}
                onClick={() => onActiveInstanceChange(inst.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onActiveInstanceChange(inst.id)
                  }
                }}
              >
                <span className={`slot-wb-tab-dot${inst.running ? ' is-running' : ''}`} aria-hidden />
                <span className="slot-wb-tab-label" title={inst.label}>{inst.label}</span>
                <button
                  type="button"
                  className="slot-wb-tab-remove"
                  title="Remove"
                  aria-label={`Remove ${inst.label}`}
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
          {instances.length >= 2 && (
            <span className="slot-wb-fleet-hint">
              {instances.length} slots · Start all runs in parallel
            </span>
          )}
        </div>
      </div>
      <div className="slot-wb-shell">
        <div className="slot-wb-canvas">{children}</div>
        {stats}
      </div>
    </div>
  )
}
