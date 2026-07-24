import { useEffect, useRef, useState } from 'react'
import OriginalsWalletBalance from './OriginalsWalletBalance'
import type { OriginalsBettingMode } from '../schema/workbenchOptions'
import type { OriginalsGameEntry } from '../registry/originalsRegistry'

const PRIMARY_MODE_IDS: OriginalsBettingMode[] = ['automatic']

const ALL_MODES: { id: OriginalsBettingMode; label: string; title?: string; advanced?: boolean }[] = [
  { id: 'automatic', label: 'Automatic', title: 'Strategy loop' },
  { id: 'conditions', label: 'Conditions', title: 'IF/THEN rules (Dice)', advanced: true },
  {
    id: 'dice-runner',
    label: 'Dice Runner',
    title: 'Legacy hunt ladder — prefer Hunt→Moonshot preset in Automatic',
    advanced: true,
  },
  { id: 'code', label: 'Code', title: 'Script / JSON mode', advanced: true },
]

function modesForGame(game: OriginalsGameEntry): typeof ALL_MODES {
  return ALL_MODES.filter((m) => {
    if (m.id === 'dice-runner' || m.id === 'conditions') return game.slug === 'dice'
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
  logOpen?: boolean
  onToggleLog?: () => void
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
  logOpen,
  onToggleLog,
}: OriginalsModeHeaderProps) {
  const modes = modesForGame(game)
  const primaryModes = modes.filter((m) => PRIMARY_MODE_IDS.includes(m.id))
  const advancedModes = modes.filter((m) => m.advanced)
  const activeAdvanced = advancedModes.find((m) => m.id === mode)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedRef = useRef<HTMLDivElement>(null)
  const showTurbo = onToggleTurbo && (mode === 'automatic' || mode === 'conditions')

  useEffect(() => {
    if (!advancedOpen) return
    const onDoc = (e: MouseEvent) => {
      if (advancedRef.current && !advancedRef.current.contains(e.target as Node)) {
        setAdvancedOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [advancedOpen])

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
        {primaryModes.map((m) => (
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

        {advancedModes.length > 0 && (
          <div className="originals-mode-advanced" ref={advancedRef}>
            <button
              type="button"
              disabled={running && !activeAdvanced}
              className={`originals-mode-tab originals-mode-tab--advanced${activeAdvanced ? ' is-active' : ''}${advancedOpen ? ' is-open' : ''}`}
              aria-expanded={advancedOpen}
              aria-haspopup="menu"
              title="Advanced modes"
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              {activeAdvanced ? activeAdvanced.label : 'More'}
              <span className="originals-mode-advanced-caret" aria-hidden>
                ▾
              </span>
            </button>
            {advancedOpen && (
              <div className="originals-mode-advanced-menu" role="menu">
                {activeAdvanced && (
                  <p className="originals-mode-advanced-hint">
                    {activeAdvanced.id === 'dice-runner'
                      ? 'Legacy — prefer Hunt→Moonshot in Automatic → Strategy.'
                      : 'Advanced mode'}
                  </p>
                )}
                {advancedModes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    disabled={running && m.id !== mode}
                    title={m.title}
                    className={`originals-mode-advanced-item${mode === m.id ? ' is-active' : ''}`}
                    onClick={() => {
                      onModeChange(m.id)
                      setAdvancedOpen(false)
                    }}
                  >
                    <span>{m.label}</span>
                    {m.id === 'dice-runner' && <span className="originals-mode-legacy-tag">Legacy</span>}
                  </button>
                ))}
                {activeAdvanced && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={running}
                    className="originals-mode-advanced-item originals-mode-advanced-item--back"
                    onClick={() => {
                      onModeChange('automatic')
                      setAdvancedOpen(false)
                    }}
                  >
                    ← Back to Automatic
                  </button>
                )}
              </div>
            )}
          </div>
        )}
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
        {onToggleLog && (
          <button
            type="button"
            className={`originals-stats-toggle${logOpen ? ' is-open' : ''}`}
            onClick={onToggleLog}
            title="Session log"
          >
            Log
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
