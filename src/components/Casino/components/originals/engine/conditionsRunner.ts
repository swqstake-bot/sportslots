import type { ConditionBlock, OriginalsWorkbenchOptions } from '../schema/workbenchOptions'

export type ConditionRoundContext = {
  lastMulti: number
  lastWin: boolean
  rollNumber: number
  lastRollResult?: number
  profitUsd?: number
  peakProfitUsd?: number
  totalWageredUsd?: number
  /** Positive = win streak length; negative = loss streak length. */
  currentStreak?: number
  betSizeUsd?: number
  /** Per-block hit counter for everyNBets — mutated in-place. */
  conditionBlockCounters?: Record<string, number>
}

export type ConditionActions = {
  stop?: boolean
  resetStats?: boolean
  resetSeed?: boolean
  depositToVault?: { amount: number }
  turboChange?: 'enable' | 'disable'
  /** Override bet size for next round (absolute $). */
  setBetSize?: number
  addBetSize?: number
  multiplyBetSize?: number
  switchOverUnder?: boolean
  setWinChance?: number
}

export type ConditionResult = {
  patch: Partial<OriginalsWorkbenchOptions>
  actions: ConditionActions
}

function matchesIf(block: ConditionBlock, ctx: ConditionRoundContext): boolean {
  const v = block.ifValue ?? 0
  switch (block.ifType) {
    case 'lastWin':
      return ctx.lastWin
    case 'lastLoss':
      return !ctx.lastWin
    case 'multiAbove':
      return ctx.lastMulti >= v
    case 'multiBelow':
      return ctx.lastMulti > 0 && ctx.lastMulti < v
    case 'rollUnder':
      return ctx.lastRollResult != null && ctx.lastRollResult < v
    case 'rollOver':
      return ctx.lastRollResult != null && ctx.lastRollResult > v
    case 'everyNBets': {
      if (v <= 0) return false
      const counters = ctx.conditionBlockCounters
      if (!counters) return ctx.rollNumber > 0 && ctx.rollNumber % Math.round(v) === 0
      const cnt = (counters[block.id] ?? 0) + 1
      counters[block.id] = cnt
      return cnt >= Math.round(v) && (() => { counters[block.id] = 0; return true })()
    }
    case 'profitAbove':
      return (ctx.profitUsd ?? 0) >= v
    case 'profitBelow':
      return (ctx.profitUsd ?? 0) <= -Math.abs(v)
    case 'drawdownAbove': {
      const peak = ctx.peakProfitUsd ?? 0
      const profit = ctx.profitUsd ?? 0
      return peak - profit >= Math.abs(v)
    }
    case 'winStreakAtLeast': {
      const streak = ctx.currentStreak ?? 0
      return streak > 0 && streak >= Math.round(v)
    }
    case 'lossStreakAtLeast': {
      const streak = ctx.currentStreak ?? 0
      return streak < 0 && -streak >= Math.round(v)
    }
    case 'wagerAbove':
      return (ctx.totalWageredUsd ?? 0) >= v
    default:
      return false
  }
}

function applyThen(
  block: ConditionBlock,
  opts: OriginalsWorkbenchOptions,
  ctx: ConditionRoundContext
): { patch: Partial<OriginalsWorkbenchOptions>; actions: ConditionActions } {
  const val = block.thenValue ?? 0
  switch (block.thenType) {
    case 'setRollUnder':
      return { patch: { rollOver: false, rollUnder: val, betHigh: false }, actions: {} }
    case 'setRollOver':
      return { patch: { rollOver: true, rollUnder: val, betHigh: true }, actions: {} }
    case 'setTargetMulti': {
      const mult = Math.max(1.01, val)
      return { patch: { targetMultiplier: mult, rollUnder: 99 / mult }, actions: {} }
    }
    case 'flipDirection': {
      const over = opts.rollOver !== false
      return { patch: { rollOver: !over, betHigh: !over }, actions: {} }
    }
    case 'switchOverUnder':
      return { patch: {}, actions: { switchOverUnder: true } }
    case 'setWinChance': {
      const pct = Math.max(0.0001, Math.min(98.9999, val))
      const mult = 99 / pct
      return { patch: { rollUnder: pct, targetMultiplier: mult }, actions: { setWinChance: pct } }
    }
    case 'stop':
      return { patch: {}, actions: { stop: true } }
    case 'resetStats':
      return { patch: {}, actions: { resetStats: true } }
    case 'resetSeed':
      return { patch: {}, actions: { resetSeed: true } }
    case 'setAmount':
      return { patch: {}, actions: { setBetSize: Math.max(0, val) } }
    case 'addAmount':
      return { patch: {}, actions: { addBetSize: val } }
    case 'multiplyAmount':
      return { patch: {}, actions: { multiplyBetSize: Math.max(0, val) } }
    case 'enableTurbo':
      return { patch: {}, actions: { turboChange: 'enable' } }
    case 'disableTurbo':
      return { patch: {}, actions: { turboChange: 'disable' } }
    case 'depositToVault': {
      const amount = val > 0 ? val : Math.max(0, ctx.profitUsd ?? 0)
      return { patch: {}, actions: { depositToVault: { amount } } }
    }
    default:
      return { patch: {}, actions: {} }
  }
}

/** Evaluate IF/THEN blocks in order; first match wins. */
export function applyConditionBlocks(
  options: OriginalsWorkbenchOptions,
  ctx: ConditionRoundContext,
  blocks?: ConditionBlock[]
): ConditionResult {
  const activeBlocks = blocks ?? options.conditionBlocks ?? []
  if (!activeBlocks.length) return { patch: {}, actions: {} }
  for (const block of activeBlocks) {
    if (matchesIf(block, ctx)) {
      return applyThen(block, options, ctx)
    }
  }
  return { patch: {}, actions: {} }
}
