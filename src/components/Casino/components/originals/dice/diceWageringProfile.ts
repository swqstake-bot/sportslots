/**
 * Dice wagering profiles — Script tab + Profile JSON (recovery / rotation).
 * Bet sizes are USD; converted to selected currency at runtime.
 */

/** High-turnover Dice B2B @ 2× with smart take-profit peel. */
export const DICE_B2B_WAGER_PROFILE = {
  name: 'Dice B2B Wager · 2× · Smart TP · 15k',
  options: {
    game: 'dice',
    initialBetSize: 0.04,
    betSize: 0.04,
    targetMultiplier: 2,
    rollUnder: 49.5,
    rollOver: false,
    onWin: 'b2b',
    onLoss: 'reset',
    increaseOnWin: 0,
    increaseOnLoss: 0,
    stopOnProfit: 0,
    stopOnLoss: 35,
    stopOnTotalWagered: 15000,
    isStopOnWinStreak: false,
    stopOnWinStreak: 0,
    isStopOnLossStreak: false,
    stopOnLossStreak: 0,
    isStopOnB2bStreak: false,
    stopOnB2bStreak: 0,
    b2bSmartTakeProfitAtMulti: 2.5,
    b2bSmartTakeProfitAtChainProfitUsd: 8,
    b2bSmartTakeProfitAtChainProfitPctOfBase: 150,
    b2bSmartTakeProfitPeelPct: 45,
    b2bRotateSeedOnTakeProfit: true,
    b2bEscalateBaseEveryTakeProfits: 3,
    b2bEscalateBasePct: 8,
    b2bMaxBaseBetUsd: 0.12,
    isSeedChangeAfterRolls: true,
    seedChangeAfterRolls: 150,
    increaseBetAfterSeedReset: 0.005,
    resetSeedOnLoss: false,
    seedResetOnLossStreak: 8,
    seedResetOnLossAmount: 0,
  },
} as const

export const DICE_B2B_WAGER_SCRIPT = `game = 'dice'
initialBetSize = 0.04
betSize = 0.04
onWin = 'b2b'
onLoss = 'reset'
targetMultiplier = 2
stopOnLoss = 35
stopOnTotalWagered = 15000
b2bSmartTakeProfitAtMulti = 2.5
b2bSmartTakeProfitAtChainProfitUsd = 8
b2bSmartTakeProfitPeelPct = 45
isSeedChangeAfterRolls = true
seedChangeAfterRolls = 150
increaseBetAfterSeedReset = 0.005
`

/**
 * Wager on Dice (2× B2B); after 6 losses in a row switch to Limbo recovery (4× martingale).
 * Returns to Dice when session profit is back to ≥ 0.
 */
export const DICE_RECOVERY_LIMBO_PROFILE = {
  name: 'Dice B2B · Limbo Recovery · 6-Loss Trigger',
  options: {
    game: 'dice',
    initialBetSize: 0.04,
    betSize: 0.04,
    targetMultiplier: 2,
    rollUnder: 49.5,
    rollOver: false,
    onWin: 'b2b',
    onLoss: 'reset',
    increaseOnWin: 0,
    increaseOnLoss: 0,
    stopOnProfit: 0,
    stopOnLoss: 40,
    stopOnTotalWagered: 20000,
    b2bSmartTakeProfitAtMulti: 2.2,
    b2bSmartTakeProfitAtChainProfitUsd: 6,
    b2bSmartTakeProfitPeelPct: 50,
    b2bRotateSeedOnTakeProfit: true,
    isSeedChangeAfterRolls: true,
    seedChangeAfterRolls: 200,
    recoveryTrigger: 'lossStreak',
    recoveryTriggerValue: 6,
    recoveryEndTrigger: 'profitNonNegative',
    recoveryEndValue: 1,
    recoveryOptions: {
      game: 'limbo',
      initialBetSize: 0.07,
      betSize: 0.07,
      targetMultiplier: 4,
      onWin: 'reset',
      onLoss: 'martingale',
      increaseOnLoss: 0,
    },
  },
} as const

/**
 * Alternating rotation: bulk Dice wager → Limbo recovery burst → tighter Dice hunt.
 * No streak trigger — predictable stage cycling for long sessions.
 */
export const DICE_ROTATION_HYBRID_PROFILE = {
  name: 'Dice Rotation · Wager → Limbo Recover → Hunt',
  options: {
    game: 'dice',
    initialBetSize: 0.03,
    betSize: 0.03,
    targetMultiplier: 2,
    rollUnder: 49.5,
    onWin: 'b2b',
    onLoss: 'reset',
    stopOnProfit: 0,
    stopOnLoss: 45,
    stopOnTotalWagered: 25000,
    b2bSmartTakeProfitAtMulti: 2,
    b2bSmartTakeProfitAtChainProfitUsd: 5,
    b2bSmartTakeProfitPeelPct: 40,
    isSeedChangeAfterRolls: true,
    seedChangeAfterRolls: 250,
    rotationStages: [
      {
        game: 'dice',
        bets: 400,
        options: {
          targetMultiplier: 1.98,
          rollUnder: 50,
          onWin: 'b2b',
          onLoss: 'reset',
          initialBetSize: 0.03,
          betSize: 0.03,
        },
      },
      {
        game: 'limbo',
        bets: 60,
        options: {
          targetMultiplier: 3.5,
          onWin: 'b2b',
          onLoss: 'increase',
          increaseOnLoss: 35,
          initialBetSize: 0.05,
          betSize: 0.05,
          b2bSmartTakeProfitAtMulti: 2.5,
          b2bSmartTakeProfitAtChainProfitUsd: 4,
          b2bSmartTakeProfitPeelPct: 60,
        },
      },
      {
        game: 'dice',
        bets: 120,
        options: {
          targetMultiplier: 3,
          rollUnder: 33,
          onWin: 'reset',
          onLoss: 'martingale',
          initialBetSize: 0.02,
          betSize: 0.02,
        },
      },
    ],
  },
} as const

/**
 * Aggressive recovery: Dice flat wager, on deep drawdown switch to high-chance Dice martingale.
 */
export const DICE_SELF_RECOVERY_PROFILE = {
  name: 'Dice Wager · Self-Recovery 1.5× Martingale',
  options: {
    game: 'dice',
    initialBetSize: 0.05,
    betSize: 0.05,
    targetMultiplier: 2,
    rollUnder: 49.5,
    onWin: 'b2b',
    onLoss: 'reset',
    stopOnProfit: 0,
    stopOnLoss: 50,
    stopOnTotalWagered: 18000,
    b2bSmartTakeProfitAtMulti: 2.5,
    b2bSmartTakeProfitPeelPct: 35,
    recoveryTrigger: 'profitBelow',
    recoveryTriggerValue: -12,
    recoveryEndTrigger: 'winStreak',
    recoveryEndValue: 2,
    recoveryOptions: {
      game: 'dice',
      initialBetSize: 0.08,
      betSize: 0.08,
      targetMultiplier: 1.5,
      rollUnder: 66,
      onWin: 'reset',
      onLoss: 'martingale',
    },
  },
} as const

export const DICE_B2B_WAGER_PROFILE_JSON = JSON.stringify(DICE_B2B_WAGER_PROFILE, null, 2)
export const DICE_RECOVERY_LIMBO_PROFILE_JSON = JSON.stringify(DICE_RECOVERY_LIMBO_PROFILE, null, 2)
export const DICE_ROTATION_HYBRID_PROFILE_JSON = JSON.stringify(DICE_ROTATION_HYBRID_PROFILE, null, 2)
export const DICE_SELF_RECOVERY_PROFILE_JSON = JSON.stringify(DICE_SELF_RECOVERY_PROFILE, null, 2)
