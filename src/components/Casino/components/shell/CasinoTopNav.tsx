type CasinoMode = 'play' | 'originals' | 'challenges' | 'telegram' | 'bonushunt' | 'forum' | 'logs'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const MODES: { id: CasinoMode; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'originals', label: 'Originals' },
  { id: 'challenges', label: 'Challenges' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'bonushunt', label: 'Bonus Hunt' },
  { id: 'forum', label: 'Forum' },
  { id: 'logs', label: 'Logs' },
]

export function CasinoTopNav({ mode, onChangeMode }: CasinoTopNavProps) {
  return (
    <div className="casino-topnav">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`casino-topnav-btn ${mode === m.id ? 'is-active' : ''}`}
          onClick={() => onChangeMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

