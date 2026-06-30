import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import { workbenchOptionsToProfile } from './workbenchStops'
import { runProfile, type ProfileRunnerCallbacks } from '../profileRunner/runProfile'
import { runTurboProfile } from '../profileRunner/runTurboProfile'
import { normalizeTurboSettings } from './turboConfig'
import type { WorkbenchSettings } from '../workbench/workbenchStorage'
import type { SessionSignal } from './sessionSignal'

export type WorkbenchSessionSettings = Pick<
  WorkbenchSettings,
  | 'clientSeed'
  | 'maxFiatBetSize'
  | 'turboMode'
  | 'turboFireIntervalMs'
  | 'turboMaxInFlight'
  | 'requestInterval'
  | 'forceRestartDelaySeconds'
  | 'requestIntervalRateLimitIncrement'
>

export type OriginalsSessionCallbacks = ProfileRunnerCallbacks & {
  onComboComplete?: () => void
}

/** Unified Automatic session — normal loop or turbo (parallel) mode. */
export async function runOriginalsSession(
  options: OriginalsWorkbenchOptions,
  currency: string,
  callbacks: OriginalsSessionCallbacks,
  signal: SessionSignal,
  usdRates?: Record<string, number>,
  accessToken?: string
): Promise<void> {
  const profileOpts = workbenchOptionsToProfile(options)
  profileOpts._workbench = true
  profileOpts._workbenchOptions = { ...options }
  if (options._workbenchSettings) {
    profileOpts._workbenchSettings = options._workbenchSettings
  }

  const turboOn = Boolean(options._workbenchSettings?.turboMode)
  const wantsB2b =
    String(options.onWin || '').toLowerCase() === 'b2b' ||
    (options.targetSelectionMode === 'combo' && (options.comboParts?.length ?? 0) > 0)
  if (turboOn && wantsB2b) {
    callbacks.onLog?.('B2B active — turbo disabled (parallel bets cannot chain wins).')
  }
  if (turboOn && !wantsB2b) {
    const ws = options._workbenchSettings!
    const turbo = normalizeTurboSettings({
      fireIntervalMs: ws.turboFireIntervalMs,
      maxInFlight: ws.turboMaxInFlight,
    })
    await runTurboProfile(
      profileOpts,
      currency,
      callbacks,
      signal,
      turbo,
      usdRates,
      accessToken
    )
    return
  }

  await runProfile(profileOpts, currency, callbacks, signal, usdRates, accessToken)
}

export async function runManualOriginalsBet(
  game: string,
  amountUsd: number,
  currency: string,
  options: OriginalsWorkbenchOptions,
  usdRates?: Record<string, number>
): Promise<{ payout?: number; multi?: number; error?: string }> {
  const signal: SessionSignal = { cancelled: false, paused: false }
  let result: { payout?: number; multi?: number; error?: string } = {}
  const profileOpts = workbenchOptionsToProfile({ ...options, game, initialBetSize: amountUsd, betSize: amountUsd })
  profileOpts.numberOfBets = 1
  profileOpts._workbench = true
  profileOpts._workbenchOptions = { ...options, game, initialBetSize: amountUsd, betSize: amountUsd }
  await runProfile(
    profileOpts,
    currency,
    {
      onBetPlaced: (r) => {
        if (r.error) result = { error: r.error }
        else result = { payout: r.payoutUsd, multi: r.multi }
      },
    },
    signal,
    usdRates
  )
  return result
}
