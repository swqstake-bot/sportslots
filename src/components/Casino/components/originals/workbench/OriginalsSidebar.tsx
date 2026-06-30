import { useState } from 'react'
import type { OriginalsWorkbenchOptions } from '../schema/workbenchOptions'
import OriginalsBetOptionsPanel from './OriginalsBetOptionsPanel'
import OriginalsBetConditionsPanel from './OriginalsBetConditionsPanel'
import OriginalsGamePanel from '../games/OriginalsGamePanel'

type SidebarTab = 'profile' | 'conditions' | 'game'

interface OriginalsSidebarProps {
  gameSlug: string
  options: OriginalsWorkbenchOptions
  onChange: (next: OriginalsWorkbenchOptions) => void
  onLoadProfile?: (opts: OriginalsWorkbenchOptions) => void
  supportsCombo?: boolean
  gameUiReady?: boolean
  disabled?: boolean
  sidebarWidth?: number
  currency?: string
}

export default function OriginalsSidebar({
  gameSlug,
  options,
  onChange,
  onLoadProfile,
  supportsCombo = false,
  gameUiReady = false,
  disabled = false,
  sidebarWidth = 380,
  currency = 'usdc',
}: OriginalsSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('profile')

  const tabs: { id: SidebarTab; label: string; show: boolean }[] = [
    { id: 'profile', label: 'Profile', show: true },
    { id: 'conditions', label: 'Conditions', show: true },
    { id: 'game', label: 'Game', show: gameUiReady },
  ]

  return (
    <aside
      className="originals-workbench-left casino-card"
      style={{ ['--originals-sidebar-w' as string]: `${sidebarWidth}px` }}
    >
      <div className="originals-sidebar-tabs originals-sidebar-tabs--main" role="tablist">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`originals-sidebar-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div className="originals-sidebar-block">
        {tab === 'profile' && (
          <OriginalsBetOptionsPanel
            options={options}
            onChange={onChange}
            onLoadProfile={onLoadProfile}
            supportsCombo={supportsCombo}
            gameSlug={gameSlug}
            disabled={disabled}
            variant="profile"
            currency={currency}
          />
        )}
        {tab === 'conditions' && (
          <OriginalsBetConditionsPanel
            options={options}
            onChange={onChange}
            disabled={disabled}
            gameSlug={gameSlug}
          />
        )}
        {tab === 'game' && gameUiReady && (
          <OriginalsGamePanel
            slug={gameSlug}
            options={options}
            onOptionsPatch={(partial) => onChange({ ...options, ...partial })}
            readOnly={disabled}
          />
        )}
      </div>
    </aside>
  )
}
