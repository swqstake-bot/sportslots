import HiloCardDisplay from '../games/HiloCardDisplay'
import KenoBetNumbers from '../games/KenoBetNumbers'
import MinesGridMini from '../games/MinesGridMini'
import { formatHiloCardChain } from '../games/originalsBetDisplay'

export interface OriginalsLastBetVisual {
  game: string
  win: boolean
  multi: number
  roundProfitUsd: number
  betSizeUsd?: number
  resultLabel?: string
  diceTarget?: number
  diceResult?: number
  limboTarget?: number
  limboResult?: number
  minesCount?: number
  diamondsCount?: number
  minesSelected?: number[]
  minesLocations?: number[]
  hiloRank?: string
  hiloSuit?: string
  hiloCards?: string
  kenoPicks?: number[]
  kenoDrawn?: number[]
  kenoHits?: number
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

function formatDiceLimboNum(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

function resultHeadline(result: OriginalsLastBetVisual, gameSlug: string): string {
  const g = gameSlug.toLowerCase()
  if (g === 'keno') return result.win ? 'Win' : 'Loss'
  if (g === 'dice' && result.diceResult != null) return formatDiceLimboNum(result.diceResult)
  if (g === 'limbo' && result.limboResult != null) return formatDiceLimboNum(result.limboResult)
  if (result.resultLabel) return result.resultLabel
  if (result.multi > 0) return `${result.multi.toFixed(2)}×`
  return result.win ? 'Win' : 'Loss'
}

function resultSubline(result: OriginalsLastBetVisual, gameSlug: string): string | null {
  const g = gameSlug.toLowerCase()
  if (g === 'keno') return null
  if (g === 'dice' && result.diceTarget != null) {
    return `Target ${formatDiceLimboNum(result.diceTarget)}`
  }
  if (g === 'limbo' && result.limboTarget != null) {
    return `Target ${formatDiceLimboNum(result.limboTarget)}×`
  }
  if (g === 'mines' && result.minesCount != null) {
    const diamonds = result.diamondsCount ?? result.minesSelected?.length ?? 0
    return `${result.minesCount} mines · ${diamonds} diamonds`
  }
  if (g === 'hilo' && result.hiloCards) {
    return formatHiloCardChain(result.hiloCards, 6)
  }
  if (result.multi > 0) return `${result.multi.toFixed(2)}× payout`
  return null
}

export function betRowToVisual(row: {
  game: string
  win: boolean
  multi: number
  roundProfitUsd: number
  betSizeUsd: number
  diceTarget?: number
  diceResult?: number
  limboTarget?: number
  limboResult?: number
  minesCount?: number
  diamondsCount?: number
  minesSelected?: number[]
  minesLocations?: number[]
  hiloRank?: string
  hiloSuit?: string
  hiloCards?: string
  kenoPicks?: number[]
  kenoDrawn?: number[]
  kenoHits?: number
}): OriginalsLastBetVisual {
  const g = row.game.toLowerCase()
  return {
    game: row.game,
    win: row.win,
    multi: row.multi,
    roundProfitUsd: row.roundProfitUsd,
    betSizeUsd: row.betSizeUsd,
    diceTarget: row.diceTarget,
    diceResult: row.diceResult,
    limboTarget: row.limboTarget,
    limboResult: row.limboResult,
    minesCount: row.minesCount,
    diamondsCount: row.diamondsCount,
    minesSelected: row.minesSelected,
    minesLocations: row.minesLocations,
    hiloRank: row.hiloRank,
    hiloSuit: row.hiloSuit,
    hiloCards: row.hiloCards,
    kenoPicks: row.kenoPicks,
    kenoDrawn: row.kenoDrawn,
    kenoHits: row.kenoHits,
    resultLabel:
      g !== 'keno' && g !== 'dice' && g !== 'limbo' && row.multi > 0
        ? `${row.multi.toFixed(2)}×`
        : undefined,
  }
}

export default function OriginalsLastResultVisual({ result, gameSlug, idleHint }: OriginalsLastResultVisualProps) {
  const g = gameSlug.toLowerCase()

  if (!result) {
    return (
      <div className="originals-last-result originals-last-result--idle casino-card">
        <p className="originals-last-result-idle">
          {idleHint ?? 'Last bet result will appear here after you place a bet.'}
        </p>
      </div>
    )
  }

  const showHiloCard = g === 'hilo' && (result.hiloRank || result.hiloSuit)
  const showMinesGrid =
    g === 'mines' &&
    ((result.minesSelected?.length ?? 0) > 0 || (result.minesLocations?.length ?? 0) > 0)
  const showKenoResult =
    g === 'keno' &&
    ((result.kenoPicks?.length ?? 0) > 0 ||
      (result.kenoDrawn?.length ?? 0) > 0 ||
      result.kenoHits != null)

  const headline = resultHeadline(result, gameSlug)
  const subline = resultSubline(result, gameSlug)
  const isDiceLimbo = g === 'dice' || g === 'limbo'

  return (
    <div
      className={`originals-last-result casino-card originals-last-result--${result.win ? 'win' : 'loss'}`}
      role="status"
      aria-live="polite"
    >
      <div className="originals-last-result-main">
        {showHiloCard ? (
          <HiloCardDisplay rank={result.hiloRank} suit={result.hiloSuit} size="lg" />
        ) : showKenoResult ? null : (
          <div
            className={`originals-last-result-value${isDiceLimbo ? ' originals-last-result-value--game-num' : ''}`}
          >
            {headline}
          </div>
        )}
        <span className={`originals-last-result-badge originals-last-result-badge--${result.win ? 'win' : 'loss'}`}>
          {result.win ? 'Win' : 'Loss'}
        </span>
      </div>

      <div className="originals-last-result-meta">
        {subline && !showKenoResult && (
          <span
            className={`originals-last-result-sub${g === 'hilo' ? ' originals-last-result-sub--hilo-chain' : ''}`}
          >
            {subline}
          </span>
        )}
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
        {result.multi > 0 && (showHiloCard || g === 'mines') && (
          <span className="originals-last-result-stat">
            <strong>{result.multi.toFixed(2)}×</strong>
          </span>
        )}
      </div>

      {showMinesGrid && (
        <MinesGridMini
          selected={result.minesSelected}
          mines={result.minesLocations}
          win={result.win}
        />
      )}

      {showKenoResult && (
        <KenoBetNumbers
          picks={result.kenoPicks}
          drawn={result.kenoDrawn}
          hits={result.kenoHits}
          mode="full"
        />
      )}
    </div>
  )
}
