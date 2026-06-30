/**
 * Combo + Hunt preset engine for dice/limbo automatic mode.
 */

import type { OriginalsWorkbenchOptions, ComboPart } from '../schema/workbenchOptions'
import { recalculateComboBetSizes } from '../schema/workbenchOptions'

export type ComboPhase = 'hunt' | 'combo'

export type ComboEngineState = {
  phase: ComboPhase
  partIndex: number
  huntWins: number
  comboHit: boolean
}

export function createComboEngine(options: OriginalsWorkbenchOptions): ComboEngineState {
  const hunt = !!options.huntEnabled && (options.huntMultiplier ?? 0) > 1
  const hasCombo = (options.comboParts?.length ?? 0) > 0 && options.targetSelectionMode === 'combo'
  return {
    phase: hunt ? 'hunt' : hasCombo ? 'combo' : 'hunt',
    partIndex: 0,
    huntWins: 0,
    comboHit: false,
  }
}

export function resolveComboParts(options: OriginalsWorkbenchOptions): ComboPart[] {
  const raw = options.comboParts ?? []
  if (raw.length === 0) return []
  const needsRecalc = raw.some((p, i) => i > 0 && p.betSize <= 0)
  return needsRecalc ? recalculateComboBetSizes(raw) : raw.map((p) => ({ ...p }))
}

/** Target multiplier and bet size (USD) for the current combo/hunt step. */
export function getComboBetParams(
  options: OriginalsWorkbenchOptions,
  state: ComboEngineState
): { targetMultiplier: number; betSizeUsd: number; rollUnder?: number } {
  const base = Math.max(0.00000001, Number(options.initialBetSize) || Number(options.betSize) || 0.01)
  const parts = resolveComboParts(options)

  if (state.phase === 'hunt' && options.huntEnabled) {
    const huntMult = Math.max(1.01, Number(options.huntMultiplier) || 30)
    return { targetMultiplier: huntMult, betSizeUsd: base, rollUnder: 99 / huntMult }
  }

  if (parts.length > 0) {
    const idx = Math.min(state.partIndex, parts.length - 1)
    const part = parts[idx]
    const target = Math.max(1.01, part.target || 2)
    const betSizeUsd = part.betSize > 0 ? part.betSize : base
    return { targetMultiplier: target, betSizeUsd, rollUnder: 99 / target }
  }

  if (options.targetSelectionMode === 'random') {
    const from = Number(options.targetMultiplierFrom) || 1.01
    const to = Number(options.targetMultiplierTo) || from
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const target = Math.round((lo + Math.random() * (hi - lo)) * 100) / 100
    return { targetMultiplier: target, betSizeUsd: base, rollUnder: 99 / target }
  }

  const staticMult = Math.max(1.01, Number(options.targetMultiplier) || 2)
  return { targetMultiplier: staticMult, betSizeUsd: base, rollUnder: 99 / staticMult }
}

/** Advance state after a round; returns true if full combo completed (for stopOnComboHit). */
export function advanceComboAfterRound(
  options: OriginalsWorkbenchOptions,
  state: ComboEngineState,
  win: boolean
): { stopSession: boolean; enteredCombo: boolean } {
  const parts = resolveComboParts(options)
  let enteredCombo = false

  if (state.phase === 'hunt' && options.huntEnabled) {
    if (win) {
      state.huntWins++
      if (parts.length > 0) {
        state.phase = 'combo'
        state.partIndex = 0
        enteredCombo = true
      }
    }
    return { stopSession: false, enteredCombo }
  }

  if (parts.length === 0) return { stopSession: false, enteredCombo: false }

  if (win) {
    if (state.partIndex >= parts.length - 1) {
      state.comboHit = true
      if (options.isStopOnComboHit) return { stopSession: true, enteredCombo: false }
      state.partIndex = 0
      if (options.huntEnabled) state.phase = 'hunt'
    } else {
      state.partIndex++
    }
  } else {
    state.partIndex = 0
    if (options.huntEnabled) state.phase = 'hunt'
  }

  return { stopSession: false, enteredCombo }
}
