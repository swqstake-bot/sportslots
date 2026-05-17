type CasinoMode = 'play' | 'originals' | 'challengeHub' | 'bonushunt' | 'logs'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const MODES: { id: CasinoMode; label: string; title: string }[] = [
  { id: 'play', label: 'Play', title: 'Play slots, challenges, wheel' },
  { id: 'originals', label: 'Originals', title: 'Stake Originals (Dice, Mines, …)' },
  {
    id: 'challengeHub',
    label: 'Challenge Hub',
    title: 'Challenge bet feeds, autorun, Telegram, forum — not the same as Bonus Hunt',
  },
  { id: 'bonushunt', label: 'Bonus Hunt', title: 'Manual bonus hunt on slots (hunt logic)' },
  { id: 'logs', label: 'Logs', title: 'Internal casino logs / diagnostics' },
]

export function CasinoTopNav({ mode, onChangeMode }: CasinoTopNavProps) {
  return (
    <nav className="casino-topnav" aria-label="Casino sections">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`casino-topnav-btn ${mode === m.id ? 'is-active' : ''}`}
          title={m.title}
          onClick={() => onChangeMode(m.id)}
          aria-current={mode === m.id ? 'page' : undefined}
        >
          {m.label}
        </button>
      ))}
    </nav>
  )
}

