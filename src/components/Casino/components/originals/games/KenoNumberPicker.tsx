import { KENO_BOARD_MAX, KENO_PICK_MAX, kenoBoardPool, normalizeKenoPicks } from '../keno/kenoNumbers'

interface KenoNumberPickerProps {
  selected: number[]
  onChange: (nums: number[]) => void
  readOnly?: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export default function KenoNumberPicker({ selected, onChange, readOnly }: KenoNumberPickerProps) {
  const cleaned = normalizeKenoPicks(selected)
  const set = new Set(cleaned)

  const toggle = (n: number) => {
    if (readOnly) return
    if (set.has(n)) {
      onChange(cleaned.filter((x) => x !== n))
      return
    }
    if (cleaned.length >= KENO_PICK_MAX) return
    onChange(normalizeKenoPicks([...cleaned, n]))
  }

  const pickRandom = (count: number) => {
    if (readOnly) return
    onChange(normalizeKenoPicks(shuffle(kenoBoardPool(KENO_BOARD_MAX)).slice(0, count)))
  }

  return (
    <div className="originals-keno-picker">
      <div className="originals-keno-picker-toolbar">
        <span className="originals-keno-picker-count">
          {cleaned.length} / {KENO_PICK_MAX} numbers
        </span>
        <div className="originals-keno-picker-actions">
          <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={() => onChange([])}>
            Clear
          </button>
          <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={() => pickRandom(8)}>
            Random 8
          </button>
          <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={() => pickRandom(10)}>
            Random 10
          </button>
        </div>
      </div>
      <div className="originals-keno-grid">
        {kenoBoardPool(KENO_BOARD_MAX).map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly || (!set.has(n) && cleaned.length >= KENO_PICK_MAX)}
            className={`originals-keno-cell${set.has(n) ? ' is-selected' : ''}`}
            onClick={() => toggle(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {cleaned.length === 0 && (
        <p className="originals-empty-hint">No numbers selected — session uses random 8 picks (1–40).</p>
      )}
    </div>
  )
}
