/**
 * Script-Ausführung: Entweder Profil-JSON ausführen oder aus Script-Code Konfig extrahieren und als Profil laufen lassen.
 */

import { runProfile } from '../profileRunner/runProfile'

export interface ScriptRunCallbacks {
  onLog?: (msg: string) => void
  onBetPlaced?: (result: { iid?: string; payout?: number; amount?: number; error?: string }) => void
  onStats?: (stats: { bets: number; profit: number; wins: number; losses: number }) => void
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
    [/seedChangeAfterRolls\s*=\s*(\d+)/, 'seedChangeAfterRolls'],
    [/increaseBetAfterSeedReset\s*=\s*([\d.]+)/, 'increaseBetAfterSeedReset'],
    [/mines\s*=\s*(\d+)/, 'mines'],
    [/diamonds\s*=\s*(\d+)/, 'diamonds'],
  ]
  for (const [re, key] of patterns) {
    const m = scriptText.match(re)
    if (m) {
      if (key === 'game') opts[key] = m[1]
      else if (key === 'risk') opts[key] = m[1]
      else opts[key] = Number(m[1])
    }
  }
  if (opts.divider && !opts.initialBetSize) {
    opts.initialBetSize = 100 / Number(opts.divider)
  }
  return opts
}

/**
 * Führt ein Profil (options-Objekt) aus. Gibt eine Stop-Funktion zurück.
 * Einsatz in options (initialBetSize/betSize) = USD; usdRates wird zur Umrechnung in die gewählte Währung genutzt.
 */
export function runProfileSession(
  options: Record<string, unknown>,
  currency: string,
  callbacks: ScriptRunCallbacks,
  usdRates?: Record<string, number>
): () => void {
  const signal = { cancelled: false }
  runProfile(options, currency, callbacks, signal, usdRates).finally(() => callbacks.onStopped?.())
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
  usdRates?: Record<string, number>
): (() => void) | null {
  try {
    const data = JSON.parse(jsonText) as { options?: Record<string, unknown> }
    const options = data?.options ?? data
    if (!options || typeof options !== 'object') return null
    return runProfileSession(options as Record<string, unknown>, currency, callbacks, usdRates)
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
  usdRates?: Record<string, number>
): (() => void) | null {
  const options = extractConfigFromScript(scriptText)
  if (!options.game) {
    callbacks.onLog?.('Im Script wurde kein game= gefunden.')
    return null
  }
  if (!options.initialBetSize && !options.betSize) options.initialBetSize = 0.01
  return runProfileSession(options, currency, callbacks, usdRates)
}
