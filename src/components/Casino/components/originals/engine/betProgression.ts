/**
 * Bet-size progressions for Originals "Automatic" mode.
 *
 * Pure and framework-free so it can be unit tested. The progression only returns a
 * multiplier of the base bet; the runner (runProfile.ts) owns the actual bet size.
 */

export type StrategyPresetId =
  | 'custom'
  | 'flat'
  | 'martingale'
  | 'anti-martingale'
  | 'paroli'
  | 'dalembert'
  | 'fibonacci'

export const STRATEGY_PRESET_OPTIONS: { value: StrategyPresetId; label: string; hint: string }[] = [
  { value: 'custom', label: 'Custom (On win / On loss)', hint: 'Use the manual On win / On loss rules below.' },
  { value: 'flat', label: 'Flat', hint: 'Always bet the base amount.' },
  {
    value: 'martingale',
    label: 'Martingale',
    hint: 'Double after every loss, back to base after a win.',
  },
  {
    value: 'anti-martingale',
    label: 'Anti-Martingale',
    hint: 'Double after every win, back to base after a loss.',
  },
  {
    value: 'paroli',
    label: 'Paroli',
    hint: 'Double after a win; reset to base after N wins in a row or after a loss.',
  },
  {
    value: 'dalembert',
    label: "D'Alembert",
    hint: 'Add one unit after a loss, remove one unit after a win (never below base).',
  },
  {
    value: 'fibonacci',
    label: 'Fibonacci',
    hint: 'Move one step forward in the sequence after a loss, two steps back after a win.',
  },
]

export interface ProgressionParams {
  preset: StrategyPresetId
  /** Paroli: consecutive wins before the bet resets to base. */
  paroliWins: number
  /** D'Alembert: one unit as % of the base bet. */
  unitPct: number
  /** Safety cap on steps (0 = off). Martingale/Fibonacci/Anti-Martingale reset, D'Alembert stops growing. */
  maxSteps: number
}

export const DEFAULT_PAROLI_WINS = 3
export const DEFAULT_UNIT_PCT = 100

export interface BetProgression {
  /** False for `custom`: the runner keeps using its manual On win / On loss rules. */
  readonly active: boolean
  readonly preset: StrategyPresetId
  /** Current step (progression-specific counter, 0 = base bet). */
  readonly step: number
  /** Multiplier of the base bet for the current step. */
  multiplier(): number
  /** Advance after a win and return the multiplier for the next bet. */
  onWin(): number
  /** Advance after a loss and return the multiplier for the next bet. */
  onLoss(): number
  reset(): void
}

const PRESET_IDS = new Set<string>(STRATEGY_PRESET_OPTIONS.map((o) => o.value))

export function isStrategyPresetId(value: unknown): value is StrategyPresetId {
  return typeof value === 'string' && PRESET_IDS.has(value)
}

function finiteOr(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Read the preset settings from raw options (profile options merged with workbench options). */
export function readProgressionParams(src: Record<string, unknown>): ProgressionParams {
  const rawPreset = String(src.strategyPreset ?? 'custom').toLowerCase().trim()
  const preset: StrategyPresetId = isStrategyPresetId(rawPreset) ? rawPreset : 'custom'
  return {
    preset,
    paroliWins: Math.max(1, Math.floor(finiteOr(src.strategyParoliWins, DEFAULT_PAROLI_WINS))),
    unitPct: Math.max(0.01, finiteOr(src.strategyUnitPct, DEFAULT_UNIT_PCT)),
    maxSteps: Math.max(0, Math.floor(finiteOr(src.strategyMaxSteps, 0))),
  }
}

/** Fibonacci number at index i, with fib(0) = fib(1) = 1. */
export function fibonacciAt(index: number): number {
  const n = Math.max(0, Math.floor(index))
  let a = 1
  let b = 1
  for (let i = 0; i < n; i++) {
    const next = a + b
    a = b
    b = next
  }
  return a
}

export function createBetProgression(params: ProgressionParams): BetProgression {
  const { preset, paroliWins, unitPct, maxSteps } = params
  let step = 0

  const mult = (): number => {
    switch (preset) {
      case 'martingale':
      case 'anti-martingale':
      case 'paroli':
        return 2 ** step
      case 'dalembert':
        return 1 + (step * unitPct) / 100
      case 'fibonacci':
        return fibonacciAt(step)
      default:
        return 1
    }
  }

  const onWin = (): number => {
    switch (preset) {
      case 'martingale':
        step = 0
        break
      case 'anti-martingale':
        step += 1
        if (maxSteps > 0 && step > maxSteps) step = 0
        break
      case 'paroli':
        step += 1
        if (step >= paroliWins) step = 0
        break
      case 'dalembert':
        step = Math.max(0, step - 1)
        break
      case 'fibonacci':
        step = Math.max(0, step - 2)
        break
      default:
        step = 0
    }
    return mult()
  }

  const onLoss = (): number => {
    switch (preset) {
      case 'martingale':
        step += 1
        if (maxSteps > 0 && step > maxSteps) step = 0
        break
      case 'anti-martingale':
      case 'paroli':
        step = 0
        break
      case 'dalembert':
        step += 1
        if (maxSteps > 0 && step > maxSteps) step = maxSteps
        break
      case 'fibonacci':
        step += 1
        if (maxSteps > 0 && step > maxSteps) step = 0
        break
      default:
        step = 0
    }
    return mult()
  }

  return {
    active: preset !== 'custom',
    preset,
    get step() {
      return step
    },
    multiplier: mult,
    onWin,
    onLoss,
    reset() {
      step = 0
    },
  }
}
