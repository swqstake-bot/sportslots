import { useCallback, useMemo, useState } from 'react'

import type { OriginalsWorkbenchOptions, ComboPart } from '../schema/workbenchOptions'

import {

  computeComboMultiplier,

  createHuntMoonshotPreset,

  DEFAULT_WORKBENCH_OPTIONS,

  recalculateComboBetSizes,

} from '../schema/workbenchOptions'

import OriginalsStrategyManager from './OriginalsStrategyManager'
import DiceChanceControl from '../games/DiceChanceControl'
import { gameUsesMultiplierStrategy } from '../registry/gameApiSchema'
import { clampMultiplier, DICE_MAX_MULTIPLIER } from '../games/targetMath'
import { fieldInputCls } from '../games/gamePanelFields'
import ActiveTargetSummary from './ActiveTargetSummary'
import BetSizeSlider from './BetSizeSlider'
import OriginalsB2bResetPanel, { OriginalsWinLossFields } from './OriginalsB2bResetPanel'



interface OriginalsBetOptionsPanelProps {

  options: OriginalsWorkbenchOptions

  onChange: (next: OriginalsWorkbenchOptions) => void

  onLoadProfile?: (options: OriginalsWorkbenchOptions) => void

  supportsCombo?: boolean
  disabled?: boolean
  showAdvanced?: boolean
  gameSlug?: string
  /** profile = bet size + target + combo only (sidebar Profile tab) */
  variant?: 'profile' | 'full'
  currency?: string
}



export default function OriginalsBetOptionsPanel({

  options,

  onChange,

  onLoadProfile,

  supportsCombo = false,

  disabled = false,

  showAdvanced = false,
  gameSlug,
  variant = 'full',
  currency = 'usdc',
}: OriginalsBetOptionsPanelProps) {

  const [advancedOpen, setAdvancedOpen] = useState(false)
  const isProfile = variant === 'profile'

  const o = useMemo(() => ({ ...DEFAULT_WORKBENCH_OPTIONS, ...options }), [options])

  const inputCls =
    'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none disabled:opacity-50 tabular-nums'

  const patch = useCallback(
    (partial: Partial<OriginalsWorkbenchOptions>) => {
      onChange({ ...DEFAULT_WORKBENCH_OPTIONS, ...options, ...partial })
    },
    [options, onChange]
  )



  const parts = o.comboParts ?? []

  const comboMode = o.targetSelectionMode === 'combo'

  const usesMultiplierProfile = gameSlug ? gameUsesMultiplierStrategy(gameSlug) : true



  const updateParts = (next: ComboPart[]) => {

    patch({ comboParts: next, targetSelectionMode: 'combo' })

  }



  return (

    <div className="originals-bet-options space-y-4">

      {onLoadProfile && (
        <OriginalsStrategyManager
          key={gameSlug ?? o.game ?? 'dice'}
          options={o}
          gameSlug={gameSlug ?? o.game ?? 'dice'}
          onLoad={(opts) => onLoadProfile({ ...opts, game: gameSlug ?? o.game })}
          disabled={disabled}
        />
      )}



      {gameSlug && !isProfile && (
        <ActiveTargetSummary gameSlug={gameSlug} options={o} currency={currency} />
      )}



      <section className="originals-options-section">
        <h4 className="originals-section-title">Bet size</h4>
        <BetSizeSlider
          value={o.initialBetSize ?? 0.01}
          currency={currency}
          disabled={disabled}
          onChange={(v) => patch({ initialBetSize: v, betSize: v })}
        />
        <label className="block mt-3">
          <span className="text-xs text-[var(--text-muted)]">Number of bets (0 = ∞)</span>
          <input
            type="number"
            min="0"
            step="1"
            disabled={disabled}
            className={inputCls}
            value={o.numberOfBets ?? 0}
            onChange={(e) => patch({ numberOfBets: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      </section>



      {usesMultiplierProfile && (
      <section className="originals-options-section">
        <h4 className="originals-section-title">
          Target {gameSlug === 'dice' ? '(chance)' : '(multiplier)'}
        </h4>
        <p className="originals-game-api-hint originals-game-api-hint--inline">
          {gameSlug === 'dice'
            ? 'Dice: diceRoll(condition, target) — only dice & limbo use profile targets'
            : 'Limbo: limboBet(multiplierTarget)'}
        </p>

        <div className="flex flex-wrap gap-1 mb-2">
          {(['static', 'random', 'combo'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled || (m === 'combo' && !supportsCombo)}
              className={`originals-seg-btn${o.targetSelectionMode === m ? ' is-active' : ''}`}
              onClick={() => patch({ targetSelectionMode: m })}
            >
              {m === 'static' ? 'Static' : m === 'random' ? 'Random' : 'Combo'}
            </button>
          ))}
        </div>

        {!comboMode && (
          <>
            {o.targetSelectionMode === 'static' ? (
              gameSlug === 'dice' ? (
                <DiceChanceControl options={o} onPatch={patch} readOnly={disabled} compact />
              ) : (
                <label className="originals-field">
                  <span className="originals-field-label">Target multiplier</span>
                  <input
                    type="number"
                    min={1.01}
                    max={DICE_MAX_MULTIPLIER}
                    step={0.01}
                    disabled={disabled}
                    className={fieldInputCls}
                    value={clampMultiplier(o.targetMultiplier ?? 2)}
                    onChange={(e) => patch({ targetMultiplier: clampMultiplier(Number(e.target.value) || 2) })}
                  />
                </label>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-[var(--text-muted)]">From ×</span>
                  <input
                    type="number"
                    min={1.01}
                    step={0.01}
                    disabled={disabled}
                    className={inputCls}
                    value={o.targetMultiplierFrom ?? 2}
                    onChange={(e) => patch({ targetMultiplierFrom: clampMultiplier(Number(e.target.value) || 2) })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--text-muted)]">To ×</span>
                  <input
                    type="number"
                    min={1.01}
                    step={0.01}
                    disabled={disabled}
                    className={inputCls}
                    value={o.targetMultiplierTo ?? 10}
                    onChange={(e) => patch({ targetMultiplierTo: clampMultiplier(Number(e.target.value) || 10) })}
                  />
                </label>
              </div>
            )}
          </>
        )}
      </section>
      )}

      {!usesMultiplierProfile && gameSlug && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed px-0.5">
          Game parameters (rows, risk, mines, rounds…) are in the <strong>Game</strong> tab — this game has no
          free target multiplier.
        </p>
      )}



      <OriginalsWinLossFields options={o} patch={patch} disabled={disabled} inputCls={inputCls} />
      <OriginalsB2bResetPanel options={o} patch={patch} disabled={disabled} inputCls={inputCls} compact={isProfile} />

      {supportsCombo && (

        <section className="originals-options-section">

          <div className="flex flex-wrap gap-2 mb-2">

            <button

              type="button"

              disabled={disabled}

              className="originals-mini-btn"

              onClick={() => patch(createHuntMoonshotPreset())}

            >

              Hunt→Moonshot preset
            </button>
            <p className="text-[10px] text-[var(--text-muted)] w-full">
              Hunt waits for a high multiplier; moonshot chains smaller targets after a hit.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">

              <input

                type="checkbox"

                disabled={disabled}

                checked={!!o.huntEnabled}

                onChange={(e) => patch({ huntEnabled: e.target.checked })}

                className="accent-[var(--accent)]"

              />

              <span className="text-xs">Hunt phase</span>

            </label>

          </div>

          {o.huntEnabled && (

            <input

              type="number"

              min="1.01"

              disabled={disabled}

              className={inputCls}

              placeholder="Hunt multiplier"

              value={o.huntMultiplier ?? 30}

              onChange={(e) => patch({ huntMultiplier: Number(e.target.value) || 30 })}

            />

          )}

        </section>

      )}



      {comboMode && supportsCombo && (

        <ComboBuilderSection

          parts={parts}

          disabled={disabled}

          inputCls={inputCls}

          isStopOnComboHit={!!o.isStopOnComboHit}

          onStopComboChange={(v) => patch({ isStopOnComboHit: v })}

          onPartsChange={updateParts}

        />

      )}



      {!isProfile && showAdvanced && (

        <section className="originals-advanced-accordion">

          <button

            type="button"

            className="originals-advanced-toggle w-full text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"

            onClick={() => setAdvancedOpen((v) => !v)}

          >

            StakeSports extensions {advancedOpen ? '▾' : '▸'}

          </button>

          {advancedOpen && (

            <div className="mt-2 space-y-2 pl-1 border-l border-[var(--border)]">

              <label className="block">

                <span className="text-xs text-[var(--text-muted)]">Smart TP at multi (÷ base)</span>

                <input

                  type="number"

                  min="0"

                  step="any"

                  disabled={disabled}

                  className={inputCls}

                  value={o.b2bSmartTakeProfitAtMulti ?? 0}

                  onChange={(e) => patch({ b2bSmartTakeProfitAtMulti: Number(e.target.value) || 0 })}

                />

              </label>

              <label className="block">

                <span className="text-xs text-[var(--text-muted)]">Smart TP chain profit ($)</span>

                <input

                  type="number"

                  min="0"

                  step="any"

                  disabled={disabled}

                  className={inputCls}

                  value={o.b2bSmartTakeProfitAtChainProfitUsd ?? 0}

                  onChange={(e) =>

                    patch({ b2bSmartTakeProfitAtChainProfitUsd: Number(e.target.value) || 0 })

                  }

                />

              </label>

              <label className="block">

                <span className="text-xs text-[var(--text-muted)]">Recovery game (slug)</span>

                <input

                  type="text"

                  disabled={disabled}

                  className={inputCls}

                  placeholder="limbo"

                  value={(o as Record<string, unknown>).recoveryGame as string ?? ''}

                  onChange={(e) =>

                    patch({

                      recoveryOptions: {

                        game: e.target.value || 'limbo',

                        initialBetSize: o.initialBetSize,

                        betSize: o.betSize,

                      },

                    } as Partial<OriginalsWorkbenchOptions>)

                  }

                />

              </label>

              <p className="text-[10px] text-[var(--text-muted)]">

                Rotation: use Code mode JSON with <code>rotationStages</code> array.

              </p>

            </div>

          )}

        </section>

      )}

    </div>

  )

}



function ComboBuilderSection({

  parts,

  disabled,

  inputCls,

  isStopOnComboHit,

  onStopComboChange,

  onPartsChange,

}: {

  parts: ComboPart[]

  disabled?: boolean

  inputCls: string

  isStopOnComboHit: boolean

  onStopComboChange: (v: boolean) => void

  onPartsChange: (p: ComboPart[]) => void

}) {

  const mult = computeComboMultiplier(parts)



  return (

    <section className="originals-options-section originals-combo-builder">

        <div className="flex items-center justify-between gap-2 mb-2">

        <h4 className="originals-section-title mb-0">Combo Builder</h4>

        {mult > 0 && <span className="text-xs originals-profit tabular-nums">Combo: {mult.toFixed(2)}×</span>}

      </div>

      <label className="flex items-center gap-2 mb-2 cursor-pointer">

        <input

          type="checkbox"

          disabled={disabled}

          checked={isStopOnComboHit}

          onChange={(e) => onStopComboChange(e.target.checked)}

          className="accent-[var(--accent)]"

        />

        <span className="text-xs text-[var(--text)]">Stop on combo hit</span>
      </label>
      <p className="text-[10px] text-[var(--text-muted)] mb-2">
        Each part is a target multiplier and bet size. Session stops when all parts hit (if enabled).
      </p>

      <div className="space-y-2">

        {(parts.length ? parts : [{ target: 10, betSize: 0.01 }]).map((part, i) => (

          <div key={i} className="originals-combo-part">

            <span className="originals-combo-step">{i + 1}</span>

            <input

              type="number"

              min="1.01"

              step="any"

              disabled={disabled}

              className={inputCls}

              placeholder="Target ×"

              value={part.target}

              onChange={(e) => {

                const next = [...(parts.length ? parts : [{ target: 10, betSize: 0.01 }])]

                next[i] = { ...next[i], target: Number(e.target.value) || 1.01 }

                onPartsChange(next)

              }}

            />

            <input

              type="number"

              min="0"

              step="any"

              disabled={disabled}

              className={inputCls}

              placeholder="Bet $"

              value={part.betSize}

              onChange={(e) => {

                const next = [...(parts.length ? parts : [{ target: 10, betSize: 0.01 }])]

                next[i] = { ...next[i], betSize: Number(e.target.value) || 0 }

                onPartsChange(next)

              }}

            />

            <button

              type="button"

              disabled={disabled || parts.length <= 1}

              className="originals-combo-del"

              onClick={() => onPartsChange(parts.filter((_, j) => j !== i))}

            >

              ×

            </button>

          </div>

        ))}

      </div>

      <div className="flex gap-2 mt-2">

        <button

          type="button"

          disabled={disabled}

          className="originals-mini-btn"

          onClick={() => onPartsChange([...(parts.length ? parts : []), { target: 10, betSize: 0 }])}

        >

          + Part

        </button>

        <button

          type="button"

          disabled={disabled || parts.length < 2}

          className="originals-mini-btn"

          onClick={() => onPartsChange(recalculateComboBetSizes(parts.length ? parts : [{ target: 10, betSize: 0.01 }]))}

        >

          Recalculate

        </button>

      </div>

    </section>

  )

}

