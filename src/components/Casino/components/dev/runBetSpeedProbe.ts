/**
 * Controlled bet-speed staircase probe (Originals GraphQL or Stake Engine RGS).
 * Measure only — does not change production hunter/turbo delays.
 */

import { placeDiceBet, placeLimboBet } from '../../api/stakeOriginalsBets'
import { getProvider } from '../../api/providers'
import { getStakeEngineGameSlugPrefixes } from '../../api/stakeSlotsApi'
import { computeBetFromMinBetAndSession } from '../challengeHub/autorunBetSizing'
import { isRateLimitError } from '../originals/engine/turboConfig'
import { usdToCurrencyAmount, multiplierToRollUnder } from '../originals/diceRunner/runDiceRunner'
import { isGoldCoinCurrency } from '../../utils/currencyMeta'

export type ProbeKind = 'originals-dice' | 'originals-limbo' | 'stake-engine'

export type ProbeStageStop = 'duration' | 'count'

export type BetSpeedProbeConfig = {
  kind: ProbeKind
  currency: string
  /** Wallet / session source currency (slots). */
  sourceCurrency: string
  /** RGS target currency (slots). */
  targetCurrency: string
  betUsd: number
  workers: 1 | 2 | 4
  stagesBps: number[]
  stageStop: ProbeStageStop
  stageDurationSec: number
  betsPerStage: number
  /** Stake Engine slug when kind === stake-engine */
  slotSlug?: string
  slotProviderId?: string
  accessToken: string
  usdRates?: Record<string, number>
}

export type ProbeStageResult = {
  targetBps: number
  achievedBps: number
  bets: number
  errors: number
  throttleErrors: number
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  elapsedMs: number
  ok: boolean
  intervalMsAtTarget: number
}

export type BetSpeedProbeCallbacks = {
  onLog?: (msg: string) => void
  onStageStart?: (stageIndex: number, targetBps: number) => void
  onStageDone?: (stageIndex: number, result: ProbeStageResult) => void
  onProgress?: (info: {
    stageIndex: number
    targetBps: number
    bets: number
    errors: number
    throttleErrors: number
    elapsedMs: number
  }) => void
}

export type BetSpeedProbeSummary = {
  stages: ProbeStageResult[]
  /** Highest stage with low error rate → suggested spawn interval. */
  recommendedIntervalMs: number | null
  recommendedBps: number | null
  stopped: boolean
}

export type ProbeSignal = { cancelled: boolean }

const LOW_ERROR_RATE = 0.02
const PROGRESS_EVERY_MS = 400

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[idx]
}

export function isThrottleHttpError(err: unknown): boolean {
  if (isRateLimitError(err)) return true
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('service unavailable') ||
    msg.includes('bad gateway') ||
    msg.includes('gateway timeout') ||
    msg.includes('cloudflare')
  )
}

export function isInsufficientBalanceError(err: unknown): boolean {
  if (err && typeof err === 'object' && (err as { insufficientBalance?: boolean }).insufficientBalance) {
    return true
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('insufficient') ||
    msg.includes('nomoney') ||
    msg.includes('not enough') ||
    msg.includes('err_ipb')
  )
}

/** webSlots entry looks like Stake Engine / RGS (providerId or known slug prefix). */
export function isStakeEngineWebSlot(slot: { slug?: string; providerId?: string }): boolean {
  const pid = String(slot.providerId || '').toLowerCase()
  if (pid === 'stakeengine') return true
  const slug = String(slot.slug || '').toLowerCase()
  if (!slug) return false
  return getStakeEngineGameSlugPrefixes().some((p: string) => slug.startsWith(String(p).toLowerCase()))
}

function normalizeStages(raw: number[]): number[] {
  const out = [...new Set(raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))]
  out.sort((a, b) => a - b)
  return out.length ? out : [5, 8, 10, 12, 15, 20]
}

function resolveOriginalsAmount(betUsd: number, currency: string, usdRates?: Record<string, number>): number {
  const cur = (currency || 'usdc').toLowerCase()
  const usd = Math.max(0.01, Number(betUsd) || 0.01)
  const amount = usdToCurrencyAmount(usd, cur, usdRates)
  if (isGoldCoinCurrency(cur)) return Math.max(0.01, Math.round(amount * 100) / 100)
  return amount > 0 ? amount : usd
}

async function placeOneOriginals(
  kind: 'originals-dice' | 'originals-limbo',
  amount: number,
  currency: string
): Promise<void> {
  if (kind === 'originals-limbo') {
    await placeLimboBet({ amount, currency, targetMultiplier: 2 })
    return
  }
  const rollUnder = multiplierToRollUnder(2)
  await placeDiceBet({ amount, currency, rollUnder, rollOver: false })
}

type SlotWorker = {
  session: unknown
  placeBet: (session: unknown, betAmount: number, extra: boolean, autoplay: boolean, opts: object) => Promise<unknown>
  betAmount: number
  slug: string
}

async function prepareSlotWorkers(
  config: BetSpeedProbeConfig,
  workers: number,
  onLog?: (msg: string) => void
): Promise<{ workers: SlotWorker[]; usdAt: number }> {
  const slug = String(config.slotSlug || '').toLowerCase()
  if (!slug) throw new Error('Pick a Stake Engine slot slug')
  const providerId = config.slotProviderId || 'stakeEngine'
  const provider = getProvider(providerId) as {
    startSession?: (t: string, sl: string, src: string, tgt: string) => Promise<unknown>
    placeBet?: SlotWorker['placeBet']
  }
  if (!provider?.startSession || !provider?.placeBet) {
    throw new Error(`Provider ${providerId} missing startSession/placeBet`)
  }

  const rate =
    isGoldCoinCurrency(config.targetCurrency)
      ? 1
      : Number(config.usdRates?.[config.targetCurrency.toLowerCase()] || 0)
  if (!(rate > 0) && !isGoldCoinCurrency(config.targetCurrency)) {
    throw new Error(`No FX rate for ${config.targetCurrency}`)
  }
  const effectiveRate = rate > 0 ? rate : 1

  const sessions: SlotWorker[] = []
  let usdAt = 0
  for (let i = 0; i < workers; i++) {
    if (i > 0) await sleep(150)
    const session = await provider.startSession(
      config.accessToken,
      slug,
      config.sourceCurrency,
      config.targetCurrency
    )
    const sized = computeBetFromMinBetAndSession(
      session as { betLevels?: number[] },
      config.targetCurrency,
      effectiveRate,
      Math.max(0.01, config.betUsd || 0.01)
    )
    usdAt = sized.usdAt
    sessions.push({
      session,
      placeBet: provider.placeBet.bind(provider),
      betAmount: sized.betAmount,
      slug,
    })
    onLog?.(
      `Slot session ${i + 1}/${workers}: ${slug} bet≈$${sized.usdAt.toFixed(3)} (minor ${sized.betAmount})`
    )
  }
  return { workers: sessions, usdAt }
}

async function runStage(
  config: BetSpeedProbeConfig,
  targetBps: number,
  signal: ProbeSignal,
  slotWorkers: SlotWorker[] | null,
  originalsAmount: number | null,
  callbacks: BetSpeedProbeCallbacks,
  stageIndex: number
): Promise<ProbeStageResult> {
  const workers = Math.max(1, Math.min(4, config.workers || 1)) as 1 | 2 | 4
  const spawnIntervalMs = Math.max(1, Math.round(1000 / targetBps))
  const maxInFlight = workers
  const durationMs =
    config.stageStop === 'duration'
      ? Math.max(5, config.stageDurationSec) * 1000
      : Number.POSITIVE_INFINITY
  const betCap =
    config.stageStop === 'count' ? Math.max(10, config.betsPerStage) : Number.POSITIVE_INFINITY

  let bets = 0
  let errors = 0
  let throttleErrors = 0
  let hardStop = false
  const latencies: number[] = []
  let inFlight = 0
  let nextWorker = 0
  const t0 = Date.now()
  let lastProgressAt = 0

  const pushProgress = (force = false) => {
    const now = Date.now()
    if (!force && now - lastProgressAt < PROGRESS_EVERY_MS) return
    lastProgressAt = now
    callbacks.onProgress?.({
      stageIndex,
      targetBps,
      bets,
      errors,
      throttleErrors,
      elapsedMs: now - t0,
    })
  }

  const fireOne = async (): Promise<void> => {
    const started = Date.now()
    try {
      if (config.kind === 'stake-engine') {
        if (!slotWorkers?.length) throw new Error('No slot session')
        const w = slotWorkers[nextWorker % slotWorkers.length]
        nextWorker += 1
        await w.placeBet(w.session, w.betAmount, false, false, { slotSlug: w.slug })
      } else {
        await placeOneOriginals(config.kind, originalsAmount!, config.currency)
      }
      latencies.push(Date.now() - started)
      bets += 1
    } catch (e) {
      errors += 1
      if (isThrottleHttpError(e)) throttleErrors += 1
      const msg = e instanceof Error ? e.message : String(e)
      if (errors <= 5 || throttleErrors <= 3) {
        callbacks.onLog?.(`bet error: ${msg.slice(0, 160)}`)
      }
      if (isInsufficientBalanceError(e)) {
        hardStop = true
        signal.cancelled = true
        callbacks.onLog?.('Insufficient balance — stopping probe.')
      }
    } finally {
      inFlight -= 1
      pushProgress()
    }
  }

  callbacks.onLog?.(
    `Stage ${stageIndex + 1}: target ${targetBps}/s (interval ${spawnIntervalMs}ms, workers ${maxInFlight})`
  )

  while (!signal.cancelled && !hardStop) {
    const elapsed = Date.now() - t0
    if (elapsed >= durationMs || bets + inFlight >= betCap) break

    if (inFlight >= maxInFlight) {
      await sleep(2)
      continue
    }

    inFlight += 1
    void fireOne()
    await sleep(spawnIntervalMs)
  }

  // Drain in-flight (bounded) so we don't leave runaway bets after Stop.
  const drainDeadline = Date.now() + 15_000
  while (inFlight > 0 && Date.now() < drainDeadline) {
    await sleep(20)
  }
  pushProgress(true)

  const elapsedMs = Math.max(1, Date.now() - t0)
  const achievedBps = (bets * 1000) / elapsedMs
  const sorted = [...latencies].sort((a, b) => a - b)
  const errorRate = bets + errors > 0 ? errors / (bets + errors) : 1
  const ok = bets > 0 && errorRate <= LOW_ERROR_RATE && throttleErrors === 0

  return {
    targetBps,
    achievedBps,
    bets,
    errors,
    throttleErrors,
    latencyP50Ms: percentile(sorted, 50),
    latencyP95Ms: percentile(sorted, 95),
    elapsedMs,
    ok,
    intervalMsAtTarget: spawnIntervalMs,
  }
}

export async function runBetSpeedProbe(
  config: BetSpeedProbeConfig,
  signal: ProbeSignal,
  callbacks: BetSpeedProbeCallbacks = {}
): Promise<BetSpeedProbeSummary> {
  const stagesBps = normalizeStages(config.stagesBps)
  const workers = Math.max(1, Math.min(4, config.workers || 1)) as 1 | 2 | 4
  const stages: ProbeStageResult[] = []

  callbacks.onLog?.(
    `Probe start: ${config.kind}, ~$${config.betUsd}/bet, workers=${workers}, stages=${stagesBps.join(',')}`
  )

  let slotWorkers: SlotWorker[] | null = null
  let originalsAmount: number | null = null

  if (config.kind === 'stake-engine') {
    const prepared = await prepareSlotWorkers(config, workers, callbacks.onLog)
    slotWorkers = prepared.workers
  } else {
    originalsAmount = resolveOriginalsAmount(config.betUsd, config.currency, config.usdRates)
    callbacks.onLog?.(
      `Originals amount: ${originalsAmount} ${config.currency} (from ~$${config.betUsd})`
    )
  }

  for (let i = 0; i < stagesBps.length; i++) {
    if (signal.cancelled) break
    const targetBps = stagesBps[i]
    callbacks.onStageStart?.(i, targetBps)
    const result = await runStage(config, targetBps, signal, slotWorkers, originalsAmount, callbacks, i)
    stages.push(result)
    callbacks.onStageDone?.(i, result)
    callbacks.onLog?.(
      `Stage ${i + 1} done: ${result.achievedBps.toFixed(2)}/s, bets=${result.bets}, err=${result.errors}, 429/5xx=${result.throttleErrors}, p50=${result.latencyP50Ms ?? '—'}ms, p95=${result.latencyP95Ms ?? '—'}ms ${result.ok ? 'OK' : 'NOISY'}`
    )
    if (signal.cancelled) break
    // Brief cool-down between stages
    await sleep(500)
  }

  let recommendedIntervalMs: number | null = null
  let recommendedBps: number | null = null
  for (const s of stages) {
    if (s.ok) {
      recommendedBps = s.targetBps
      recommendedIntervalMs = s.intervalMsAtTarget
    }
  }
  // Slight buffer if we found a good stage: prefer ceil(1000 / bps) already used; bump +5ms if last ok was noisy-adjacent
  if (recommendedIntervalMs != null) {
    recommendedIntervalMs = Math.max(55, recommendedIntervalMs)
  }

  if (recommendedIntervalMs != null) {
    callbacks.onLog?.(
      `Recommendation: interval_ms=${recommendedIntervalMs} (~${recommendedBps}/s) — low error rate; copy into turbo/settings later.`
    )
  } else {
    callbacks.onLog?.('Recommendation: none — all stages noisy or stopped early. Lower rates or check session.')
  }

  return {
    stages,
    recommendedIntervalMs,
    recommendedBps,
    stopped: signal.cancelled,
  }
}

export const DEFAULT_PROBE_STAGES_BPS = [5, 8, 10, 12, 15, 20]
