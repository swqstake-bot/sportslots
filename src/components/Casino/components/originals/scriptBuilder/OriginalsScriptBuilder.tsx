/**
 * Script Builder – Mechaniken per Klick auswählen, als Profil (.json) exportieren.
 * Übersichtlich in aufklappbaren Sektionen gruppiert.
 */

import { useState, useCallback } from 'react'
import { AccordionSection } from '../../../../ui/AccordionSection'
import {
  DEFAULT_PROFILE_OPTIONS,
  type OriginalsProfile,
  type ProfileOptions,
  type OriginalsGame,
} from './profileSchema'

const inputCls = 'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none'
const labelCls = 'block text-xs text-[var(--text-muted)] mb-0.5'
const sectionCls = 'space-y-3'

const COMMON_OPTION_KEYS: (keyof ProfileOptions)[] = [
  'game', 'initialBetSize', 'betSize', 'onWin', 'increaseOnWin', 'onLoss', 'increaseOnLoss',
  'stopOnProfit', 'stopOnLoss', 'stopOnTotalWagered',
  'isStopOnWinStreak', 'stopOnWinStreak', 'isStopOnLossStreak', 'stopOnLossStreak', 'isStopOnB2bStreak', 'stopOnB2bStreak',
  'b2bTakeProfitAfterWins', 'b2bTakeProfitAtChainMultiplier', 'b2bTakeProfitChainProfitPct', 'b2bTakeProfitChainProfitUsd',
  'b2bRotateSeedOnTakeProfit', 'b2bEscalateBaseEveryTakeProfits', 'b2bEscalateBasePct', 'b2bMaxBaseBetUsd',
  'b2bSmartTakeProfitAtMulti',
  'b2bSmartTakeProfitAtChainProfitUsd',
  'b2bSmartTakeProfitAtChainProfitPctOfBase',
  'b2bSmartTakeProfitPeelPct',
  'isSeedChangeAfterRolls', 'seedChangeAfterRolls', 'increaseBetAfterSeedReset', 'seedResetOnLossStreak', 'resetSeedOnLoss', 'seedResetOnLossAmount', 'isVaultAllProfits', 'vaultProfitsThreshold',
]
const GAME_OPTION_KEYS: Record<OriginalsGame, (keyof ProfileOptions)[]> = {
  keno: [
    'risk', 'numbers', 'randomNumbersFrom', 'randomNumbersTo',
    'useHeatmapHotNumbers', 'heatmapHotNumbers', 'heatmapRange',
    'kenoHeatmapCycleEnabled', 'kenoHeatmapPrerollBets', 'kenoHeatmapAttackBets',
    'kenoHeatmapPrerollBetSize', 'kenoHeatmapAttackBetSize', 'kenoHeatmapPickCount',
  ],
  mines: ['mines', 'diamonds', 'randomMinesFrom', 'randomMinesTo', 'randomDiamondsFrom', 'randomDiamondsTo'],
  dice: ['rollUnder', 'rollOver'],
  limbo: ['targetMultiplier'],
  plinko: ['rows', 'plinkoRisk'],
}

function optionsForExport(opts: ProfileOptions): Partial<ProfileOptions> {
  const game = opts.game as OriginalsGame
  const keys = [...COMMON_OPTION_KEYS, ...(GAME_OPTION_KEYS[game] || [])]
  const out: Partial<ProfileOptions> = {}
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(opts, k)) {
      ;(out as Record<string, unknown>)[k] = opts[k]
    }
  }
  return out
}

const GAMES: { id: OriginalsGame; label: string }[] = [
  { id: 'dice', label: 'Dice' },
  { id: 'limbo', label: 'Limbo' },
  { id: 'mines', label: 'Mines' },
  { id: 'plinko', label: 'Plinko' },
  { id: 'keno', label: 'Keno' },
]

export default function OriginalsScriptBuilder() {
  const [name, setName] = useState('My profile')
  const [opts, setOpts] = useState<ProfileOptions>({ ...DEFAULT_PROFILE_OPTIONS })
  const [exportSuccess, setExportSuccess] = useState(false)

  const updateOpt = useCallback(<K extends keyof ProfileOptions>(key: K, value: ProfileOptions[K]) => {
    setOpts((p) => ({ ...p, [key]: value }))
  }, [])

  const exportProfile = useCallback(() => {
    const profile: OriginalsProfile = {
      name,
      options: optionsForExport(opts),
      lastUsed: false,
      favorite: false,
      loadOnStart: false,
    }
    const json = JSON.stringify(profile, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `profile-${name.replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 2000)
  }, [name, opts])

  const copyJson = useCallback(() => {
    const profile: OriginalsProfile = { name, options: optionsForExport(opts), lastUsed: false, favorite: false, loadOnStart: false }
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2))
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 2000)
  }, [name, opts])

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Select mechanics and tune values. Export produces an Originals profile (.json).
      </p>

      <AccordionSection title="Basics" defaultOpen={true}>
        <div className={sectionCls}>
          <div>
            <label className={labelCls}>Profile name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="My profile" />
          </div>
          <div>
            <label className={labelCls}>Game</label>
            <select value={opts.game} onChange={(e) => updateOpt('game', e.target.value as OriginalsGame)} className={inputCls}>
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Bet size & behavior" defaultOpen={true}>
        <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
          <div>
            <label className={labelCls}>Bet size (USD)</label>
            <input type="number" min="0" step="any" value={opts.initialBetSize} onChange={(e) => { const v = Number(e.target.value); updateOpt('initialBetSize', v); updateOpt('betSize', v) }} className={inputCls} placeholder="0.01" title="Amount in US dollars (e.g. 0.01 = $0.01)" />
          </div>
          <div>
            <label className={labelCls}>On win</label>
            <select value={opts.onWin} onChange={(e) => updateOpt('onWin', e.target.value as ProfileOptions['onWin'])} className={inputCls} title="B2B = reinvest win (parlay). Stop B2B streak stops after X wins in a row.">
              <option value="reset">Reset (starting bet)</option>
              <option value="b2b">B2B (bet win)</option>
              <option value="martingale">Martingale</option>
              <option value="increase">+ %</option>
              <option value="none">No change</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>On loss</label>
            <select value={opts.onLoss} onChange={(e) => updateOpt('onLoss', e.target.value as ProfileOptions['onLoss'])} className={inputCls}>
              <option value="reset">Reset</option>
              <option value="martingale">Martingale</option>
              <option value="increase">+ %</option>
              <option value="none">No change</option>
            </select>
          </div>
          <div>
            <label className={labelCls} title="Only when On win = + %">+ on win %</label>
            <input type="number" min="0" value={opts.increaseOnWin} onChange={(e) => updateOpt('increaseOnWin', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} title="Only when On loss = + %">+ on loss %</label>
            <input type="number" min="0" value={opts.increaseOnLoss} onChange={(e) => updateOpt('increaseOnLoss', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Stops" defaultOpen={false}>
        <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
          <div>
            <label className={labelCls}>Stop Profit (USD)</label>
            <input type="number" min="0" step="any" value={opts.stopOnProfit} onChange={(e) => updateOpt('stopOnProfit', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Stop Loss (USD)</label>
            <input type="number" min="0" step="any" value={opts.stopOnLoss} onChange={(e) => updateOpt('stopOnLoss', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} title="Session stoppt bei erreichtem Gesamt-Wagered (USD). 0 = aus.">Stop Total Wagered (USD)</label>
            <input type="number" min="0" step="any" value={opts.stopOnTotalWagered} onChange={(e) => updateOpt('stopOnTotalWagered', Number(e.target.value))} className={inputCls} placeholder="0 = off" />
          </div>
          <div>
            <label className="flex items-center gap-2 mt-3">
              <input type="checkbox" checked={opts.isStopOnWinStreak} onChange={(e) => updateOpt('isStopOnWinStreak', e.target.checked)} className="rounded accent-[var(--accent)]" />
              <span className="text-xs">Stop Win-Streak</span>
            </label>
            <input type="number" min="0" value={opts.stopOnWinStreak} onChange={(e) => updateOpt('stopOnWinStreak', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className="flex items-center gap-2 mt-3">
              <input type="checkbox" checked={opts.isStopOnLossStreak} onChange={(e) => updateOpt('isStopOnLossStreak', e.target.checked)} className="rounded accent-[var(--accent)]" />
              <span className="text-xs">Stop Loss-Streak</span>
            </label>
            <input type="number" min="0" value={opts.stopOnLossStreak} onChange={(e) => updateOpt('stopOnLossStreak', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className="flex items-center gap-2 mt-3">
              <input type="checkbox" checked={opts.isStopOnB2bStreak} onChange={(e) => updateOpt('isStopOnB2bStreak', e.target.checked)} className="rounded accent-[var(--accent)]" />
              <span className="text-xs" title="Stop after X wins in a row. Makes sense with On win = B2B.">Stop after B2B streak</span>
            </label>
            <input type="number" min="0" value={opts.stopOnB2bStreak} onChange={(e) => updateOpt('stopOnB2bStreak', Number(e.target.value))} className={inputCls} placeholder="e.g. 6" />
          </div>
        </div>
      </AccordionSection>

      {opts.onWin === 'b2b' && (
        <AccordionSection title="B2B Take Profit & escalation" defaultOpen={true}>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Smart TP: bei Trigger wird peel % abgesichert, der Rest bleibt B2B (kein Reset auf Base). Trigger sind ODER (Einsatz÷Base, Ketten-$ oder Ketten-% der Base).
          </p>
          <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
            <div>
              <label className={labelCls} title="2 oder 200 = Einsatz mindestens 200% der Base.">Smart TP ab (× Base)</label>
              <input type="number" min="0" step="0.1" value={opts.b2bSmartTakeProfitAtMulti} onChange={(e) => updateOpt('b2bSmartTakeProfitAtMulti', Number(e.target.value))} className={inputCls} placeholder="2" />
            </div>
            <div>
              <label className={labelCls} title="Ketten-Gewinn in USD seit Kettenstart.">Smart TP ab Ketten-$</label>
              <input type="number" min="0" step="0.01" value={opts.b2bSmartTakeProfitAtChainProfitUsd} onChange={(e) => updateOpt('b2bSmartTakeProfitAtChainProfitUsd', Number(e.target.value))} className={inputCls} placeholder="12" />
            </div>
            <div>
              <label className={labelCls} title="200 = Ketten-Gewinn ≥ 200% der Base ($0.12 bei $0.06).">Smart TP ab Ketten-% Base</label>
              <input type="number" min="0" step="1" value={opts.b2bSmartTakeProfitAtChainProfitPctOfBase} onChange={(e) => updateOpt('b2bSmartTakeProfitAtChainProfitPctOfBase', Number(e.target.value))} className={inputCls} placeholder="200" />
            </div>
            <div>
              <label className={labelCls} title="% vom Peel-Pool der nicht reinvestiert wird.">Smart TP peel %</label>
              <input type="number" min="0" max="100" step="1" value={opts.b2bSmartTakeProfitPeelPct} onChange={(e) => updateOpt('b2bSmartTakeProfitPeelPct', Number(e.target.value))} className={inputCls} placeholder="40" />
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2 mt-3">Vollständiger Take Profit (Kette → Base):</p>
          <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
            <div>
              <label className={labelCls} title="0 = aus. Z. B. 5 = nach 5. Gewinn in der Kette auszahlen.">TP after chain wins (0=off)</label>
              <input type="number" min="0" value={opts.b2bTakeProfitAfterWins} onChange={(e) => updateOpt('b2bTakeProfitAfterWins', Number(e.target.value))} className={inputCls} placeholder="5" />
            </div>
            <div>
              <label className={labelCls} title="Nächster Einsatz ≥ Kettenstart × X → Take Profit.">TP at chain multiplier (0=off)</label>
              <input type="number" min="0" step="0.1" value={opts.b2bTakeProfitAtChainMultiplier} onChange={(e) => updateOpt('b2bTakeProfitAtChainMultiplier', Number(e.target.value))} className={inputCls} placeholder="6" />
            </div>
            <div>
              <label className={labelCls} title="Ketten-Gewinn ≥ Start der Kette × (pct/100).">TP chain profit % (0=off)</label>
              <input type="number" min="0" step="1" value={opts.b2bTakeProfitChainProfitPct} onChange={(e) => updateOpt('b2bTakeProfitChainProfitPct', Number(e.target.value))} className={inputCls} placeholder="40" />
            </div>
            <div>
              <label className={labelCls} title="Ketten-Gewinn in USD seit Kettenstart.">TP chain profit USD (0=off)</label>
              <input type="number" min="0" step="0.01" value={opts.b2bTakeProfitChainProfitUsd} onChange={(e) => updateOpt('b2bTakeProfitChainProfitUsd', Number(e.target.value))} className={inputCls} placeholder="1.5" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 mt-3">
                <input type="checkbox" checked={opts.b2bRotateSeedOnTakeProfit} onChange={(e) => updateOpt('b2bRotateSeedOnTakeProfit', e.target.checked)} className="rounded accent-[var(--accent)]" />
                <span className="text-xs">Rotate seed on TP</span>
              </label>
            </div>
            <div>
              <label className={labelCls} title="Alle N Take Profits: Base um % erhöhen (mehr Turnover). 0 = aus.">Escalate base every N TPs</label>
              <input type="number" min="0" value={opts.b2bEscalateBaseEveryTakeProfits} onChange={(e) => updateOpt('b2bEscalateBaseEveryTakeProfits', Number(e.target.value))} className={inputCls} placeholder="4" />
            </div>
            <div>
              <label className={labelCls}>Escalate base +%</label>
              <input type="number" min="0" step="1" value={opts.b2bEscalateBasePct} onChange={(e) => updateOpt('b2bEscalateBasePct', Number(e.target.value))} className={inputCls} placeholder="10" />
            </div>
            <div>
              <label className={labelCls} title="0 = kein Cap">Max base bet (USD, 0=off)</label>
              <input type="number" min="0" step="0.01" value={opts.b2bMaxBaseBetUsd} onChange={(e) => updateOpt('b2bMaxBaseBetUsd', Number(e.target.value))} className={inputCls} placeholder="0.2" />
            </div>
          </div>
        </AccordionSection>
      )}

      <AccordionSection title="Seed & bet ladder" defaultOpen={false}>
        <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
          <div>
            <label className="flex items-center gap-2 mt-3">
              <input type="checkbox" checked={opts.isSeedChangeAfterRolls} onChange={(e) => updateOpt('isSeedChangeAfterRolls', e.target.checked)} className="rounded accent-[var(--accent)]" />
              <span className="text-xs">Seed after X rolls</span>
            </label>
            <input type="number" min="0" value={opts.seedChangeAfterRolls} onChange={(e) => updateOpt('seedChangeAfterRolls', Number(e.target.value))} className={inputCls} placeholder="e.g. 25" />
          </div>
          <div>
            <label className={labelCls} title="After each block: increase bet by this USD amount">Bet + per block (USD)</label>
            <input type="number" min="0" step="0.01" value={opts.increaseBetAfterSeedReset} onChange={(e) => updateOpt('increaseBetAfterSeedReset', Number(e.target.value))} className={inputCls} placeholder="0.01" />
          </div>
          <div>
            <label className={labelCls} title="After X losses in a row: rotate seed (0 = off)">Seed on loss streak (0=off)</label>
            <input type="number" min="0" value={opts.seedResetOnLossStreak} onChange={(e) => updateOpt('seedResetOnLossStreak', Number(e.target.value))} className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className={labelCls} title="Session loss ≥ amount (USD): rotate seed">Seed reset at loss (USD, 0=off)</label>
            <input type="number" min="0" step="0.01" value={opts.seedResetOnLossAmount ?? 0} onChange={(e) => updateOpt('seedResetOnLossAmount', Number(e.target.value))} className={inputCls} placeholder="0" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 mt-3" title="On each loss: new seed, block restarts from scratch">
              <input type="checkbox" checked={opts.resetSeedOnLoss ?? false} onChange={(e) => updateOpt('resetSeedOnLoss', e.target.checked)} className="rounded accent-[var(--accent)]" />
              <span className="text-xs">Reset seed on loss</span>
            </label>
          </div>
        </div>
        {opts.isSeedChangeAfterRolls && opts.seedChangeAfterRolls > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            Every {opts.seedChangeAfterRolls} bets = new block. Bet = starting bet + (block no. × {opts.increaseBetAfterSeedReset || '0.01'}).
          </p>
        )}
      </AccordionSection>

      {opts.game === 'keno' && (
        <AccordionSection title="Keno" defaultOpen={true}>
          <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
            <div>
              <label className={labelCls}>Risk</label>
              <select value={opts.risk} onChange={(e) => updateOpt('risk', e.target.value as ProfileOptions['risk'])} className={inputCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="classic">Classic</option>
              </select>
            </div>
            <div>
              <label className={labelCls} title="Random pick count between min and max">Random picks from</label>
              <input type="number" min="0" max="10" value={opts.randomNumbersFrom} onChange={(e) => updateOpt('randomNumbersFrom', Number(e.target.value))} className={inputCls} placeholder="0 = fixed numbers" />
            </div>
            <div>
              <label className={labelCls}>Random picks to</label>
              <input type="number" min="0" max="10" value={opts.randomNumbersTo} onChange={(e) => updateOpt('randomNumbersTo', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-3">
                <input type="checkbox" checked={opts.useHeatmapHotNumbers} onChange={(e) => updateOpt('useHeatmapHotNumbers', e.target.checked)} className="rounded accent-[var(--accent)]" />
                <span className="text-xs">Heatmap (hot zone)</span>
              </label>
            </div>
            <div>
              <label className={labelCls}>Heatmap hot (count)</label>
              <input type="number" min="0" max="10" value={opts.heatmapHotNumbers} onChange={(e) => updateOpt('heatmapHotNumbers', Number(e.target.value))} className={inputCls} disabled={!opts.useHeatmapHotNumbers} />
            </div>
            <div>
              <label className={labelCls}>Heatmap Range (1–X)</label>
              <input type="number" min="1" max="39" value={opts.heatmapRange} onChange={(e) => updateOpt('heatmapRange', Number(e.target.value))} className={inputCls} disabled={!opts.useHeatmapHotNumbers && !opts.kenoHeatmapCycleEnabled} />
            </div>
          </div>
          <div className={`${sectionCls} mt-3 pt-3 border-t border-[var(--border)]`}>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Heatmap-Zyklus: Preroll sammelt Draw-Frequenzen, Attack setzt auf die häufigsten Zahlen.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-end sm:col-span-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={opts.kenoHeatmapCycleEnabled} onChange={(e) => updateOpt('kenoHeatmapCycleEnabled', e.target.checked)} className="rounded accent-[var(--accent)]" />
                  <span className="text-xs">Heatmap-Zyklus aktiv</span>
                </label>
              </div>
              <div>
                <label className={labelCls}>Preroll Bets</label>
                <input type="number" min="1" value={opts.kenoHeatmapPrerollBets} onChange={(e) => updateOpt('kenoHeatmapPrerollBets', Number(e.target.value))} className={inputCls} disabled={!opts.kenoHeatmapCycleEnabled} />
              </div>
              <div>
                <label className={labelCls}>Attack Bets</label>
                <input type="number" min="1" value={opts.kenoHeatmapAttackBets} onChange={(e) => updateOpt('kenoHeatmapAttackBets', Number(e.target.value))} className={inputCls} disabled={!opts.kenoHeatmapCycleEnabled} />
              </div>
              <div>
                <label className={labelCls}>Preroll Einsatz ($)</label>
                <input type="number" min="0.0001" step="0.01" value={opts.kenoHeatmapPrerollBetSize} onChange={(e) => updateOpt('kenoHeatmapPrerollBetSize', Number(e.target.value))} className={inputCls} disabled={!opts.kenoHeatmapCycleEnabled} />
              </div>
              <div>
                <label className={labelCls}>Attack Einsatz ($)</label>
                <input type="number" min="0.0001" step="0.01" value={opts.kenoHeatmapAttackBetSize} onChange={(e) => updateOpt('kenoHeatmapAttackBetSize', Number(e.target.value))} className={inputCls} disabled={!opts.kenoHeatmapCycleEnabled} />
              </div>
              <div>
                <label className={labelCls}>Zahlen pro Bet</label>
                <input type="number" min="1" max="10" value={opts.kenoHeatmapPickCount} onChange={(e) => updateOpt('kenoHeatmapPickCount', Number(e.target.value))} className={inputCls} disabled={!opts.kenoHeatmapCycleEnabled} />
              </div>
            </div>
          </div>
        </AccordionSection>
      )}

      {opts.game === 'mines' && (
        <AccordionSection title="Mines" defaultOpen={true}>
          <div className={`${sectionCls} grid grid-cols-2 sm:grid-cols-4 gap-3`}>
            <div>
              <label className={labelCls}>Mines</label>
              <input type="number" min={1} max={24} value={opts.mines} onChange={(e) => updateOpt('mines', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Diamonds (gems)</label>
              <input type="number" min="1" max="24" value={opts.diamonds} onChange={(e) => updateOpt('diamonds', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Random mines from</label>
              <input type="number" min="0" value={opts.randomMinesFrom} onChange={(e) => updateOpt('randomMinesFrom', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Random mines to</label>
              <input type="number" min="0" value={opts.randomMinesTo} onChange={(e) => updateOpt('randomMinesTo', Number(e.target.value))} className={inputCls} />
            </div>
          </div>
        </AccordionSection>
      )}

      {opts.game === 'dice' && (
        <AccordionSection title="Dice" defaultOpen={true}>
          <div className={`${sectionCls} grid grid-cols-2 gap-3`}>
            <div>
              <label className={labelCls}>Roll Under (Chance %)</label>
              <input type="number" min="0.01" max="99.99" step="0.01" value={opts.rollUnder} onChange={(e) => updateOpt('rollUnder', Number(e.target.value))} className={inputCls} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={opts.rollOver} onChange={(e) => updateOpt('rollOver', e.target.checked)} className="rounded accent-[var(--accent)]" />
                <span className="text-xs">Roll Over</span>
              </label>
            </div>
          </div>
        </AccordionSection>
      )}

      {opts.game === 'limbo' && (
        <AccordionSection title="Limbo" defaultOpen={true}>
          <div className={sectionCls}>
            <div>
              <label className={labelCls}>Target multiplier</label>
              <input type="number" min="1.01" max="1000000" step="0.01" value={opts.targetMultiplier} onChange={(e) => updateOpt('targetMultiplier', Number(e.target.value))} className={inputCls} />
            </div>
          </div>
        </AccordionSection>
      )}

      {opts.game === 'plinko' && (
        <AccordionSection title="Plinko" defaultOpen={true}>
          <div className={`${sectionCls} grid grid-cols-2 gap-3`}>
            <div>
              <label className={labelCls}>Rows</label>
              <input type="number" min={8} max={16} value={opts.rows} onChange={(e) => updateOpt('rows', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Risk</label>
              <select value={opts.plinkoRisk} onChange={(e) => updateOpt('plinkoRisk', e.target.value as ProfileOptions['plinkoRisk'])} className={inputCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          </div>
        </AccordionSection>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={exportProfile} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[#0A0A0F] text-sm font-medium hover:opacity-90">
          Download as .json
        </button>
        <button type="button" onClick={copyJson} className="px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-sm hover:border-[var(--accent)]">
          Copy JSON
        </button>
        {exportSuccess && <span className="text-sm text-emerald-400 self-center">Done.</span>}
      </div>
    </div>
  )
}
