import type { DiceRunnerConfig } from './runDiceRunner'

const STORAGE_KEY = 'originalsDiceRunnerConfig'

export type DiceRunnerPersisted = Pick<
  DiceRunnerConfig,
  | 'betUsd'
  | 'targetMultiplier'
  | 'rollOver'
  | 'currency'
  | 'spinsPerSec'
  | 'seedChangeEverySpins'
  | 'seedChangeOnTargetHit'
  | 'stopOnTargetHit'
  | 'autoRerun'
  | 'twoPhaseHunt'
  | 'huntMultiplier'
  | 'endHuntMultiplier'
  | 'repeatAfterMoonshot'
>

const DEFAULTS: DiceRunnerPersisted = {
  betUsd: 0.01,
  targetMultiplier: 100,
  rollOver: true,
  currency: 'usdc',
  spinsPerSec: 8,
  seedChangeEverySpins: 0,
  seedChangeOnTargetHit: true,
  stopOnTargetHit: true,
  autoRerun: false,
  twoPhaseHunt: false,
  huntMultiplier: 30,
  endHuntMultiplier: 9900,
  repeatAfterMoonshot: false,
}

export function loadDiceRunnerConfig(): DiceRunnerPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<DiceRunnerPersisted>
    return {
      betUsd: Number(parsed.betUsd) > 0 ? Number(parsed.betUsd) : DEFAULTS.betUsd,
      targetMultiplier: Number(parsed.targetMultiplier) >= 1.01 ? Number(parsed.targetMultiplier) : DEFAULTS.targetMultiplier,
      rollOver: parsed.rollOver !== false,
      currency: String(parsed.currency || DEFAULTS.currency).toLowerCase(),
      spinsPerSec: Number(parsed.spinsPerSec) > 0 ? Number(parsed.spinsPerSec) : DEFAULTS.spinsPerSec,
      seedChangeEverySpins: Math.max(0, Math.floor(Number(parsed.seedChangeEverySpins) || 0)),
      seedChangeOnTargetHit: parsed.seedChangeOnTargetHit !== false,
      stopOnTargetHit: parsed.stopOnTargetHit !== false,
      autoRerun: parsed.autoRerun === true,
      twoPhaseHunt: parsed.twoPhaseHunt === true,
      huntMultiplier:
        Number(parsed.huntMultiplier) >= 1.01 ? Number(parsed.huntMultiplier) : DEFAULTS.huntMultiplier,
      endHuntMultiplier:
        Number(parsed.endHuntMultiplier) >= 1.01
          ? Number(parsed.endHuntMultiplier)
          : DEFAULTS.endHuntMultiplier,
      repeatAfterMoonshot: parsed.repeatAfterMoonshot === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveDiceRunnerConfig(cfg: DiceRunnerPersisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore quota */
  }
}
