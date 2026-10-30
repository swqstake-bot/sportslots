import type { CasinoMode } from '../../../../store/uiStore'

interface CasinoTopNavProps {
  mode: string
  onChangeMode: (mode: CasinoMode) => void
}

const PLAY_MODES: { id: Exclude<CasinoMode, 'logs'>; label: string; title: string }[] = [
  { id: 'play', label: 'Slots', title: 'Slots and autospin' },
  { id: 'originals', label: 'Originals', title: 'Stake Originals' },
  { id: 'bonushunt', label: 'Bonus Hunt', title: 'Hunt until bonus triggers' },
]

const HUNT_MODES: { id: Exclude<CasinoMode, 'logs'>; label: string; title: string }[] = [
  { id: 'challengeHub', label: 'Hunter', title: 'Stake casino challenges and hunter' },
  { id: 'promotions', label: 'Promotions', title: 'Casino promotions, forum competitions, Telegram' },
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
  const challengeWorkspace = mode === 'challengeHub' || mode === 'promotions'
  return (
    <nav className="casino-topnav" aria-label={challengeWorkspace ? 'Challenge sections' : 'Casino game sections'}>
      <div className="casino-topnav-group" role="group" aria-label={challengeWorkspace ? 'Challenges and promotions' : 'Games'}>
        <NavButtons modes={challengeWorkspace ? HUNT_MODES : PLAY_MODES} mode={mode} onChangeMode={onChangeMode} />
      </div>
    </nav>
  )
}
