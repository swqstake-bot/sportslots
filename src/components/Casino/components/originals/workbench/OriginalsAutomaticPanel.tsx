import { Button } from '../../ui/Button'
import OriginalsProfitChart from './OriginalsProfitChart'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import type { useOriginalsSession } from '../hooks/useOriginalsSession'
import { formatBetUsd } from './betDisplayUtils'

type Session = ReturnType<typeof useOriginalsSession>

interface OriginalsAutomaticPanelProps {
  options: OriginalsWorkbenchOptions
  currency: string
  session: Session
  turboMode?: boolean
}

export default function OriginalsAutomaticPanel({
  options,
  currency,
  session,
  turboMode,
}: OriginalsAutomaticPanelProps) {
  const { running, paused, startCooldownSecs, start, stop, pause, resume, armStopOnNextWin, resetStats, stats, chartData, chartSessionKey } = session

  return (
    <div className="originals-automatic-panel space-y-4">
      <div className="originals-automatic-controls">
        <div className="originals-automatic-actions">
          {!running ? (
            <>
              <Button
                type="button"
                className="originals-start-btn"
                onClick={() => start(options, currency)}
                disabled={!options.game || startCooldownSecs > 0}
              >
                {startCooldownSecs > 0 ? `Wait ${startCooldownSecs}s` : 'Start'}
              </Button>
              {stats && (
                <button
                  type="button"
                  className="originals-mini-btn"
                  onClick={resetStats}
                  title="Clear statistics and bet list"
                >
                  Reset stats
                </button>
              )}
            </>
          ) : (
            <>
              <Button type="button" variant="danger" className="originals-stop-btn" onClick={stop}>
                Stop
              </Button>
              {paused ? (
                <Button type="button" className="originals-mini-btn originals-mini-btn--primary" onClick={resume}>
                  Resume
                </Button>
              ) : (
                <button type="button" className="originals-mini-btn" onClick={pause} title="Pause betting">
                  Pause
                </button>
              )}
              <button
                type="button"
                className="originals-mini-btn"
                onClick={armStopOnNextWin}
                title="Stop on the next win"
              >
                Stop on win
              </button>
              <span className="originals-running-label">
                <span className={`originals-running-dot${paused ? ' originals-running-dot--paused' : ''}`} aria-hidden />
                {paused ? 'Paused' : turboMode ? 'Turbo' : 'Running'}
              </span>
            </>
          )}
        </div>
        {stats && (
          <div className="originals-session-summary tabular-nums">
            <span>{stats.bets} bets</span>
            <span className="originals-session-summary-sep">·</span>
            <span>{stats.betsPerSec.toFixed(1)}/s</span>
            <span className="originals-session-summary-sep">·</span>
            <span className={stats.profit >= 0 ? 'originals-profit' : 'originals-loss'}>
              {stats.profit >= 0 ? '+' : ''}${formatBetUsd(stats.profit)}
            </span>
            {stats.rtp > 0 && (
              <>
                <span className="originals-session-summary-sep">·</span>
                <span className="originals-session-summary-rtp" title="Return to player">
                  RTP {(stats.rtp * 100).toFixed(1)}%
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {!running && !stats && (
        <p className="text-xs text-[var(--text-muted)]">
          Configure options on the left, then press Start.
          {turboMode
            ? ' Turbo ⚡ sends parallel bets (flat stake, best for wagering).'
            : ' Statistics stay visible after Stop.'}
        </p>
      )}

      {(running || chartData.length > 1) && (
        <div className="originals-stats-chart originals-stats-chart--inline">
          <OriginalsProfitChart chartData={chartData} domainResetKey={chartSessionKey} height={200} />
        </div>
      )}
    </div>
  )
}
