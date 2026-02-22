import { formatAmount } from '../utils/formatAmount'

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
    overflow: 'auto',
    fontSize: '0.7rem',
    fontFamily: '"JetBrains Mono", monospace',
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '2rem 1fr 1fr 1fr 2rem',
    gap: '0.35rem',
    padding: '0.2rem 0',
    borderBottom: '1px solid var(--border)',
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '2rem 1fr 1fr 1fr 2rem',
    gap: '0.35rem',
    padding: '0.2rem 0',
    borderBottom: '1px solid var(--border)',
    alignItems: 'center',
  },
  rowBonus: {
    background: 'rgba(255, 193, 7, 0.06)',
  },
  num: { color: 'var(--text-muted)', fontSize: '0.68rem' },
  win: { color: 'var(--success)', fontWeight: 500 },
  loss: { color: 'var(--error)', fontWeight: 500 },
  bonus: { color: 'var(--warning, #f59e0b)', fontSize: '0.7rem' },
  empty: {
    padding: '1.5rem',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
  },
}

function fmt(val, cc) {
  return formatAmount(val, cc)
}

export default function BetList({ bets, currencyCode, compact = false, minimal = false, showSlot = false, emptyMessage }) {
  const cardStyle = minimal ? { ...STYLES.card, marginTop: '0.14rem', padding: '0.18rem' } : (compact ? { ...STYLES.card, marginTop: '0.28rem', padding: '0.3rem' } : STYLES.card)
  const listStyle = minimal ? { ...STYLES.list, maxHeight: 52, fontSize: '0.5rem', lineHeight: 1.15 } : (compact ? { ...STYLES.list, maxHeight: 85, fontSize: '0.58rem', lineHeight: 1.2 } : STYLES.list)
  const gridCols = showSlot ? '2rem 1.2fr 1fr 1fr 1fr 2rem' : '2rem 1fr 1fr 1fr 2rem'
  const headerRowStyle = { ...STYLES.headerRow, gridTemplateColumns: gridCols }
  const rowStyle = { ...STYLES.row, gridTemplateColumns: gridCols }

  if (!bets?.length) {
    const msg = emptyMessage ?? 'Noch keine Spins in dieser Session.'
    return (
      <div style={cardStyle}>
        <div style={{ ...STYLES.title, fontSize: compact ? '0.7rem' : '0.8rem' }}>Spins</div>
        <div style={{ ...STYLES.empty, padding: minimal ? '0.18rem' : (compact ? '0.3rem' : '1.5rem'), fontSize: minimal ? '0.5rem' : (compact ? '0.62rem' : '0.85rem') }}>{msg}</div>
      </div>
    )
  }

  const cc = (currencyCode || '').toUpperCase()
  const suffix = cc ? ` ${cc}` : ''

  return (
    <div style={cardStyle}>
      <div style={STYLES.header}>
        <span style={{ ...STYLES.title, fontSize: minimal ? '0.5rem' : (compact ? '0.58rem' : '0.8rem') }}>Spins</span>
        <span style={{ ...STYLES.count, fontSize: minimal ? '0.48rem' : (compact ? '0.55rem' : '0.75rem') }}>{bets.length} Einträge</span>
      </div>
      <div style={listStyle}>
        <div style={headerRowStyle}>
          <span>#</span>
          {showSlot && <span>Slot</span>}
          <span>Einsatz</span>
          <span>Gewinn</span>
          <span>Netto</span>
          <span>X</span>
        </div>
        {[...bets].reverse().map((b, i) => {
          const bet = b.betAmount ?? 0
          const win = b.winAmount ?? 0
          const net = win - bet
          const isBonus = b.isBonus
          const multiplier = bet > 0 ? (win / bet).toFixed(1) : '0'
          return (
            <div
              key={b.id ?? i}
              style={{
                ...rowStyle,
                ...(isBonus ? STYLES.rowBonus : {}),
              }}
            >
              <span style={STYLES.num}>{bets.length - i}</span>
              {showSlot && (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.slotName || b.slotSlug}>
                  {b.slotName || b.slotSlug || '–'}
                </span>
              )}
              <span>{fmt(bet, cc)}{suffix}</span>
              <span style={win > 0 ? STYLES.win : {}}>
                {isBonus ? ' Bonus' : `${fmt(win, cc)}${suffix}`}
              </span>
              <span style={net >= 0 ? STYLES.win : STYLES.loss}>
                {isBonus ? '–' : `${net >= 0 ? '+' : ''}${fmt(net, cc)}${suffix}`}
              </span>
              <span style={win > 0 ? STYLES.win : {}} title={`${multiplier}× Einsatz`}>
                {isBonus ? '–' : `${multiplier}×`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
