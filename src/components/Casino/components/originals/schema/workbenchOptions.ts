/**

 * Workbench options schema (Automatic mode + Combo + Hunt presets).

 */



import type { ProfileOptions as LegacyProfileOptions } from '../scriptBuilder/profileSchema'



export type WorkbenchOnWinLoss = 'reset' | 'increase' | 'decrease' | 'martingale' | 'b2b' | 'none'



export type OriginalsBettingMode = 'automatic' | 'conditions' | 'code' | 'dice-runner'



export interface ComboPart {

  target: number

  betSize: number

}



export type TargetSelectionMode = 'static' | 'random' | 'combo'

export type ConditionIfType =
  | 'rollUnder'
  | 'rollOver'
  | 'multiAbove'
  | 'multiBelow'
  | 'lastWin'
  | 'lastLoss'
  | 'everyNBets'
  | 'profitAbove'
  | 'profitBelow'
  | 'drawdownAbove'
  | 'winStreakAtLeast'
  | 'lossStreakAtLeast'
  | 'wagerAbove'

export type ConditionThenType =
  | 'setRollUnder'
  | 'setRollOver'
  | 'setTargetMulti'
  | 'flipDirection'
  | 'stop'
  | 'resetStats'
  | 'resetSeed'
  | 'setAmount'
  | 'addAmount'
  | 'multiplyAmount'
  | 'switchOverUnder'
  | 'setWinChance'
  | 'enableTurbo'
  | 'disableTurbo'
  | 'depositToVault'

export interface ConditionBlock {
  id: string
  ifType: ConditionIfType
  ifValue?: number
  thenType: ConditionThenType
  thenValue?: number
}

export interface OriginalsWorkbenchOptions extends Omit<Partial<LegacyProfileOptions>, 'game' | 'onWin' | 'onLoss'> {

  game?: string

  notes?: string

  minBetSize?: number

  numberOfBets?: number

  asyncMode?: boolean

  onWin?: WorkbenchOnWinLoss

  onLoss?: WorkbenchOnWinLoss

  stopOnDrawdown?: number

  stopOnNextWin?: boolean

  stopOnWagerAbove?: number

  isStopOnMultiplier?: boolean

  stopOnMultiplier?: number

  isStopOnExactRoll?: boolean

  stopOnExactRoll?: number

  isStopOnRTPAbove?: boolean

  stopOnRTPAbove?: number

  isStopOnRTPBelow?: boolean

  stopOnRTPBelow?: number

  isStopOnB2bMultiplierSum?: boolean

  stopOnB2bMultiplierSum?: number

  isStopIfBetIdContains?: boolean

  stopIfBetIdContains?: string

  isStopIfBetIdEndsOn?: boolean

  stopIfBetIdEndsOn?: string

  isStopIfBetIdIs?: boolean

  stopIfBetIdIs?: 'even' | 'odd'

  isStopIfLast3BetIdDigitsContain?: boolean

  stopIfLast3BetIdDigitsContain?: string

  sendBetIdToChallengesRoom?: boolean

  preRolls?: number

  preRollsBetSize?: number

  isSeedChangeAfterWins?: boolean

  seedChangeAfterWins?: number

  isSeedChangeAfterLosses?: boolean

  seedChangeAfterLosses?: number

  isSeedChangeAfterWinStreak?: boolean

  seedChangeAfterWinStreak?: number

  isSeedChangeAfterLossStreak?: boolean

  seedChangeAfterLossStreak?: number

  isSeedChangeAfterRolls?: boolean
  seedChangeAfterRolls?: number
  increaseBetAfterSeedReset?: number
  seedResetOnLossStreak?: number
  resetSeedOnLoss?: boolean

  isSeedChangeOnMultiplier?: boolean

  seedChangeOnMultiplier?: number

  betHigh?: boolean

  targetSelectionMode?: TargetSelectionMode

  targetMultiplierFrom?: number

  targetMultiplierTo?: number

  switchOverUnderAfterRolls?: number

  switchOverUnderAfterWins?: number

  switchOverUnderAfterLosses?: number

  switchOverUnderAfterWinStreak?: number

  switchOverUnderAfterLossStreak?: number

  isSwitchOverUnderAfterRolls?: boolean
  isSwitchOverUnderAfterWins?: boolean
  isSwitchOverUnderAfterLosses?: boolean
  isSwitchOverUnderAfterWinStreak?: boolean
  isSwitchOverUnderAfterLossStreak?: boolean

  isRandomMultiplier?: boolean
  randomMultiplier1?: number
  randomMultiplier2?: number

  isVaultAllProfits?: boolean
  vaultProfitsThreshold?: number

  conditionBlocks?: ConditionBlock[]

  isStopOnComboHit?: boolean

  comboParts?: ComboPart[]

  huntEnabled?: boolean

  huntMultiplier?: number

  difficulty?: 'easy' | 'medium' | 'hard' | 'expert' | 'master'

  rounds?: number

  /** Pump / Chicken target round index */
  round?: number

  /** Pump / multi-round games — alias for rounds in bet APIs */
  rollCount?: number

  segments?: number
  lines?: number
  tiles?: number[]
  eggs?: number[]
  guesses?: string[]
  numberOfFlips?: number
  numberOfRounds?: number
  repeatGuess?: boolean
  hiloRounds?: number
  hiloGuess?: 'higher' | 'lower' | 'equal'
  hiloPattern?: string
  eggLevels?: Array<number | undefined>
  startCardRank?: string
  startCardSuit?: string
  minesFields?: number[]
  casesIdentifier?: string

  /** Plinko UI: selected board slot × (sets rows/risk via lookup) */
  plinkoTarget?: number

  requestInterval?: number

  currency?: string

  /** Injected by session runner — not persisted in profiles */
  _workbenchSettings?: {
    clientSeed?: string
    maxFiatBetSize?: number
    turboMode?: boolean
    turboFireIntervalMs?: number
    turboMaxInFlight?: number
    requestInterval?: number
    forceRestartDelaySeconds?: number
    requestIntervalRateLimitIncrement?: number
  }

  /** Session-only: continue bet list # after stop → start (not persisted). */
  _betIndexOffset?: number
}



export interface OriginalsProfileV2 {

  name: string

  options: OriginalsWorkbenchOptions

  lastUsed?: boolean

  favorite?: boolean

  loadOnStart?: boolean

  notes?: string

}



export const DEFAULT_WORKBENCH_OPTIONS: OriginalsWorkbenchOptions = {

  game: 'dice',

  initialBetSize: 0.01,

  betSize: 0.01,

  minBetSize: 0,

  onWin: 'reset',

  onLoss: 'reset',

  increaseOnWin: 0,

  increaseOnLoss: 0,

  stopOnProfit: 0,

  stopOnLoss: 0,

  numberOfBets: 0,

  targetSelectionMode: 'static',

  targetMultiplier: 2,

  betHigh: true,

  rollOver: true,

  isStopOnComboHit: false,

  comboParts: [],

  huntEnabled: false,

  huntMultiplier: 30,

  difficulty: 'easy',

  rounds: 1,

}



export function computeComboMultiplier(parts: ComboPart[]): number {

  if (!parts.length) return 0

  return parts.reduce((acc, p) => acc * Math.max(1.01, p.target || 1), 1)

}



export function recalculateComboBetSizes(parts: ComboPart[]): ComboPart[] {

  if (parts.length === 0) return []

  const out = parts.map((p) => ({ ...p }))

  for (let i = 1; i < out.length; i++) {

    const prev = out[i - 1]

    out[i].betSize = Math.max(0, prev.betSize * prev.target)

  }

  return out

}



export function createHuntMoonshotPreset(huntMult = 30, moonMults: number[] = [100, 1000, 9900]): OriginalsWorkbenchOptions {

  return {

    ...DEFAULT_WORKBENCH_OPTIONS,

    huntEnabled: true,

    huntMultiplier: huntMult,

    targetSelectionMode: 'combo',

    isStopOnComboHit: true,

    comboParts: moonMults.map((target, i) => ({

      target,

      betSize: i === 0 ? 0.01 : 0,

    })),

  }

}


