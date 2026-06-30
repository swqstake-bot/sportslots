import OriginalsWalletBalance from './OriginalsWalletBalance'
import type { OriginalsBettingMode } from '../schema/workbenchOptions'
import type { OriginalsGameEntry } from '../registry/originalsRegistry'

const ALL_MODES: { id: OriginalsBettingMode; label: string; title?: string }[] = [
  { id: 'manual', label: 'Manual', title: 'Single bet' },
  { id: 'automatic', label: 'Automatic', title: 'Profile / strategy loop' },
  { id: 'conditions', label: 'Conditions', title: 'Condition builder (Dice)' },
  { id: 'dice-runner', label: 'Dice Runner', title: 'Hunt → moonshot ladder' },
  { id: 'code', label: 'Code', title: 'Script mode' },
]

function modesForGame(game: OriginalsGameEntry): typeof ALL_MODES {
  return ALL_MODES.filter((m) => {
    if (m.id === 'dice-runner' || m.id === 'conditions') return game.slug === 'dice'
    if (m.id === 'manual') return game.supportsManual && game.uiReady
    return true
  })
}

interface OriginalsModeHeaderProps {
  game: OriginalsGameEntry
  mode: OriginalsBettingMode
  running?: boolean
  onModeChange: (mode: OriginalsBettingMode) => void
  onBack?: () => void
  statsOpen: boolean
  onToggleStats: () => void
  onOpenSettings?: () => void
  currency?: string
  onCurrencyChange?: (currency: string) => void
  currencyDisabled?: boolean
  accessToken?: string
  turboMode?: boolean
  turboCompatible?: boolean
  onToggleTurbo?: () => void
  showSidebarToggle?: boolean
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export default function OriginalsModeHeader({
  game,
  mode,
  running = false,
  onModeChange,
  onBack,
  statsOpen,
  onToggleStats,
  onOpenSettings,
  currency,
  onCurrencyChange,
  currencyDisabled,
  accessToken,
  turboMode = false,
  turboCompatible = true,
  onToggleTurbo,
  showSidebarToggle,
  sidebarCollapsed,
  onToggleSidebar,
}: OriginalsModeHeaderProps) {
  const modes = modesForGame(game)
  const showTurbo = onToggleTurbo && (mode === 'automatic' || mode === 'conditions')

  return (
    <div className="originals-mode-header">
      <div className="originals-mode-header-left">
        {onBack && (
          <button type="button" className="originals-back-btn" onClick={onBack}>
            ← Games
          </button>
        )}
        <div className="originals-mode-game-chip">
          <img src={game.thumbnailUrl} alt="" className="originals-mode-game-thumb" />
          <div className="originals-mode-game-text">
            <h2 className="originals-game-title">{game.name}</h2>
            {running && (
              <span className="originals-running-label">
                <span className="originals-running-dot" aria-hidden />
                {turboMode ? 'Turbo' : 'Running'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="originals-mode-tabs">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={running && m.id !== mode}
            title={m.title}
            className={`originals-mode-tab${mode === m.id ? ' is-active' : ''}`}
            onClick={() => onModeChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="originals-mode-header-actions">
        {showSidebarToggle && onToggleSidebar && (
          <button
            type="button"
            className={`originals-stats-toggle${sidebarCollapsed ? '' : ' is-open'}`}
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Show strategy panel' : 'Hide strategy panel'}
          >
            {sidebarCollapsed ? 'Panel' : 'Panel ◂'}
          </button>
        )}
        {showTurbo && (
          <button
            type="button"
            className={`originals-turbo-toggle${turboMode ? ' is-active' : ''}`}
            disabled={running || !turboCompatible}
            title={
              !turboCompatible
                ? 'Turbo not available for this game'
                : turboMode
                  ? 'Turbo on — parallel bets'
                  : 'Turbo off — normal sequential bets'
            }
            onClick={onToggleTurbo}
          >
            ⚡ Turbo
          </button>
        )}
        {currency && onCurrencyChange && (
          <OriginalsWalletBalance
            currency={currency}
            onChange={onCurrencyChange}
            disabled={currencyDisabled || running}
            accessToken={accessToken}
          />
        )}
        {onOpenSettings && (
          <button type="button" className="originals-stats-toggle" onClick={onOpenSettings} title="Settings">
            ⚙
          </button>
        )}
        <button
          type="button"
          className={`originals-stats-toggle${statsOpen ? ' is-open' : ''}`}
          onClick={onToggleStats}
          title="Statistics"
        >
          Stats
        </button>
      </div>
    </div>
  )
}
