import HiloCardDisplay from '../games/HiloCardDisplay'

export interface OriginalsLastBetVisual {
  game: string
  win: boolean
  multi: number
  roundProfitUsd: number
  betSizeUsd?: number
  /** Dice roll / limbo crash / generic result label */
  resultLabel?: string
  hiloRank?: string
  hiloSuit?: string
}

interface OriginalsLastResultVisualProps {
  result: OriginalsLastBetVisual | null
  gameSlug: string
  idleHint?: string
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n !== 0 && Math.abs(n) < 0.1) return n.toFixed(4)
  return n.toFixed(2)
}

function resultHeadline(result: OriginalsLastBetVisual, gameSlug: string): string {
  if (result.resultLabel) return result.resultLabel
  const g = gameSlug.toLowerCase()
  if (result.multi > 0) return `${result.multi.toFixed(2)}×`
  if (g === 'dice' || g === 'limbo') return '—'
  return result.win ? 'Win' : 'Loss'
}

function resultSubline(result: OriginalsLastBetVisual, gameSlug: string): string | null {
  const g = gameSlug.toLowerCase()
  if (g === 'dice' && result.multi > 0) return `Multiplier ${result.multi.toFixed(2)}×`
  if (g === 'limbo' && result.multi > 0) return `Crashed at ${result.multi.toFixed(2)}×`
  if (result.multi > 0) return `${result.multi.toFixed(2)}× payout`
  return null
}

export function betRowToVisual(row: {
  game: string
  win: boolean
  multi: number
  roundProfitUsd: number
  betSizeUsd: number
}): OriginalsLastBetVisual {
  return {
    game: row.game,
    win: row.win,
    multi: row.multi,
    roundProfitUsd: row.roundProfitUsd,
    betSizeUsd: row.betSizeUsd,
    resultLabel: row.multi > 0 ? `${row.multi.toFixed(2)}×` : undefined,
  }
}

export default function OriginalsLastResultVisual({ result, gameSlug, idleHint }: OriginalsLastResultVisualProps) {
  const g = gameSlug.toLowerCase()
  const showHiloCard = g === 'hilo' && result && (result.hiloRank || result.hiloSuit)

  if (!result) {
    return (
      <div className="originals-last-result originals-last-result--idle casino-card">
        <p className="originals-last-result-idle">
          {idleHint ?? 'Last bet result will appear here after you place a bet.'}
        </p>
      </div>
    )
  }

  const headline = resultHeadline(result, gameSlug)
  const subline = resultSubline(result, gameSlug)

  return (
    <div
      className={`originals-last-result casino-card originals-last-result--${result.win ? 'win' : 'loss'}`}
      role="status"
      aria-live="polite"
    >
      <div className="originals-last-result-main">
        {showHiloCard ? (
          <HiloCardDisplay rank={result.hiloRank} suit={result.hiloSuit} size="lg" />
        ) : (
          <div className="originals-last-result-value">{headline}</div>
        )}
        <span className={`originals-last-result-badge originals-last-result-badge--${result.win ? 'win' : 'loss'}`}>
          {result.win ? 'Win' : 'Loss'}
        </span>
      </div>

      <div className="originals-last-result-meta">
        {subline && !showHiloCard && <span className="originals-last-result-sub">{subline}</span>}
        {result.betSizeUsd != null && result.betSizeUsd > 0 && (
          <span className="originals-last-result-stat">
            Bet <strong>${formatUsd(result.betSizeUsd)}</strong>
          </span>
        )}
        <span
          className={`originals-last-result-stat${result.roundProfitUsd >= 0 ? ' originals-profit' : ' originals-loss'}`}
        >
          {result.roundProfitUsd >= 0 ? '+' : ''}${formatUsd(result.roundProfitUsd)}
        </span>
        {result.multi > 0 && showHiloCard && (
          <span className="originals-last-result-stat">
            <strong>{result.multi.toFixed(2)}×</strong>
          </span>
        )}
      </div>
    </div>
  )
}
