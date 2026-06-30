import { useCallback, useState } from 'react'
import type { OriginalsBetRow } from '../hooks/useOriginalsSession'
import type { BetListColumns } from './workbenchStorage'
import { copyBetIdToClipboard, displayBetId, formatBetUsd, shortenBetId } from './betDisplayUtils'

interface OriginalsBetBrowserProps {
  betList: OriginalsBetRow[]
  open?: boolean
  maxRows?: number
  columns?: BetListColumns
}

function formatTime(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function formatKenoNumbers(nums?: number[]): string {
  if (!nums?.length) return '—'
  return [...nums].sort((a, b) => a - b).join(', ')
}

function exportCsv(rows: OriginalsBetRow[], columns?: BetListColumns): void {
  const header = ['#', 'Game', 'Bet ID', 'Bet ($)', 'Payout ($)', 'P/L ($)', 'Multi', 'B2B', 'Win', 'Time', 'Nonce']
  if (columns?.kenoPicks) header.push('Picks')
  if (columns?.kenoDrawn) header.push('Drawn')
  if (columns?.kenoHits) header.push('Hits')
  const lines = rows
    .slice()
    .reverse()
    .map((r) => {
      const base = [
        r.betIndex,
        r.game,
        r.betId ?? '',
        r.betSizeUsd.toFixed(6),
        r.payoutUsd.toFixed(6),
        r.roundProfitUsd.toFixed(6),
        r.multi.toFixed(4),
        r.b2bMulti.toFixed(4),
        r.win ? '1' : '0',
        r.timestamp ? new Date(r.timestamp).toISOString() : '',
        r.nonce ?? '',
      ]
      if (columns?.kenoPicks) base.push(formatKenoNumbers(r.kenoPicks))
      if (columns?.kenoDrawn) base.push(formatKenoNumbers(r.kenoDrawn))
      if (columns?.kenoHits) base.push(r.kenoHits != null ? String(r.kenoHits) : '')
      return base.join(',')
    })
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `originals-bets-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function OriginalsBetBrowser({
  betList,
  open = true,
  maxRows,
  columns,
}: OriginalsBetBrowserProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const handleExport = useCallback(() => exportCsv(betList, columns), [betList, columns])
  const cols: BetListColumns = columns ?? {
    game: true,
    betId: true,
    bet: true,
    multi: true,
    b2b: true,
    pl: true,
    time: false,
    nonce: false,
    kenoPicks: false,
    kenoDrawn: false,
    kenoHits: false,
  }

  const copyId = useCallback(async (id: string, betIndex: number) => {
    const ok = await copyBetIdToClipboard(id)
    if (ok) {
      setCopiedIndex(betIndex)
      window.setTimeout(() => setCopiedIndex((c) => (c === betIndex ? null : c)), 1500)
    }
  }, [])

  if (!open) return null

  const rows = maxRows != null ? betList.slice(0, maxRows) : betList

  return (
    <div className="originals-bet-browser casino-card">
      <div className="originals-panel-header originals-bet-browser-header">
        <span>Bets ({betList.length})</span>
        <button
          type="button"
          className="originals-mini-btn"
          disabled={betList.length === 0}
          onClick={handleExport}
        >
          Export CSV
        </button>
      </div>
      <div className="originals-panel-body originals-bet-table-wrap originals-bet-browser-body">
        {betList.length === 0 ? (
          <p className="originals-empty-hint">No bets yet — start betting to see history here.</p>
        ) : (
          <table className="originals-bet-table originals-bet-table--full">
            <thead>
              <tr>
                <th>#</th>
                {cols.game && <th>Game</th>}
                {cols.betId && <th>Bet ID</th>}
                {cols.bet && <th>Bet</th>}
                {cols.multi && <th>×</th>}
                {cols.b2b && <th>B2B</th>}
                {cols.pl && <th>P/L</th>}
                {cols.kenoPicks && <th>Picks</th>}
                {cols.kenoDrawn && <th>Drawn</th>}
                {cols.kenoHits && <th>Hits</th>}
                {cols.time && <th>Time</th>}
                {cols.nonce && <th>Nonce</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const betId = displayBetId(row.betId)
                return (
                  <tr key={row.betIndex}>
                    <td>{row.betIndex}</td>
                    {cols.game && <td>{row.game}</td>}
                    {cols.betId && (
                      <td className="originals-bet-id-cell">
                        {betId ? (
                          <span className="originals-bet-id-wrap">
                            <span title={betId}>{shortenBetId(betId, 16)}</span>
                            <button
                              type="button"
                              className="originals-bet-id-copy"
                              title={`Copy ${betId}`}
                              onClick={() => void copyId(betId, row.betIndex)}
                            >
                              {copiedIndex === row.betIndex ? '✓' : 'Copy'}
                            </button>
                          </span>
                        ) : (
                          '…'
                        )}
                      </td>
                    )}
                    {cols.bet && <td>${formatBetUsd(row.betSizeUsd)}</td>}
                    {cols.multi && <td>{row.multi > 0 ? `${row.multi.toFixed(2)}×` : '—'}</td>}
                    {cols.b2b && <td>{row.b2bMulti > 1.001 ? `${row.b2bMulti.toFixed(2)}×` : '—'}</td>}
                    {cols.pl && (
                      <td className={row.roundProfitUsd >= 0 ? 'originals-profit' : 'originals-loss'}>
                        {row.roundProfitUsd >= 0 ? '+' : ''}${formatBetUsd(row.roundProfitUsd)}
                      </td>
                    )}
                    {cols.kenoPicks && (
                      <td className="originals-keno-nums text-xs" title={formatKenoNumbers(row.kenoPicks)}>
                        {formatKenoNumbers(row.kenoPicks)}
                      </td>
                    )}
                    {cols.kenoDrawn && (
                      <td className="originals-keno-nums text-xs" title={formatKenoNumbers(row.kenoDrawn)}>
                        {formatKenoNumbers(row.kenoDrawn)}
                      </td>
                    )}
                    {cols.kenoHits && (
                      <td className="tabular-nums text-xs">{row.kenoHits != null ? row.kenoHits : '—'}</td>
                    )}
                    {cols.time && <td className="tabular-nums text-xs">{formatTime(row.timestamp)}</td>}
                    {cols.nonce && <td className="tabular-nums text-xs">{row.nonce ?? '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
