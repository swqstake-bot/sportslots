import { useCallback, useState } from 'react'
import { Button } from '../../ui/Button'
import type { ConditionBlock, ConditionIfType, ConditionThenType, OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import type { useOriginalsSession } from '../hooks/useOriginalsSession'

interface OriginalsConditionsPanelProps {
  gameSlug: string
  options: OriginalsWorkbenchOptions
  onChange: (next: OriginalsWorkbenchOptions) => void
  currency?: string
  session?: ReturnType<typeof useOriginalsSession>
}

let blockSeq = 0
function newBlock(): ConditionBlock {
  blockSeq += 1
  return { id: `c${blockSeq}`, ifType: 'lastWin', thenType: 'flipDirection' }
}

const IF_TYPES: { value: ConditionIfType; label: string; hasValue?: boolean }[] = [
  { value: 'lastWin', label: 'Last bet won' },
  { value: 'lastLoss', label: 'Last bet lost' },
  { value: 'multiAbove', label: 'Multiplier ≥', hasValue: true },
  { value: 'multiBelow', label: 'Multiplier <', hasValue: true },
  { value: 'rollUnder', label: 'Roll <', hasValue: true },
  { value: 'rollOver', label: 'Roll >', hasValue: true },
  { value: 'everyNBets', label: 'Every N bets', hasValue: true },
  { value: 'profitAbove', label: 'Profit above $', hasValue: true },
  { value: 'profitBelow', label: 'Profit below -$', hasValue: true },
  { value: 'drawdownAbove', label: 'Drawdown > $', hasValue: true },
  { value: 'winStreakAtLeast', label: 'Win streak ≥', hasValue: true },
  { value: 'lossStreakAtLeast', label: 'Loss streak ≥', hasValue: true },
  { value: 'wagerAbove', label: 'Total wagered > $', hasValue: true },
]

const THEN_TYPES: { value: ConditionThenType; label: string; hasValue?: boolean }[] = [
  { value: 'flipDirection', label: 'Flip over/under' },
  { value: 'setRollUnder', label: 'Set roll under', hasValue: true },
  { value: 'setRollOver', label: 'Set roll over', hasValue: true },
  { value: 'setTargetMulti', label: 'Set target ×', hasValue: true },
  { value: 'switchOverUnder', label: 'Switch over/under' },
  { value: 'setWinChance', label: 'Set win chance %', hasValue: true },
  { value: 'setAmount', label: 'Set bet amount $', hasValue: true },
  { value: 'addAmount', label: 'Add to bet $', hasValue: true },
  { value: 'multiplyAmount', label: 'Multiply bet by', hasValue: true },
  { value: 'stop', label: 'Stop session' },
  { value: 'resetStats', label: 'Reset stats' },
  { value: 'resetSeed', label: 'Rotate seed' },
  { value: 'enableTurbo', label: 'Enable turbo' },
  { value: 'disableTurbo', label: 'Disable turbo' },
  { value: 'depositToVault', label: 'Deposit to vault ($)', hasValue: true },
]

const NO_VALUE_IF_TYPES: ConditionIfType[] = ['lastWin', 'lastLoss']
const NO_VALUE_THEN_TYPES: ConditionThenType[] = ['flipDirection', 'switchOverUnder', 'stop', 'resetStats', 'resetSeed', 'enableTurbo', 'disableTurbo']

export default function OriginalsConditionsPanel({
  gameSlug,
  options,
  onChange,
  currency = 'usdc',
  session,
}: OriginalsConditionsPanelProps) {
  const blocks = options.conditionBlocks ?? []
  const [localBlocks, setLocalBlocks] = useState<ConditionBlock[]>(blocks.length ? blocks : [newBlock()])
  const running = session?.running ?? false

  const syncBlocks = useCallback(
    (next: ConditionBlock[]) => {
      setLocalBlocks(next)
      onChange({ ...options, conditionBlocks: next })
    },
    [options, onChange]
  )

  if (gameSlug !== 'dice') {
    return (
      <div className="casino-card p-6 text-center text-sm text-[var(--text-muted)]">
        Condition Builder is available for Dice only.
      </div>
    )
  }

  const inputCls =
    'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm'

  return (
    <div className="casino-card p-4 space-y-3 originals-conditions-panel">
      <div>
        <h4 className="text-sm font-semibold text-[var(--text)]">Condition Builder (Dice)</h4>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          IF/THEN blocks run each round before placing a bet. First matching block applies.
        </p>
      </div>

      {localBlocks.map((b, i) => (
        <div key={b.id} className="originals-condition-block">
          <span className="originals-combo-step">{i + 1}</span>
          <div className="originals-condition-fields">
            <label className="block">
              <span className="text-[10px] text-[var(--text-muted)] uppercase">IF</span>
              <select
                className={inputCls}
                value={b.ifType}
                onChange={(e) => {
                  const next = [...localBlocks]
                  next[i] = { ...next[i], ifType: e.target.value as ConditionIfType }
                  syncBlocks(next)
                }}
              >
                {IF_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {!NO_VALUE_IF_TYPES.includes(b.ifType) && (
              <input
                type="number"
                step="any"
                className={inputCls}
                placeholder="Value"
                value={b.ifValue ?? 0}
                onChange={(e) => {
                  const next = [...localBlocks]
                  next[i] = { ...next[i], ifValue: Number(e.target.value) || 0 }
                  syncBlocks(next)
                }}
              />
            )}
            <label className="block">
              <span className="text-[10px] text-[var(--text-muted)] uppercase">THEN</span>
              <select
                className={inputCls}
                value={b.thenType}
                onChange={(e) => {
                  const next = [...localBlocks]
                  next[i] = { ...next[i], thenType: e.target.value as ConditionThenType }
                  syncBlocks(next)
                }}
              >
                {THEN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            {!NO_VALUE_THEN_TYPES.includes(b.thenType) && (
              <input
                type="number"
                step="any"
                className={inputCls}
                placeholder="Then value"
                value={b.thenValue ?? (b.thenType === 'setRollUnder' || b.thenType === 'setRollOver' ? 49.5 : 0)}
                onChange={(e) => {
                  const next = [...localBlocks]
                  next[i] = { ...next[i], thenValue: Number(e.target.value) || 0 }
                  syncBlocks(next)
                }}
              />
            )}
          </div>
          <button
            type="button"
            className="originals-combo-del"
            disabled={localBlocks.length <= 1}
            onClick={() => syncBlocks(localBlocks.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="originals-mini-btn" onClick={() => syncBlocks([...localBlocks, newBlock()])}>
          + Block
        </button>
        {session && (
          !running ? (
            <Button
              type="button"
              className="originals-start-btn"
              onClick={() =>
                session.start({ ...options, conditionBlocks: localBlocks }, currency)
              }
            >
              Start
            </Button>
          ) : (
            <Button type="button" variant="danger" className="originals-stop-btn" onClick={session.stop}>
              Stop
            </Button>
          )
        )}
      </div>
    </div>
  )
}
