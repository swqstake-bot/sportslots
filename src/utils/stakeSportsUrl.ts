/**
 * Parses a Stake sports event URL or path into API slugs.
 * Example: https://stake.com/de/sports/mma/ufc/ufc-fight-night-evloev-vs-murphy
 * → { sport: "mma", category: "ufc", tournament: "ufc-fight-night-evloev-vs-murphy" }
 */
/**
 * Normalisiert Sport-Bet-Share-ID für die Zwischenablage (z. B. `sport:587418751`).
 * Akzeptiert rohes `sport:…`, URL-encoded Werte oder volle Stake-Links mit `iid=`.
 */
export function formatSportBetShareIdForCopy(iid?: string | null): string | null {
  let raw = String(iid ?? '').trim()
  if (!raw) return null
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // keep raw
  }
  const fromQuery = raw.match(/[?&]iid=([^&]+)/i)?.[1]
  if (fromQuery) {
    try {
      raw = decodeURIComponent(fromQuery)
    } catch {
      raw = fromQuery
    }
  }
  const idMatch = raw.match(/sport:([0-9]+)/i)
  if (idMatch) return `sport:${idMatch[1]}`
  if (/^sport:/i.test(raw)) return raw.split(/[?#&]/)[0] || raw
  return raw || null
}

type SportBetIidSource = { iid?: string | null; bet?: { iid?: string | null } | null }

/** Sammelt `sport:…`-IDs aus Wetten (dedupliziert, Reihenfolge behalten). */
export function collectSportBetShareIds(bets: SportBetIidSource[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const bet of bets) {
    const id = formatSportBetShareIdForCopy(bet?.bet?.iid ?? bet?.iid)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Top-N-Liste für Zwischenablage: `sport:1 sport:2 sport:3` */
export function joinSportBetShareIds(ids: string[]): string {
  return ids.filter(Boolean).join(' ')
}

export function parseStakeSportsTournamentUrl(input: string): {
  sport: string;
  category: string;
  tournament: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\/sports\/([^/]+)\/([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  return {
    sport: decodeURIComponent(m[1].toLowerCase()),
    category: decodeURIComponent(m[2].toLowerCase()),
    tournament: decodeURIComponent(m[3].toLowerCase()),
  };
}
