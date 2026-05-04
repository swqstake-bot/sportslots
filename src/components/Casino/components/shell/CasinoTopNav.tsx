type CasinoMode = 'play' | 'originals' | 'challengeHub' | 'bonushunt' | 'logs'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const MODES: { id: CasinoMode; label: string; title: string }[] = [
  { id: 'play', label: 'Play', title: 'Slots spielen, Challenges anlegen, Wheel' },
  { id: 'originals', label: 'Originals', title: 'Stake Originals (Dice, Mines, …)' },
  {
    id: 'challengeHub',
    label: 'Challenge Hub',
    title: 'Challenge-Betlisten, Autorun-Hunter, Telegram, Forum — nicht dasselbe wie Bonus Hunt',
  },
  { id: 'bonushunt', label: 'Bonus Hunt', title: 'Manuelle Bonus-Jagd auf Slots (eigene Hunt-Logik)' },
  { id: 'logs', label: 'Logs', title: 'Interne Casino-Logs / Diagnose' },
]

export function CasinoTopNav({ mode, onChangeMode }: CasinoTopNavProps) {
  return (
    <nav className="casino-topnav" aria-label="Casino Bereiche">
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

