import { useEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import { formatAmount } from '../utils/formatAmount'
import { pickBetHistoryShareRaw } from '../utils/stakeBetShareId'

function fmt(val, cc) {
  return formatAmount(val, cc)
}

function multiplierTone(multiplier) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return ''
  if (multiplier >= 500) return 'terminal-multi-pill--legend'
  if (multiplier >= 100) return 'terminal-multi-pill--jackpot'
  if (multiplier >= 50) return 'terminal-multi-pill--epic'
  if (multiplier >= 20) return 'terminal-multi-pill--great'
  if (multiplier >= 10) return 'terminal-multi-pill--good'
  if (multiplier >= 2) return 'terminal-multi-pill--nice'
  return ''
}

function shortenId(id, max = 18) {
  if (!id || typeof id !== 'string') return ''
  if (id.length <= max) return id
  return `${id.slice(0, Math.max(6, max - 1))}…`
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
  showBetId = false,
  maxRows = 0,
  title = 'Spins',
  emptyMessage,
  onOpenSlot = null,
}) {
  const scrollRef = useRef(null)
  const lastHeadKeyRef = useRef('')
  const showIdCol = !!(showBetId || showCopyHouse)

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

  // Stable head only — shareId/win patches must not reset scroll (list "jump").
  const headKey = displayBets[0]
    ? `${displayBets[0].id ?? ''}|${displayBets[0].addedAt ?? ''}`
    : ''

  useEffect(() => {
    if (!headKey || headKey === lastHeadKeyRef.current) return
    lastHeadKeyRef.current = headKey
    const el = scrollRef.current
    if (el) el.scrollTop = 0
  }, [headKey])

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
      <div className={scrollClass} ref={scrollRef}>
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
              {showIdCol && (
                <th className="terminal-th" style={{ minWidth: '7.5rem' }}>
                  Bet ID
                </th>
              )}
              <th className="terminal-th" style={{ minWidth: '8.5rem' }}>
                Win
              </th>
              {showNet && <th className="terminal-th">Net</th>}
              {showContext && (
                <th className="terminal-th" style={{ minWidth: '11rem' }}>
                  Context
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
              // Already a persistable house:/casino: share id (or null) — never RGS roundId.
              const shareId = pickBetHistoryShareRaw(b)
              const canCopyShare = typeof shareId === 'string' && shareId.trim() !== ''
              const sharePreview = canCopyShare ? shortenId(shareId, compact || minimal ? 14 : 18) : ''
              const showWin = !(isBonus && b.stoppedBonus)
              const multiplierNum = bet > 0 ? (win / bet) : 0
              const multiplier = Number.isFinite(multiplierNum) ? multiplierNum.toFixed(2) : '0.00'
              const multiplierToneClass = multiplierTone(multiplierNum)
              const scatterCount =
                b.scatterCount != null && Number.isFinite(Number(b.scatterCount))
                  ? Number(b.scatterCount)
                  : null
              const canOpenSlot = !showWin && typeof onOpenSlot === 'function' && typeof b.slotSlug === 'string' && b.slotSlug.length > 0

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
                  {showIdCol && (
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
                              void navigator?.clipboard?.writeText(shareId)
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
                    className={clsx(
                      'terminal-td',
                      !isHubPending && win > 0 && 'terminal-td--win',
                      isHubPending && 'terminal-td--pending'
                    )}
                  >
                    {!showWin ? (
                      <span className="terminal-inline">
                        <span>{`Bonus${scatterCount != null ? ` (${scatterCount}S)` : ''}`}</span>
                        {canOpenSlot ? (
                          <button
                            type="button"
                            className="terminal-copy-btn"
                            onClick={() => onOpenSlot(b)}
                            title={`Open ${b.slotName || b.slotSlug}`}
                          >
                            Open
                          </button>
                        ) : null}
                      </span>
                    ) : isHubPending ? '…' : `${fmt(win, rowCurrency)}${rowSuffix}`}
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
                              void navigator?.clipboard?.writeText(shareId)
                            }}
                          >
                            Copy
                          </button>
                        ) : null}
                      </span>
                    </td>
                  )}
                  <td className={clsx('terminal-td', isHubPending && 'terminal-td--pending')} title={!isHubPending && showWin ? `${multiplier}× stake` : undefined}>
                    {!showWin ? '–' : isHubPending ? '…' : (
                      <span className={clsx('terminal-multi-pill', multiplierToneClass)}>
                        {multiplier}×
                      </span>
                    )}
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
