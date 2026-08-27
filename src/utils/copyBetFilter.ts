import type { CopyBetSettings } from '../store/copyBetStore'

export type FeedOutcome = {
  id?: string
  odds?: number
  fixtureAbreviation?: string
  fixtureName?: string
  fixture?: {
    id?: string
    tournament?: { slug?: string; category?: { sport?: { slug?: string } } }
  }
}

export type FeedSportBet = {
  __typename?: string
  id?: string
  customBet?: boolean
  createdAt?: string
  potentialMultiplier?: number
  amount?: number
  currency?: string
  user?: { name?: string; preferenceHideBets?: boolean }
  outcomes?: FeedOutcome[]
}

export type FeedBoardRow = {
  id?: string
  iid?: string
  bet?: FeedSportBet
}

function splitKeywords(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function currencyToUsd(
  amount: number,
  currency: string,
  usdRates: Record<string, number>
): number {
  const cur = String(currency || '').toLowerCase()
  const rate = usdRates[cur]
  if (!Number.isFinite(amount)) return 0
  if (cur === 'usd' || cur === 'usdt' || cur === 'usdc') return amount
  if (Number.isFinite(rate) && rate > 0) return amount * rate
  return amount
}

export function usdToCurrency(
  usd: number,
  currency: string,
  usdRates: Record<string, number>
): number {
  const cur = String(currency || '').toLowerCase()
  if (cur === 'usd' || cur === 'usdt' || cur === 'usdc') return usd
  const rate = usdRates[cur]
  if (Number.isFinite(rate) && rate > 0) return usd / rate
  return usd
}

export function parseSportBet(row: FeedBoardRow): {
  id: string
  iid: string
  customBet: boolean
  odds: number
  amount: number
  currency: string
  user: string
  hidden: boolean
  outcomes: FeedOutcome[]
  sport: string
  event: string
  legs: number
  outcomeIds: string[]
} | null {
  const bet = row?.bet
  if (!bet || bet.__typename !== 'SportBet') return null
  const outcomes = Array.isArray(bet.outcomes) ? bet.outcomes : []
  const outcomeIds = outcomes.map((o) => String(o.id || '')).filter(Boolean)
  if (outcomeIds.length === 0) return null
  const sports = outcomes
    .map((o) => String(o.fixture?.tournament?.category?.sport?.slug || ''))
    .filter(Boolean)
  const events = outcomes
    .map((o) => String(o.fixtureName || o.fixtureAbreviation || ''))
    .filter(Boolean)
  return {
    id: String(bet.id || row.id || ''),
    iid: String(row.iid || ''),
    customBet: Boolean(bet.customBet),
    odds: Number(bet.potentialMultiplier) || 0,
    amount: Number(bet.amount) || 0,
    currency: String(bet.currency || '').toLowerCase(),
    user: String(bet.user?.name || (bet.user?.preferenceHideBets ? 'Hidden' : '')),
    hidden: Boolean(bet.user?.preferenceHideBets),
    outcomes,
    sport: sports[0] || '',
    event: events.join(' · '),
    legs: outcomes.length,
    outcomeIds,
  }
}

export function matchCopyFilters(
  parsed: NonNullable<ReturnType<typeof parseSportBet>>,
  settings: CopyBetSettings,
  stakeUsd: number,
  ownName: string
): string | null {
  if (settings.skipOwnBets && ownName && parsed.user.toLowerCase() === ownName.toLowerCase()) {
    return 'own bet'
  }
  if (settings.skipHiddenUsers && parsed.hidden) return 'hidden user'
  if (settings.skipCustomBet && parsed.customBet) return 'custom/SGM'
  if (parsed.odds < settings.minOdds || parsed.odds > settings.maxOdds) {
    return `odds ${parsed.odds.toFixed(2)}`
  }
  if (stakeUsd < settings.minStakeUsd || (settings.maxStakeUsd > 0 && stakeUsd > settings.maxStakeUsd)) {
    return `stake $${stakeUsd.toFixed(0)}`
  }
  if (parsed.legs < settings.minLegs || parsed.legs > settings.maxLegs) {
    return `legs ${parsed.legs}`
  }
  if (settings.sportSlug && settings.sportSlug !== 'all' && parsed.sport !== settings.sportSlug) {
    return `sport ${parsed.sport || '?'}`
  }
  const eventKeys = splitKeywords(settings.eventFilter)
  if (eventKeys.length > 0) {
    const hay = parsed.event.toLowerCase()
    if (!eventKeys.some((k) => hay.includes(k))) return 'event filter'
  }
  const includeUsers = splitKeywords(settings.userInclude)
  if (includeUsers.length > 0 && !includeUsers.includes(parsed.user.toLowerCase())) {
    return 'user not in include'
  }
  const excludeUsers = splitKeywords(settings.userExclude)
  if (excludeUsers.includes(parsed.user.toLowerCase())) return 'user excluded'
  return null
}

export function resolveCopyStakeUsd(settings: CopyBetSettings, originalStakeUsd: number): number {
  if (settings.stakeMode === 'percent') {
    const raw = originalStakeUsd * (Math.max(0, settings.copyPercent) / 100)
    const cap = settings.copyMaxUsd > 0 ? settings.copyMaxUsd : raw
    return Math.min(raw, cap)
  }
  if (settings.stakeMode === 'cap') {
    return Math.min(originalStakeUsd, Math.max(0.01, settings.copyMaxUsd || originalStakeUsd))
  }
  return Math.max(0.01, settings.copyStakeUsd)
}
