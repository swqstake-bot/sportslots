export function placeDiceBet(params: { amount: number; currency: string; rollUnder: number; rollOver?: boolean }): Promise<{ iid?: string; payout?: number } | null>
export function placeLimboBet(params: { amount: number; currency: string; targetMultiplier: number }): Promise<{ iid?: string; payout?: number } | null>
export function placeMinesBet(params: { amount: number; currency: string; mineCount: number }): Promise<{ iid?: string; id?: string; payout?: number } | null>
export function minesReveal(params: { identifier: string; fields: number[] }): Promise<{ id?: string; payout?: number; active?: boolean } | null>
export function minesCashout(params: { identifier: string }): Promise<{ id?: string; payout?: number } | null>
export function placePlinkoBet(params: { amount: number; currency: string; rows: number; risk: string }): Promise<{ iid?: string; payout?: number } | null>
export function placeKenoBet(params: { amount: number; currency: string; picks: number[]; risk: string }): Promise<{ iid?: string; payout?: number } | null>
export function rotateSeedPair(seed?: string): Promise<{ ok: boolean }>
export function stakeBlackjackBet(params: { amount: number; currency: string; identifier?: string }): Promise<unknown>
export function stakeBlackjackNext(params: { action: string; identifier?: string }): Promise<unknown>
