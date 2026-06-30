import GameTargetSummary from './GameTargetSummary'

interface NoParamsGameControlProps {
  gameSlug: 'diamonds' | 'slots-samurai' | 'blackjack'
}

const API_LINES: Record<string, string> = {
  diamonds: 'diamondsBet(identifier)',
  'slots-samurai': 'REST slots-samurai/bet (+ next spins)',
  blackjack: 'REST blackjack/bet + next actions',
}

export default function NoParamsGameControl({ gameSlug }: NoParamsGameControlProps) {
  return (
    <>
      <GameTargetSummary gameSlug={gameSlug} options={{}} gameOnly />
      <p className="originals-game-empty-params">
        {API_LINES[gameSlug]} — only stake amount and currency are sent. Strategy is configured in the Profile tab.
      </p>
    </>
  )
}
