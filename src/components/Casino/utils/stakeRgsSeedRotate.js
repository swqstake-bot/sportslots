import { buildStakeCasinoFairnessReferer, rotateStakeRgsGameSeed } from '../api/stakeFairness'
import { skipStakeEngineEndRoundAfterSuccessfulPlay } from '../api/providers/stakeEngine'

const SESSION_PROBE_DELAY_MS = 400
const STAKE_RGS_FAIRNESS_AFTER_SPIN_MS = 500
const STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS = 4

function seedSwitchErrText(err) {
  if (err == null) return 'unknown'
  if (typeof err === 'string') return err
  if (typeof err === 'number' || typeof err === 'boolean') return String(err)
  if (err instanceof Error) return err.message || String(err)
  const m = err?.message
  if (m != null) return String(m)
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * True when RGS round is still open (bonus/FS) — seed rotate should wait.
 * @param {unknown} rawRound
 * @param {{ skipContinueOnBonus?: boolean }} [options]
 */
export function shouldDeferStakeRgsSeedReset(rawRound, options = {}) {
  return !!skipStakeEngineEndRoundAfterSuccessfulPlay(rawRound, options)
}

/**
 * Resolve Stake game UUID for fairness rotate.
 * @param {{ stakeGameId?: string } | null | undefined} slot
 * @param {{ stakeGameId?: string } | null | undefined} session
 */
export function resolveStakeRgsGameId(slot, session) {
  return String(slot?.stakeGameId || session?.stakeGameId || '').trim()
}

/**
 * Rotate Stake-RGS fairness seed and start a fresh provider session.
 * Mirrors AutoChallengeHunter seed-reset flow.
 *
 * @param {object} args
 * @param {string} args.gameId
 * @param {string} [args.clientSeed] optional 8-char alnum; empty → random
 * @param {string} args.slug
 * @param {string} [args.slotName]
 * @param {(token: string, slug: string, source: string, target: string) => Promise<object>} args.startSession
 * @param {string} args.accessToken
 * @param {string} args.sourceCurrency
 * @param {string} args.targetCurrency
 * @param {(msg: string) => void} [args.log]
 * @returns {Promise<{ ok: boolean, session?: object, seed?: string, error?: string }>}
 */
export async function rotateStakeRgsSeedAndRefreshSession({
  gameId,
  clientSeed,
  slug,
  slotName,
  startSession,
  accessToken,
  sourceCurrency,
  targetCurrency,
  log,
}) {
  const gid = String(gameId || '').trim()
  const gSlug = String(slug || '').trim()
  const label = String(slotName || gSlug || 'slot')
  const say = typeof log === 'function' ? log : () => {}

  if (!gid) {
    return { ok: false, error: 'No Stake game UUID (gameId) — refresh slots list.' }
  }
  if (typeof startSession !== 'function') {
    return { ok: false, error: 'Missing startSession' }
  }

  let lastErr = ''
  for (let seedAttempt = 0; seedAttempt < STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS; seedAttempt++) {
    try {
      if (seedAttempt === 0) {
        say(`Stake RGS seed reset — ${label}`)
        await new Promise((r) => setTimeout(r, STAKE_RGS_FAIRNESS_AFTER_SPIN_MS))
      } else {
        const backoffMs = SESSION_PROBE_DELAY_MS * seedAttempt + STAKE_RGS_FAIRNESS_AFTER_SPIN_MS
        say(
          `Stake RGS seed reset retry ${seedAttempt + 1}/${STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS} (after ${backoffMs} ms) — ${label}`
        )
        await new Promise((r) => setTimeout(r, backoffMs))
      }

      let fairnessReferer
      let fairnessLanguage
      try {
        const st = await window.electronAPI?.getStakeSessionStatus?.()
        const origin = st?.origin
        const locale =
          typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en'
        const langPart = String(locale).trim().toLowerCase().split('-')[0]
        fairnessLanguage = /^[a-z]{2}$/.test(langPart) ? langPart : 'en'
        if (origin && gSlug) {
          fairnessReferer = buildStakeCasinoFairnessReferer(origin, locale, gSlug, gid)
        }
      } catch (_) {
        /* referer optional */
      }

      const seedArg = String(clientSeed || '').trim()
      const rotated = await rotateStakeRgsGameSeed(
        gid,
        seedArg && /^[A-Za-z0-9]{8}$/.test(seedArg) ? seedArg : undefined,
        { referer: fairnessReferer, language: fairnessLanguage }
      )
      if (!rotated?.ok) {
        throw new Error(seedSwitchErrText(rotated?.error) || 'rotateSeed without activeSeed')
      }

      await new Promise((r) => setTimeout(r, SESSION_PROBE_DELAY_MS))
      const session = await startSession(accessToken, gSlug, sourceCurrency, targetCurrency)
      say(
        `Seed rotated (RGS game ${gid} · client ${rotated.seed ?? '—'}) · new session — ${label}`
      )
      return { ok: true, session, seed: rotated.seed }
    } catch (seedErr) {
      lastErr = seedSwitchErrText(seedErr)
      say(
        `Stake RGS seed reset attempt ${seedAttempt + 1}/${STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS} failed: ${lastErr}`
      )
    }
  }

  return {
    ok: false,
    error: `Stake RGS seed reset aborted after ${STAKE_RGS_SEED_RESET_SWITCH_ATTEMPTS} attempts: ${lastErr || 'unknown'}`,
  }
}

/**
 * Evaluate whether seed should rotate after a completed spin (counters already updated for this spin).
 * @param {object} opts
 * @param {number} opts.spinsSinceSeed
 * @param {number} opts.winsSinceSeed
 * @param {number} opts.lossesSinceSeed
 * @param {number} opts.winStreak
 * @param {number} opts.lossStreak
 * @param {boolean} opts.isWin
 * @param {number} opts.multi
 * @param {number} opts.seedChangeAfterSpins
 * @param {number} opts.seedChangeOnMultiplier
 * @param {number} opts.seedChangeAfterWins
 * @param {number} opts.seedChangeAfterLosses
 * @param {number} opts.seedChangeAfterWinStreak
 * @param {number} opts.seedChangeAfterLossStreak
 * @param {boolean} opts.seedResetOnLoss
 */
export function shouldTriggerStakeRgsSeedReset(opts) {
  const afterSpins = Math.max(0, Math.floor(Number(opts.seedChangeAfterSpins) || 0))
  if (afterSpins > 0 && (Number(opts.spinsSinceSeed) || 0) >= afterSpins) return true

  const onMulti = Math.max(0, Number(opts.seedChangeOnMultiplier) || 0)
  if (onMulti > 0 && Number(opts.multi) >= onMulti) return true

  const afterWins = Math.max(0, Math.floor(Number(opts.seedChangeAfterWins) || 0))
  if (afterWins > 0 && (Number(opts.winsSinceSeed) || 0) >= afterWins) return true

  const afterLosses = Math.max(0, Math.floor(Number(opts.seedChangeAfterLosses) || 0))
  if (afterLosses > 0 && (Number(opts.lossesSinceSeed) || 0) >= afterLosses) return true

  const winStreakN = Math.max(0, Math.floor(Number(opts.seedChangeAfterWinStreak) || 0))
  if (winStreakN > 0 && (Number(opts.winStreak) || 0) >= winStreakN) return true

  const lossStreakN = Math.max(0, Math.floor(Number(opts.seedChangeAfterLossStreak) || 0))
  if (lossStreakN > 0 && (Number(opts.lossStreak) || 0) >= lossStreakN) return true

  if (opts.seedResetOnLoss && !opts.isWin) return true

  return false
}

/** Any seed-reset option enabled. */
export function hasAnyStakeRgsSeedOption(opts) {
  return (
    Math.max(0, Math.floor(Number(opts.seedChangeAfterSpins) || 0)) > 0 ||
    Math.max(0, Number(opts.seedChangeOnMultiplier) || 0) > 0 ||
    Math.max(0, Math.floor(Number(opts.seedChangeAfterWins) || 0)) > 0 ||
    Math.max(0, Math.floor(Number(opts.seedChangeAfterLosses) || 0)) > 0 ||
    Math.max(0, Math.floor(Number(opts.seedChangeAfterWinStreak) || 0)) > 0 ||
    Math.max(0, Math.floor(Number(opts.seedChangeAfterLossStreak) || 0)) > 0 ||
    !!opts.seedResetOnLoss
  )
}
