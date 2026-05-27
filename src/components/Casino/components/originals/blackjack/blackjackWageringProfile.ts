/**
 * Ready-to-paste wagering profile: Originals → Script → Profile JSON.
 * Uses built-in basic strategy (European S17, DAS, late surrender).
 */
export const BLACKJACK_WAGERING_PROFILE = {
  name: 'Blackjack Basic Strategy Wagering',
  options: {
    game: 'blackjack',
    initialBetSize: 0.01,
    betSize: 0.01,
    onWin: 'reset',
    onLoss: 'reset',
    increaseOnWin: 0,
    increaseOnLoss: 0,
    stopOnProfit: 0,
    stopOnLoss: 0,
    isStopOnWinStreak: false,
    stopOnWinStreak: 0,
    isStopOnLossStreak: false,
    stopOnLossStreak: 0,
    isStopOnB2bStreak: false,
    stopOnB2bStreak: 0,
  },
} as const

/** Antebot-style one-liner script (Script tab). */
export const BLACKJACK_WAGERING_SCRIPT = `game = 'blackjack'
initialBetSize = 0.01
onWin = 'reset'
onLoss = 'reset'
`
