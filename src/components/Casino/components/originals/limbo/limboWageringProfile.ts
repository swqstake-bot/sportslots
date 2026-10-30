/**
 * Limbo B2B — zufällige Ziel-Multiplikatoren, Session-Profit & Wagering.
 * Random-Multi: log-uniform (häufig niedrige ×, seltener High-Hunt).
 */

export const LIMBO_B2B_RANDOM_MULTI_200_PROFILE = {
  name: 'Limbo B2B Random 1–10× · $200 · Smart TP $10',
  options: {
    game: 'limbo',
    initialBetSize: 0.05,
    betSize: 0.05,
    onWin: 'b2b',
    onLoss: 'reset',
    increaseOnWin: 0,
    increaseOnLoss: 0,
    targetMultiplier: 3,
    targetMultiplierFrom: 1.5,
    targetMultiplierTo: 10,
    targetMultiplierSample: 'log',
    targetSelectionMode: 'random',
    stopOnProfit: 200,
    stopOnLoss: 55,
    stopOnTotalWagered: 4500,
    isStopOnWinStreak: false,
    stopOnWinStreak: 0,
    isStopOnLossStreak: false,
    stopOnLossStreak: 0,
    isStopOnB2bStreak: false,
    stopOnB2bStreak: 0,
    b2bTakeProfitAfterWins: 0,
    b2bTakeProfitAtChainMultiplier: 0,
    b2bTakeProfitChainProfitPct: 0,
    b2bTakeProfitChainProfitUsd: 0,
    b2bSmartTakeProfitAtMulti: 2.5,
    b2bSmartTakeProfitAtChainProfitUsd: 10,
    b2bSmartTakeProfitAtChainProfitPctOfBase: 0,
    b2bSmartTakeProfitPeelPct: 50,
    b2bRotateSeedOnTakeProfit: false,
    b2bEscalateBaseEveryTakeProfits: 0,
    b2bEscalateBasePct: 0,
    b2bMaxBaseBetUsd: 0,
    isSeedChangeAfterRolls: false,
    seedChangeAfterRolls: 0,
    increaseBetAfterSeedReset: 0,
    resetSeedOnLoss: false,
    seedResetOnLossStreak: 0,
    seedResetOnLossAmount: 0,
  },
} as const

export const LIMBO_B2B_RANDOM_MULTI_200_SCRIPT = `game = 'limbo'

initialBetSize = 0.05

betSize = 0.05

onWin = 'b2b'

onLoss = 'reset'

targetMultiplierFrom = 1.5

targetMultiplierTo = 10

targetMultiplierSample = 'log'

targetSelectionMode = 'random'

stopOnProfit = 200

stopOnLoss = 55

stopOnTotalWagered = 4500

b2bSmartTakeProfitAtMulti = 2.5

b2bSmartTakeProfitAtChainProfitUsd = 10

b2bSmartTakeProfitPeelPct = 50

`

export const LIMBO_B2B_RANDOM_MULTI_200_PROFILE_JSON = JSON.stringify(LIMBO_B2B_RANDOM_MULTI_200_PROFILE, null, 2)

/**
 * Limbo B2B Smart Hunt → $500
 * Log-random 1.1–15× (oft ~1.3–3×, gelegentlich 8–15× Hunt).
 * Smart peel: ~50% absichern sobald Stake ≥2.2× Base ODER Ketten-Profit ≥$18, Rest bleibt B2B.
 */
export const LIMBO_B2B_SMART_HUNT_500_PROFILE = {
  name: 'Limbo B2B Smart Hunt · $500 · Peel 50%',
  options: {
    game: 'limbo',
    initialBetSize: 0.08,
    betSize: 0.08,
    onWin: 'b2b',
    onLoss: 'reset',
    increaseOnWin: 0,
    increaseOnLoss: 0,
    targetMultiplier: 2,
    targetMultiplierFrom: 1.1,
    targetMultiplierTo: 15,
    targetMultiplierSample: 'log',
    targetSelectionMode: 'random',
    stopOnProfit: 500,
    stopOnLoss: 140,
    stopOnTotalWagered: 14000,
    isStopOnWinStreak: false,
    stopOnWinStreak: 0,
    isStopOnLossStreak: false,
    stopOnLossStreak: 0,
    isStopOnB2bStreak: false,
    stopOnB2bStreak: 0,
    b2bTakeProfitAfterWins: 0,
    b2bTakeProfitAtChainMultiplier: 0,
    b2bTakeProfitChainProfitPct: 0,
    b2bTakeProfitChainProfitUsd: 0,
    b2bSmartTakeProfitAtMulti: 2.2,
    b2bSmartTakeProfitAtChainProfitUsd: 18,
    b2bSmartTakeProfitAtChainProfitPctOfBase: 200,
    b2bSmartTakeProfitPeelPct: 50,
    b2bRotateSeedOnTakeProfit: true,
    b2bEscalateBaseEveryTakeProfits: 5,
    b2bEscalateBasePct: 12,
    b2bMaxBaseBetUsd: 0.35,
    isSeedChangeAfterRolls: false,
    seedChangeAfterRolls: 0,
    increaseBetAfterSeedReset: 0,
    resetSeedOnLoss: false,
    seedResetOnLossStreak: 0,
    seedResetOnLossAmount: 0,
  },
} as const

export const LIMBO_B2B_SMART_HUNT_500_SCRIPT = `game = 'limbo'

initialBetSize = 0.08

betSize = 0.08

onWin = 'b2b'

onLoss = 'reset'

# Log-Zufall: oft 1.1–3×, seltener 8–15× Hunt
targetMultiplierFrom = 1.1

targetMultiplierTo = 15

targetMultiplierSample = 'log'

targetSelectionMode = 'random'

stopOnProfit = 500

stopOnLoss = 140

stopOnTotalWagered = 14000

# Smart peel: absichern, Rest weiter B2B
b2bSmartTakeProfitAtMulti = 2.2

b2bSmartTakeProfitAtChainProfitUsd = 18

b2bSmartTakeProfitAtChainProfitPctOfBase = 200

b2bSmartTakeProfitPeelPct = 50

b2bRotateSeedOnTakeProfit = true

# Base leicht hochziehen nach mehreren Peels (Cap 0.35)
b2bEscalateBaseEveryTakeProfits = 5

b2bEscalateBasePct = 12

b2bMaxBaseBetUsd = 0.35

`

export const LIMBO_B2B_SMART_HUNT_500_PROFILE_JSON = JSON.stringify(LIMBO_B2B_SMART_HUNT_500_PROFILE, null, 2)
