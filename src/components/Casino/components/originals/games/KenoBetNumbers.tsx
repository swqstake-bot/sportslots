export function kenoHitNumbers(picks?: number[], drawn?: number[]): number[] {
  if (!picks?.length || !drawn?.length) return []
  const drawnSet = new Set(drawn)
  return [...picks].filter((n) => drawnSet.has(n)).sort((a, b) => a - b)
}

/** Hits first (left), then misses — each group ascending. */
function sortKenoNumbersHitsFirst(numbers: number[], hitSet: Set<number>): number[] {
  const hits = numbers.filter((n) => hitSet.has(n)).sort((a, b) => a - b)
  const misses = numbers.filter((n) => !hitSet.has(n)).sort((a, b) => a - b)
  return [...hits, ...misses]
}

export function formatKenoNumberList(nums?: number[], hitSet?: Set<number>): string {
  if (!nums?.length) return '—'
  const ordered = hitSet ? sortKenoNumbersHitsFirst(nums, hitSet) : [...nums].sort((a, b) => a - b)
  return ordered.join(', ')
}

interface KenoBetNumbersProps {
  picks?: number[]
  drawn?: number[]
  hits?: number
  /** picks | drawn | hits-only | full (last-result block) */
  mode: 'picks' | 'drawn' | 'hits' | 'full'
}

function KenoNumberChips({
  numbers,
  hitSet,
  variant,
}: {
  numbers: number[]
  hitSet: Set<number>
  variant: 'pick' | 'drawn'
}) {
  if (numbers.length === 0) return <span className="originals-keno-nums-empty">—</span>
  return (
    <span className="originals-keno-num-chips">
      {numbers.map((n) => (
        <span
          key={n}
          className={`originals-keno-num-chip originals-keno-num-chip--${variant}${
            hitSet.has(n) ? ' is-hit' : ''
          }`}
        >
          {n}
        </span>
      ))}
    </span>
  )
}

export default function KenoBetNumbers({ picks, drawn, hits, mode }: KenoBetNumbersProps) {
  const hitSet = new Set(kenoHitNumbers(picks, drawn))
  const sortedPicks = sortKenoNumbersHitsFirst(picks ?? [], hitSet)
  const sortedDrawn = sortKenoNumbersHitsFirst(drawn ?? [], hitSet)
  const hitCount = hits ?? hitSet.size

  if (mode === 'hits') {
    return <span className="originals-keno-hits">{hitCount > 0 ? `${hitCount} hits` : '0 hits'}</span>
  }

  if (mode === 'picks') {
    return <KenoNumberChips numbers={sortedPicks} hitSet={hitSet} variant="pick" />
  }

  if (mode === 'drawn') {
    return <KenoNumberChips numbers={sortedDrawn} hitSet={hitSet} variant="drawn" />
  }

  return (
    <div className="originals-keno-result-full">
      <div className="originals-keno-result-row">
        <span className="originals-keno-result-label">Picks</span>
        <KenoNumberChips numbers={sortedPicks} hitSet={hitSet} variant="pick" />
      </div>
      <div className="originals-keno-result-row">
        <span className="originals-keno-result-label">Drawn</span>
        <KenoNumberChips numbers={sortedDrawn} hitSet={hitSet} variant="drawn" />
      </div>
      <div className="originals-keno-result-row originals-keno-result-row--hits">
        <span className="originals-keno-result-label">Hits</span>
        <span className="originals-keno-hits">{hitCount}</span>
      </div>
    </div>
  )
}

export function formatKenoMultiLabel(multi: number, hits?: number): string {
  if (multi <= 0) return '—'
  if (hits != null && hits >= 0) return `${multi.toFixed(2)}× (${hits} hits)`
  return `${multi.toFixed(2)}×`
}
