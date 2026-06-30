interface MinesGridMiniProps {
  selected?: number[]
  mines?: number[]
  win?: boolean
}

export default function MinesGridMini({ selected = [], mines = [], win = true }: MinesGridMiniProps) {
  const selectedSet = new Set(selected)
  const minesSet = new Set(!win ? mines : [])

  return (
    <div className="originals-mines-grid-mini" aria-label="Mines grid">
      {Array.from({ length: 25 }, (_, i) => {
        let cls = 'originals-mines-mini-cell'
        if (selectedSet.has(i)) cls += ' is-gem'
        if (minesSet.has(i)) cls += ' is-mine'
        return <div key={i} className={cls} />
      })}
    </div>
  )
}
