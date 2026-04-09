export interface CasinoSlotInstance {
  id: string
  slug: string
  sourceCurrency?: string
  targetCurrency?: string
  challengeTargetMultiplier?: number
  challengeTargetMultipliers?: number[]
  minBetUsd?: number
  promoSource?: string
}

export interface CasinoChallengeSelection {
  gameSlug: string
  gameName?: string
  currency?: string
  targetMultiplier?: number
  targetMultipliers?: number[]
  minBetUsd?: number
  autoStart?: boolean
  autospinCount?: number
  promoSource?: string
}

export interface SlotSet {
  id: string
  name: string
  slugs: string[]
}
