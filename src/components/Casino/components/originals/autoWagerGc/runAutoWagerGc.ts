/**
 * Auto Wager GC — Stake.eu top-up claim + Dice gold wager loop.
 * States: META → WAGER_LOOP (gold ≥ 10) → TURNSTILE → CLAIM → …
 * Claim wait is derived from API lastClaim + interval (if any), GraphQL errors,
 * VipMeta refresh — not a user-configured cooldown. Soft lastClaim+5m only as logged fallback;
 * otherwise poll every ~45s while gold < 10.
 */
import { placeDiceBet } from '../../../api/stakeOriginalsBets'
import {
  claimTopUpBonus,
  fetchTopUpMeta,
  formatClaimWait,
  isTopUpCooldownError,
  parseClaimWaitMsFromMessage,
  TOPUP_CLAIM_POLL_MS,
  TOPUP_SOFT_COOLDOWN_MS,
  topUpIntervalMsFromMeta,
  topUpReadyAtMs,
} from '../../../api/stakeTopUpBonus'
import { refreshWalletBalances, walletBalanceMajor } from '../../../../../utils/walletBalance'
import { multiplierToRollUnder } from '../games/targetMath'

export type AutoWagerGcPhase =
  | 'idle'
  | 'meta'
  | 'turnstile'
  | 'claim'
  | 'wager'
  | 'cooldown'
  | 'error'
  | 'stopped'

export interface AutoWagerGcConfig {
  /** Gold bet size (default 100). */
  betGold: number
  /** Dice target multi (default 1.012 ≈ 99% RTP). */
  targetMultiplier: number
  /** Delay between dice bets (default 125ms). */
  paceMs: number
  /** Only claim when gold balance is below this (default 10). */
  claimBelowGold: number
}

export interface AutoWagerGcHooks {
  onPhase?: (phase: AutoWagerGcPhase, detail?: string) => void
  onLog?: (line: string) => void
  onStats?: (stats: AutoWagerGcStats) => void
  signal: { cancelled: boolean }
}

export interface AutoWagerGcStats {
  claims: number
  spins: number
  claimedGold: number
  /** Cumulative stake amounts placed this run (GC). */
  wageredGold: number
  goldBalance: number
  lastError?: string
}

const DEFAULTS: AutoWagerGcConfig = {
  betGold: 100,
  targetMultiplier: 1.012,
  paceMs: 125,
  claimBelowGold: 10,
}

function sleep(ms: number, signal: { cancelled: boolean }) {
  return new Promise<void>((resolve) => {
    const t0 = Date.now()
    const tick = () => {
      if (signal.cancelled || Date.now() - t0 >= ms) {
        resolve()
        return
      }
      setTimeout(tick, Math.min(250, ms - (Date.now() - t0)))
    }
    tick()
  })
}

async function solveTurnstileToken(): Promise<string> {
  const api = window.electronAPI
  if (!api?.solveEuTurnstile) {
    throw new Error('solveEuTurnstile IPC unavailable — restart app / rebuild electron')
  }
  const res = await api.solveEuTurnstile({})
  if (!res?.ok || !res.token) {
    throw new Error(res?.error || 'Turnstile failed')
  }
  return res.token
}

function goldFromStore(): number {
  return walletBalanceMajor('gold')
}

/**
 * Size stake so a single loss can land gold under claimBelow.
 * Far above threshold → preferredBet; near threshold → shrink so loss → just under claimBelow.
 * e.g. claimBelow=10, gold=120, preferred=100 → min(100,120,110.01)=100 → loss → 20
 * e.g. claimBelow=10, gold=15, preferred=100 → min(100,15,5.01)=5.01 → loss → 9.99
 * e.g. gold=1000, preferred=100 → min(100,1000,990.01)=100
 */
function stakeForClaimThreshold(gold: number, preferredBet: number, claimBelow: number): number {
  const targetAfterLoss = claimBelow - 0.01
  const toReachClaimable = Math.max(0.01, gold - targetAfterLoss)
  return Math.min(preferredBet, gold, toReachClaimable)
}

export async function runAutoWagerGc(
  config: Partial<AutoWagerGcConfig>,
  hooks: AutoWagerGcHooks
): Promise<void> {
  const cfg: AutoWagerGcConfig = {
    betGold: Math.max(1, Number(config.betGold) || DEFAULTS.betGold),
    targetMultiplier: Math.max(1.0102, Number(config.targetMultiplier) || DEFAULTS.targetMultiplier),
    paceMs: Math.max(50, Number(config.paceMs) || DEFAULTS.paceMs),
    claimBelowGold: Math.max(1, Number(config.claimBelowGold) || DEFAULTS.claimBelowGold),
  }
  const { signal, onPhase, onLog, onStats } = hooks
  const log = (msg: string) => onLog?.(msg)
  const phase = (p: AutoWagerGcPhase, detail?: string) => onPhase?.(p, detail)

  const stats: AutoWagerGcStats = {
    claims: 0,
    spins: 0,
    claimedGold: 0,
    wageredGold: 0,
    goldBalance: goldFromStore(),
  }
  const emitStats = () => onStats?.({ ...stats })

  const rollUnder = multiplierToRollUnder(cfg.targetMultiplier)
  log(
    `Start Auto Wager GC — bet ${cfg.betGold} GC @ ${cfg.targetMultiplier}× (RU ${rollUnder.toFixed(2)}), pace ${cfg.paceMs}ms, claim when gold < ${cfg.claimBelowGold}`
  )

  /** Absolute ms when claim is believed available (from error / lastClaim+interval). */
  let claimReadyAt = 0
  /** Interval from API meta if present; otherwise null (HAR: topUp has no claimInterval). */
  let knownIntervalMs: number | null = null
  /** Soft lastClaim+5m estimate for UI only while polling. */
  let softReadyAt = 0

  /** Update known interval + soft lastClaim+5m UI estimate. Does not block claiming. */
  const noteMetaTiming = (lastClaim: string | null | undefined, intervalMs: number | null) => {
    if (intervalMs != null && intervalMs > 0) knownIntervalMs = intervalMs
    if (lastClaim) {
      const soft = topUpReadyAtMs(lastClaim, TOPUP_SOFT_COOLDOWN_MS)
      if (soft > Date.now()) softReadyAt = Math.max(softReadyAt, soft)
    }
  }

  /**
   * After a failed claim: arm wait from lastClaim + API interval when present.
   * Soft lastClaim+5m is UI/log only — polling remains the no-interval fallback.
   */
  const armWaitFromMetaAfterFail = (
    lastClaim: string | null | undefined,
    intervalMs: number | null,
    source: string
  ) => {
    noteMetaTiming(lastClaim, intervalMs)
    if (intervalMs != null && intervalMs > 0) {
      const ready = topUpReadyAtMs(lastClaim, intervalMs)
      if (ready > Date.now()) {
        claimReadyAt = Math.max(claimReadyAt, ready)
        log(
          `Claim wait from ${source}: lastClaim + interval ${Math.round(intervalMs / 1000)}s → next in ${formatClaimWait(ready - Date.now())}`
        )
      }
    } else if (lastClaim && softReadyAt > Date.now()) {
      log(
        `No claim interval in API (${source}) — soft fallback lastClaim+5m est. ${formatClaimWait(softReadyAt - Date.now())} (poll, not hard wait)`
      )
    }
  }

  /** Sleep until readyAt (or poll window), updating "next claim in Xm Ys". */
  async function waitForClaimSlot(readyAt: number, label: string) {
    while (!signal.cancelled) {
      const remaining = readyAt - Date.now()
      if (remaining <= 0) break
      phase('cooldown', `next claim in ${formatClaimWait(remaining)}`)
      await sleep(Math.min(remaining, 1000), signal)
    }
    if (!signal.cancelled) {
      log(`${label} — slot open, retrying claim`)
    }
  }

  try {
    while (!signal.cancelled) {
      phase('meta', 'Fetching balance / top-up meta')
      let gold = goldFromStore()
      let lastClaim: string | null | undefined
      let topUpActive = true

      try {
        const meta = await fetchTopUpMeta()
        gold = meta.goldBalance
        lastClaim = meta.topUpBonus?.lastClaim
        topUpActive = meta.topUpBonus?.active !== false
        const intervalMs = topUpIntervalMsFromMeta(meta.topUpBonus) ?? knownIntervalMs
        noteMetaTiming(lastClaim, intervalMs)
        try {
          await refreshWalletBalances()
          gold = goldFromStore() || gold
        } catch {
          /* keep meta gold */
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.lastError = msg
        emitStats()
        log(`Meta error: ${msg}`)
        phase('error', msg)
        await sleep(5000, signal)
        continue
      }

      stats.goldBalance = gold
      emitStats()

      if (signal.cancelled) break

      // Wager while gold >= claim threshold; shrink bet near threshold so a loss lands < claimBelow
      if (gold >= cfg.claimBelowGold) {
        phase('wager', `Gold ${gold.toFixed(2)} — dice loop`)
        log(`Wager loop — gold ${gold.toFixed(2)} (claim when < ${cfg.claimBelowGold})`)
        while (!signal.cancelled) {
          gold = goldFromStore()
          if (gold < cfg.claimBelowGold) break

          const stake = stakeForClaimThreshold(gold, cfg.betGold, cfg.claimBelowGold)
          if (stake < 0.01) break

          try {
            const bet = await placeDiceBet({
              amount: stake,
              currency: 'gold',
              rollUnder,
              rollOver: false,
            })
            stats.spins += 1
            stats.wageredGold += stake
            const payout = Number(bet?.payout ?? 0) || 0
            const multi = Number(bet?.payoutMultiplier ?? 0) || 0
            // Optimistic local balance: stake deducts bet, credits payout
            const next = Math.max(0, gold - stake + payout)
            try {
              const { useUserStore } = await import('../../../../../store/userStore')
              useUserStore.getState().patchBalance('gold', next)
            } catch {
              /* ignore */
            }
            stats.goldBalance = next
            emitStats()
            if (stats.spins % 25 === 0 || multi >= cfg.targetMultiplier || stake < cfg.betGold) {
              log(
                `Spin #${stats.spins} stake ${stake.toFixed(2)} GC multi ${multi.toFixed(4)}× payout ${payout.toFixed(2)} GC`
              )
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            stats.lastError = msg
            emitStats()
            log(`Dice error: ${msg}`)
            try {
              await refreshWalletBalances()
            } catch {
              /* ignore */
            }
            await sleep(Math.max(cfg.paceMs, 1000), signal)
            if (/insufficient|balance|not enough/i.test(msg)) break
            continue
          }

          await sleep(cfg.paceMs, signal)

          if (stats.spins % 40 === 0) {
            try {
              await refreshWalletBalances()
              stats.goldBalance = goldFromStore()
              emitStats()
            } catch {
              /* ignore */
            }
          }
        }

        try {
          await refreshWalletBalances()
          stats.goldBalance = goldFromStore()
          emitStats()
        } catch {
          /* ignore */
        }
        continue
      }

      // Below claim threshold — attempt claim (server / error / meta decide wait)
      if (!topUpActive) {
        log('Top-up bonus inactive — waiting')
        phase('cooldown', 'Top-up inactive')
        await sleep(30_000, signal)
        continue
      }

      if (claimReadyAt > Date.now()) {
        const left = claimReadyAt - Date.now()
        log(`Waiting for claim — ${formatClaimWait(left)} (from server/meta)`)
        await waitForClaimSlot(claimReadyAt, 'Claim wait')
        continue
      }

      // TURNSTILE → CLAIM (no forced 5m after prior success — try immediately when gold < 10)
      phase('turnstile', 'Solving Turnstile')
      log('Solving Turnstile…')
      let token: string
      try {
        token = await solveTurnstileToken()
        log('Turnstile OK')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.lastError = msg
        emitStats()
        log(`Turnstile failed: ${msg}`)
        phase('error', msg)
        await sleep(5000, signal)
        continue
      }

      if (signal.cancelled) break

      phase('claim', 'Claiming top-up')
      try {
        const rows = await claimTopUpBonus(token)
        const amount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
        stats.claims += 1
        stats.claimedGold += amount
        log(`Claimed ${amount} GC (claim #${stats.claims}) — resuming wager`)
        // No forced client cooldown after success — wager immediately on next loop.
        claimReadyAt = 0
        softReadyAt = 0
        try {
          await refreshWalletBalances()
        } catch {
          /* ignore */
        }
        // Remember API interval (if any) for a later gold < 10 cycle; do not arm claimReadyAt now.
        try {
          const meta = await fetchTopUpMeta()
          const intervalMs = topUpIntervalMsFromMeta(meta.topUpBonus)
          if (intervalMs != null && intervalMs > 0) knownIntervalMs = intervalMs
        } catch {
          /* ignore */
        }
        stats.goldBalance = goldFromStore()
        emitStats()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.lastError = msg
        emitStats()
        log(`Claim failed: ${msg}`)
        phase('error', msg)

        const parsed = parseClaimWaitMsFromMessage(msg)
        if (parsed != null && parsed > 0) {
          claimReadyAt = Date.now() + parsed
          log(`Claim wait from GraphQL error: ${formatClaimWait(parsed)}`)
          await waitForClaimSlot(claimReadyAt, 'Error cooldown')
          continue
        }

        // Refresh VipMeta after failed claim — pick up lastClaim / interval
        try {
          const meta = await fetchTopUpMeta()
          lastClaim = meta.topUpBonus?.lastClaim
          const intervalMs = topUpIntervalMsFromMeta(meta.topUpBonus) ?? knownIntervalMs
          armWaitFromMetaAfterFail(lastClaim, intervalMs, 'VipMeta after claim fail')
          stats.goldBalance = meta.goldBalance
          emitStats()
        } catch (metaErr) {
          const m = metaErr instanceof Error ? metaErr.message : String(metaErr)
          log(`VipMeta after claim fail: ${m}`)
        }

        if (claimReadyAt > Date.now()) {
          await waitForClaimSlot(claimReadyAt, 'Meta cooldown')
          continue
        }

        // No API interval / error wait — poll every ~45s; soft lastClaim+5m only for UI/log
        if (isTopUpCooldownError(msg)) {
          log(
            `Cooldown-like claim error without parseable wait — polling every ${Math.round(TOPUP_CLAIM_POLL_MS / 1000)}s`
          )
        } else {
          log(`Claim error — retry in ${Math.round(TOPUP_CLAIM_POLL_MS / 1000)}s`)
        }

        const pollUntil = Date.now() + TOPUP_CLAIM_POLL_MS
        while (!signal.cancelled && Date.now() < pollUntil) {
          const est = softReadyAt > Date.now() ? softReadyAt - Date.now() : 0
          phase(
            'cooldown',
            est > 0
              ? `next claim in ${formatClaimWait(est)} (est.) — polling`
              : `waiting — retry claim in ${formatClaimWait(pollUntil - Date.now())}`
          )
          await sleep(Math.min(1000, pollUntil - Date.now()), signal)
        }
        continue
      }
      // Loop → wager with fresh gold
    }
  } finally {
    phase(signal.cancelled ? 'stopped' : 'idle')
    log(signal.cancelled ? 'Stopped' : 'Finished')
    emitStats()
  }
}

export const AUTO_WAGER_GC_DEFAULTS = DEFAULTS

