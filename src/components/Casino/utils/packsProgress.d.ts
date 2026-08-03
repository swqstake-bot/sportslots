export const PACKS_TOTAL_CARDS = 240

export function packsHuntAmountForCurrency(currency?: string | null): number
export function packsCollectedCount(cardsCollected: unknown): number
export function packsCollectedFromBetApi(betApi: unknown): number | null
export function packsRemaining(collected: number, total?: number): number
export function isPacksCollectionComplete(collected: number, total?: number): boolean
export function publishPacksProgress(collected: number, total?: number): void
