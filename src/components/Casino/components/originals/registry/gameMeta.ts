/** Per-game copy and dashboard grouping (neutral labels). */

export type OriginalsGameCategory = 'core' | 'action' | 'slots' | 'table'

export interface OriginalsGameMeta {
  category: OriginalsGameCategory
  tagline: string
  /** Short hint shown above game options */
  optionsHint?: string
}

export const GAME_META: Record<string, OriginalsGameMeta> = {
  dice: { category: 'core', tagline: 'Roll over/under a target multiplier', optionsHint: 'Set target × and direction. Combo mode uses per-part targets.' },
  limbo: { category: 'core', tagline: 'Crash-style target multiplier', optionsHint: 'Win when the result is at or above your target ×.' },
  mines: { category: 'core', tagline: 'Reveal gems, avoid mines', optionsHint: 'Mines + gems define grid risk. Automatic uses profile defaults.' },
  plinko: { category: 'core', tagline: 'Drop ball through peg rows', optionsHint: 'Rows and risk level change payout spread.' },
  keno: { category: 'core', tagline: 'Pick numbers, match draws', optionsHint: 'Risk tier affects volatility. Number picks use profile/heatmap settings.' },
  snakes: { category: 'action', tagline: 'Board path with difficulty tiers', optionsHint: 'Difficulty and roll count per bet round.' },
  pump: { category: 'action', tagline: 'Pump rounds before cashout', optionsHint: 'Difficulty and round index for each bet.' },
  hilo: { category: 'action', tagline: 'Higher / lower card chain', optionsHint: 'Optional start card; rounds before auto cashout.' },
  'dragon-tower': { category: 'action', tagline: 'Climb tower, pick eggs', optionsHint: 'Difficulty + comma-separated egg tile indices.' },
  diamonds: { category: 'action', tagline: 'Match gem patterns', optionsHint: 'Single bet — pattern resolved server-side.' },
  flip: { category: 'action', tagline: 'Heads/tails streak guesses', optionsHint: 'Comma-separated guess sequence per bet.' },
  wheel: { category: 'action', tagline: 'Spin wheel segments', optionsHint: 'Segment count and risk tier.' },
  darts: { category: 'action', tagline: 'Target board difficulty', optionsHint: 'Difficulty affects payout curve.' },
  bars: { category: 'action', tagline: 'Pick bar tiles', optionsHint: 'Difficulty + optional tile indices.' },
  chicken: { category: 'action', tagline: 'Cross rounds safely', optionsHint: 'Difficulty and target round.' },
  tarot: { category: 'action', tagline: 'Card draw difficulty', optionsHint: 'Medium is a common default for tarot bets.' },
  cases: { category: 'action', tagline: 'Open case by difficulty', optionsHint: 'Difficulty selects case tier.' },
  packs: { category: 'action', tagline: 'Pack open', optionsHint: 'Amount + currency only; optional pack identifier.' },
  'rock-paper-scissors': { category: 'action', tagline: 'Multi-round RPS guesses', optionsHint: 'Guesses list and number of rounds.' },
  'slots-scarab': { category: 'slots', tagline: 'Scarab spin lines', optionsHint: 'Active paylines per spin.' },
  'slots-samurai': { category: 'slots', tagline: 'Blue Samurai spins', optionsHint: 'Single spin per bet; optional next-spin flow in API.' },
  'tome-of-life': { category: 'slots', tagline: 'Tome slot lines', optionsHint: 'Lines count for each GraphQL spin.' },
  blackjack: { category: 'table', tagline: 'Standard blackjack hand', optionsHint: 'One hand per bet — no extra parameters.' },
  roulette: { category: 'table', tagline: 'Table game (API pending)', optionsHint: 'Capture stake.com network when placing a manual bet.' },
  baccarat: { category: 'table', tagline: 'Table game (API pending)', optionsHint: 'Capture stake.com network when placing a manual bet.' },
  'video-poker': { category: 'table', tagline: 'Video poker (API pending)', optionsHint: 'Capture stake.com network when placing a manual bet.' },
  drill: { category: 'action', tagline: 'Drill game (API pending)', optionsHint: 'API not wired yet.' },
  moles: { category: 'action', tagline: 'Moles game (API pending)', optionsHint: 'API not wired yet.' },
  blitz: { category: 'action', tagline: 'Blitz game (API pending)', optionsHint: 'API not wired yet.' },
}

export const CATEGORY_LABELS: Record<OriginalsGameCategory, string> = {
  core: 'Core',
  action: 'Action & Arcade',
  slots: 'Original Slots',
  table: 'Table',
}

export function getGameMeta(slug: string): OriginalsGameMeta {
  return GAME_META[slug] ?? { category: 'action', tagline: 'Stake Originals game' }
}
