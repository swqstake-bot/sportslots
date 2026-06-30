/**
 * Per-game Stake API bet parameters (stakeOriginalsBets.js + SSP reference).
 * Profile multiplier strategies: dice & limbo only.
 */

export interface GameApiProfile {
  slug: string
  mutationOrRest: string
  betFields: string[]
  supportsMultiplierStrategy: boolean
  supportsCombo: boolean
  usesDiscreteMultipliers: boolean
  notes?: string
}

const profile = (
  slug: string,
  mutationOrRest: string,
  betFields: string[],
  extra: Partial<GameApiProfile> = {}
): GameApiProfile => ({
  slug,
  mutationOrRest,
  betFields,
  supportsMultiplierStrategy: false,
  supportsCombo: false,
  usesDiscreteMultipliers: false,
  ...extra,
})

export const GAME_API_PROFILES: Record<string, GameApiProfile> = {
  dice: profile('dice', 'diceRoll(condition, target)', ['condition', 'target'], {
    supportsMultiplierStrategy: true,
    supportsCombo: true,
    notes: 'Chance ≈ 99 / payout×',
  }),
  limbo: profile('limbo', 'limboBet(multiplierTarget)', ['multiplierTarget ≥ 1.01'], {
    supportsMultiplierStrategy: true,
    supportsCombo: true,
  }),
  plinko: profile('plinko', 'plinkoBet(rows, risk)', ['rows 8–16', 'risk'], { usesDiscreteMultipliers: true }),
  mines: profile('mines', 'minesBet → minesNext → minesCashout', ['minesCount', 'fields[]', 'cashout']),
  keno: profile('keno', 'kenoBet(numbers, risk)', ['numbers[1–39]', 'risk']),
  wheel: profile('wheel', 'REST wheel/spin', ['segments', 'risk']),
  pump: profile('pump', 'pumpBet(round, difficulty)', ['round', 'difficulty'], { usesDiscreteMultipliers: true }),
  chicken: profile('chicken', 'REST chicken/bet', ['round', 'difficulty'], { usesDiscreteMultipliers: true }),
  hilo: profile('hilo', 'hiloBet → hiloNext → hiloCashout', ['startCard', 'guess', 'rounds']),
  flip: profile('flip', 'flipBet(guesses[])', ['guesses heads|tails']),
  snakes: profile('snakes', 'REST snakes/bet', ['difficulty', 'rollCount']),
  'dragon-tower': profile('dragon-tower', 'REST dragon-tower/bet', ['difficulty', 'eggs[]']),
  darts: profile('darts', 'REST darts/bet', ['difficulty']),
  cases: profile('cases', 'REST cases/bet', ['difficulty']),
  bars: profile('bars', 'REST bars/bet', ['difficulty', 'tiles[]']),
  tarot: profile('tarot', 'REST tarot/bet', ['difficulty']),
  packs: profile('packs', 'casesBet | REST packs/bet', ['identifier?', 'difficulty']),
  'rock-paper-scissors': profile('rock-paper-scissors', 'REST rock-paper-scissors/bet', ['guesses[]']),
  diamonds: profile('diamonds', 'diamondsBet', ['amount', 'currency']),
  'tome-of-life': profile('tome-of-life', 'slotsTomeOfLifeBet', ['lines']),
  'slots-scarab': profile('slots-scarab', 'REST slots/bet', ['lines']),
  'slots-samurai': profile('slots-samurai', 'REST slots-samurai/bet (+ next)', ['amount']),
  blackjack: profile('blackjack', 'REST blackjack/bet (+ next)', ['amount']),
  roulette: profile('roulette', 'API pending', [], { notes: 'Not wired' }),
  baccarat: profile('baccarat', 'API pending', [], { notes: 'Not wired' }),
  'video-poker': profile('video-poker', 'API pending', [], { notes: 'Not wired' }),
  drill: profile('drill', 'API pending', [], { notes: 'Not wired' }),
  moles: profile('moles', 'API pending', [], { notes: 'Not wired' }),
  blitz: profile('blitz', 'API pending', [], { notes: 'Not wired' }),
}

export function getGameApiProfile(slug: string): GameApiProfile | undefined {
  return GAME_API_PROFILES[slug.toLowerCase()]
}

export function gameUsesMultiplierStrategy(slug: string): boolean {
  return getGameApiProfile(slug)?.supportsMultiplierStrategy === true
}
