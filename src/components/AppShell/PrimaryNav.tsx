type AppView = 'casino' | 'sports' | 'logger'

interface PrimaryNavProps {
  currentView: AppView
  onChangeView: (view: AppView) => void
}

const TABS: { id: AppView; label: string }[] = [
  { id: 'casino', label: 'Casino' },
  { id: 'sports', label: 'Sports' },
  { id: 'logger', label: 'Logger' },
]

export function PrimaryNav({ currentView, onChangeView }: PrimaryNavProps) {
  return (
    <nav className="app-primary-nav" aria-label="Primary Navigation">
      {TABS.map((tab) => {
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
