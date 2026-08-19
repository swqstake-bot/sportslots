import type { CasinoMode } from '../../../../store/uiStore'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const PLAY_MODES: { id: Exclude<CasinoMode, 'logs'>; label: string; title: string }[] = [
  { id: 'play', label: 'Slots', title: 'Slots and autospin' },
  { id: 'originals', label: 'Originals', title: 'Stake Originals' },
]

const HUNT_MODES: { id: Exclude<CasinoMode, 'logs'>; label: string; title: string }[] = [
  { id: 'challengeHub', label: 'Challenges', title: 'Stake casino challenges and hunter' },
  { id: 'promotions', label: 'Promotions', title: 'Casino promotions, forum competitions, Telegram' },
  { id: 'bonushunt', label: 'Bonus Hunt', title: 'Hunt until bonus triggers' },
]

function NavButtons({
  modes,
  mode,
  onChangeMode,
}: {
  modes: typeof PLAY_MODES
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}) {
  return (
    <>
      {modes.map((m) => (
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
    </>
  )
}

export function CasinoTopNav({ mode, onChangeMode }: CasinoTopNavProps) {
  return (
    <nav className="casino-topnav" aria-label="Casino sections">
      <NavButtons modes={PLAY_MODES} mode={mode} onChangeMode={onChangeMode} />
      <span className="casino-topnav-split" aria-hidden />
      <NavButtons modes={HUNT_MODES} mode={mode} onChangeMode={onChangeMode} />
    </nav>
  )
}
