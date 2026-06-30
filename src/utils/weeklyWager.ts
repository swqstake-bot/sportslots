export interface ActiveRaffle {
  id?: string
  name?: string
  description?: string
  raffleUser?: {
    progress?: number
    ticketCount?: number
  } | null
}

/** LBOT updateUserWager — weekly raffle progress in USD. */
export function computeWeeklyWagerUsd(
  raffleUser?: { ticketCount?: number; progress?: number } | null
): number | null {
  if (!raffleUser) return null
  const ticketCount = raffleUser.ticketCount ?? 0
  const progress = raffleUser.progress ?? 0
  return Math.round((ticketCount + progress) * 1000 * 100) / 100
}

export function pickWeeklyRaffle(raffles: ActiveRaffle[] | null | undefined): ActiveRaffle | null {
  if (!raffles?.length) return null
  const weekly = raffles.find(
    (raffle) =>
      /weekly/i.test(String(raffle.name || '')) || /weekly/i.test(String(raffle.description || ''))
  )
  return weekly ?? raffles[0] ?? null
}

export function extractWeeklyWagerUsd(raffles: ActiveRaffle[] | null | undefined): number | null {
  const raffle = pickWeeklyRaffle(raffles)
  if (!raffle?.raffleUser) return null
  return computeWeeklyWagerUsd(raffle.raffleUser)
}
