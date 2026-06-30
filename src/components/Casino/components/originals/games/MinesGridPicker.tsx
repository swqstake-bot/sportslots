import { formatPayoutMulti } from './payoutTables/formatPayoutMulti'

const GRID = 5
const CELLS = GRID * GRID

interface MinesGridPickerProps {
  minesCount: number
  gemsTarget: number
  /** Preferred reveal order (tile indices 0–24). First N used per round. */
  fields: number[]
  onChange: (fields: number[]) => void
  readOnly?: boolean
  payoutMulti?: number | null
}

export default function MinesGridPicker({
  minesCount,
  gemsTarget,
  fields,
  onChange,
  readOnly,
  payoutMulti,
}: MinesGridPickerProps) {
  const order = fields.length > 0 ? fields : []
  const orderSet = new Set(order)

  const toggle = (idx: number) => {
    if (readOnly) return
    if (orderSet.has(idx)) {
      onChange(order.filter((i) => i !== idx))
      return
    }
    if (order.length >= gemsTarget) return
    onChange([...order, idx])
  }

  const clear = () => onChange([])
  const fillRow = () => {
    if (readOnly) return
    const row = Array.from({ length: GRID }, (_, c) => c)
    onChange(row)
  }

  return (
    <div className="originals-mines-picker">
      <div className="originals-mines-picker-meta">
        <span>
          {minesCount} mines · reveal {gemsTarget} gem{gemsTarget !== 1 ? 's' : ''}
          {payoutMulti != null ? ` · ${formatPayoutMulti(payoutMulti)}` : ''}
        </span>
        <span className="originals-mines-picker-order">
          {order.length > 0 ? `${order.length} tiles in order` : 'Random reveal order'}
        </span>
      </div>
      <div className="originals-mines-picker-toolbar">
        <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={clear}>
          Clear
        </button>
        <button type="button" className="originals-mini-btn" disabled={readOnly} onClick={fillRow}>
          Top row
        </button>
      </div>
      <div className="originals-mines-grid" role="grid" aria-label="Mines tile picker">
        {Array.from({ length: CELLS }, (_, idx) => {
          const pos = order.indexOf(idx)
          const isGem = pos >= 0 && pos < gemsTarget
          const isExtra = pos >= gemsTarget
          return (
            <button
              key={idx}
              type="button"
              disabled={readOnly}
              className={`originals-mines-cell${isGem ? ' is-gem' : ''}${isExtra ? ' is-extra' : ''}`}
              title={`Tile ${idx}${pos >= 0 ? ` · pick #${pos + 1}` : ''}`}
              onClick={() => toggle(idx)}
            >
              {pos >= 0 ? pos + 1 : ''}
            </button>
          )
        })}
      </div>
      <p className="originals-empty-hint">
        Click tiles to set reveal order. Green = gems to cash out. Empty = random tiles each bet.
      </p>
    </div>
  )
}
