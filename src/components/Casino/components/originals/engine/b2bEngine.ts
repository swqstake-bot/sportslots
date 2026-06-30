/**
 * B2B multiplier tracking and compounding helpers.
 */

export type B2bState = {
  chainWins: number
  chainMultiProduct: number
  chainBaseUsd: number
  chainStartProfitUsd: number
  takeProfitCount: number
  securedUsd: number
}

export function createB2bState(): B2bState {
  return {
    chainWins: 0,
    chainMultiProduct: 1,
    chainBaseUsd: 0,
    chainStartProfitUsd: 0,
    takeProfitCount: 0,
    securedUsd: 0,
  }
}

export function resetB2bChain(state: B2bState, profitUsd: number): void {
  state.chainWins = 0
  state.chainMultiProduct = 1
  state.chainBaseUsd = 0
  state.chainStartProfitUsd = profitUsd
}

export function onB2bWin(
  state: B2bState,
  lastWin: boolean,
  multi: number,
  effectiveBaseUsd: number,
  profitBeforeRound: number,
  tookProfit: boolean
): number {
  if (!lastWin || state.chainBaseUsd <= 0) {
    state.chainBaseUsd = effectiveBaseUsd
    state.chainStartProfitUsd = profitBeforeRound
  }
  state.chainWins = lastWin ? state.chainWins + 1 : 1
  if (multi > 0) {
    const b2bMulti = lastWin ? state.chainMultiProduct * multi : multi
    state.chainMultiProduct = tookProfit ? 1 : b2bMulti
    return b2bMulti
  }
  return 0
}

export function pctOrMultiplierToRatio(v: number): number {
  if (v <= 0) return 0
  return v >= 10 ? v / 100 : v
}

/** Lightweight B2B streak tracker for workbench extended stops. */
export type B2bRuntimeState = {
  chainWins: number
  runningProduct: number
}

export function createB2bRuntime(): B2bRuntimeState {
  return { chainWins: 0, runningProduct: 1 }
}

export function recordB2bWin(state: B2bRuntimeState, multi: number, enabled: boolean): number {
  if (!enabled || multi <= 0) {
    recordB2bLoss(state)
    return 0
  }
  state.chainWins += 1
  state.runningProduct *= multi
  return state.runningProduct
}

export function recordB2bLoss(state: B2bRuntimeState): void {
  state.chainWins = 0
  state.runningProduct = 1
}

export function shouldStopB2bStreak(state: B2bRuntimeState, threshold: number): boolean {
  return threshold > 0 && state.chainWins >= threshold
}
