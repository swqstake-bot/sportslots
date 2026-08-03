/**

 * Workbench options → runProfile options + extended stop checks.

 */



import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'



export function workbenchOptionsToProfile(options: OriginalsWorkbenchOptions): Record<string, unknown> {
  const o = { ...options } as Record<string, unknown>
  o.game = options.game || 'dice'
  if (options.targetSelectionMode === 'combo' && (options.comboParts?.length ?? 0) > 0) {
    o.onWin = 'b2b'
  }
  if (options.stopOnWagerAbove && !options.stopOnTotalWagered) {
    o.stopOnTotalWagered = options.stopOnWagerAbove
  }
  if (options.betHigh != null && options.game === 'dice') {
    o.rollOver = options.betHigh
  }
  // Packs card hunt: infinite bets; stake is forced in the runner from currency.
  if (options.huntPacksCards && String(o.game).toLowerCase() === 'packs') {
    o.numberOfBets = 0
  }
  return o
}



export type WorkbenchStopContext = {

  profitUsd: number

  peakProfitUsd: number

  wageredUsdThisRound: number

  multi: number

  b2bMulti: number

  b2bStreak?: number

  totalWageredUsd: number

  betShareId: string | null | undefined

  lastWin: boolean

  bets: number

  rollNumber?: number

}



export type WorkbenchStopResult = { stop: boolean; reason?: string }



export type WorkbenchStopCheckContext = {

  profitUsd: number

  peakProfitUsd: number

  totalWageredUsd: number

  lastMulti: number

  lastBetId: string

  lastWin: boolean

  rollNumber: number

  b2bProduct: number

  b2bStreak: number

}



function betIdStr(id: string | null | undefined): string {

  return String(id ?? '').trim()

}



export function evaluateWorkbenchStops(

  options: OriginalsWorkbenchOptions,

  ctx: WorkbenchStopContext

): WorkbenchStopResult {

  const drawdown = Number(options.stopOnDrawdown) || 0

  if (drawdown > 0) {

    const dd = ctx.peakProfitUsd - ctx.profitUsd

    if (dd >= drawdown) return { stop: true, reason: `Drawdown $${dd.toFixed(4)} ≥ $${drawdown}` }

  }



  const wagerAbove = Number(options.stopOnWagerAbove) || 0

  if (wagerAbove > 0 && ctx.wageredUsdThisRound >= wagerAbove) {

    return { stop: true, reason: `Wager $${ctx.wageredUsdThisRound.toFixed(4)} ≥ $${wagerAbove}` }

  }



  if (options.isStopOnMultiplier && (Number(options.stopOnMultiplier) || 0) > 0) {

    const need = Number(options.stopOnMultiplier)

    if (ctx.multi >= need) return { stop: true, reason: `Multiplier ${ctx.multi.toFixed(2)}× ≥ ${need}×` }

  }



  if (options.isStopOnB2bMultiplierSum && (Number(options.stopOnB2bMultiplierSum) || 0) > 0) {

    const need = Number(options.stopOnB2bMultiplierSum)

    if (ctx.b2bMulti >= need) return { stop: true, reason: `B2B sum ${ctx.b2bMulti.toFixed(2)}× ≥ ${need}×` }

  }

  if (options.isStopOnB2bStreak && (Number(options.stopOnB2bStreak) || 0) > 0) {
    const need = Number(options.stopOnB2bStreak)
    const streak = Number(ctx.b2bStreak) || 0
    if (streak >= need) return { stop: true, reason: `B2B streak ${streak} ≥ ${need}` }
  }

  if (ctx.totalWageredUsd > 0) {
    const rtp = ((ctx.totalWageredUsd + ctx.profitUsd) / ctx.totalWageredUsd) * 100
    if (options.isStopOnRTPAbove && (Number(options.stopOnRTPAbove) || 0) > 0) {
      const need = Number(options.stopOnRTPAbove)
      if (rtp >= need) return { stop: true, reason: `RTP ${rtp.toFixed(1)}% ≥ ${need}%` }
    }
    if (options.isStopOnRTPBelow && (Number(options.stopOnRTPBelow) || 0) > 0) {
      const need = Number(options.stopOnRTPBelow)
      if (rtp <= need) return { stop: true, reason: `RTP ${rtp.toFixed(1)}% ≤ ${need}%` }
    }
  }

  if (options.isStopOnExactRoll && (Number(options.stopOnExactRoll) || 0) > 0) {
    const need = Number(options.stopOnExactRoll)
    const roll = ctx.rollNumber
    if (roll != null && Math.abs(roll - need) < 0.001) {
      return { stop: true, reason: `Dice roll ${roll} = ${need}` }
    }
  }



  const numBets = Number(options.numberOfBets) || 0

  if (numBets > 0 && ctx.bets >= numBets) {

    return { stop: true, reason: `${numBets} bets completed` }

  }



  const id = betIdStr(ctx.betShareId)

  if (id) {

    if (options.isStopIfBetIdContains && options.stopIfBetIdContains) {

      if (id.includes(String(options.stopIfBetIdContains))) {

        return { stop: true, reason: `Bet ID contains "${options.stopIfBetIdContains}"` }

      }

    }

    if (options.isStopIfBetIdEndsOn && options.stopIfBetIdEndsOn) {

      if (id.endsWith(String(options.stopIfBetIdEndsOn))) {

        return { stop: true, reason: `Bet ID ends with "${options.stopIfBetIdEndsOn}"` }

      }

    }

    if (options.isStopIfBetIdIs) {

      const digits = id.replace(/\D/g, '')

      const last = digits.slice(-1)

      if (last && options.stopIfBetIdIs === 'even' && Number(last) % 2 === 0) {

        return { stop: true, reason: 'Bet ID is even' }

      }

      if (last && options.stopIfBetIdIs === 'odd' && Number(last) % 2 === 1) {

        return { stop: true, reason: 'Bet ID is odd' }

      }

    }

    if (options.isStopIfLast3BetIdDigitsContain && options.stopIfLast3BetIdDigitsContain) {

      const digits = id.replace(/\D/g, '')

      const last3 = digits.slice(-3)

      if (last3.includes(String(options.stopIfLast3BetIdDigitsContain))) {

        return { stop: true, reason: `Last 3 digits contain "${options.stopIfLast3BetIdDigitsContain}"` }

      }

    }

  }



  return { stop: false }

}



export function checkWorkbenchStops(

  options: OriginalsWorkbenchOptions,

  ctx: WorkbenchStopCheckContext

): string | undefined {

  const result = evaluateWorkbenchStops(options, {

    profitUsd: ctx.profitUsd,

    peakProfitUsd: ctx.peakProfitUsd,

    wageredUsdThisRound: 0,

    multi: ctx.lastMulti,

    b2bMulti: ctx.b2bProduct,

    b2bStreak: ctx.b2bStreak,

    totalWageredUsd: ctx.totalWageredUsd,

    betShareId: ctx.lastBetId,

    lastWin: ctx.lastWin,

    bets: ctx.rollNumber,

    rollNumber: ctx.rollNumber,

  })

  return result.stop ? result.reason : undefined

}


