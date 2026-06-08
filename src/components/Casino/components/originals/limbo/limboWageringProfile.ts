/**
 * Limbo B2B — zufällige Ziel-Multiplikatoren (1–10×), Session-Profit & Wagering.
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

stopOnProfit = 200

stopOnLoss = 55

stopOnTotalWagered = 4500

b2bSmartTakeProfitAtMulti = 2.5

b2bSmartTakeProfitAtChainProfitUsd = 10

b2bSmartTakeProfitPeelPct = 50

`

export const LIMBO_B2B_RANDOM_MULTI_200_PROFILE_JSON = JSON.stringify(LIMBO_B2B_RANDOM_MULTI_200_PROFILE, null, 2)
