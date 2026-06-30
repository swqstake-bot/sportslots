import { useEffect, useRef } from 'react'

interface OriginalsLogDockProps {
  open: boolean
  onToggle: () => void
  logLines: string[]
  running?: boolean
}

export default function OriginalsLogDock({ open, onToggle, logLines, running }: OriginalsLogDockProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastLine = logLines[logLines.length - 1]

  useEffect(() => {
    if (!open || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [open, logLines.length, lastLine])

  if (!open) {
    return (
      <button
        type="button"
        className="originals-log-dock-tab"
        onClick={onToggle}
        title="Show session log"
        aria-expanded={false}
      >
        <span className="originals-log-dock-tab-label">Log</span>
        {logLines.length > 0 && (
          <span className="originals-log-dock-tab-badge" aria-hidden>
            {logLines.length > 99 ? '99+' : logLines.length}
          </span>
        )}
        {running && <span className="originals-log-dock-tab-dot" aria-hidden />}
      </button>
    )
  }

  return (
    <aside className="originals-log-dock" aria-label="Session log">
      <div className="originals-log-dock-header">
        <h3>Log</h3>
        <button type="button" className="originals-log-dock-collapse" onClick={onToggle} title="Hide log">
          ▸
        </button>
      </div>
      <div ref={scrollRef} className="originals-log-dock-body originals-log-scroll">
        {logLines.length === 0 ? (
          <span className="originals-empty-hint">Ready — press Start.</span>
        ) : (
          logLines.map((line, i) => (
            <div key={i} className="originals-log-line">
              {line}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
