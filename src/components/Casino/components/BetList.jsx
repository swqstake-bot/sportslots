import { useMemo } from 'react'
import clsx from 'clsx'
import { formatAmount } from '../utils/formatAmount'
import { formatStakeShareBetId } from '../utils/stakeBetShareId'

function fmt(val, cc) {
  return formatAmount(val, cc)
}

export default function BetList({
  bets,
  totalCount,
  currencyCode,
  compact = false,
  minimal = false,
  showSlot = false,
  showNet = true,
  showContext = false,
  showCopyHouse = false,
  maxRows = 0,
  title = 'Spins',
  emptyMessage,
}) {
  const displayBets = useMemo(() => {
    const nonZero = (bets || []).filter((b) => (b.betAmount ?? 0) !== 0 || (b.winAmount ?? 0) !== 0)
    const sorted = [...nonZero].sort((a, b) => {
      const ta = Number(a?.addedAt ?? 0)
      const tb = Number(b?.addedAt ?? 0)
      if (Number.isFinite(ta) && Number.isFinite(tb) && (ta > 0 || tb > 0)) return tb - ta
      return 0
    })
    return Number.isFinite(Number(maxRows)) && Number(maxRows) > 0 ? sorted.slice(0, Number(maxRows)) : sorted
  }, [bets, maxRows])

  const panelClass = clsx('terminal-panel', minimal && 'terminal-panel--minimal', compact && 'terminal-panel--compact')
  const scrollClass = clsx(
    'terminal-scroll',
    'terminal-scroll--bet',
    minimal && 'terminal-scroll--minimal',
    compact && 'terminal-scroll--compact'
  )

  if (!displayBets.length) {
    const msg = emptyMessage ?? 'No spins in this session yet.'
    return (
      <div className={panelClass}>
        <div className="terminal-panel__head">
          <span className="terminal-panel__title">{title}</span>
        </div>
        <div className="terminal-empty">{msg}</div>
      </div>
    )
  }

  const defaultCurrency = (currencyCode || '').toUpperCase()

  return (
    <div className={panelClass}>
      <div className="terminal-panel__head">
        <span className="terminal-panel__title">{title}</span>
        <span className="terminal-panel__count">
          {totalCount != null ? totalCount : bets.length} entries
        </span>
      </div>
      <div className={scrollClass}>
        <table className="terminal-table">
          <thead>
            <tr>
              <th className="terminal-th" style={{ width: '2.2rem' }}>
                #
              </th>
              {showSlot && (
                <th className="terminal-th" style={{ minWidth: '14rem' }}>
                  Slot
                </th>
              )}
              <th className="terminal-th" style={{ minWidth: '8.5rem' }}>
                Stake
              </th>
              <th className="terminal-th" style={{ minWidth: '8.5rem' }}>
                Win
              </th>
              {showNet && <th className="terminal-th">Net</th>}
              {showContext && (
                <th className="terminal-th" style={{ minWidth: '11rem' }}>
                  Context
                </th>
              )}
              {showCopyHouse && (
                <th className="terminal-th" style={{ minWidth: '4.3rem' }}>
                  ID
                </th>
              )}
              <th className="terminal-th" style={{ width: '3.1rem' }}>
                X
              </th>
            </tr>
          </thead>
          <tbody>
            {displayBets.map((b, i) => {
              const bet = b.betAmount ?? 0
              const win = b.winAmount ?? 0
              const net = win - bet
              const isBonus = b.isBonus
              const isHubPending = b.hubSettlement === 'pending'
              const rowCurrency = String(b.currencyCode || defaultCurrency || '').toUpperCase()
              const rowSuffix = rowCurrency ? ` ${rowCurrency}` : ''
              const shareRaw = b.shareIid || b.houseTopId || b.houseId || b.iid || null
              const shareId = formatStakeShareBetId(shareRaw)
              const canCopyShare = typeof shareId === 'string' && shareId.trim() !== ''
              const sharePreview =
                canCopyShare && shareId.length > 22 ? `${shareId.slice(0, 22)}…` : shareId || ''
              const showWin = !(isBonus && b.stoppedBonus)
              const multiplier = bet > 0 ? (win / bet).toFixed(2) : '0'
              const scatterCount =
                b.scatterCount != null && Number.isFinite(Number(b.scatterCount))
                  ? Number(b.scatterCount)
                  : null

              return (
                <tr
                  key={b.id ?? i}
                  className={clsx(isBonus && 'terminal-row--bonus', compact && 'terminal-tr--compact')}
                >
                  <td className="terminal-td terminal-td--num">{i + 1}</td>
                  {showSlot && (
                    <td className="terminal-td" title={b.slotName || b.slotSlug}>
                      {b.slotName || b.slotSlug || '–'}
                    </td>
                  )}
                  <td className="terminal-td">
                    {fmt(bet, rowCurrency)}
                    {rowSuffix}
                  </td>
                  <td
                    className={clsx(
                      'terminal-td',
                      !isHubPending && win > 0 && 'terminal-td--win',
                      isHubPending && 'terminal-td--pending'
                    )}
                  >
                    {!showWin
                      ? `Bonus${scatterCount != null ? ` (${scatterCount}S)` : ''}`
                      : isHubPending
                        ? '…'
                        : `${fmt(win, rowCurrency)}${rowSuffix}`}
                  </td>
                  {showNet && (
                    <td
                      className={clsx(
                        'terminal-td',
                        !isHubPending && net > 0 && 'terminal-td--win',
                        !isHubPending && net < 0 && 'terminal-td--loss',
                        !isHubPending && net === 0 && 'terminal-td--even',
                        isHubPending && 'terminal-td--pending'
                      )}
                    >
                      {!showWin ? '–' : isHubPending ? '…' : `${net >= 0 ? '+' : ''}${fmt(net, rowCurrency)}${rowSuffix}`}
                    </td>
                  )}
                  {showContext && (
                    <td className="terminal-td">
                      <span className="terminal-context">
                        {(() => {
                          const contextRaw = String(b.sourceTag || b.roundId || b.slotSlug || '—')
                          const contextMasked = /^house:/i.test(contextRaw) ? 'bet id' : contextRaw
                          return (
                            <span className="terminal-context-clip" title={contextMasked}>
                              {contextMasked}
                            </span>
                          )
                        })()}
                        {canCopyShare ? (
                          <button
                            type="button"
                            className="terminal-copy-btn"
                            title={shareId}
                            onClick={() => {
                              try {
                                navigator?.clipboard?.writeText(shareId).catch(() => {})
                              } catch (_) {}
                            }}
                          >
                            Copy
                          </button>
                        ) : null}
                      </span>
                    </td>
                  )}
                  {showCopyHouse && (
                    <td className="terminal-td">
                      {canCopyShare ? (
                        <span className="terminal-inline">
                          <span className="terminal-id-preview" title={shareId}>
                            {sharePreview}
                          </span>
                          <button
                            type="button"
                            className="terminal-copy-btn"
                            title={`Copy bet id (${shareId})`}
                            onClick={() => {
                              try {
                                navigator?.clipboard?.writeText(shareId).catch(() => {})
                              } catch (_) {}
                            }}
                          >
                            Copy
                          </button>
                        </span>
                      ) : (
                        <span className="terminal-id-preview">—</span>
                      )}
                    </td>
                  )}
                  <td
                    className={clsx('terminal-td', !isHubPending && win > 0 && 'terminal-td--win', isHubPending && 'terminal-td--pending')}
                    title={!isHubPending && showWin ? `${multiplier}× stake` : undefined}
                  >
                    {!showWin ? '–' : isHubPending ? '…' : `${multiplier}×`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
