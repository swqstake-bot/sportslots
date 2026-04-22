import { useMemo } from 'react'
import { formatAmount } from '../utils/formatAmount'
import { formatStakeShareBetId } from '../utils/stakeBetShareId'

const STYLES = {
  card: {
    marginTop: '1rem',
    padding: '1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  title: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  count: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  list: {
    maxHeight: 360,
    overflowY: 'auto',
    overflowX: 'auto',
    fontSize: '0.7rem',
    fontFamily: '"JetBrains Mono", monospace',
  },
  table: {
    width: 'max-content',
    minWidth: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    tableLayout: 'auto',
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    textAlign: 'left',
    padding: '0.24rem 0.3rem',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    fontSize: '0.64rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    fontWeight: 700,
  },
  td: {
    padding: '0.24rem 0.3rem',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowBonus: {
    background: 'rgba(255, 193, 7, 0.06)',
  },
  num: { color: 'var(--text-muted)', fontSize: '0.68rem' },
  win: { color: 'var(--success)', fontWeight: 500 },
  loss: { color: 'var(--error)', fontWeight: 500 },
  even: { color: 'var(--text-muted)', fontWeight: 500 },
  bonus: { color: 'var(--warning, #f59e0b)', fontSize: '0.7rem' },
  empty: {
    padding: '1.5rem',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
  },
  contextCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    minWidth: 0,
  },
  copyBtn: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '0.08rem 0.3rem',
    fontSize: '0.62rem',
    color: 'var(--accent)',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
  },
}

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
  const cardStyle = minimal ? { ...STYLES.card, marginTop: '0.14rem', padding: '0.18rem' } : (compact ? { ...STYLES.card, marginTop: '0.28rem', padding: '0.3rem' } : STYLES.card)
  const listStyle = minimal ? { ...STYLES.list, maxHeight: 52, fontSize: '0.5rem', lineHeight: 1.15 } : (compact ? { ...STYLES.list, maxHeight: 85, fontSize: '0.58rem', lineHeight: 1.2 } : STYLES.list)
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

  if (!displayBets.length) {
    const msg = emptyMessage ?? 'Noch keine Spins in dieser Session.'
    return (
      <div style={cardStyle}>
        <div style={{ ...STYLES.title, fontSize: compact ? '0.7rem' : '0.8rem' }}>{title}</div>
        <div style={{ ...STYLES.empty, padding: minimal ? '0.18rem' : (compact ? '0.3rem' : '1.5rem'), fontSize: minimal ? '0.5rem' : (compact ? '0.62rem' : '0.85rem') }}>{msg}</div>
      </div>
    )
  }

  const defaultCurrency = (currencyCode || '').toUpperCase()

  return (
    <div style={cardStyle}>
      <div style={STYLES.header}>
        <span style={{ ...STYLES.title, fontSize: minimal ? '0.5rem' : (compact ? '0.58rem' : '0.8rem') }}>{title}</span>
        <span style={{ ...STYLES.count, fontSize: minimal ? '0.48rem' : (compact ? '0.55rem' : '0.75rem') }}>{totalCount != null ? totalCount : bets.length} Einträge</span>
      </div>
      <div style={listStyle}>
        {(() => {
          return (
            <table style={STYLES.table}>
              <thead>
                <tr>
                  <th style={{ ...STYLES.th, width: '2.2rem' }}>#</th>
                  {showSlot && <th style={{ ...STYLES.th, minWidth: '14rem' }}>Slot</th>}
                  <th style={{ ...STYLES.th, minWidth: '8.5rem' }}>Stake</th>
                  <th style={{ ...STYLES.th, minWidth: '8.5rem' }}>Win</th>
                  {showNet && <th style={STYLES.th}>Net</th>}
                  {showContext && <th style={{ ...STYLES.th, minWidth: '11rem' }}>Context</th>}
                  {showCopyHouse && <th style={{ ...STYLES.th, minWidth: '4.3rem' }}>ID</th>}
                  <th style={{ ...STYLES.th, width: '3.1rem' }}>X</th>
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
          // House copy only from real houseBets IDs (iid/top-id), never from roundId/sourceTag.
          const shareRaw = b.shareIid || b.houseTopId || b.houseId || b.iid || null
          const shareId = formatStakeShareBetId(shareRaw)
          const canCopyShare = typeof shareId === 'string' && shareId.trim() !== ''
          const sharePreview =
            canCopyShare && shareId.length > 22 ? `${shareId.slice(0, 22)}…` : (shareId || '')
          // Bei Stopp auf Bonus: Platzhalter "Bonus". Sonst Win anzeigen (auch bei durchgespieltem Bonus)
          const showWin = !(isBonus && b.stoppedBonus)
          const multiplier = bet > 0 ? (win / bet).toFixed(2) : '0'
          const pendingCellStyle = isHubPending ? { color: 'var(--text-muted)', fontStyle: 'italic' } : {}
          return (
            <tr
              key={b.id ?? i}
              style={{
                fontSize: compact ? '0.68rem' : undefined,
                ...(isBonus ? STYLES.rowBonus : {}),
              }}
            >
              <td style={{ ...STYLES.td, ...STYLES.num }}>{i + 1}</td>
              {showSlot && (
                <td style={STYLES.td} title={b.slotName || b.slotSlug}>
                  {b.slotName || b.slotSlug || '–'}
                </td>
              )}
              <td style={STYLES.td}>{fmt(bet, rowCurrency)}{rowSuffix}</td>
              <td style={{ ...STYLES.td, ...(win > 0 && !isHubPending ? STYLES.win : {}), ...pendingCellStyle }}>
                {!showWin ? ' Bonus' : isHubPending ? '…' : `${fmt(win, rowCurrency)}${rowSuffix}`}
              </td>
              {showNet && (
                <td
                  style={{
                    ...STYLES.td,
                    ...(net > 0 && !isHubPending ? STYLES.win : net < 0 && !isHubPending ? STYLES.loss : STYLES.even),
                    ...pendingCellStyle,
                  }}
                >
                  {!showWin ? '–' : isHubPending ? '…' : `${net >= 0 ? '+' : ''}${fmt(net, rowCurrency)}${rowSuffix}`}
                </td>
              )}
              {showContext && (
                <td style={STYLES.td}>
                  <span style={STYLES.contextCell}>
                  {(() => {
                    const contextRaw = String(b.sourceTag || b.roundId || b.slotSlug || '—')
                    const contextMasked = /^house:/i.test(contextRaw) ? 'bet id' : contextRaw
                    return (
                      <span
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}
                        title={contextMasked}
                      >
                        {contextMasked}
                      </span>
                    )
                  })()}
                  {canCopyShare ? (
                    <button
                      type="button"
                      style={STYLES.copyBtn}
                      title={shareId}
                      onClick={() => {
                        try {
                          navigator?.clipboard?.writeText(shareId).catch(() => {})
                        } catch (_) {
                          // ignore clipboard failures in compact list
                        }
                      }}
                    >
                      Copy
                    </button>
                  ) : null}
                </span>
                </td>
              )}
              {showCopyHouse && (
                <td style={STYLES.td}>
                  {canCopyShare ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }} title={shareId}>
                        {sharePreview}
                      </span>
                      <button
                        type="button"
                        style={STYLES.copyBtn}
                        title={`Copy bet id (${shareId})`}
                        onClick={() => {
                          try {
                            navigator?.clipboard?.writeText(shareId).catch(() => {})
                          } catch (_) {
                            // ignore clipboard failures in compact list
                          }
                        }}
                      >
                        Copy
                      </button>
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>—</span>}
                </td>
              )}
              <td
                style={{ ...STYLES.td, ...(win > 0 && !isHubPending ? STYLES.win : {}), ...pendingCellStyle }}
                title={!isHubPending && showWin ? `${multiplier}× Stake` : undefined}
              >
                {!showWin ? '–' : isHubPending ? '…' : `${multiplier}×`}
              </td>
            </tr>
          )
        })}
              </tbody>
            </table>
          )
        })()}
      </div>
    </div>
  )
}
