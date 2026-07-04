/** Pro GraphQL-Request: Stake validiert `activeSportBets(limit)` mit Obergrenze (typisch ≤50). */
export const ACTIVE_SPORT_BETS_PAGE_SIZE = 50

/**
 * Max. gleichzeitig offene Sportwetten (Stake-API-Konto-Limit).
 * Stake-Limit Stand 2026: 300 (früher 150).
 */
export const ACTIVE_SPORT_BETS_MAX_TOTAL = 300

/** Offset für „Limit voll?“-Probe: wenn Eintrag existiert → ≥ MAX_TOTAL aktiv. */
export const ACTIVE_SPORT_BETS_LIMIT_PROBE_OFFSET = ACTIVE_SPORT_BETS_MAX_TOTAL - 1

export function isActiveSportBetsLimitError(message: string): boolean {
  const m = String(message || '').toLowerCase()
  if (!m) return false
  const sportCtx =
    m.includes('active') ||
    m.includes('sport bet') ||
    m.includes('sportbet') ||
    m.includes('sport-bet')
  if (!sportCtx) return false
  return (
    m.includes('limit') ||
    m.includes('maximum') ||
    m.includes('max ') ||
    /\b150\b/.test(m) ||
    /\b300\b/.test(m)
  )
}
