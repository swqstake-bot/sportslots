/**
 * Antebot-kompatibles Profil-Schema für Script Builder und Profil-Runner.
 */

export type OriginalsGame = 'dice' | 'limbo' | 'mines' | 'plinko' | 'keno'

export interface ProfileOptions {
  game: OriginalsGame
  initialBetSize: number
  betSize: number
  onWin: 'reset' | 'martingale' | 'increase' | 'none'
  increaseOnWin: number
  onLoss: 'reset' | 'martingale' | 'increase' | 'none'
  increaseOnLoss: number
  stopOnProfit: number
  stopOnLoss: number
  isStopOnWinStreak: boolean
  stopOnWinStreak: number
  isStopOnLossStreak: boolean
  stopOnLossStreak: number
  isStopOnB2bStreak: boolean
  stopOnB2bStreak: number
  isSeedChangeAfterRolls: boolean
  seedChangeAfterRolls: number
  /** Nach jedem Seed-Reset: Einsatz (USD) um diesen Betrag erhöhen (z. B. 0.01 = $0.01 pro Block). */
  increaseBetAfterSeedReset: number
  isVaultAllProfits: boolean
  vaultProfitsThreshold: number
  // Keno
  risk: 'low' | 'medium' | 'high' | 'classic'
  numbers: number[]
  randomNumbersFrom: number
  randomNumbersTo: number
  useHeatmapHotNumbers: boolean
  heatmapHotNumbers: number
  heatmapRange: number
  // Mines
  mines: number
  diamonds: number
  randomMinesFrom: number
  randomMinesTo: number
  randomDiamondsFrom: number
  randomDiamondsTo: number
  // Dice
  rollUnder: number
  rollOver: boolean
  // Limbo
  targetMultiplier: number
  // Plinko
  rows: number
  plinkoRisk: 'low' | 'medium' | 'high'
}

export interface AntebotProfile {
  name: string
  options: Partial<ProfileOptions>
  lastUsed?: boolean
  favorite?: boolean
  loadOnStart?: boolean
}

export const DEFAULT_PROFILE_OPTIONS: ProfileOptions = {
  game: 'keno',
  initialBetSize: 0.01,
  betSize: 0.01,
  onWin: 'reset',
  increaseOnWin: 0,
  onLoss: 'reset',
  increaseOnLoss: 0,
  stopOnProfit: 0,
  stopOnLoss: 0,
  isStopOnWinStreak: false,
  stopOnWinStreak: 0,
  isStopOnLossStreak: false,
  stopOnLossStreak: 0,
  isStopOnB2bStreak: false,
  stopOnB2bStreak: 2,
  isSeedChangeAfterRolls: false,
  seedChangeAfterRolls: 0,
  increaseBetAfterSeedReset: 0,
  isVaultAllProfits: false,
  vaultProfitsThreshold: 0,
  risk: 'medium',
  numbers: [1, 2, 3, 4, 5, 6, 7, 8],
  randomNumbersFrom: 0,
  randomNumbersTo: 0,
  useHeatmapHotNumbers: false,
  heatmapHotNumbers: 5,
  heatmapRange: 30,
  mines: 3,
  diamonds: 3,
  randomMinesFrom: 0,
  randomMinesTo: 0,
  randomDiamondsFrom: 0,
  randomDiamondsTo: 0,
  rollUnder: 49.5,
  rollOver: false,
  targetMultiplier: 2,
  rows: 16,
  plinkoRisk: 'low',
}
