/**
 * Tab „Multi“: Game Rotation, Conditional Switch, Hybrid – wählbar statt Freitext.
 */

import { useState, useEffect } from 'react'
import type { OriginalsSettingsState } from './OriginalsSettings'
import {
  ORIGINALS_GAMES,
  ROTATION_PRESETS,
  SWITCH_CONDITIONS_BY_GAME,
  HYBRID_PRESETS,
  SWITCH_VALUE_STREAK_OPTIONS,
  SWITCH_VALUE_PCT_OPTIONS,
  type OriginalsGameId,
  type SwitchConditionType,
} from './originalsConstants'

const inputCls = 'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none'

interface OriginalsMultiStrategiesProps {
  value?: Partial<OriginalsSettingsState>
  onChange?: (s: OriginalsSettingsState) => void
}

/** Parst "dice:400,limbo:150" zu [{ game, count }]. */
function parseRotationConfig(config: string): { game: OriginalsGameId; count: number }[] {
  if (!config.trim()) return []
  return config.split(',').map((part) => {
    const [game, count] = part.trim().split(':')
    return { game: (game?.toLowerCase() || 'dice') as OriginalsGameId, count: Math.max(0, Number(count) || 0) }
  }).filter((r) => ORIGINALS_GAMES.some((g) => g.id === r.game))
}

function formatRotationConfig(entries: { game: OriginalsGameId; count: number }[]): string {
  return entries.filter((e) => e.count > 0).map((e) => `${e.game}:${e.count}`).join(', ')
}

/** Eine Conditional-Switch-Regel: Von-Spiel, Bedingung, optional Wert, Ziel-Spiel. */
export type SwitchRule = { fromGame: OriginalsGameId; condition: SwitchConditionType; conditionValue?: string; targetGame: OriginalsGameId }

/** Parst "fromGame|condition|value→target" oder "condition→target" (Legacy). */
function parseSwitchConfig(config: string): SwitchRule[] {
  if (!config.trim()) return []
  return config.split(',').map((part) => {
    const toTarget = part.trim().split('→').map((s) => s.trim())
    const targetGame = (toTarget[1]?.toLowerCase() || 'keno') as OriginalsGameId
    const left = toTarget[0] || ''
    const pipeParts = left.split('|').map((s) => s.trim())
    if (pipeParts.length >= 3) {
      return {
        fromGame: (pipeParts[0]?.toLowerCase() || 'dice') as OriginalsGameId,
        condition: (pipeParts[1] || 'dice9Reds') as SwitchConditionType,
        conditionValue: pipeParts[2] || undefined,
        targetGame,
      }
    }
    if (pipeParts.length === 2) {
      return {
        fromGame: (pipeParts[0]?.toLowerCase() || 'dice') as OriginalsGameId,
        condition: (pipeParts[1] || 'dice9Reds') as SwitchConditionType,
        conditionValue: undefined,
        targetGame,
      }
    }
    return {
      fromGame: 'dice',
      condition: (left || 'dice9Reds') as SwitchConditionType,
      conditionValue: undefined,
      targetGame,
    }
  }).filter((r) => r.condition && r.targetGame && ORIGINALS_GAMES.some((g) => g.id === r.fromGame)) as SwitchRule[]
}

function formatSwitchConfig(entries: SwitchRule[]): string {
  return entries.map((e) => {
    const left = e.conditionValue != null && e.conditionValue !== '' ? `${e.fromGame}|${e.condition}|${e.conditionValue}` : `${e.fromGame}|${e.condition}`
    return `${left}→${e.targetGame}`
  }).join(', ')
}

export default function OriginalsMultiStrategies({ value = {}, onChange }: OriginalsMultiStrategiesProps) {
  const [rotationEntries, setRotationEntries] = useState(() => parseRotationConfig(value.gameRotationConfig ?? ''))
  const [switchEntries, setSwitchEntries] = useState(() => parseSwitchConfig(value.conditionalGameSwitch ?? ''))
  const hybrid = value.hybridStrategies ?? ''

  useEffect(() => {
    const parsed = parseSwitchConfig(value.conditionalGameSwitch ?? '')
    const normalized = parsed.map((row) => {
      const opts = SWITCH_CONDITIONS_BY_GAME[row.fromGame] ?? SWITCH_CONDITIONS_BY_GAME.dice
      const valid = opts.some((o) => o.value === row.condition)
      return valid ? row : { ...row, condition: (opts[0]?.value ?? 'dice9Reds') as SwitchConditionType }
    })
    setSwitchEntries(normalized)
  }, [value.conditionalGameSwitch])
  const streakBased = value.streakBasedMode ?? false
  const heatMap = value.heatMapHotColdMode ?? false

  const emit = (next: Partial<OriginalsSettingsState>) => {
    onChange?.({ ...value, ...next } as OriginalsSettingsState)
  }

  const setRotation = (entries: { game: OriginalsGameId; count: number }[]) => {
    setRotationEntries(entries)
    emit({ gameRotationConfig: formatRotationConfig(entries) })
  }

  const setSwitches = (entries: SwitchRule[]) => {
    setSwitchEntries(entries)
    emit({ conditionalGameSwitch: formatSwitchConfig(entries) })
  }

  const addRotationRow = () => setRotation([...rotationEntries, { game: 'dice', count: 100 }])
  const removeRotationRow = (i: number) => setRotation(rotationEntries.filter((_, idx) => idx !== i))
  const updateRotationRow = (i: number, game: OriginalsGameId, count: number) => {
    const next = [...rotationEntries]
    next[i] = { game, count }
    setRotation(next)
  }

  const addSwitchRow = () => setSwitches([...switchEntries, { fromGame: 'dice', condition: 'dice9Reds', targetGame: 'keno' }])
  const removeSwitchRow = (i: number) => setSwitches(switchEntries.filter((_, idx) => idx !== i))
  const updateSwitchRow = (i: number, patch: Partial<SwitchRule>) => {
    const next = [...switchEntries]
    next[i] = { ...next[i], ...patch }
    setSwitches(next)
  }

  /** Bedingungen für das gewählte „Von-Spiel“ (nur diese anzeigen). */
  const conditionsForGame = (fromGame: OriginalsGameId) => SWITCH_CONDITIONS_BY_GAME[fromGame] ?? SWITCH_CONDITIONS_BY_GAME.dice
  const needsValue = (fromGame: OriginalsGameId, condition: SwitchConditionType) =>
    conditionsForGame(fromGame).find((c) => c.value === condition)?.needsValue ?? false
  const isPctCondition = (c: SwitchConditionType) => c === 'profitPct' || c === 'lossPct'

  const v = value ?? {}
  const labelCls = 'block text-xs text-[var(--text-muted)] mb-0.5'

  return (
    <div className="casino-card space-y-4">
      <h3 className="casino-card-header text-base">
        <span className="casino-card-header-accent" />
        Multi-Strategien
      </h3>

      <div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Pro Spiel (für Rotation / Switch)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--bg-deep)]/50 border border-[var(--border-subtle)]">
          <div>
            <label className={labelCls}>Dice: Chance % (Roll Under)</label>
            <input type="number" min="0.01" max="99.99" step="0.01" value={v.multiDiceChance ?? 49.5} onChange={(e) => emit({ multiDiceChance: Number(e.target.value) || 49.5 })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Limbo: Ziel-Multiplikator</label>
            <input type="number" min="1.01" max="1000000" step="0.01" value={v.multiLimboMultiplier ?? 2} onChange={(e) => emit({ multiLimboMultiplier: Number(e.target.value) || 2 })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Mines: Minenanzahl</label>
            <input type="number" min="1" max="24" value={v.multiMinesCount ?? 3} onChange={(e) => emit({ multiMinesCount: Math.max(1, Math.min(24, Number(e.target.value) || 3)) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Plinko: Reihen</label>
            <input type="number" min="8" max="16" value={v.multiPlinkoRows ?? 16} onChange={(e) => emit({ multiPlinkoRows: Math.max(8, Math.min(16, Number(e.target.value) || 16)) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Plinko: Risk</label>
            <select value={v.multiPlinkoRisk ?? 'low'} onChange={(e) => emit({ multiPlinkoRisk: e.target.value })} className={inputCls}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Keno: Anzahl Picks (Felder)</label>
            <input type="number" min="1" max="10" value={v.multiKenoPicks ?? 5} onChange={(e) => emit({ multiKenoPicks: Math.max(1, Math.min(10, Number(e.target.value) || 5)) })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Keno: Risk</label>
            <select value={v.multiKenoRisk ?? 'low'} onChange={(e) => emit({ multiKenoRisk: e.target.value })} className={inputCls}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Rotation (Vorgabe)</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {ROTATION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setRotation(preset.config.map((c) => ({ game: c.game, count: c.count })))}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-deep)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {rotationEntries.map((row, i) => (
            <div key={i} className="flex gap-2 items-center flex-wrap">
              <select
                value={row.game}
                onChange={(e) => updateRotationRow(i, e.target.value as OriginalsGameId, row.count)}
                className={inputCls}
                style={{ width: '6rem' }}
              >
                {ORIGINALS_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={row.count}
                onChange={(e) => updateRotationRow(i, row.game, Number(e.target.value))}
                className={inputCls}
                style={{ width: '5rem' }}
              />
              <span className="text-xs text-[var(--text-muted)]">Bets</span>
              <button type="button" onClick={() => removeRotationRow(i)} className="text-red-400 text-xs">Entfernen</button>
            </div>
          ))}
          <button type="button" onClick={addRotationRow} className="text-xs text-[var(--accent)]">+ Zeile</button>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Conditional Switch (pro Original: Von-Spiel → Bedingung → Ziel)</div>
        <div className="space-y-2">
          {switchEntries.map((row, i) => {
            const opts = conditionsForGame(row.fromGame)
            const conditionValid = opts.some((o) => o.value === row.condition)
            const condition = conditionValid ? row.condition : (opts[0]?.value ?? 'dice9Reds')
            const showValue = needsValue(row.fromGame, condition)
            return (
              <div key={i} className="flex gap-2 items-center flex-wrap p-2 rounded-lg bg-[var(--bg-deep)]/50 border border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-muted)]">Wenn</span>
                <select
                  value={row.fromGame}
                  onChange={(e) => {
                    const from = e.target.value as OriginalsGameId
                    const firstCond = conditionsForGame(from)[0]?.value ?? 'dice9Reds'
                    updateSwitchRow(i, { fromGame: from, condition: firstCond, conditionValue: undefined })
                  }}
                  className={inputCls}
                  style={{ width: '6rem' }}
                >
                  {ORIGINALS_GAMES.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
                <span className="text-xs text-[var(--text-muted)]">:</span>
                <select
                  value={condition}
                  onChange={(e) => updateSwitchRow(i, { condition: e.target.value as SwitchConditionType })}
                  className={inputCls}
                  style={{ minWidth: '11rem' }}
                >
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {showValue && (() => {
                  const valueOpts = isPctCondition(condition) ? SWITCH_VALUE_PCT_OPTIONS : SWITCH_VALUE_STREAK_OPTIONS
                  const validVal = valueOpts.some((o) => o.v === row.conditionValue) ? row.conditionValue : valueOpts[0]?.v ?? '5'
                  return (
                    <select value={validVal} onChange={(e) => updateSwitchRow(i, { conditionValue: e.target.value })} className={inputCls} style={{ width: '5rem' }}>
                      {valueOpts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  )
                })()}
                <span className="text-[var(--text-muted)]">→</span>
                <span className="text-xs text-[var(--text-muted)]">→ wechsle zu</span>
                <select
                  value={row.targetGame}
                  onChange={(e) => updateSwitchRow(i, { targetGame: e.target.value as OriginalsGameId })}
                  className={inputCls}
                  style={{ width: '6rem' }}
                >
                  {ORIGINALS_GAMES.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeSwitchRow(i)} className="text-red-400 text-xs ml-auto">Entfernen</button>
              </div>
            )
          })}
          <button type="button" onClick={addSwitchRow} className="text-xs text-[var(--accent)]">+ Regel</button>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Hybrid</div>
        <select
          value={HYBRID_PRESETS.find((p) => p.value === hybrid) ? hybrid : ''}
          onChange={(e) => emit({ hybridStrategies: e.target.value })}
          className={inputCls}
        >
          {HYBRID_PRESETS.map((p) => (
            <option key={p.value || 'aus'} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={streakBased}
            onChange={(e) => emit({ streakBasedMode: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--accent)]"
          />
          <span className="text-xs">Streak-Based (6+ Wins aggressiver)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={heatMap}
            onChange={(e) => emit({ heatMapHotColdMode: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--accent)]"
          />
          <span className="text-xs">Heat Map / Hot-Cold</span>
        </label>
      </div>
    </div>
  )
}
