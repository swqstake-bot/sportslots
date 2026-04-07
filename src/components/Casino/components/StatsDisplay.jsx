import { useMemo } from 'react'
import { formatAmount } from '../utils/formatAmount'

const STYLES = {
  card: {
    marginTop: '0.35rem',
    padding: '0.5rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  title: {
    fontSize: '0.75rem',
    fontWeight: 600,
    marginBottom: '0.4rem',
    color: 'var(--text-muted)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.3rem 1rem',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  label: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  value: {
    fontSize: '1rem',
    fontWeight: 600,
    fontFamily: '"JetBrains Mono", monospace',
  },
  valuePositive: { color: 'var(--success)' },
  valueNegative: { color: 'var(--error)' },
  empty: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: '1rem',
  },
}

/** Session-Geldbeträge aus SlotControl stats sind USD-Cent (toUsdCents), nicht Slot-Zielwährung. */
function formatUsdCentsLine(value) {
  if (value == null || !Number.isFinite(Number(value))) return '–'
  return `${formatAmount(Number(value), 'usd')} USD`
}

export default function StatsDisplay({ stats, currencyCode, compact = false, minimal = false }) {
  const displayStats = useMemo(() => {
    if (!stats || stats.spins === 0) return null
    return {
      spins: stats.spins,
      totalWagered: stats.totalWagered,
      totalWon: stats.totalWon,
      netResult: stats.totalWon - stats.totalWagered,
      winCount: stats.winCount,
      lossCount: stats.lossCount,
      breakEvenCount: stats.breakEvenCount ?? 0,
      fxMissingCount: stats.fxMissingCount ?? 0,
      biggestWin: stats.biggestWin,
      biggestMultiplier: stats.biggestMultiplier,
      multiOver100xCount: stats.multiOver100xCount,
      multiOver100xSum: stats.multiOver100xSum,
      currentBalance: stats.currentBalance,
      sessionStartBalance: stats.sessionStartBalance,
    }
  }, [stats])

  const cardStyle = minimal ? { ...STYLES.card, marginTop: '0.14rem', padding: '0.18rem' } : (compact ? { ...STYLES.card, marginTop: '0.28rem', padding: '0.3rem' } : STYLES.card)
  const titleStyle = minimal ? { ...STYLES.title, marginBottom: '0.1rem', fontSize: '0.5rem' } : (compact ? { ...STYLES.title, marginBottom: '0.2rem', fontSize: '0.62rem' } : STYLES.title)
  const valueStyle = minimal ? { ...STYLES.value, fontSize: '0.58rem' } : (compact ? { ...STYLES.value, fontSize: '0.72rem' } : STYLES.value)

  if (!displayStats || displayStats.spins === 0) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Statistik</div>
        <div style={{ ...STYLES.empty, padding: minimal ? '0.18rem' : (compact ? '0.3rem' : '1rem'), fontSize: minimal ? '0.52rem' : (compact ? '0.65rem' : '0.85rem') }}>Noch keine Spins in dieser Session.</div>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>Statistik</div>
      <div style={{ fontSize: minimal ? '0.5rem' : (compact ? '0.58rem' : '0.65rem'), color: 'var(--text-muted)', marginBottom: compact ? '0.2rem' : '0.35rem' }}>
        Einsatz/Gewinn/Netto/Kontostand: Näherung in USD (intern USD-Cent)
        {currencyCode ? ` · Spiel: ${String(currencyCode).toUpperCase()}` : ''}
      </div>
      <div style={{ ...STYLES.grid, gap: minimal ? '0.12rem 0.4rem' : (compact ? '0.2rem 0.6rem' : '0.5rem 1.5rem') }}>
        <div style={STYLES.item}>
          <span style={STYLES.label}>Spins</span>
          <span style={valueStyle}>{displayStats.spins}</span>
        </div>
        <div style={STYLES.item}>
          <span style={STYLES.label}>Gesamteinsatz</span>
          <span style={valueStyle}>{formatUsdCentsLine(displayStats.totalWagered)}</span>
        </div>
        <div style={STYLES.item}>
          <span style={STYLES.label}>Gewinne gesamt</span>
          <span style={valueStyle}>{formatUsdCentsLine(displayStats.totalWon)}</span>
        </div>
        <div style={STYLES.item}>
          <span style={STYLES.label}>Netto</span>
          <span
            style={{
              ...valueStyle,
              ...(displayStats.netResult >= 0 ? STYLES.valuePositive : STYLES.valueNegative),
            }}
          >
            {displayStats.netResult >= 0 ? '+' : ''}{formatUsdCentsLine(displayStats.netResult)}
          </span>
        </div>
        <div style={STYLES.item}>
          <span style={STYLES.label}>Gewinne / Verluste / Even</span>
          <span style={valueStyle}>
            {displayStats.winCount} / {displayStats.lossCount} / {displayStats.breakEvenCount}
          </span>
        </div>
        {(displayStats.fxMissingCount > 0) && (
        <div style={STYLES.item}>
          <span style={STYLES.label}>FX nicht bewertet</span>
          <span style={valueStyle}>{displayStats.fxMissingCount} Spin(s)</span>
        </div>
        )}
        <div style={STYLES.item}>
          <span style={STYLES.label}>Größter Gewinn</span>
          <span style={{ ...valueStyle, ...STYLES.valuePositive }}>
            {formatUsdCentsLine(displayStats.biggestWin)}
          </span>
        </div>
        {(displayStats.biggestMultiplier > 0) && (
        <div style={STYLES.item}>
          <span style={STYLES.label}>Höchster Multi</span>
          <span style={{ ...valueStyle, ...STYLES.valuePositive }}>
            {displayStats.biggestMultiplier.toFixed(1)}×
          </span>
        </div>
        )}
        <div style={STYLES.item}>
          <span style={STYLES.label}>Kontostand</span>
          <span style={valueStyle}>{formatUsdCentsLine(displayStats.currentBalance)}</span>
        </div>
        {(displayStats.multiOver100xCount > 0 || displayStats.multiOver100xSum > 0) && (
        <div style={STYLES.item}>
          <span style={STYLES.label}>≥100× Count / Sum</span>
          <span style={{ ...valueStyle, ...STYLES.valuePositive }}>
            {displayStats.multiOver100xCount} / {displayStats.multiOver100xSum.toFixed(1)}×
          </span>
        </div>
        )}
        {(displayStats.sessionStartBalance != null && displayStats.currentBalance != null) && (
        <div style={STYLES.item}>
          <span style={STYLES.label}>Session Δ Balance</span>
          <span
            style={{
              ...valueStyle,
              ...((displayStats.currentBalance - displayStats.sessionStartBalance) >= 0 ? STYLES.valuePositive : STYLES.valueNegative),
            }}
          >
            {formatUsdCentsLine(displayStats.currentBalance - displayStats.sessionStartBalance)}
          </span>
        </div>
        )}
      </div>
    </div>
  )
}
