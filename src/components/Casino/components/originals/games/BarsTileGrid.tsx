const TOTAL = 30

const MAX_PICKS = 5



interface BarsTileGridProps {

  selected: number[]

  readOnly?: boolean

  onChange: (tiles: number[]) => void

}



export default function BarsTileGrid({ selected, readOnly, onChange }: BarsTileGridProps) {

  const set = new Set(selected)



  const toggle = (idx: number) => {

    if (readOnly) return

    if (set.has(idx)) {

      onChange(selected.filter((t) => t !== idx))

      return

    }

    if (selected.length >= MAX_PICKS) return

    onChange([...selected, idx].sort((a, b) => a - b))

  }



  const pickRandom = (count: number) => {

    if (readOnly) return

    const pool = Array.from({ length: TOTAL }, (_, i) => i)

    for (let i = pool.length - 1; i > 0; i--) {

      const j = Math.floor(Math.random() * (i + 1))

      ;[pool[i], pool[j]] = [pool[j], pool[i]]

    }

    onChange(pool.slice(0, Math.min(count, MAX_PICKS)).sort((a, b) => a - b))

  }



  return (

    <div className="originals-bars-picker">

      <div className="originals-mines-picker-toolbar">

        <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={() => onChange([])}>

          Clear

        </button>

        <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={() => pickRandom(3)}>

          Pick 3

        </button>

        <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={() => pickRandom(5)}>

          Pick 5

        </button>

      </div>

      <div className="originals-bars-grid" role="grid" aria-label="Bars tile picker">

        {Array.from({ length: TOTAL }, (_, idx) => (

          <button

            key={idx}

            type="button"

            disabled={readOnly || (selected.length >= MAX_PICKS && !set.has(idx))}

            className={`originals-bars-tile${set.has(idx) ? ' is-selected' : ''}`}

            onClick={() => toggle(idx)}

            title={`Tile ${idx}`}

          >

            {idx + 1}

          </button>

        ))}

      </div>

      <p className="originals-empty-hint">

        Select up to {MAX_PICKS} tiles (0–29). Empty = random tiles each bet.

      </p>

    </div>

  )

}


