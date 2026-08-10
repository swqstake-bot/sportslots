type CasinoMode = 'play' | 'originals' | 'challengeHub' | 'bonushunt' | 'logs' | 'dev'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const MODES: { id: CasinoMode; label: string; title: string }[] = [
  { id: 'play', label: 'Slots', title: 'Slots, wheel, and selected games' },
  { id: 'originals', label: 'Originals', title: 'Stake Originals (Dice, Mines, …)' },
  {
    id: 'challengeHub',
    label: 'Challenge Hub',
    title:
      'Stake Challenges, Balance rules, Telegram, Forum — not the same as Bonus Hunt (Casino → Bonus Hunt)',
  },
  { id: 'bonushunt', label: 'Bonus Hunt', title: 'Pick slots and hunt until bonus triggers (Casino → Bonus Hunt)' },
  { id: 'logs', label: 'Logs', title: 'Internal casino logs / diagnostics' },
  { id: 'dev', label: 'Dev', title: 'Dev tools — bet-speed probe (burns money)' },
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

