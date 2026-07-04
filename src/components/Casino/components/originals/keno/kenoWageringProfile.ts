/**

 * Keno B2B — Wagering-Profile.

 */



export const KENO_B2B_INFINITY_WAGER_PROFILE = {

  name: 'Keno B2B Infinity Wager · Medium · 20k',

  options: {

    game: 'keno',

    risk: 'medium',

    initialBetSize: 0.06,

    betSize: 0.06,

    onWin: 'b2b',

    onLoss: 'reset',

    increaseOnWin: 0,

    increaseOnLoss: 0,

    randomNumbersFrom: 9,

    randomNumbersTo: 10,

    stopOnProfit: 0,

    stopOnLoss: 47,

    stopOnTotalWagered: 20000,

    isStopOnWinStreak: false,

    stopOnWinStreak: 0,

    isStopOnLossStreak: false,

    stopOnLossStreak: 0,

    isStopOnB2bStreak: false,

    stopOnB2bStreak: 0,

    isSeedChangeAfterRolls: false,

    seedChangeAfterRolls: 0,

    increaseBetAfterSeedReset: 0,

    resetSeedOnLoss: false,

    seedResetOnLossStreak: 0,

    seedResetOnLossAmount: 0,

  },

} as const



export const KENO_B2B_COMPLEX_TP_PROFILE = {

  name: 'Keno B2B Complex TP · Medium · 20k',

  options: {

    game: 'keno',

    risk: 'medium',

    initialBetSize: 0.06,

    betSize: 0.06,

    onWin: 'b2b',

    onLoss: 'reset',

    increaseOnWin: 0,

    increaseOnLoss: 0,

    randomNumbersFrom: 9,

    randomNumbersTo: 10,

    stopOnProfit: 0,

    stopOnLoss: 47,

    stopOnTotalWagered: 20000,

    isStopOnWinStreak: false,

    stopOnWinStreak: 0,

    isStopOnLossStreak: false,

    stopOnLossStreak: 0,

    isStopOnB2bStreak: false,

    stopOnB2bStreak: 0,

    b2bTakeProfitAfterWins: 5,

    b2bTakeProfitAtChainMultiplier: 8,

    b2bTakeProfitChainProfitPct: 0,

    b2bTakeProfitChainProfitUsd: 2,

    b2bRotateSeedOnTakeProfit: false,

    b2bEscalateBaseEveryTakeProfits: 4,

    b2bEscalateBasePct: 10,

    b2bMaxBaseBetUsd: 0.2,

    isSeedChangeAfterRolls: false,

    seedChangeAfterRolls: 0,

    increaseBetAfterSeedReset: 0,

    resetSeedOnLoss: false,

    seedResetOnLossStreak: 0,

    seedResetOnLossAmount: 0,

  },

} as const



/**

 * Keno High · 10 · B2B + Smart Take Profit.

 * Reinvestiert Gewinne; ab 200% Einsatz/Base, $12 Ketten-Gewinn oder 200% Ketten-Gewinn vs Base:

 * 40% des Peel-Pools sichern, 60% weiter als B2B.

 */

export const KENO_B2B_HIGH_10_500_PROFILE = {

  name: 'Keno B2B High · 10 · Smart TP · $500',

  options: {

    game: 'keno',

    risk: 'high',

    initialBetSize: 0.06,

    betSize: 0.06,

    onWin: 'b2b',

    onLoss: 'reset',

    increaseOnWin: 0,

    increaseOnLoss: 0,

    randomNumbersFrom: 10,

    randomNumbersTo: 10,

    stopOnProfit: 500,

    stopOnLoss: 48,

    stopOnTotalWagered: 0,

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

    b2bSmartTakeProfitAtMulti: 2,

    b2bSmartTakeProfitAtChainProfitUsd: 12,

    b2bSmartTakeProfitAtChainProfitPctOfBase: 200,

    b2bSmartTakeProfitPeelPct: 40,

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



export const KENO_B2B_INFINITY_WAGER_SCRIPT = `game = 'keno'

risk = 'medium'

initialBetSize = 0.06

betSize = 0.06

onWin = 'b2b'

onLoss = 'reset'

stopOnLoss = 47

stopOnTotalWagered = 20000

`



export const KENO_B2B_COMPLEX_TP_SCRIPT = `game = 'keno'

risk = 'medium'

initialBetSize = 0.06

betSize = 0.06

onWin = 'b2b'

onLoss = 'reset'

stopOnLoss = 47

stopOnTotalWagered = 20000

b2bTakeProfitAfterWins = 5

b2bTakeProfitAtChainMultiplier = 8

b2bTakeProfitChainProfitUsd = 2

b2bEscalateBaseEveryTakeProfits = 4

b2bEscalateBasePct = 10

b2bMaxBaseBetUsd = 0.2

`



export const KENO_B2B_HIGH_10_500_SCRIPT = `game = 'keno'

risk = 'high'

initialBetSize = 0.06

betSize = 0.06

onWin = 'b2b'

onLoss = 'reset'

stopOnProfit = 500

stopOnLoss = 48

randomNumbersFrom = 10

randomNumbersTo = 10

b2bSmartTakeProfitAtMulti = 2

b2bSmartTakeProfitAtChainProfitUsd = 12

b2bSmartTakeProfitAtChainProfitPctOfBase = 200

b2bSmartTakeProfitPeelPct = 40

`



export const KENO_B2B_INFINITY_WAGER_PROFILE_JSON = JSON.stringify(KENO_B2B_INFINITY_WAGER_PROFILE, null, 2)

export const KENO_B2B_COMPLEX_TP_PROFILE_JSON = JSON.stringify(KENO_B2B_COMPLEX_TP_PROFILE, null, 2)

export const KENO_B2B_HIGH_10_500_PROFILE_JSON = JSON.stringify(KENO_B2B_HIGH_10_500_PROFILE, null, 2)



/** Keno Heatmap-Zyklus: 100× Preroll @ 1¢ → 20× Attack @ 10¢ mit Hot Picks, wiederholen. */

export const KENO_HEATMAP_CYCLE_PROFILE = {

  name: 'Keno Heatmap Cycle · 4 picks · 100/20',

  options: {

    game: 'keno',

    risk: 'medium',

    initialBetSize: 0.1,

    betSize: 0.1,

    onWin: 'reset',

    onLoss: 'reset',

    kenoHeatmapCycleEnabled: true,

    kenoHeatmapPrerollBets: 100,

    kenoHeatmapAttackBets: 20,

    kenoHeatmapPrerollBetSize: 0.01,

    kenoHeatmapAttackBetSize: 0.1,

    kenoHeatmapPickCount: 4,

    heatmapRange: 39,

    stopOnProfit: 0,

    stopOnLoss: 50,

    stopOnTotalWagered: 0,

  },

} as const



export const KENO_HEATMAP_CYCLE_SCRIPT = `game = 'keno'

risk = 'medium'

initialBetSize = 0.10

onWin = 'reset'

onLoss = 'reset'

kenoHeatmapCycleEnabled = true

kenoHeatmapPrerollBets = 100

kenoHeatmapAttackBets = 20

kenoHeatmapPrerollBetSize = 0.01

kenoHeatmapAttackBetSize = 0.10

kenoHeatmapPickCount = 4

heatmapRange = 39

stopOnLoss = 50

`



export const KENO_HEATMAP_CYCLE_PROFILE_JSON = JSON.stringify(KENO_HEATMAP_CYCLE_PROFILE, null, 2)

