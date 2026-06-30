const SUITS: Record<string, { sym: string; red: boolean }> = {
  C: { sym: '♣', red: false },
  D: { sym: '♦', red: true },
  H: { sym: '♥', red: true },
  S: { sym: '♠', red: false },
}

interface HiloCardDisplayProps {
  rank?: string
  suit?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function formatHiloSuit(suit?: string): string {
  const key = (suit ?? '').toUpperCase().slice(0, 1)
  return SUITS[key]?.sym ?? '?'
}

export function isHiloSuitRed(suit?: string): boolean {
  const key = (suit ?? '').toUpperCase().slice(0, 1)
  return SUITS[key]?.red ?? false
}

export default function HiloCardDisplay({ rank, suit, size = 'md', className = '' }: HiloCardDisplayProps) {
  const key = (suit ?? '').toUpperCase().slice(0, 1)
  const suitMeta = SUITS[key]
  const sizeClass = size === 'lg' ? ' originals-hilo-card--lg' : size === 'sm' ? ' originals-hilo-card--sm' : ''

  return (
    <div className={`originals-hilo-card${sizeClass}${className ? ` ${className}` : ''}`}>
      <span className="originals-hilo-card-rank">{rank?.trim() || '?'}</span>
      <span
        className={`originals-hilo-card-suit${suitMeta?.red ? ' originals-hilo-card-suit--red' : ''}`}
        aria-hidden
      >
        {suitMeta?.sym ?? '?'}
      </span>
    </div>
  )
}
