const KENO_MAX = 40
const KENO_PICK_MAX = 10

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
  const set = new Set(selected)

  const toggle = (n: number) => {
    if (readOnly) return
    if (set.has(n)) {
      onChange(selected.filter((x) => x !== n))
      return
    }
    if (selected.length >= KENO_PICK_MAX) return
    onChange([...selected, n].sort((a, b) => a - b))
  }

  const pickRandom = (count: number) => {
    if (readOnly) return
    onChange(shuffle(Array.from({ length: KENO_MAX }, (_, i) => i + 1)).slice(0, count).sort((a, b) => a - b))
  }

  return (
    <div className="originals-keno-picker">
      <div className="originals-keno-picker-toolbar">
        <span className="originals-keno-picker-count">
          {selected.length} / {KENO_PICK_MAX} numbers
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
        {Array.from({ length: KENO_MAX }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly || (!set.has(n) && selected.length >= KENO_PICK_MAX)}
            className={`originals-keno-cell${set.has(n) ? ' is-selected' : ''}`}
            onClick={() => toggle(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="originals-empty-hint">No numbers selected — session uses random 8 picks.</p>
      )}
    </div>
  )
}
