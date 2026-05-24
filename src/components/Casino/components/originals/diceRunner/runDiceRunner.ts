/**
 * Dice Runner — flat loss spins, stop on target multi hit, optional seed rotation, configurable delay.
 */

import { placeDiceBet, rotateSeedPair } from '../../../api/stakeOriginalsBets'
import { isFiatCurrency, isZeroDecimalCurrency } from '../../../utils/currencyMeta'

export interface DiceRunnerConfig {
  betUsd: number
  targetMultiplier: number
  rollOver: boolean
  currency: string
  spinsPerSec: number
  /** 0 = off */
  seedChangeEverySpins: number
  seedChangeOnTargetHit: boolean
  stopOnTargetHit: boolean
  autoRerun: boolean
}

export interface DiceRunnerCallbacks {
  onLog?: (msg: string) => void
  onBetPlaced?: (row: {
    spin: number
    amount: number
    payout: number
    payoutMultiplier: number
    win: boolean
    profitUsd: number
    betUsd: number
    error?: string
  }) => void
  onStats?: (stats: {
    spins: number
    wins: number
    losses: number
    profitUsd: number
    wageredUsd: number
    betsPerSec: number
    lastMulti: number
  }) => void
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function usdToCurrencyAmount(usdAmount: number, currency: string, usdRates?: Record<string, number>): number {
  if (!usdRates || usdAmount <= 0) return usdAmount
  const cur = currency.toLowerCase()
  const rate = usdRates[cur]
  if (rate == null || rate <= 0) return usdAmount
  const amount = usdAmount / rate
  if (isZeroDecimalCurrency(cur)) return Math.max(1, Math.round(amount))
  if (isFiatCurrency(cur)) return Math.round(amount * 100) / 100
  return Math.round(amount * 1e8) / 1e8
}

function currencyAmountToUsd(amount: number, currency: string, usdRates?: Record<string, number>): number {
  if (!usdRates || amount <= 0) return amount
  const rate = usdRates[currency.toLowerCase()]
  if (rate == null || rate <= 0) return amount
  return Math.round(amount * rate * 1e8) / 1e8
}

/** Roll-under threshold for placeDiceBet. */
export function multiplierToRollUnder(targetMultiplier: number): number {
  const mult = Number(targetMultiplier)
  if (!Number.isFinite(mult) || mult < 1.01) return 49.5
  return 99 / mult
}

function spinDelayMs(spinsPerSec: number): number {
  const sps = Number(spinsPerSec)
  if (!Number.isFinite(sps) || sps <= 0) return 0
  return Math.max(0, Math.round(1000 / sps))
}

function isInsufficientBalanceError(msg: string): boolean {
  const m = String(msg || '').toLowerCase()
  return m.includes('insufficient') || m.includes('nomoney') || m.includes('balance') || m.includes('not enough')
}

async function tryRotateSeed(callbacks: DiceRunnerCallbacks, reason: string): Promise<void> {
  try {
    const rotated = await rotateSeedPair()
    if (rotated?.ok) callbacks.onLog?.(`Seed rotated (${reason}).`)
    else callbacks.onLog?.(`Seed rotation failed (${reason}).`)
  } catch (e) {
    callbacks.onLog?.(`Seed rotation error (${reason}): ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function runDiceRunner(
  config: DiceRunnerConfig,
  callbacks: DiceRunnerCallbacks,
  signal: { cancelled: boolean },
  usdRates?: Record<string, number>
): Promise<'hit' | 'stopped' | 'error' | 'balance'> {
  const cur = (config.currency || 'usdc').toLowerCase()
  const betUsd = Math.max(0.00000001, Number(config.betUsd) || 0.01)
  const targetMult = Math.max(1.01, Number(config.targetMultiplier) || 2)
  const rollUnder = multiplierToRollUnder(targetMult)
  const rollOver = config.rollOver !== false
  const delay = spinDelayMs(config.spinsPerSec)
  const seedEvery = Math.max(0, Math.floor(Number(config.seedChangeEverySpins) || 0))
  const seedOnHit = config.seedChangeOnTargetHit === true
  const stopOnHit = config.stopOnTargetHit !== false

  let spins = 0
  let wins = 0
  let losses = 0
  let profitUsd = 0
  let wageredUsd = 0
  let spinsSinceSeed = 0
  let lastMulti = 0
  const startedAt = Date.now()

  callbacks.onLog?.(
    `Dice Runner: $${betUsd.toFixed(4)} · target ${targetMult.toFixed(2)}× · ${rollOver ? 'Roll Over' : 'Roll Under'} · ~${config.spinsPerSec || 'max'} spins/s`
  )

  while (!signal.cancelled) {
    if (seedEvery > 0 && spinsSinceSeed >= seedEvery) {
      await tryRotateSeed(callbacks, `every ${seedEvery} spins`)
      spinsSinceSeed = 0
    }

    const amount = usdToCurrencyAmount(betUsd, cur, usdRates)
    spins++
    spinsSinceSeed++

    let res: Awaited<ReturnType<typeof placeDiceBet>> | null = null
    try {
      res = await placeDiceBet({ amount, currency: cur, rollUnder, rollOver })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.(`Error: ${msg}`)
      callbacks.onBetPlaced?.({
        spin: spins,
        amount,
        payout: 0,
        payoutMultiplier: 0,
        win: false,
        profitUsd,
        betUsd,
        error: msg,
      })
      if (isInsufficientBalanceError(msg)) return 'balance'
      return 'error'
    }

    if (!res) {
      callbacks.onLog?.('No response from diceRoll.')
      return 'error'
    }

    const payout = Number(res.payout) || 0
    const payoutMultiplier = Number(res.payoutMultiplier) || 0
    const payoutUsd = currencyAmountToUsd(payout, cur, usdRates)
    const betUsdRound = currencyAmountToUsd(amount, cur, usdRates)
    const win = payout > 0
    wageredUsd += betUsdRound
    profitUsd += payoutUsd - betUsdRound
    lastMulti = payoutMultiplier > 0 ? payoutMultiplier : win ? payoutUsd / Math.max(betUsdRound, 1e-12) : 0

    if (win) wins++
    else losses++

    const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000)
    callbacks.onBetPlaced?.({
      spin: spins,
      amount,
      payout,
      payoutMultiplier,
      win,
      profitUsd,
      betUsd: betUsdRound,
    })
    callbacks.onStats?.({
      spins,
      wins,
      losses,
      profitUsd,
      wageredUsd,
      betsPerSec: spins / elapsedSec,
      lastMulti,
    })

    if (win && payoutMultiplier >= targetMult * 0.995) {
      callbacks.onLog?.(`Target hit: ${payoutMultiplier.toFixed(2)}× ≥ ${targetMult.toFixed(2)}×`)
      if (seedOnHit) await tryRotateSeed(callbacks, 'target hit')
      if (stopOnHit) {
        callbacks.onLog?.('Stopped.')
        return 'hit'
      }
      callbacks.onLog?.('Continuing (stop on target hit disabled).')
    }

    if (delay > 0) await sleep(delay)
  }

  return 'stopped'
}
