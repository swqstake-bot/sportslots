const LEVELS = 9


export function columnsForDifficulty(difficulty: string): number {

  const map: Record<string, number> = { easy: 4, medium: 3, hard: 2, expert: 3, master: 4 }

  return map[String(difficulty || 'easy').toLowerCase()] ?? 4

}



/** Column picks per tower level (index 0 = top, 8 = bottom start). */

export function normalizeEggLevels(raw: unknown): Array<number | undefined> {

  if (!Array.isArray(raw)) return Array(LEVELS).fill(undefined)

  const out: Array<number | undefined> = Array(LEVELS).fill(undefined)

  if (raw.length === LEVELS && raw.some((v) => v == null || typeof v === 'number')) {

    raw.forEach((v, i) => {

      if (i < LEVELS && typeof v === 'number' && Number.isFinite(v)) out[i] = v

    })

    return out

  }

  raw.forEach((v, i) => {

    if (typeof v === 'number' && Number.isFinite(v) && i < LEVELS) {

      out[LEVELS - 1 - i] = v % columnsForDifficulty('easy')

    }

  })

  return out

}



export function eggLevelsToApi(eggs: Array<number | undefined>): number[] {

  return eggs.filter((v): v is number => v != null && Number.isFinite(v))

}



interface DragonTowerEggGridProps {

  difficulty: string

  eggLevels: Array<number | undefined>

  readOnly?: boolean

  onChange: (levels: Array<number | undefined>) => void

}



export default function DragonTowerEggGrid({

  difficulty,

  eggLevels,

  readOnly,

  onChange,

}: DragonTowerEggGridProps) {

  const cols = columnsForDifficulty(difficulty)

  const levels = normalizeEggLevels(eggLevels)



  const lowestSelected = levels.findIndex((v) => v != null)

  const selectedCount = levels.filter((v) => v != null).length



  const pick = (level: number, col: number) => {

    if (readOnly) return

    const next = [...levels]

    if (next[level] === col) {

      for (let i = level; i < LEVELS; i++) next[i] = undefined

    } else {

      const canPick = level === LEVELS - 1 || (lowestSelected !== -1 && level === lowestSelected - 1)

      if (!canPick && next[level] == null) return

      next[level] = col

    }

    onChange(next)

  }



  return (

    <div className="originals-dragon-tower">

      <p className="originals-empty-hint mb-2">

        Pick one egg per level from the bottom up ({selectedCount}/9). API sends eggs[] column indices.

      </p>

      <div className="originals-dragon-tower-levels">

        {Array.from({ length: LEVELS }, (_, level) => {

          const isSelected = levels[level] != null

          const canPick =

            level === LEVELS - 1 || (lowestSelected !== -1 && level === lowestSelected - 1) || isSelected

          return (

            <div key={level} className="originals-dragon-tower-row">

              <span className="originals-dragon-tower-level-label">L{level + 1}</span>

              <div className="originals-dragon-tower-cols" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>

                {Array.from({ length: cols }, (_, col) => (

                  <button

                    key={col}

                    type="button"

                    disabled={readOnly || (!canPick && !isSelected)}

                    className={`originals-dragon-tile${levels[level] === col ? ' is-egg' : ''}`}

                    onClick={() => pick(level, col)}

                    title={`Level ${level + 1} · column ${col + 1}`}

                  >

                    {levels[level] === col ? '🥚' : col + 1}

                  </button>

                ))}

              </div>

            </div>

          )

        })}

      </div>

    </div>

  )

}


