import type { ReactNode } from 'react'

import type { OriginalsBetRow } from '../hooks/useOriginalsSession'
import { formatHiloCardCode, type OriginalsBetApiState } from '../engine/originalsRoundResult'
import { formatKenoMultiLabel } from './KenoBetNumbers'

export function formatHiloCardChain(cards?: string, maxVisible = 5): string {
  if (!cards?.trim()) return '—'
  const parts = cards.split(' -> ').map((s) => s.trim()).filter(Boolean)
  if (parts.length <= maxVisible) return parts.join(' -> ')
  return ['...', ...parts.slice(-(maxVisible - 1))].join(' -> ')
}

export function formatHiloCardChainFromState(state?: OriginalsBetApiState): string | undefined {
  if (!state?.startCard?.rank) return undefined
  const cards = [formatHiloCardCode(state.startCard)]
  if (Array.isArray(state.rounds)) {
    for (const round of state.rounds) {
      if (round && 'card' in round && round.card) {
        const code = formatHiloCardCode(round.card)
        if (code) cards.push(code)
      }
    }
  }
  return cards.length > 0 ? cards.join(' -> ') : undefined
}

export function formatGameMultiCell(row: OriginalsBetRow, gameSlug?: string): string | ReactNode {
  const g = (gameSlug ?? row.game).toLowerCase()
  const multi = row.multi

  if (g === 'keno' && row.kenoHits != null && multi > 0) {
    return formatKenoMultiLabel(multi, row.kenoHits)
  }

  if (g === 'dice' && (row.diceTarget != null || row.diceResult != null)) {
    const target = row.diceTarget != null ? row.diceTarget.toFixed(2) : '?'
    const result = row.diceResult != null ? row.diceResult.toFixed(2) : '?'
    const payout = multi > 0 ? multi.toFixed(2) : '0.00'
    return `${payout} (Target: ${target}) (Result: ${result})`
  }

  if (g === 'limbo' && (row.limboTarget != null || row.limboResult != null)) {
    const target = row.limboTarget != null ? row.limboTarget.toFixed(2) : '?'
    const result = row.limboResult != null ? row.limboResult.toFixed(2) : '?'
    const payout = multi > 0 ? multi.toFixed(2) : '0.00'
    return `${payout} (Target: ${target}) (Result: ${result})`
  }

  if (g === 'mines' && row.minesCount != null) {
    const diamonds = row.diamondsCount ?? row.minesSelected?.length ?? 0
    const payout = multi > 0 ? multi.toFixed(2) : '0.00'
    return `${payout} (${row.minesCount} mines / ${diamonds} diamonds)`
  }

  if (g === 'hilo' && row.hiloCards) {
    const value = multi > 0 ? multi.toFixed(2) : '0.00'
    return (
      <span className="originals-hilo-multi-cell">
        <span className="originals-hilo-multi-value">{value}</span>
        <span className="originals-hilo-multi-chain" title={row.hiloCards}>
          {formatHiloCardChain(row.hiloCards)}
        </span>
      </span>
    )
  }

  if (multi <= 0) return '—'
  return `${multi.toFixed(2)}×`
}
