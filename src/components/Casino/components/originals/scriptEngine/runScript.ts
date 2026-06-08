/**
 * Script-Ausführung: Entweder Profil-JSON ausführen oder aus Script-Code Konfig extrahieren und als Profil laufen lassen.
 */

import { runProfile } from '../profileRunner/runProfile'
import type { ScriptSessionStats } from './scriptSessionStats'

export interface ScriptRunCallbacks {
  onLog?: (msg: string) => void
  onBetPlaced?: (result: {
    iid?: string
    betId?: string | null
    payout?: number
    amount?: number
    error?: string
    game?: string
    betIndex?: number
    betSizeUsd?: number
    payoutUsd?: number
    roundProfitUsd?: number
    profitUsd?: number
    multi?: number
    b2bMulti?: number
  }) => void
  onBetShareId?: (betIndex: number, betId: string) => void
  onStats?: (stats: ScriptSessionStats) => void
  onStopped?: () => void
  onSeedReset?: (tierIndex: number, newBetSizeUsd: number) => void
}

/** Extrahiert aus Antebot-Style-Script Variablen (game = 'keno', initialBetSize = 0.01, etc.). Pro Variable zählt die erste Übereinstimmung. */
export function extractConfigFromScript(scriptText: string): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  const patterns: [RegExp, string][] = [
    [/game\s*=\s*['"]([^'"]+)['"]/, 'game'],
    [/initialBetSize\s*=\s*([\d.]+)/, 'initialBetSize'],
    [/betSize\s*=\s*([\d.]+)/, 'betSize'],
    [/risk\s*=\s*['"]([^'"]+)['"]/, 'risk'],
    [/divider\s*=\s*(\d+)/, 'divider'],
    [/stopOnProfit\s*=\s*(\d+)/, 'stopOnProfit'],
    [/stopOnLoss\s*=\s*(\d+)/, 'stopOnLoss'],
    [/stopOnTotalWagered\s*=\s*(\d+)/, 'stopOnTotalWagered'],
    [/onWin\s*=\s*['"]([^'"]+)['"]/, 'onWin'],
    [/onLoss\s*=\s*['"]([^'"]+)['"]/, 'onLoss'],
    [/b2bTakeProfitAfterWins\s*=\s*(\d+)/, 'b2bTakeProfitAfterWins'],
    [/b2bTakeProfitAtChainMultiplier\s*=\s*([\d.]+)/, 'b2bTakeProfitAtChainMultiplier'],
    [/b2bTakeProfitChainProfitPct\s*=\s*([\d.]+)/, 'b2bTakeProfitChainProfitPct'],
    [/b2bTakeProfitChainProfitUsd\s*=\s*([\d.]+)/, 'b2bTakeProfitChainProfitUsd'],
    [/b2bEscalateBaseEveryTakeProfits\s*=\s*(\d+)/, 'b2bEscalateBaseEveryTakeProfits'],
    [/b2bEscalateBasePct\s*=\s*([\d.]+)/, 'b2bEscalateBasePct'],
    [/b2bMaxBaseBetUsd\s*=\s*([\d.]+)/, 'b2bMaxBaseBetUsd'],
    [/b2bSmartTakeProfitAtMulti\s*=\s*([\d.]+)/, 'b2bSmartTakeProfitAtMulti'],
    [/b2bSmartTakeProfitAtChainProfitUsd\s*=\s*([\d.]+)/, 'b2bSmartTakeProfitAtChainProfitUsd'],
    [/b2bSmartTakeProfitAtChainProfitPctOfBase\s*=\s*([\d.]+)/, 'b2bSmartTakeProfitAtChainProfitPctOfBase'],
    [/b2bSmartTakeProfitPeelPct\s*=\s*([\d.]+)/, 'b2bSmartTakeProfitPeelPct'],
    [/b2bSmartTakeProfitAtPct\s*=\s*([\d.]+)/, 'b2bSmartTakeProfitAtPct'],
    [/targetMultiplierFrom\s*=\s*([\d.]+)/, 'targetMultiplierFrom'],
    [/targetMultiplierTo\s*=\s*([\d.]+)/, 'targetMultiplierTo'],
    [/targetMultiplier\s*=\s*([\d.]+)/, 'targetMultiplier'],
    [/randomNumbersFrom\s*=\s*(\d+)/, 'randomNumbersFrom'],
    [/randomNumbersTo\s*=\s*(\d+)/, 'randomNumbersTo'],
    [/seedChangeAfterRolls\s*=\s*(\d+)/, 'seedChangeAfterRolls'],
    [/increaseBetAfterSeedReset\s*=\s*([\d.]+)/, 'increaseBetAfterSeedReset'],
    [/mines\s*=\s*(\d+)/, 'mines'],
    [/diamonds\s*=\s*(\d+)/, 'diamonds'],
  ]
  const boolPatterns: [RegExp, string][] = [
    [/b2bRotateSeedOnTakeProfit\s*=\s*true/i, 'b2bRotateSeedOnTakeProfit'],
    [/resetSeedOnLoss\s*=\s*true/i, 'resetSeedOnLoss'],
    [/isSeedChangeAfterRolls\s*=\s*true/i, 'isSeedChangeAfterRolls'],
  ]
  for (const [re, key] of patterns) {
    const m = scriptText.match(re)
    if (m) {
      if (key === 'game' || key === 'risk' || key === 'onWin' || key === 'onLoss') opts[key] = m[1]
      else opts[key] = Number(m[1])
    }
  }
  for (const [re, key] of boolPatterns) {
    if (re.test(scriptText)) opts[key] = true
  }
  if (/seedChangeAfterRolls\s*=\s*(\d+)/.test(scriptText) && opts.seedChangeAfterRolls) {
    opts.isSeedChangeAfterRolls = true
  }
  if (opts.divider && !opts.initialBetSize) {
    opts.initialBetSize = 100 / Number(opts.divider)
  }
  if (opts.initialBetSize != null && opts.betSize == null) {
    opts.betSize = opts.initialBetSize
  }
  if (!opts.onLoss) opts.onLoss = 'reset'
  const smartAtPct = opts.b2bSmartTakeProfitAtPct as number | undefined
  if (smartAtPct != null && smartAtPct > 0 && !opts.b2bSmartTakeProfitAtMulti) {
    opts.b2bSmartTakeProfitAtMulti = smartAtPct >= 10 ? smartAtPct / 100 : smartAtPct
  }
  delete opts.b2bSmartTakeProfitAtPct
  if (typeof opts.b2bSmartTakeProfitAtMulti === 'number' && opts.b2bSmartTakeProfitAtMulti >= 10) {
    opts.b2bSmartTakeProfitAtMulti = opts.b2bSmartTakeProfitAtMulti / 100
  }
  return opts
}

/** Fehlende Profil-Felder aus Script/JSON ergänzen (B2B-Keno). */
export function normalizeProfileOptions(options: Record<string, unknown>): Record<string, unknown> {
  const o = { ...options }
  if (o.initialBetSize != null && o.betSize == null) o.betSize = o.initialBetSize
  if (!o.onLoss) o.onLoss = 'reset'
  if (String(o.game || '').toLowerCase() === 'keno' && !o.onWin) o.onWin = 'b2b'
  const smartAtPct = o.b2bSmartTakeProfitAtPct as number | undefined
  if (smartAtPct != null && smartAtPct > 0 && !o.b2bSmartTakeProfitAtMulti) {
    o.b2bSmartTakeProfitAtMulti = smartAtPct >= 10 ? smartAtPct / 100 : smartAtPct
  }
  if (typeof o.b2bSmartTakeProfitAtMulti === 'number' && o.b2bSmartTakeProfitAtMulti >= 10) {
    o.b2bSmartTakeProfitAtMulti = o.b2bSmartTakeProfitAtMulti / 100
  }
  const chainPct = o.b2bSmartTakeProfitAtChainProfitPctOfBase as number | undefined
  if (typeof chainPct === 'number' && chainPct > 0 && chainPct < 10) {
    o.b2bSmartTakeProfitAtChainProfitPctOfBase = chainPct * 100
  }
  delete o.b2bSmartTakeProfitAtPct
  return o
}

/**
 * Führt ein Profil (options-Objekt) aus. Gibt eine Stop-Funktion zurück.
 * Einsatz in options (initialBetSize/betSize) = USD; usdRates wird zur Umrechnung in die gewählte Währung genutzt.
 */
export function runProfileSession(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ScriptRunCallbacks,
  usdRates?: Record<string, number>,
  accessToken?: string
): () => void {
  const signal = { cancelled: false }
  runProfile(normalizeProfileOptions(options), currency, callbacks, signal, usdRates, accessToken).finally(() =>
    callbacks.onStopped?.()
  )
  return () => {
    signal.cancelled = true
  }
}

/**
 * Parst Profil-JSON (Antebot-Format: { name, options }) und startet Session. Einsatz = USD (mit usdRates umgerechnet).
 */
export function runProfileJson(
  jsonText: string,
  currency: string,
  callbacks: ScriptRunCallbacks,
  usdRates?: Record<string, number>,
  accessToken?: string
): (() => void) | null {
  try {
    const data = JSON.parse(jsonText) as { options?: Record<string, unknown> }
    const options = data?.options ?? data
    if (!options || typeof options !== 'object') return null
    return runProfileSession(options as Record<string, unknown>, currency, callbacks, usdRates, accessToken)
  } catch {
    callbacks.onLog?.('Ungültiges Profil-JSON.')
    return null
  }
}

/**
 * Versucht aus Script-Text Konfig zu extrahieren und als Profil zu starten. Einsatz = USD (mit usdRates umgerechnet).
 */
export function runScriptAsProfile(
  scriptText: string,
  currency: string,
  callbacks: ScriptRunCallbacks,
  usdRates?: Record<string, number>,
  accessToken?: string
): (() => void) | null {
  const options = extractConfigFromScript(scriptText)
  if (!options.game) {
    callbacks.onLog?.('Im Script wurde kein game= gefunden.')
    return null
  }
  if (!options.initialBetSize && !options.betSize) options.initialBetSize = 0.01
  return runProfileSession(normalizeProfileOptions(options), currency, callbacks, usdRates, accessToken)
}
