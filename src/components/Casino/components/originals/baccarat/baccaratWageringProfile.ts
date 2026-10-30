/**
 * Baccarat hedge wagering — equal Player + Banker each round (fast volume, small commission bleed).
 */

export const BACCARAT_HEDGE_WAGER_65K_PROFILE = {
  name: 'Baccarat Hedge · $65k wagered · $50/side',
  options: {
    game: 'baccarat',
    baccaratMode: 'both',
    initialBetSize: 50,
    betSize: 50,
    onWin: 'reset',
    onLoss: 'reset',
    increaseOnWin: 0,
    increaseOnLoss: 0,
    stopOnProfit: 0,
    stopOnLoss: 900,
    stopOnTotalWagered: 65000,
    isStopOnWinStreak: false,
    stopOnWinStreak: 0,
    isStopOnLossStreak: false,
    stopOnLossStreak: 0,
    isStopOnB2bStreak: false,
    stopOnB2bStreak: 0,
    requestInterval: 100,
  },
} as const

export const BACCARAT_HEDGE_WAGER_65K_SCRIPT = `game = 'baccarat'

# Same amount on Player AND Banker each round (betSize = per side)
baccaratMode = 'both'

initialBetSize = 50

betSize = 50

onWin = 'reset'

onLoss = 'reset'

stopOnTotalWagered = 65000

# Commission bleed ~0.5–1% of wagered; keep room so the run finishes
stopOnLoss = 900

stopOnProfit = 0

requestInterval = 100

`

export const BACCARAT_HEDGE_WAGER_65K_PROFILE_JSON = JSON.stringify(BACCARAT_HEDGE_WAGER_65K_PROFILE, null, 2)
