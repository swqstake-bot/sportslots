/**
 * Script Builder – Mechaniken per Klick auswählen, als Profil (.json) exportieren.
 */

import { useState, useCallback } from 'react'
import {
  DEFAULT_PROFILE_OPTIONS,
  type AntebotProfile,
  type ProfileOptions,
  type OriginalsGame,
} from './profileSchema'

const inputCls = 'w-full bg-[var(--bg-deep)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)] outline-none'
const labelCls = 'block text-xs text-[var(--text-muted)] mb-0.5'

const COMMON_OPTION_KEYS: (keyof ProfileOptions)[] = [
  'game', 'initialBetSize', 'betSize', 'onWin', 'increaseOnWin', 'onLoss', 'increaseOnLoss',
  'stopOnProfit', 'stopOnLoss', 'isStopOnWinStreak', 'stopOnWinStreak', 'isStopOnLossStreak', 'stopOnLossStreak', 'isStopOnB2bStreak', 'stopOnB2bStreak',
  'isSeedChangeAfterRolls', 'seedChangeAfterRolls', 'increaseBetAfterSeedReset', 'isVaultAllProfits', 'vaultProfitsThreshold',
]
const GAME_OPTION_KEYS: Record<OriginalsGame, (keyof ProfileOptions)[]> = {
  keno: ['risk', 'numbers', 'randomNumbersFrom', 'randomNumbersTo', 'useHeatmapHotNumbers', 'heatmapHotNumbers', 'heatmapRange'],
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
    if (Object.prototype.hasOwnProperty.call(opts, k)) out[k] = opts[k]
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
  const [name, setName] = useState('Mein Profil')
  const [opts, setOpts] = useState<ProfileOptions>({ ...DEFAULT_PROFILE_OPTIONS })
  const [exportSuccess, setExportSuccess] = useState(false)

  const updateOpt = useCallback(<K extends keyof ProfileOptions>(key: K, value: ProfileOptions[K]) => {
    setOpts((p) => ({ ...p, [key]: value }))
  }, [])

  const exportProfile = useCallback(() => {
    const profile: AntebotProfile = {
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
    const profile: AntebotProfile = { name, options: optionsForExport(opts), lastUsed: false, favorite: false, loadOnStart: false }
    navigator.clipboard.writeText(JSON.stringify(profile, null, 2))
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 2000)
  }, [name, opts])

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-muted)]">
        Mechaniken auswählen und einstellen. Export erzeugt ein Antebot-kompatibles Profil (.json).
      </p>

      <div>
        <label className={labelCls}>Profilname</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Mein Profil" />
      </div>

      <div>
        <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Spiel</div>
        <select value={opts.game} onChange={(e) => updateOpt('game', e.target.value as OriginalsGame)} className={inputCls}>
          {GAMES.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Einsatz (USD)</label>
          <input type="number" min="0" step="any" value={opts.initialBetSize} onChange={(e) => { const v = Number(e.target.value); updateOpt('initialBetSize', v); updateOpt('betSize', v) }} className={inputCls} placeholder="0.01" title="Betrag in US-Dollar (z. B. 0.01 = $0.01)" />
        </div>
        <div>
          <label className={labelCls}>Bei Win</label>
          <select value={opts.onWin} onChange={(e) => updateOpt('onWin', e.target.value as ProfileOptions['onWin'])} className={inputCls} title="Reset = zurück auf Starteinsatz, Martingale = auch Reset, + % = Einsatz um X % erhöhen, Unverändert = Einsatz bleibt">
            <option value="reset">Reset</option>
            <option value="martingale">Martingale</option>
            <option value="increase">+ %</option>
            <option value="none">Unverändert</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Bei Loss</label>
          <select value={opts.onLoss} onChange={(e) => updateOpt('onLoss', e.target.value as ProfileOptions['onLoss'])} className={inputCls} title="Reset = zurück auf Starteinsatz, Martingale = Einsatz verdoppeln, + % = um X % erhöhen, Unverändert = Einsatz bleibt">
            <option value="reset">Reset</option>
            <option value="martingale">Martingale</option>
            <option value="increase">+ %</option>
            <option value="none">Unverändert</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>+ on Loss %</label>
          <input type="number" min="0" value={opts.increaseOnLoss} onChange={(e) => updateOpt('increaseOnLoss', Number(e.target.value))} className={inputCls} />
        </div>
      </div>

      <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Stops</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Stop Profit</label>
          <input type="number" min="0" step="any" value={opts.stopOnProfit} onChange={(e) => updateOpt('stopOnProfit', Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Stop Loss</label>
          <input type="number" min="0" step="any" value={opts.stopOnLoss} onChange={(e) => updateOpt('stopOnLoss', Number(e.target.value))} className={inputCls} />
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
            <span className="text-xs">Stop B2B-Streak</span>
          </label>
          <input type="number" min="0" value={opts.stopOnB2bStreak} onChange={(e) => updateOpt('stopOnB2bStreak', Number(e.target.value))} className={inputCls} />
        </div>
      </div>

      <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Seed & Einsatz-Staffel</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="flex items-center gap-2 mt-3">
            <input type="checkbox" checked={opts.isSeedChangeAfterRolls} onChange={(e) => updateOpt('isSeedChangeAfterRolls', e.target.checked)} className="rounded accent-[var(--accent)]" />
            <span className="text-xs">Seed nach X Rolls</span>
          </label>
          <input type="number" min="0" value={opts.seedChangeAfterRolls} onChange={(e) => updateOpt('seedChangeAfterRolls', Number(e.target.value))} className={inputCls} placeholder="z. B. 25" />
        </div>
        <div>
          <label className={labelCls} title="Nach jedem Block (z. B. 25 Bets): Einsatz um diesen USD-Betrag erhöhen">Einsatz + pro Block (USD, z. B. 0.01)</label>
          <input type="number" min="0" step="0.01" value={opts.increaseBetAfterSeedReset} onChange={(e) => updateOpt('increaseBetAfterSeedReset', Number(e.target.value))} className={inputCls} placeholder="0.01" />
        </div>
      </div>
      {opts.isSeedChangeAfterRolls && opts.seedChangeAfterRolls > 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          Beispiel: Alle {opts.seedChangeAfterRolls} Bets „Seed-Reset“ (neuer Block), dann Einsatz (USD) = Starteinsatz + (Block-Nr. × {opts.increaseBetAfterSeedReset || '0.01'}). Bis Stop-Bedingung.
        </p>
      )}

      {opts.game === 'keno' && (
        <>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Keno</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              <label className={labelCls} title="Bei jeder Wette neue Zufallszahlen (1–40), Anzahl zwischen von und bis">Random Picks von</label>
              <input type="number" min="0" max="10" value={opts.randomNumbersFrom} onChange={(e) => updateOpt('randomNumbersFrom', Number(e.target.value))} className={inputCls} placeholder="0 = feste Numbers" />
            </div>
            <div>
              <label className={labelCls} title="Bei jeder Wette neue Zufallszahlen (1–40)">Random Picks bis</label>
              <input type="number" min="0" max="10" value={opts.randomNumbersTo} onChange={(e) => updateOpt('randomNumbersTo', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-3">
                <input type="checkbox" checked={opts.useHeatmapHotNumbers} onChange={(e) => updateOpt('useHeatmapHotNumbers', e.target.checked)} className="rounded accent-[var(--accent)]" />
                <span className="text-xs">Heatmap (Hot-Zone)</span>
              </label>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Bei jeder Wette neue Zufallszahlen aus der Hot-Zone</p>
            </div>
            <div>
              <label className={labelCls} title="Anzahl Zahlen pro Wette aus der Hot-Zone (1–10)">Heatmap Hot (Anzahl)</label>
              <input type="number" min="0" max="10" value={opts.heatmapHotNumbers} onChange={(e) => updateOpt('heatmapHotNumbers', Number(e.target.value))} className={inputCls} disabled={!opts.useHeatmapHotNumbers} />
            </div>
            <div>
              <label className={labelCls} title="Hot-Zone = Zahlen 1 bis N (Stake Keno: 1–39)">Heatmap Range (1–X)</label>
              <input type="number" min="1" max="39" value={opts.heatmapRange} onChange={(e) => updateOpt('heatmapRange', Number(e.target.value))} className={inputCls} disabled={!opts.useHeatmapHotNumbers} />
            </div>
          </div>
        </>
      )}

      {opts.game === 'mines' && (
        <>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Mines</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Minen</label>
              <input type="number" min={1} max={24} value={opts.mines} onChange={(e) => updateOpt('mines', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Diamanten (Gems)</label>
              <input type="number" min="1" max="24" value={opts.diamonds} onChange={(e) => updateOpt('diamonds', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Random Minen von/bis</label>
              <input type="number" min="0" value={opts.randomMinesFrom} onChange={(e) => updateOpt('randomMinesFrom', Number(e.target.value))} className={inputCls} />
              <input type="number" min="0" value={opts.randomMinesTo} onChange={(e) => updateOpt('randomMinesTo', Number(e.target.value))} className={inputCls} />
            </div>
          </div>
        </>
      )}

      {opts.game === 'dice' && (
        <>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Dice</div>
          <div className="grid grid-cols-2 gap-3">
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
        </>
      )}

      {opts.game === 'limbo' && (
        <div>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Limbo</div>
          <div>
            <label className={labelCls}>Ziel-Multiplikator</label>
            <input type="number" min="1.01" step="0.01" value={opts.targetMultiplier} onChange={(e) => updateOpt('targetMultiplier', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
      )}

      {opts.game === 'plinko' && (
        <div>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Plinko</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Reihen</label>
              <input type="number" min={8} max={16} value={opts.rows} onChange={(e) => updateOpt('rows', Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Risk</label>
              <select value={opts.plinkoRisk} onChange={(e) => updateOpt('plinkoRisk', e.target.value as ProfileOptions['plinkoRisk'])} className={inputCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={exportProfile} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[#0A0A0F] text-sm font-medium hover:opacity-90">
          Als .json herunterladen
        </button>
        <button type="button" onClick={copyJson} className="px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-sm hover:border-[var(--accent)]">
          JSON kopieren
        </button>
        {exportSuccess && <span className="text-sm text-emerald-400 self-center">Erfolgreich.</span>}
      </div>
    </div>
  )
}
