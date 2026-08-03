/**
 * Dice Runner — flat loss spins, stop on target multi hit, optional seed rotation, configurable delay.
 */

import { placeDiceBet, rotateSeedPair } from '../../../api/stakeOriginalsBets'
import { isFiatCurrency, isGoldCoinCurrency, isZeroDecimalCurrency } from '../../../utils/currencyMeta'

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
  /** Hunt klein bis huntMultiplier, dann 1× Wette mit vollem Gewinn auf endHuntMultiplier. */
  twoPhaseHunt: boolean
  huntMultiplier: number
  endHuntMultiplier: number
  /** Nach Moonshot wieder mit Hunt-Phase starten. */
  repeatAfterMoonshot: boolean
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
    phase?: 'hunt' | 'moonshot'
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
  if (usdAmount <= 0) return usdAmount
  if (isGoldCoinCurrency(currency)) return Math.round(usdAmount * 100) / 100
  if (!usdRates) return usdAmount
  const cur = currency.toLowerCase()
  const rate = usdRates[cur]
  if (rate == null || rate <= 0) return usdAmount
  const amount = usdAmount / rate
  if (isZeroDecimalCurrency(cur)) return Math.max(1, Math.round(amount))
  if (isFiatCurrency(cur)) return Math.round(amount * 100) / 100
  return Math.round(amount * 1e8) / 1e8
}

function currencyAmountToUsd(amount: number, currency: string, usdRates?: Record<string, number>): number {
  if (amount <= 0) return amount
  if (isGoldCoinCurrency(currency)) return Math.round(amount * 100) / 100
  if (!usdRates) return amount
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

function normalizeCurrencyAmount(amount: number, currency: string): number {
  const cur = currency.toLowerCase()
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (isZeroDecimalCurrency(cur)) return Math.max(1, Math.floor(n))
  if (isFiatCurrency(cur)) return Math.round(n * 100) / 100
  return Math.round(n * 1e8) / 1e8
}

async function placeDiceSpin(
  amount: number,
  currency: string,
  targetMultiplier: number,
  rollOver: boolean
): Promise<Awaited<ReturnType<typeof placeDiceBet>> | null> {
  const rollUnder = multiplierToRollUnder(targetMultiplier)
  return placeDiceBet({ amount, currency, rollUnder, rollOver })
}

export type DiceRunnerEndReason =
  | 'hit'
  | 'moonshot_win'
  | 'moonshot_loss'
  | 'stopped'
  | 'error'
  | 'balance'

export async function runDiceRunner(
  config: DiceRunnerConfig,
  callbacks: DiceRunnerCallbacks,
  signal: { cancelled: boolean },
  usdRates?: Record<string, number>
): Promise<DiceRunnerEndReason> {
  const cur = (config.currency || 'usdc').toLowerCase()
  const betUsd = Math.max(0.00000001, Number(config.betUsd) || 0.01)
  const twoPhase = config.twoPhaseHunt === true
  const huntMult = Math.max(1.01, Number(config.huntMultiplier) || Number(config.targetMultiplier) || 30)
  const endMult = Math.max(1.01, Number(config.endHuntMultiplier) || 9900)
  const targetMult = twoPhase ? huntMult : Math.max(1.01, Number(config.targetMultiplier) || 2)
  const rollOver = config.rollOver !== false
  const delay = spinDelayMs(config.spinsPerSec)
  const seedEvery = Math.max(0, Math.floor(Number(config.seedChangeEverySpins) || 0))
  const seedOnHit = config.seedChangeOnTargetHit === true
  const stopOnHit = config.stopOnTargetHit !== false
  const repeatMoonshot = config.repeatAfterMoonshot === true

  let spins = 0
  let wins = 0
  let losses = 0
  let profitUsd = 0
  let wageredUsd = 0
  let spinsSinceSeed = 0
  let lastMulti = 0
  const startedAt = Date.now()

  const emitStats = () => {
    const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000)
    callbacks.onStats?.({
      spins,
      wins,
      losses,
      profitUsd,
      wageredUsd,
      betsPerSec: spins / elapsedSec,
      lastMulti,
    })
  }

  const recordBet = (row: {
    amount: number
    payout: number
    payoutMultiplier: number
    win: boolean
    betUsdRound: number
    payoutUsd: number
    phase: 'hunt' | 'moonshot'
    error?: string
  }) => {
    wageredUsd += row.betUsdRound
    profitUsd += row.payoutUsd - row.betUsdRound
    lastMulti =
      row.payoutMultiplier > 0
        ? row.payoutMultiplier
        : row.win
          ? row.payoutUsd / Math.max(row.betUsdRound, 1e-12)
          : 0
    if (row.win) wins++
    else losses++
    callbacks.onBetPlaced?.({
      spin: spins,
      amount: row.amount,
      payout: row.payout,
      payoutMultiplier: row.payoutMultiplier,
      win: row.win,
      profitUsd,
      betUsd: row.betUsdRound,
      phase: row.phase,
      error: row.error,
    })
    emitStats()
  }

  callbacks.onLog?.(
    twoPhase
      ? `Dice Runner (Hunt→Moonshot): hunt $${betUsd.toFixed(4)} @ ${huntMult.toFixed(2)}× → 1× @ ${endMult.toFixed(0)}× mit Gewinn · ${rollOver ? 'Roll Over' : 'Roll Under'} · ~${config.spinsPerSec || 'max'} spins/s`
      : `Dice Runner: $${betUsd.toFixed(4)} · target ${targetMult.toFixed(2)}× · ${rollOver ? 'Roll Over' : 'Roll Under'} · ~${config.spinsPerSec || 'max'} spins/s`
  )

  const runMoonshot = async (
    payoutAmount: number
  ): Promise<'moonshot_win' | 'moonshot_loss' | 'error' | 'balance'> => {
    const moonAmount = normalizeCurrencyAmount(payoutAmount, cur)
    if (!(moonAmount > 0)) {
      callbacks.onLog?.('Moonshot übersprungen — kein Gewinn-Betrag.')
      return 'moonshot_loss'
    }
    callbacks.onLog?.(
      `Moonshot: ${moonAmount} ${cur.toUpperCase()} @ ${endMult.toFixed(2)}× (voller Hunt-Gewinn)`
    )
    spins++
    spinsSinceSeed++

    let res: Awaited<ReturnType<typeof placeDiceBet>> | null = null
    try {
      res = await placeDiceSpin(moonAmount, cur, endMult, rollOver)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.(`Moonshot error: ${msg}`)
      recordBet({
        amount: moonAmount,
        payout: 0,
        payoutMultiplier: 0,
        win: false,
        betUsdRound: currencyAmountToUsd(moonAmount, cur, usdRates),
        payoutUsd: 0,
        phase: 'moonshot',
        error: msg,
      })
      if (isInsufficientBalanceError(msg)) return 'balance'
      return 'error'
    }

    if (!res) {
      callbacks.onLog?.('Moonshot: keine Antwort von diceRoll.')
      return 'error'
    }

    const payout = Number(res.payout) || 0
    const payoutMultiplier = Number(res.payoutMultiplier) || 0
    const payoutUsd = currencyAmountToUsd(payout, cur, usdRates)
    const betUsdRound = currencyAmountToUsd(moonAmount, cur, usdRates)
    const win = payout > 0
    recordBet({
      amount: moonAmount,
      payout,
      payoutMultiplier,
      win,
      betUsdRound,
      payoutUsd,
      phase: 'moonshot',
    })

    const moonshotWon =
      win && payoutMultiplier >= endMult * 0.995
    if (moonshotWon) {
      callbacks.onLog?.(`Moonshot JACKPOT: ${payoutMultiplier.toFixed(2)}× ≥ ${endMult.toFixed(2)}×`)
    } else if (win) {
      callbacks.onLog?.(`Moonshot Gewinn, aber unter Ziel: ${payoutMultiplier.toFixed(2)}× < ${endMult.toFixed(2)}×`)
    } else {
      callbacks.onLog?.(`Moonshot verfehlt @ ${endMult.toFixed(2)}× — Hunt geht weiter.`)
    }
    if (seedOnHit && moonshotWon) await tryRotateSeed(callbacks, 'moonshot win')
    return moonshotWon ? 'moonshot_win' : 'moonshot_loss'
  }

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
      res = await placeDiceSpin(amount, cur, targetMult, rollOver)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.(`Error: ${msg}`)
      recordBet({
        amount,
        payout: 0,
        payoutMultiplier: 0,
        win: false,
        betUsdRound: currencyAmountToUsd(amount, cur, usdRates),
        payoutUsd: 0,
        phase: 'hunt',
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
    recordBet({
      amount,
      payout,
      payoutMultiplier,
      win,
      betUsdRound,
      payoutUsd,
      phase: 'hunt',
    })

    if (win && payoutMultiplier >= targetMult * 0.995) {
      callbacks.onLog?.(`Hunt hit: ${payoutMultiplier.toFixed(2)}× ≥ ${targetMult.toFixed(2)}×`)
      if (seedOnHit && !twoPhase) await tryRotateSeed(callbacks, 'target hit')

      if (twoPhase) {
        if (seedOnHit) await tryRotateSeed(callbacks, 'hunt hit')
        const moonResult = await runMoonshot(payout)
        if (moonResult === 'error' || moonResult === 'balance') return moonResult
        if (moonResult === 'moonshot_win') {
          if (repeatMoonshot) {
            callbacks.onLog?.('Moonshot JACKPOT — Hunt neu starten (repeat).')
            if (delay > 0) await sleep(delay)
            continue
          }
          return 'moonshot_win'
        }
        if (delay > 0) await sleep(delay)
        continue
      }

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
