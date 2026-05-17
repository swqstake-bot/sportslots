/**
 * Selectable options for Originals (stop conditions, games, conditions, presets).
 */

export type OriginalsGameId = 'dice' | 'limbo' | 'mines' | 'plinko' | 'keno' | 'blackjack'

export const ORIGINALS_GAMES: { id: OriginalsGameId; label: string }[] = [
  { id: 'dice', label: 'Dice' },
  { id: 'limbo', label: 'Limbo' },
  { id: 'mines', label: 'Mines' },
  { id: 'plinko', label: 'Plinko' },
  { id: 'keno', label: 'Keno' },
  { id: 'blackjack', label: 'Blackjack' },
]

/** Stop condition types (dropdown instead of free text). */
export type StopConditionType =
  | ''
  | 'b2b'
  | 'xReds'
  | 'winStreak'
  | 'lossStreak'
  | 'xBets'
  | 'profitTier1'
  | 'profitTier2'
  | 'profitTier3'
  | 'profitAmount'
  | 'lossAmount'

export const STOP_CONDITION_OPTIONS: { value: StopConditionType; label: string }[] = [
  { value: '', label: 'Off' },
  { value: 'b2b', label: 'B2B (2 losses)' },
  { value: 'xReds', label: 'X reds in a row' },
  { value: 'winStreak', label: 'Win streak reached' },
  { value: 'lossStreak', label: 'Loss streak reached' },
  { value: 'xBets', label: 'After X bets' },
  { value: 'profitTier1', label: 'Profit Tier 1' },
  { value: 'profitTier2', label: 'Profit Tier 2' },
  { value: 'profitTier3', label: 'Profit Tier 3' },
  { value: 'profitAmount', label: 'Profit amount' },
  { value: 'lossAmount', label: 'Loss amount' },
]

/** Conditions for conditional game switch (per game). */
export type SwitchConditionType =
  | 'dice9Reds'
  | 'diceLossStreak'
  | 'diceXBets'
  | 'limboCrash4x50'
  | 'limboLossStreak'
  | 'minesGemsReached'
  | 'minesLossStreak'
  | 'plinkoDrops'
  | 'plinkoLossStreak'
  | 'kenoDraws'
  | 'kenoLossStreak'
  | 'lossStreak'
  | 'winStreak'
  | 'profitPct'
  | 'lossPct'
  | 'xBets'

/** Per Originals game: which conditions to show (for “from game”). */
export const SWITCH_CONDITIONS_BY_GAME: Record<OriginalsGameId, { value: SwitchConditionType; label: string; needsValue?: boolean }[]> = {
  dice: [
    { value: 'dice9Reds', label: '9 red dice' },
    { value: 'diceLossStreak', label: 'Dice loss streak', needsValue: true },
    { value: 'diceXBets', label: 'After X dice bets', needsValue: true },
    { value: 'lossStreak', label: 'Loss streak (global)', needsValue: true },
    { value: 'winStreak', label: 'Win streak (global)', needsValue: true },
    { value: 'profitPct', label: 'Profit %', needsValue: true },
    { value: 'lossPct', label: 'Loss %', needsValue: true },
  ],
  limbo: [
    { value: 'limboCrash4x50', label: '4× Limbo >50×' },
    { value: 'limboLossStreak', label: 'Limbo loss streak', needsValue: true },
    { value: 'lossStreak', label: 'Loss streak (global)', needsValue: true },
    { value: 'winStreak', label: 'Win streak (global)', needsValue: true },
    { value: 'profitPct', label: 'Profit %', needsValue: true },
    { value: 'lossPct', label: 'Loss %', needsValue: true },
  ],
  mines: [
    { value: 'minesGemsReached', label: 'X gems reached', needsValue: true },
    { value: 'minesLossStreak', label: 'Mines loss streak', needsValue: true },
    { value: 'lossStreak', label: 'Loss streak (global)', needsValue: true },
    { value: 'winStreak', label: 'Win streak (global)', needsValue: true },
    { value: 'profitPct', label: 'Profit %', needsValue: true },
    { value: 'lossPct', label: 'Loss %', needsValue: true },
  ],
  plinko: [
    { value: 'plinkoDrops', label: 'After X drops', needsValue: true },
    { value: 'plinkoLossStreak', label: 'Plinko loss streak', needsValue: true },
    { value: 'lossStreak', label: 'Loss streak (global)', needsValue: true },
    { value: 'winStreak', label: 'Win streak (global)', needsValue: true },
    { value: 'profitPct', label: 'Profit %', needsValue: true },
    { value: 'lossPct', label: 'Loss %', needsValue: true },
  ],
  keno: [
    { value: 'kenoDraws', label: 'After X keno draws', needsValue: true },
    { value: 'kenoLossStreak', label: 'Keno loss streak', needsValue: true },
    { value: 'lossStreak', label: 'Loss streak (global)', needsValue: true },
    { value: 'winStreak', label: 'Win streak (global)', needsValue: true },
    { value: 'profitPct', label: 'Profit %', needsValue: true },
    { value: 'lossPct', label: 'Loss %', needsValue: true },
  ],
  blackjack: [
    { value: 'lossStreak', label: 'Loss streak (global)', needsValue: true },
    { value: 'winStreak', label: 'Win streak (global)', needsValue: true },
    { value: 'xBets', label: 'After X bets', needsValue: true },
    { value: 'profitPct', label: 'Profit %', needsValue: true },
    { value: 'lossPct', label: 'Loss %', needsValue: true },
  ],
}

/** All condition types (fallback when no fromGame). */
export const SWITCH_CONDITION_OPTIONS: { value: SwitchConditionType; label: string }[] = [
  { value: 'dice9Reds', label: '9 red dice' },
  { value: 'diceLossStreak', label: 'Dice loss streak' },
  { value: 'limboCrash4x50', label: '4× Limbo >50×' },
  { value: 'lossStreak', label: 'Loss streak' },
  { value: 'winStreak', label: 'Win streak' },
  { value: 'profitPct', label: 'Profit %' },
  { value: 'lossPct', label: 'Loss %' },
]

/** Hybrid strategy presets. */
export const HYBRID_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Off' },
  { value: 'martingale_paroli', label: 'Martingale to -8%, then Paroli to +4%' },
  { value: 'martingale_flat', label: 'Martingale to -8%, then flat' },
  { value: 'paroli_flat', label: 'Paroli to +4%, then flat' },
  { value: 'custom', label: 'Custom (see description)' },
]

/** Rotation presets (which games, how many bets each). */
export const ROTATION_PRESETS: { id: string; label: string; config: { game: OriginalsGameId; count: number }[] }[] = [
  { id: 'dice_heavy', label: 'Dice-heavy', config: [{ game: 'dice', count: 400 }, { game: 'limbo', count: 100 }, { game: 'plinko', count: 50 }] },
  { id: 'balanced', label: 'Balanced', config: [{ game: 'dice', count: 200 }, { game: 'limbo', count: 150 }, { game: 'mines', count: 100 }, { game: 'plinko', count: 80 }, { game: 'keno', count: 70 }] },
  { id: 'mixed', label: 'Mixed', config: [{ game: 'dice', count: 150 }, { game: 'mines', count: 120 }, { game: 'plinko', count: 100 }] },
]

// --- Selectable presets (no free text) ---

export const BET_AMOUNT_OPTIONS = [
  { v: '0.0001', l: '0.0001' }, { v: '0.001', l: '0.001' }, { v: '0.01', l: '0.01' }, { v: '0.05', l: '0.05' }, { v: '0.1', l: '0.1' }, { v: '0.5', l: '0.5' }, { v: '1', l: '1' }, { v: '2', l: '2' }, { v: '5', l: '5' },
]
export const PCT_OPTIONS = [
  { v: 0, l: '0%' }, { v: 50, l: '50%' }, { v: 100, l: '100%' }, { v: 150, l: '150%' }, { v: 200, l: '200%' }, { v: -50, l: '-50%' }, { v: -100, l: '-100%' },
]
export const INCREASE_ON_LOSS_OPTIONS = [{ v: 0, l: '0%' }, { v: 50, l: '50%' }, { v: 100, l: '100%' }, { v: 150, l: '150%' }, { v: 200, l: '200%' }]
/** “Custom value” option for dropdowns with manual input. */
export const CUSTOM_OPTION = { v: 'custom' as const, l: 'Custom' }
export const CUSTOM_OPTION_NUM = { v: -1, l: 'Custom' }

export const RESET_WINS_OPTIONS = [{ v: 0, l: 'Off' }, { v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 10, l: '10' }]
export const RESET_LOSS_STREAK_OPTIONS = [{ v: 0, l: 'Off' }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' }, { v: 10, l: '10' }, { v: 12, l: '12' }]
export const STOP_PROFIT_OPTIONS = [{ v: '', l: 'Off' }, { v: '0.01', l: '0.01' }, { v: '0.02', l: '0.02' }, { v: '0.05', l: '0.05' }, { v: '0.1', l: '0.1' }, { v: '0.5', l: '0.5' }, { v: '1', l: '1' }]
export const STOP_LOSS_OPTIONS = [{ v: '', l: 'Off' }, { v: '-0.01', l: '-0.01' }, { v: '-0.02', l: '-0.02' }, { v: '-0.05', l: '-0.05' }, { v: '-0.1', l: '-0.1' }, { v: '-0.5', l: '-0.5' }]
export const STOP_AFTER_BETS_OPTIONS = [{ v: 0, l: 'Off' }, { v: 100, l: '100' }, { v: 500, l: '500' }, { v: 1000, l: '1k' }, { v: 5000, l: '5k' }, { v: 10000, l: '10k' }]
export const STREAK_NUM_OPTIONS = [{ v: 0, l: 'Off' }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' }, { v: 10, l: '10' }, { v: 12, l: '12' }]
export const STOP_CONDITION_VALUE_OPTIONS = [{ v: '3', l: '3' }, { v: '5', l: '5' }, { v: '8', l: '8' }, { v: '10', l: '10' }, { v: '12', l: '12' }]
export const PROFIT_LOSS_AMOUNT_OPTIONS = [{ v: '', l: '–' }, { v: '0.01', l: '0.01' }, { v: '0.02', l: '0.02' }, { v: '0.05', l: '0.05' }, { v: '0.1', l: '0.1' }]
export const CHANGE_CHANCE_STREAK_OPTIONS = [{ v: 0, l: 'Off' }, { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' }, { v: 10, l: '10' }]
export const CHANGE_CHANCE_VALUE_OPTIONS = [{ v: '', l: '–' }, { v: '1', l: '1%' }, { v: '5', l: '5%' }, { v: '10', l: '10%' }, { v: '25', l: '25%' }, { v: '49.5', l: '49.5%' }, { v: '75', l: '75%' }]
export const SEED_X_OPTIONS = [{ v: 0, l: 'Off' }, { v: 50, l: '50' }, { v: 100, l: '100' }, { v: 200, l: '200' }, { v: 500, l: '500' }]
export const VAULT_PROFIT_OPTIONS = [{ v: '', l: 'Off' }, { v: '0.01', l: '0.01' }, { v: '0.02', l: '0.02' }, { v: '0.05', l: '0.05' }, { v: '0.1', l: '0.1' }]
export const VAULT_AMOUNT_OPTIONS = [{ v: '', l: 'Off' }, { v: '0.01', l: '0.01' }, { v: '0.02', l: '0.02' }, { v: '0.05', l: '0.05' }]
export const DYNAMIC_BET_PCT_OPTIONS = [{ v: 0, l: 'Off' }, { v: 0.001, l: '0.001%' }, { v: 0.005, l: '0.005%' }, { v: 0.01, l: '0.01%' }, { v: 0.02, l: '0.02%' }]
export const KELLY_OPTIONS = [{ v: 0, l: 'Off' }, { v: 0.25, l: '0.25' }, { v: 0.5, l: '0.5' }, { v: 1, l: '1' }]
export const SESSION_CAP_OPTIONS = [{ v: 0, l: 'Off' }, { v: 10, l: '10%' }, { v: 25, l: '25%' }, { v: 50, l: '50%' }, { v: 100, l: '100%' }]
export const TIER_PCT_OPTIONS = [{ v: 5, l: '5%' }, { v: 7, l: '7%' }, { v: 10, l: '10%' }, { v: 12, l: '12%' }, { v: 15, l: '15%' }, { v: 20, l: '20%' }, { v: 30, l: '30%' }]
export const LOSS_RECOVERY_OPTIONS = [{ v: 0, l: 'Off' }, { v: 8, l: '8%' }, { v: 10, l: '10%' }, { v: 12, l: '12%' }, { v: 15, l: '15%' }, { v: 20, l: '20%' }]
export const DAILY_WEEKLY_LIMIT_OPTIONS = [{ v: '', l: 'Off' }, { v: '-0.01', l: '-0.01' }, { v: '-0.05', l: '-0.05' }, { v: '-0.1', l: '-0.1' }, { v: '-0.5', l: '-0.5' }]
export const CHANCE_OPTIONS = [{ v: '1', l: '1%' }, { v: '5', l: '5%' }, { v: '10', l: '10%' }, { v: '25', l: '25%' }, { v: '49.5', l: '49.5%' }, { v: '75', l: '75%' }, { v: '90', l: '90%' }]
export const DICE_LADDER_PRESETS = [{ v: '', l: 'Off' }, { v: '49.5,25,12,6', l: '49.5→25→12→6' }, { v: '50,20,5', l: '50→20→5' }, { v: '45,30,15', l: '45→30→15' }]
export const DICE_HIGHLOW_BETS_OPTIONS = [{ v: '', l: 'Off' }, { v: '2-5', l: '2–5' }, { v: '2-7', l: '2–7' }, { v: '3-6', l: '3–6' }]
export const KENO_DRAWS_OPTIONS = [{ v: 0, l: 'Off' }, { v: 50, l: '50' }, { v: 100, l: '100' }, { v: 200, l: '200' }]
export const KENO_RISK_PCT_OPTIONS = [{ v: 0, l: 'Off' }, { v: 5, l: '5%' }, { v: 10, l: '10%' }, { v: 15, l: '15%' }, { v: 20, l: '20%' }]
export const MINES_START_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ v: i + 1, l: String(i + 1) }))
export const MINES_AFTER_WIN_OPTIONS = [{ v: 0, l: '0' }, { v: 1, l: '+1' }, { v: 2, l: '+2' }]
export const MINES_AFTER_LOSS_OPTIONS = [{ v: 1, l: '-1' }, { v: 2, l: '-2' }]
export const PLINKO_DROPS_OPTIONS = [{ v: 0, l: 'Off' }, { v: 30, l: '30' }, { v: 50, l: '50' }, { v: 100, l: '100' }, { v: 200, l: '200' }]
export const CASHOUT_MULT_OPTIONS = [{ v: '', l: 'Off' }, { v: '1.5', l: '1.5×' }, { v: '2', l: '2×' }, { v: '2.5', l: '2.5×' }, { v: '3', l: '3×' }, { v: '4', l: '4×' }, { v: '5', l: '5×' }]
export const DUAL_PCT_OPTIONS = [{ v: 25, l: '25%' }, { v: 50, l: '50%' }, { v: 75, l: '75%' }]
export const DUAL_MULT_OPTIONS = [{ v: 1.5, l: '1.5×' }, { v: 1.8, l: '1.8×' }, { v: 2, l: '2×' }, { v: 2.5, l: '2.5×' }, { v: 3, l: '3×' }, { v: 4, l: '4×' }, { v: 4.2, l: '4.2×' }, { v: 5, l: '5×' }]
export const CRASH_MINMAX_OPTIONS = [{ v: '', l: 'Off' }, { v: '1.5', l: '1.5×' }, { v: '2', l: '2×' }, { v: '2.5', l: '2.5×' }, { v: '3', l: '3×' }, { v: '5', l: '5×' }]
export const TURBO_DELAY_OPTIONS = [{ v: 100, l: '100ms' }, { v: 200, l: '200ms' }, { v: 300, l: '300ms' }, { v: 400, l: '400ms' }]
export const TIER3_PAUSE_OPTIONS = [{ v: 1, l: '1h' }, { v: 2, l: '2h' }, { v: 4, l: '4h' }]
export const SUMMARY_EVERY_OPTIONS = [{ v: 0, l: 'Off' }, { v: 25, l: '25' }, { v: 50, l: '50' }, { v: 100, l: '100' }, { v: 200, l: '200' }]
export const TARGET_MULT_BANKROLL_OPTIONS = [{ v: 0, l: 'Off' }, { v: 5, l: '5%' }, { v: 10, l: '10%' }, { v: 15, l: '15%' }, { v: 20, l: '20%' }]
export const TARGET_MULT_VAL_OPTIONS = [{ v: 0, l: 'Off' }, { v: 10, l: '10×' }, { v: 20, l: '20×' }, { v: 30, l: '30×' }, { v: 50, l: '50×' }]

/** Multi tab: selectable condition value (streak / bets). */
export const SWITCH_VALUE_STREAK_OPTIONS = [{ v: '3', l: '3' }, { v: '5', l: '5' }, { v: '8', l: '8' }, { v: '10', l: '10' }, { v: '12', l: '12' }]
export const SWITCH_VALUE_PCT_OPTIONS = [{ v: '5', l: '5%' }, { v: '10', l: '10%' }, { v: '15', l: '15%' }, { v: '20', l: '20%' }, { v: '30', l: '30%' }]
