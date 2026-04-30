type CasinoMode = 'play' | 'originals' | 'challengeHub' | 'bonushunt' | 'logs'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const MODES: { id: CasinoMode; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'originals', label: 'Originals' },
  { id: 'challengeHub', label: 'Challenge Hub' },
  { id: 'bonushunt', label: 'Bonus Hunt' },
  { id: 'logs', label: 'Logs' },
]

export function CasinoTopNav({ mode, onChangeMode }: CasinoTopNavProps) {
  return (
    <nav className="casino-topnav" aria-label="Casino Bereiche">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`casino-topnav-btn ${mode === m.id ? 'is-active' : ''}`}
          onClick={() => onChangeMode(m.id)}
          aria-current={mode === m.id ? 'page' : undefined}
        >
          {m.label}
        </button>
      ))}
    </nav>
  )
}

