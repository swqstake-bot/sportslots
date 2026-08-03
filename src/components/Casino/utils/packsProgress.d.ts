export const PACKS_TOTAL_CARDS = 240
export const PACKS_PROGRESS_LOG_INTERVAL_MS = 8000

export function packsHuntAmountForCurrency(currency?: string | null): number
export function packsCollectedCount(cardsCollected: unknown): number
export function packsCollectedFromBetApi(betApi: unknown): number | null
export function packsNewCardIdsFromBetApi(betApi: unknown): number[]
export function packsRemaining(collected: number, total?: number): number
export function isPacksCollectionComplete(collected: number, total?: number): boolean
export function formatPacksProgressLog(
  collected: number,
  opts?: { newIds?: number[]; prevCollected?: number | null }
): string
export function publishPacksProgress(collected: number, total?: number): void
