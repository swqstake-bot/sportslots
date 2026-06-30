import OriginalsProfitChart from './OriginalsProfitChart'
import type { ScriptSessionStats } from '../scriptEngine/scriptSessionStats'
import OriginalsStatsPanel from './OriginalsStatsPanel'
import { useDraggablePanel } from './useDraggablePanel'

interface OriginalsStatsDrawerProps {
  open: boolean
  onClose: () => void
  onReset?: () => void
  running?: boolean
  chartData: { index: number; profit: number }[]
  chartSessionKey?: number
  stats: ScriptSessionStats | null
  floating?: boolean
}

export default function OriginalsStatsDrawer({
  open,
  onClose,
  onReset,
  running,
  chartData,
  chartSessionKey,
  stats,
  floating = false,
}: OriginalsStatsDrawerProps) {
  const { panelRef, panelStyle, onHeaderPointerDown } = useDraggablePanel(floating)

  if (!open) return null

  return (
    <aside
      ref={panelRef}
      className={`originals-stats-dock${floating ? ' originals-stats-dock--float' : ''}`}
      style={panelStyle}
      aria-label="Statistics"
    >
      <div
        className={`originals-stats-drawer-header${floating ? ' originals-stats-drawer-header--draggable' : ''}`}
        title={floating ? 'Drag title to move' : undefined}
      >
        <h3 onPointerDown={floating ? onHeaderPointerDown : undefined}>Statistics</h3>
        <div className="originals-stats-dock-actions">
          {onReset && (
            <button
              type="button"
              className="originals-mini-btn"
              disabled={running}
              onClick={onReset}
              title="Clear bets and statistics"
            >
              Reset
            </button>
          )}
          <button type="button" onClick={onClose} className="originals-stats-close" aria-label="Hide statistics">
            ×
          </button>
        </div>
      </div>
      <div className="originals-stats-body">
        {stats ? (
          <OriginalsStatsPanel stats={stats} compact />
        ) : (
          <p className="originals-empty-hint">Press Start to begin. Stats persist after Stop until you reset.</p>
        )}
        {(running || chartData.length > 1) && (
          <div className="originals-stats-chart">
            <OriginalsProfitChart chartData={chartData} domainResetKey={chartSessionKey} height={240} />
          </div>
        )}
      </div>
    </aside>
  )
}
