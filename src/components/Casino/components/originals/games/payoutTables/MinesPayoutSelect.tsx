import { listMinesPayoutOptions } from './rhPayoutLookup'
import { formatPayoutMulti } from './formatPayoutMulti'

interface MinesPayoutSelectProps {
  mines: number
  diamonds: number
  readOnly?: boolean
  onDiamondsChange: (diamonds: number) => void
}

/** Pick target payout from modhub RH Mines table (sets gem count). */
export default function MinesPayoutSelect({ mines, diamonds, readOnly, onDiamondsChange }: MinesPayoutSelectProps) {
  const options = listMinesPayoutOptions(mines)
  if (options.length === 0) return null

  const value = options.some((o) => o.diamonds === diamonds) ? String(diamonds) : ''

  return (
    <label className="originals-field originals-field--block">
      <span className="originals-field-label">Target payout (from table)</span>
      <select
        className="originals-select originals-payout-multi-select"
        disabled={readOnly}
        value={value}
        size={options.length > 10 ? 8 : 1}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (n > 0) onDiamondsChange(n)
        }}
      >
        <option value="">— select multiplier —</option>
        {options.map((o) => (
          <option key={o.diamonds} value={String(o.diamonds)}>
            {o.diamonds} gem{o.diamonds !== 1 ? 's' : ''} — {formatPayoutMulti(o.multi)}
          </option>
        ))}
      </select>
    </label>
  )
}
