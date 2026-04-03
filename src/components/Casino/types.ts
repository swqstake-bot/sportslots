export interface CasinoSlotInstance {
  id: string
  slug: string
  sourceCurrency?: string
  targetCurrency?: string
  challengeTargetMultiplier?: number
  challengeTargetMultipliers?: number[]
  minBetUsd?: number
}

export interface SlotSet {
  id: string
  name: string
  slugs: string[]
}
