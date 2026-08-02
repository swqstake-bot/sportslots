type AppView = 'casino' | 'sports' | 'logger'

interface PrimaryNavProps {
  currentView: AppView
  onChangeView: (view: AppView) => void
  /** Stake.eu has no sports product yet. */
  hideSports?: boolean
}

const TABS: { id: AppView; label: string }[] = [
  { id: 'casino', label: 'Casino' },
  { id: 'sports', label: 'Sports' },
  { id: 'logger', label: 'Logger' },
]

export function PrimaryNav({ currentView, onChangeView, hideSports = false }: PrimaryNavProps) {
  const tabs = hideSports ? TABS.filter((t) => t.id !== 'sports') : TABS
  return (
    <nav className="app-primary-nav" aria-label="Primary Navigation">
      {tabs.map((tab) => {
        const active = currentView === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeView(tab.id)}
            className={`app-primary-nav-btn ${active ? 'is-active' : ''}`.trim()}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
