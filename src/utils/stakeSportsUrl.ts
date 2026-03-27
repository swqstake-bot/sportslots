/**
 * Parses a Stake sports event URL or path into API slugs.
 * Example: https://stake.com/de/sports/mma/ufc/ufc-fight-night-evloev-vs-murphy
 * → { sport: "mma", category: "ufc", tournament: "ufc-fight-night-evloev-vs-murphy" }
 */
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
