/**
 * Profil-Schema für Script Builder und Profil-Runner.
 */

export type OriginalsGame = 'dice' | 'limbo' | 'mines' | 'plinko' | 'keno'

export interface ProfileOptions {
  game: OriginalsGame
  initialBetSize: number
  betSize: number
  /** Verhalten nach Win. `b2b` = nächster Einsatz = letzter Payout (Parlay). */
  onWin: 'reset' | 'martingale' | 'increase' | 'b2b' | 'none'
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
  /** Session stoppt bei erreichtem Gesamt-Wagered (USD). 0 = aus. */
  stopOnTotalWagered: number
  /** B2B: nach X Gewinnen in der aktuellen Kette → Einsatz auf Base, Gewinn bleibt. 0 = aus. */
  b2bTakeProfitAfterWins: number
  /** B2B: wenn nächster Einsatz ≥ Kettenstart × X → Take Profit vor dem Spin. 0 = aus. */
  b2bTakeProfitAtChainMultiplier: number
  /** B2B: Ketten-Gewinn (Session-Δ seit Kettenstart) ≥ Kettenstart × (pct/100). 0 = aus. */
  b2bTakeProfitChainProfitPct: number
  /** B2B: Ketten-Gewinn in USD ≥ Wert → Take Profit. 0 = aus. */
  b2bTakeProfitChainProfitUsd: number
  /** Nach B2B Take Profit: Seed rotieren. */
  b2bRotateSeedOnTakeProfit: boolean
  /** Alle N Take Profits: Base-Einsatz um b2bEscalateBasePct % erhöhen (mehr Turnover). 0 = aus. */
  b2bEscalateBaseEveryTakeProfits: number
  b2bEscalateBasePct: number
  /** Obergrenze für Base nach Eskalation (USD). 0 = kein Cap. */
  b2bMaxBaseBetUsd: number
  /** Smart TP: wenn nächster Einsatz ÷ Base ≥ X (2 = 200%). 0 = aus. */
  b2bSmartTakeProfitAtMulti: number
  /** Smart TP: Ketten-Gewinn (USD seit Kettenstart) ≥ Wert. 0 = aus. */
  b2bSmartTakeProfitAtChainProfitUsd: number
  /** Smart TP: Ketten-Gewinn ≥ Base × (Wert/100), z. B. 200 = 200% der Base. 0 = aus. */
  b2bSmartTakeProfitAtChainProfitPctOfBase: number
  /** Smart TP: % des abgesicherten Anteils (vom Peel-Pool), Rest B2B-Reinvest. z. B. 40. */
  b2bSmartTakeProfitPeelPct: number
  isSeedChangeAfterRolls: boolean
  seedChangeAfterRolls: number
  /** Nach jedem Seed-Reset: Einsatz (USD) um diesen Betrag erhöhen (z. B. 0.01 = $0.01 pro Block). */
  increaseBetAfterSeedReset: number
  /** Bei X Verlusten in Folge: Seed rotieren (0 = aus). */
  seedResetOnLossStreak: number
  /** Bei jedem Verlust: Seed rotieren und Seed-Session (Block) neu starten. */
  resetSeedOnLoss: boolean
  /** Wenn Session-Verlust ≥ diesen USD-Betrag: Seed rotieren + Session zurücksetzen (0 = aus). */
  seedResetOnLossAmount: number
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
  /** Preroll → Heatmap → Attack wiederholen (Keno). */
  kenoHeatmapCycleEnabled: boolean
  kenoHeatmapPrerollBets: number
  kenoHeatmapAttackBets: number
  kenoHeatmapPrerollBetSize: number
  kenoHeatmapAttackBetSize: number
  kenoHeatmapPickCount: number
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
  plinkoRisk: 'low' | 'medium' | 'high' | 'expert'
}

export interface OriginalsProfile {
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
  stopOnTotalWagered: 0,
  b2bTakeProfitAfterWins: 0,
  b2bTakeProfitAtChainMultiplier: 0,
  b2bTakeProfitChainProfitPct: 0,
  b2bTakeProfitChainProfitUsd: 0,
  b2bRotateSeedOnTakeProfit: false,
  b2bEscalateBaseEveryTakeProfits: 0,
  b2bEscalateBasePct: 0,
  b2bMaxBaseBetUsd: 0,
  b2bSmartTakeProfitAtMulti: 0,
  b2bSmartTakeProfitAtChainProfitUsd: 0,
  b2bSmartTakeProfitAtChainProfitPctOfBase: 0,
  b2bSmartTakeProfitPeelPct: 0,
  isSeedChangeAfterRolls: false,
  seedChangeAfterRolls: 0,
  increaseBetAfterSeedReset: 0,
  seedResetOnLossStreak: 0,
  resetSeedOnLoss: false,
  seedResetOnLossAmount: 0,
  isVaultAllProfits: false,
  vaultProfitsThreshold: 0,
  risk: 'medium',
  numbers: [1, 2, 3, 4, 5, 6, 7, 8],
  randomNumbersFrom: 0,
  randomNumbersTo: 0,
  useHeatmapHotNumbers: false,
  heatmapHotNumbers: 5,
  heatmapRange: 39,
  kenoHeatmapCycleEnabled: false,
  kenoHeatmapPrerollBets: 100,
  kenoHeatmapAttackBets: 20,
  kenoHeatmapPrerollBetSize: 0.01,
  kenoHeatmapAttackBetSize: 0.1,
  kenoHeatmapPickCount: 4,
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
