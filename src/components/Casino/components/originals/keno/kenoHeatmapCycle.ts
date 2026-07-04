import {
  createKenoHeatmapTracker,
  pickRandomKenoNumbers,
} from './kenoHeatmapTracker'

export type KenoHeatmapPhase = 'preroll' | 'attack'

export interface KenoHeatmapCycleConfig {
  enabled: boolean
  prerollBets: number
  attackBets: number
  prerollBetSizeUsd: number
  attackBetSizeUsd: number
  pickCount: number
  heatmapRange: number
}

export interface KenoHeatmapCycleState {
  phase: KenoHeatmapPhase
  betsInPhase: number
  cycleNumber: number
}

function optBool(options: Record<string, unknown>, key: string): boolean {
  const v = options[key]
  if (v === true || v === 'true' || v === 1 || v === '1') return true
  return false
}

function optNum(options: Record<string, unknown>, key: string, fallback: number): number {
  const n = Number(options[key])
  return Number.isFinite(n) ? n : fallback
}

export function readKenoHeatmapCycleConfig(
  options: Record<string, unknown>,
  initialBetUsd: number
): KenoHeatmapCycleConfig | null {
  const enabled =
    optBool(options, 'kenoHeatmapCycleEnabled') || optBool(options, 'isKenoHeatmapCycle')
  if (!enabled) return null

  const prerollBets = Math.max(1, Math.floor(optNum(options, 'kenoHeatmapPrerollBets', 100)))
  const attackBets = Math.max(1, Math.floor(optNum(options, 'kenoHeatmapAttackBets', 20)))
  const prerollBetSizeUsd = Math.max(
    0.00000001,
    optNum(options, 'kenoHeatmapPrerollBetSize', optNum(options, 'preRollsBetSize', 0.01))
  )
  const attackBetSizeUsd = Math.max(
    0.00000001,
    optNum(options, 'kenoHeatmapAttackBetSize', initialBetUsd)
  )
  const pickCount = Math.max(1, Math.min(10, Math.floor(optNum(options, 'kenoHeatmapPickCount', 4))))
  const heatmapRange = Math.max(1, Math.min(39, Math.floor(optNum(options, 'heatmapRange', 39))))

  return {
    enabled: true,
    prerollBets,
    attackBets,
    prerollBetSizeUsd,
    attackBetSizeUsd,
    pickCount,
    heatmapRange,
  }
}

export function createKenoHeatmapCycleState(): KenoHeatmapCycleState {
  return { phase: 'preroll', betsInPhase: 0, cycleNumber: 1 }
}

export function createKenoHeatmapCycleRuntime(config: KenoHeatmapCycleConfig) {
  return {
    config,
    state: createKenoHeatmapCycleState(),
    tracker: createKenoHeatmapTracker(config.heatmapRange),
  }
}

export type KenoHeatmapCycleRuntime = ReturnType<typeof createKenoHeatmapCycleRuntime>

export function resolveKenoCycleRound(
  runtime: KenoHeatmapCycleRuntime,
  baseOpts: Record<string, unknown>
): { betSizeUsd: number; opts: Record<string, unknown>; log?: string } {
  const { config, state, tracker } = runtime
  const betSizeUsd =
    state.phase === 'preroll' ? config.prerollBetSizeUsd : config.attackBetSizeUsd

  if (state.phase === 'attack') {
    const numbers = tracker.getHotPicks(config.pickCount)
    const log =
      state.betsInPhase === 0
        ? `Keno heatmap → attack ${config.attackBets}× @ $${config.attackBetSizeUsd.toFixed(4)} | picks: ${numbers.join(', ')} (cycle ${state.cycleNumber})`
        : undefined
    return {
      betSizeUsd,
      opts: { ...baseOpts, useHeatmapHotNumbers: false, numbers },
      log,
    }
  }

  const numbers = pickRandomKenoNumbers(config.pickCount, config.heatmapRange)
  const log =
    state.betsInPhase === 0
      ? `Keno heatmap → preroll ${config.prerollBets}× @ $${config.prerollBetSizeUsd.toFixed(4)} (cycle ${state.cycleNumber})`
      : undefined
  return {
    betSizeUsd,
    opts: { ...baseOpts, useHeatmapHotNumbers: false, numbers },
    log,
  }
}

export function tickKenoHeatmapCycle(
  runtime: KenoHeatmapCycleRuntime,
  drawn: number[] | undefined,
  onLog?: (msg: string) => void
) {
  const { config, state, tracker } = runtime
  if (drawn?.length) tracker.recordDrawn(drawn)
  state.betsInPhase += 1

  if (state.phase === 'preroll' && state.betsInPhase >= config.prerollBets) {
    const hot = tracker.getHotPicks(config.pickCount)
    state.phase = 'attack'
    state.betsInPhase = 0
    onLog?.(
      `Preroll fertig (${config.prerollBets} draws) → attack mit hot picks: ${hot.join(', ')}`
    )
    return
  }

  if (state.phase === 'attack' && state.betsInPhase >= config.attackBets) {
    state.phase = 'preroll'
    state.betsInPhase = 0
    state.cycleNumber += 1
    tracker.reset()
    onLog?.(
      `Attack-Runde fertig → neuer Preroll (${config.prerollBets}× @ $${config.prerollBetSizeUsd.toFixed(4)}, cycle ${state.cycleNumber})`
    )
  }
}
