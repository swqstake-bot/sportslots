/**
 * Einstellungen pro Spiel + gemeinsame Limits. Kein Delay/Jitter, kein Seed nach Bonus.
 * Stop Conditions wählbar (B2B, X Reds, …). Spiel-spezifische Blöcke nur bei activeGame.
 */

import { useState, useMemo } from 'react'
import type { OriginalsGameId } from './originalsConstants'
import {
  STOP_CONDITION_OPTIONS,
  type StopConditionType,
  BET_AMOUNT_OPTIONS,
  INCREASE_ON_LOSS_OPTIONS,
  PCT_OPTIONS,
  RESET_WINS_OPTIONS,
  RESET_LOSS_STREAK_OPTIONS,
  STOP_PROFIT_OPTIONS,
  STOP_LOSS_OPTIONS,
  STOP_AFTER_BETS_OPTIONS,
  STREAK_NUM_OPTIONS,
  STOP_CONDITION_VALUE_OPTIONS,
  PROFIT_LOSS_AMOUNT_OPTIONS,
  CHANGE_CHANCE_STREAK_OPTIONS,
  CHANGE_CHANCE_VALUE_OPTIONS,
  SEED_X_OPTIONS,
  VAULT_PROFIT_OPTIONS,
  VAULT_AMOUNT_OPTIONS,
  DYNAMIC_BET_PCT_OPTIONS,
  KELLY_OPTIONS,
  SESSION_CAP_OPTIONS,
  TIER_PCT_OPTIONS,
  LOSS_RECOVERY_OPTIONS,
  DAILY_WEEKLY_LIMIT_OPTIONS,
  CHANCE_OPTIONS,
  DICE_LADDER_PRESETS,
  DICE_HIGHLOW_BETS_OPTIONS,
  TARGET_MULT_BANKROLL_OPTIONS,
  TARGET_MULT_VAL_OPTIONS,
  KENO_DRAWS_OPTIONS,
  KENO_RISK_PCT_OPTIONS,
  MINES_START_OPTIONS,
  MINES_AFTER_WIN_OPTIONS,
  MINES_AFTER_LOSS_OPTIONS,
  PLINKO_DROPS_OPTIONS,
  CASHOUT_MULT_OPTIONS,
  DUAL_PCT_OPTIONS,
  DUAL_MULT_OPTIONS,
  CRASH_MINMAX_OPTIONS,
  TURBO_DELAY_OPTIONS,
  TIER3_PAUSE_OPTIONS,
  SUMMARY_EVERY_OPTIONS,
  CUSTOM_OPTION,
} from './originalsConstants'

export interface OriginalsSettingsState {
  baseBet: string
  nextBet: string
  chanceOrMultiplier: string
  increaseOnLossPct: number
  increaseOnWinPct: number
  resetAfterWins: number
  resetAfterLossStreak: number
  changeChanceAfterLossStreak: number
  changeChanceNewValue: string
  stopOnProfit: string
  stopOnLoss: string
  stopAfterBets: number
  stopOnWinStreak: number
  stopOnLossStreak: number
  stopConditionType: StopConditionType
  stopConditionValue: string
  seedChangeEveryXBets: number
  seedChangeOnLoss: boolean
  seedChangeAfterWins: number
  seedChangeAfterLosses: number
  vaultAutoDepositAtProfit: string
  dynamicBaseBetPct: number
  kellyFraction: number
  sessionBankrollCapPct: number
  profitGoalTier1Pct: number
  profitGoalTier2Pct: number
  profitGoalTier3Pct: number
  lossRecoveryDrawdownPct: number
  dailyLossLimit: string
  weeklyLossLimit: string
  diceHighLowRandomizerAfterBets: string
  soundAlertsEnabled: boolean
  telegramWebhook: string
  discordWebhook: string
  serverSeedHashCheck: boolean
  gameRotationConfig: string
  conditionalGameSwitch: string
  hybridStrategies: string
  streakBasedMode: boolean
  heatMapHotColdMode: boolean
  diceChanceLadder: string
  diceTargetMultiplierBankrollPct: number
  diceTargetMultiplierValue: number
  kenoSmartPickerDraws: number
  kenoPatternAvoider: boolean
  kenoAutoRiskSwitchPct: number
  minesDynamicMineStart: number
  minesDynamicMineAfterWin: number
  minesDynamicMineAfterLoss: number
  minesGridHeatmap: boolean
  plinkoRiskRowsSwitch: boolean
  plinkoPathAnalyzerDrops: number
  plinkoBallRandomizer: boolean
  autoCashoutMultiplier: string
  dualCashout1Pct: number
  dualCashout1Mult: number
  dualCashout2Pct: number
  dualCashout2Mult: number
  crashMinCashout: string
  crashMaxCashout: string
  crashAggressive: boolean
  profitGoalTier3PauseHours: number
  liveProfitChart: boolean
  sessionReplayExport: boolean
  betsSummaryEveryXBets: number
  aiStatMode: boolean
  vaultAutoTopupAmount: string
  rtpVarianceTracker: boolean
  crashGreenRedStreakPredict: boolean
  turboModeDelayMs: number
  /** Multi-Tab: Pro-Spiel-Parameter für Rotation. */
  multiDiceChance: number
  multiLimboMultiplier: number
  multiMinesCount: number
  multiPlinkoRows: number
  multiPlinkoRisk: string
  multiKenoPicks: number
  multiKenoRisk: string
}

export const defaultOriginalsSettings: OriginalsSettingsState = {
  baseBet: '0.01',
  nextBet: '0.01',
  chanceOrMultiplier: '49.5',
  increaseOnLossPct: 100,
  increaseOnWinPct: 0,
  resetAfterWins: 1,
  resetAfterLossStreak: 8,
  changeChanceAfterLossStreak: 0,
  changeChanceNewValue: '',
  stopOnProfit: '',
  stopOnLoss: '',
  stopAfterBets: 0,
  stopOnWinStreak: 0,
  stopOnLossStreak: 0,
  stopConditionType: '',
  stopConditionValue: '',
  seedChangeEveryXBets: 0,
  seedChangeOnLoss: false,
  seedChangeAfterWins: 0,
  seedChangeAfterLosses: 0,
  vaultAutoDepositAtProfit: '',
  dynamicBaseBetPct: 0,
  kellyFraction: 0,
  sessionBankrollCapPct: 0,
  profitGoalTier1Pct: 5,
  profitGoalTier2Pct: 15,
  profitGoalTier3Pct: 30,
  lossRecoveryDrawdownPct: 12,
  dailyLossLimit: '',
  weeklyLossLimit: '',
  diceHighLowRandomizerAfterBets: '',
  soundAlertsEnabled: false,
  telegramWebhook: '',
  discordWebhook: '',
  serverSeedHashCheck: false,
  gameRotationConfig: '',
  conditionalGameSwitch: '',
  hybridStrategies: '',
  streakBasedMode: false,
  heatMapHotColdMode: false,
  diceChanceLadder: '',
  diceTargetMultiplierBankrollPct: 0,
  diceTargetMultiplierValue: 0,
  kenoSmartPickerDraws: 0,
  kenoPatternAvoider: false,
  kenoAutoRiskSwitchPct: 0,
  minesDynamicMineStart: 3,
  minesDynamicMineAfterWin: 1,
  minesDynamicMineAfterLoss: 1,
  minesGridHeatmap: false,
  plinkoRiskRowsSwitch: false,
  plinkoPathAnalyzerDrops: 0,
  plinkoBallRandomizer: false,
  autoCashoutMultiplier: '',
  dualCashout1Pct: 50,
  dualCashout1Mult: 1.8,
  dualCashout2Pct: 50,
  dualCashout2Mult: 4.2,
  crashMinCashout: '',
  crashMaxCashout: '',
  crashAggressive: false,
  profitGoalTier3PauseHours: 1,
  liveProfitChart: true,
  sessionReplayExport: false,
  betsSummaryEveryXBets: 50,
  aiStatMode: false,
  vaultAutoTopupAmount: '',
  rtpVarianceTracker: false,
  crashGreenRedStreakPredict: false,
  turboModeDelayMs: 400,
  multiDiceChance: 49.5,
  multiLimboMultiplier: 2,
  multiMinesCount: 3,
  multiPlinkoRows: 16,
  multiPlinkoRisk: 'low',
  multiKenoPicks: 5,
  multiKenoRisk: 'low',
}

interface OriginalsSettingsProps {
  value?: Partial<OriginalsSettingsState>
  onChange?: (s: OriginalsSettingsState) => void
  showChance?: boolean
  showMultiplier?: boolean
  currency?: string
  /** Nur die Optionen für dieses Spiel anzeigen (Dice/Keno/Mines/Plinko/Limbo). */
  activeGame?: OriginalsGameId
}

export function OriginalsSettings({
  value = {},
  onChange,
  showChance = true,
  showMultiplier = true,
  activeGame = 'dice',
}: OriginalsSettingsProps) {
  const [open, setOpen] = useState(false)
  const s = useMemo(
    () => ({ ...defaultOriginalsSettings, ...value }),
    [value]
  )

  const update = (next: Partial<OriginalsSettingsState>) => {
    onChange?.({ ...s, ...next })
  }

  const inputCls = 'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none'
  const labelCls = 'block text-xs text-[var(--text-muted)] mb-0.5'
  const sel = (opts: { v: string | number; l: string }[], val: string | number, onChange: (v: string | number) => void) => {
    const inList = opts.some((x) => String(x.v) === String(val))
    const displayVal = inList ? val : opts[0]?.v
    return (
      <select value={String(displayVal)} onChange={(e) => { const o = opts.find((x) => String(x.v) === e.target.value); if (o) onChange(o.v) }} className={inputCls}>
        {opts.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
      </select>
    )
  }

  /** Dropdown mit letzter Option „Eigener Wert“; bei Auswahl erscheint Eingabefeld. */
  const selWithCustom = (
    opts: { v: string | number; l: string }[],
    val: number,
    onChange: (v: number) => void,
    min = 0,
    max = 99999
  ) => {
    const inList = opts.some((x) => Number(x.v) === Number(val))
    const isCustom = !inList
    const numVal = Number(val) || 0
    return (
      <div className="flex gap-1 flex-wrap items-center">
        <select
          value={inList ? String(val) : CUSTOM_OPTION.v}
          onChange={(e) => {
            if (e.target.value === CUSTOM_OPTION.v) onChange(numVal || Number(opts[0]?.v) || 0)
            else onChange(Number(e.target.value))
          }}
          className={inputCls}
          style={{ minWidth: '5rem' }}
        >
          {opts.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
          <option value={CUSTOM_OPTION.v}>{CUSTOM_OPTION.l}</option>
        </select>
        {isCustom && (
          <input
            type="number"
            min={min}
            max={max}
            value={numVal}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            className={inputCls}
            style={{ width: '4.5rem' }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden bg-[var(--bg-elevated)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-deep)]/50"
      >
        <span>Strategie & Limits</span>
        <span className="text-[var(--text-muted)]">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-[var(--border-subtle)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
            <div><label className={labelCls}>Base Bet</label>{sel(BET_AMOUNT_OPTIONS, BET_AMOUNT_OPTIONS.some((o) => o.v === s.baseBet) ? s.baseBet : '0.01', (v) => update({ baseBet: String(v) }))}</div>
            <div><label className={labelCls}>Next Bet</label>{sel(BET_AMOUNT_OPTIONS, BET_AMOUNT_OPTIONS.some((o) => o.v === s.nextBet) ? s.nextBet : '0.01', (v) => update({ nextBet: String(v) }))}</div>
            {(showChance || showMultiplier) && <div><label className={labelCls}>{showChance ? 'Chance %' : 'Mult.'}</label>{sel(CHANCE_OPTIONS, CHANCE_OPTIONS.some((o) => o.v === s.chanceOrMultiplier) ? s.chanceOrMultiplier : '49.5', (v) => update({ chanceOrMultiplier: String(v) }))}</div>}
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Martingale</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>+ on Loss %</label>{sel(INCREASE_ON_LOSS_OPTIONS, s.increaseOnLossPct, (v) => update({ increaseOnLossPct: Number(v) }))}</div>
              <div><label className={labelCls}>+ on Win %</label>{sel(PCT_OPTIONS, s.increaseOnWinPct, (v) => update({ increaseOnWinPct: Number(v) }))}</div>
              <div><label className={labelCls}>Reset nach Wins</label>{selWithCustom(RESET_WINS_OPTIONS, s.resetAfterWins, (v) => update({ resetAfterWins: v }), 0, 999)}</div>
              <div><label className={labelCls}>Reset Loss-Streak</label>{selWithCustom(RESET_LOSS_STREAK_OPTIONS, s.resetAfterLossStreak, (v) => update({ resetAfterLossStreak: v }), 0, 99)}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Stop & Safety</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Profit</label>{sel(STOP_PROFIT_OPTIONS, s.stopOnProfit || '', (v) => update({ stopOnProfit: String(v) }))}</div>
              <div><label className={labelCls}>Loss</label>{sel(STOP_LOSS_OPTIONS, s.stopOnLoss || '', (v) => update({ stopOnLoss: String(v) }))}</div>
              <div><label className={labelCls}>Nach Bets</label>{selWithCustom(STOP_AFTER_BETS_OPTIONS, s.stopAfterBets, (v) => update({ stopAfterBets: v }), 0, 999999)}</div>
              <div><label className={labelCls}>Win-Streak</label>{selWithCustom(STREAK_NUM_OPTIONS, s.stopOnWinStreak, (v) => update({ stopOnWinStreak: v }), 0, 99)}</div>
              <div><label className={labelCls}>Loss-Streak</label>{selWithCustom(STREAK_NUM_OPTIONS, s.stopOnLossStreak, (v) => update({ stopOnLossStreak: v }), 0, 99)}</div>
              <div><label className={labelCls}>Stop-Condition</label><select value={s.stopConditionType} onChange={(e) => update({ stopConditionType: e.target.value as StopConditionType })} className={inputCls}>{STOP_CONDITION_OPTIONS.map((o) => <option key={o.value || 'none'} value={o.value}>{o.label}</option>)}</select></div>
              {(s.stopConditionType === 'xReds' || s.stopConditionType === 'winStreak' || s.stopConditionType === 'lossStreak' || s.stopConditionType === 'xBets') && (
                <div><label className={labelCls}>Wert</label>{selWithCustom(STOP_CONDITION_VALUE_OPTIONS.map((o) => ({ v: Number(o.v), l: o.l })), Number(s.stopConditionValue) || 5, (v) => update({ stopConditionValue: String(v) }), 1, 99)}</div>
              )}
              {(s.stopConditionType === 'profitAmount' || s.stopConditionType === 'lossAmount') && (
                <div><label className={labelCls}>Betrag</label>{sel(PROFIT_LOSS_AMOUNT_OPTIONS, s.stopConditionValue || '', (v) => update({ stopConditionValue: String(v) }))}</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Chance/Mult. bei Bedingung</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Nach Loss-Streak</label>{selWithCustom(CHANGE_CHANCE_STREAK_OPTIONS, s.changeChanceAfterLossStreak, (v) => update({ changeChanceAfterLossStreak: v }), 0, 99)}</div>
              <div><label className={labelCls}>Neue Chance %</label>{sel(CHANGE_CHANCE_VALUE_OPTIONS, s.changeChanceNewValue || '', (v) => update({ changeChanceNewValue: String(v) }))}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Seed & Vault</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Seed alle X Bets</label>{selWithCustom(SEED_X_OPTIONS, s.seedChangeEveryXBets, (v) => update({ seedChangeEveryXBets: v }), 0, 9999)}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.seedChangeOnLoss} onChange={(e) => update({ seedChangeOnLoss: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Seed nach Loss</span></label></div>
              <div><label className={labelCls}>Seed nach X Wins</label>{selWithCustom(SEED_X_OPTIONS, s.seedChangeAfterWins, (v) => update({ seedChangeAfterWins: v }), 0, 9999)}</div>
              <div><label className={labelCls}>Seed nach X Losses</label>{selWithCustom(SEED_X_OPTIONS, s.seedChangeAfterLosses, (v) => update({ seedChangeAfterLosses: v }), 0, 9999)}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.serverSeedHashCheck} onChange={(e) => update({ serverSeedHashCheck: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Server Seed Check</span></label></div>
              <div><label className={labelCls}>Vault ab Profit</label>{sel(VAULT_PROFIT_OPTIONS, s.vaultAutoDepositAtProfit || '', (v) => update({ vaultAutoDepositAtProfit: String(v) }))}</div>
              <div><label className={labelCls}>Vault Betrag</label>{sel(VAULT_AMOUNT_OPTIONS, s.vaultAutoTopupAmount || '', (v) => update({ vaultAutoTopupAmount: String(v) }))}</div>
            </div>
          </div>

          {activeGame === 'dice' && (
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Dice</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Chance Ladder</label>{sel(DICE_LADDER_PRESETS, DICE_LADDER_PRESETS.some((o) => o.v === s.diceChanceLadder) ? s.diceChanceLadder : '', (v) => update({ diceChanceLadder: String(v) }))}</div>
              <div><label className={labelCls}>Target Mult. Bankroll %</label>{sel(TARGET_MULT_BANKROLL_OPTIONS, s.diceTargetMultiplierBankrollPct, (v) => update({ diceTargetMultiplierBankrollPct: Number(v) }))}</div>
              <div><label className={labelCls}>Target Mult. (×)</label>{sel(TARGET_MULT_VAL_OPTIONS, s.diceTargetMultiplierValue, (v) => update({ diceTargetMultiplierValue: Number(v) }))}</div>
              <div><label className={labelCls}>High/Low Flip</label>{sel(DICE_HIGHLOW_BETS_OPTIONS, s.diceHighLowRandomizerAfterBets || '', (v) => update({ diceHighLowRandomizerAfterBets: String(v) }))}</div>
            </div>
          </div>
          )}

          {activeGame === 'keno' && (
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Keno</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Smart Picker</label>{sel(KENO_DRAWS_OPTIONS, s.kenoSmartPickerDraws, (v) => update({ kenoSmartPickerDraws: Number(v) }))}</div>
              <div><label className={labelCls}>Auto Risk ab %</label>{sel(KENO_RISK_PCT_OPTIONS, s.kenoAutoRiskSwitchPct, (v) => update({ kenoAutoRiskSwitchPct: Number(v) }))}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.kenoPatternAvoider} onChange={(e) => update({ kenoPatternAvoider: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Pattern Avoider</span></label></div>
            </div>
          </div>
          )}

          {activeGame === 'mines' && (
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Mines</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Start Minen</label>{sel(MINES_START_OPTIONS, s.minesDynamicMineStart, (v) => update({ minesDynamicMineStart: Number(v) }))}</div>
              <div><label className={labelCls}>+Nach Win</label>{sel(MINES_AFTER_WIN_OPTIONS, s.minesDynamicMineAfterWin, (v) => update({ minesDynamicMineAfterWin: Number(v) }))}</div>
              <div><label className={labelCls}>−Nach Loss</label>{sel(MINES_AFTER_LOSS_OPTIONS, s.minesDynamicMineAfterLoss, (v) => update({ minesDynamicMineAfterLoss: Number(v) }))}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.minesGridHeatmap} onChange={(e) => update({ minesGridHeatmap: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Grid Heatmap</span></label></div>
            </div>
          </div>
          )}

          {activeGame === 'plinko' && (
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Plinko</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Path Analyzer</label>{sel(PLINKO_DROPS_OPTIONS, s.plinkoPathAnalyzerDrops, (v) => update({ plinkoPathAnalyzerDrops: Number(v) }))}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.plinkoRiskRowsSwitch} onChange={(e) => update({ plinkoRiskRowsSwitch: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Risk+Rows Switch</span></label></div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.plinkoBallRandomizer} onChange={(e) => update({ plinkoBallRandomizer: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Ball Randomizer</span></label></div>
            </div>
          </div>
          )}

          {activeGame === 'limbo' && (
          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Limbo / Crash</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Auto Cashout ×</label>{sel(CASHOUT_MULT_OPTIONS, s.autoCashoutMultiplier || '', (v) => update({ autoCashoutMultiplier: String(v) }))}</div>
              <div><label className={labelCls}>Dual 1 %</label>{sel(DUAL_PCT_OPTIONS, s.dualCashout1Pct, (v) => update({ dualCashout1Pct: Number(v) }))}</div>
              <div><label className={labelCls}>Dual 1 ×</label>{sel(DUAL_MULT_OPTIONS, s.dualCashout1Mult, (v) => update({ dualCashout1Mult: Number(v) }))}</div>
              <div><label className={labelCls}>Dual 2 %</label>{sel(DUAL_PCT_OPTIONS, s.dualCashout2Pct, (v) => update({ dualCashout2Pct: Number(v) }))}</div>
              <div><label className={labelCls}>Dual 2 ×</label>{sel(DUAL_MULT_OPTIONS, s.dualCashout2Mult, (v) => update({ dualCashout2Mult: Number(v) }))}</div>
              <div><label className={labelCls}>Crash Min ×</label>{sel(CRASH_MINMAX_OPTIONS, s.crashMinCashout || '', (v) => update({ crashMinCashout: String(v) }))}</div>
              <div><label className={labelCls}>Crash Max ×</label>{sel(CRASH_MINMAX_OPTIONS, s.crashMaxCashout || '', (v) => update({ crashMaxCashout: String(v) }))}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.crashAggressive} onChange={(e) => update({ crashAggressive: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Aggressive</span></label></div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.crashGreenRedStreakPredict} onChange={(e) => update({ crashGreenRedStreakPredict: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Green/Red Streak</span></label></div>
              <div><label className={labelCls}>Turbo Delay</label>{sel(TURBO_DELAY_OPTIONS, s.turboModeDelayMs, (v) => update({ turboModeDelayMs: Number(v) }))}</div>
              <div><label className={labelCls}>Tier 3 Pause</label>{sel(TIER3_PAUSE_OPTIONS, s.profitGoalTier3PauseHours, (v) => update({ profitGoalTier3PauseHours: Number(v) }))}</div>
            </div>
          </div>
          )}

          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Bankroll</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><label className={labelCls}>Dynamic Base Bet %</label>{sel(DYNAMIC_BET_PCT_OPTIONS, s.dynamicBaseBetPct, (v) => update({ dynamicBaseBetPct: Number(v) }))}</div>
              <div>
                <label className={`${labelCls} flex items-center gap-1`}>
                  Kelly
                  <span title="Kelly Criterion: mathematisch optimaler Einsatzanteil der Bankroll pro Wette. 0.25 = Quarter Kelly (konservativ), 1 = Full Kelly (höheres Risiko). Aus = feste Einsätze." className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--text-muted)]/20 text-[var(--text-muted)] text-xs cursor-help">?</span>
                </label>
                {sel(KELLY_OPTIONS, s.kellyFraction, (v) => update({ kellyFraction: Number(v) }))}
              </div>
              <div><label className={labelCls}>Session Cap %</label>{sel(SESSION_CAP_OPTIONS, s.sessionBankrollCapPct, (v) => update({ sessionBankrollCapPct: Number(v) }))}</div>
              <div><label className={labelCls}>Tier 1 %</label>{sel(TIER_PCT_OPTIONS, s.profitGoalTier1Pct, (v) => update({ profitGoalTier1Pct: Number(v) }))}</div>
              <div><label className={labelCls}>Tier 2 %</label>{sel(TIER_PCT_OPTIONS, s.profitGoalTier2Pct, (v) => update({ profitGoalTier2Pct: Number(v) }))}</div>
              <div><label className={labelCls}>Tier 3 %</label>{sel(TIER_PCT_OPTIONS, s.profitGoalTier3Pct, (v) => update({ profitGoalTier3Pct: Number(v) }))}</div>
              <div><label className={labelCls}>Loss Recovery %</label>{sel(LOSS_RECOVERY_OPTIONS, s.lossRecoveryDrawdownPct, (v) => update({ lossRecoveryDrawdownPct: Number(v) }))}</div>
              <div><label className={labelCls}>Daily Limit</label>{sel(DAILY_WEEKLY_LIMIT_OPTIONS, s.dailyLossLimit || '', (v) => update({ dailyLossLimit: String(v) }))}</div>
              <div><label className={labelCls}>Weekly Limit</label>{sel(DAILY_WEEKLY_LIMIT_OPTIONS, s.weeklyLossLimit || '', (v) => update({ weeklyLossLimit: String(v) }))}</div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">UI & Notifications</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.liveProfitChart} onChange={(e) => update({ liveProfitChart: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Live Chart</span></label></div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.soundAlertsEnabled} onChange={(e) => update({ soundAlertsEnabled: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Sound</span></label></div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.sessionReplayExport} onChange={(e) => update({ sessionReplayExport: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">Replay .csv</span></label></div>
              <div><label className={labelCls}>Summary alle X</label>{sel(SUMMARY_EVERY_OPTIONS, s.betsSummaryEveryXBets, (v) => update({ betsSummaryEveryXBets: Number(v) }))}</div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.aiStatMode} onChange={(e) => update({ aiStatMode: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">AI/Stat</span></label></div>
              <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={s.rtpVarianceTracker} onChange={(e) => update({ rtpVarianceTracker: e.target.checked })} className="w-4 h-4 rounded accent-[var(--accent)]" /><span className="text-xs">RTP Tracker</span></label></div>
              <div><label className={labelCls}>Telegram URL</label><input type="url" placeholder="https://…" value={s.telegramWebhook} onChange={(e) => update({ telegramWebhook: e.target.value })} className={inputCls} /></div>
              <div><label className={labelCls}>Discord URL</label><input type="url" placeholder="https://…" value={s.discordWebhook} onChange={(e) => update({ discordWebhook: e.target.value })} className={inputCls} /></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
