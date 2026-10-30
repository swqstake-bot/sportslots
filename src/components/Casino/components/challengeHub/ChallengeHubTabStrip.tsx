import { memo } from 'react'

export type HubTab = 'casino' | 'autorun' | 'archive'

const PRIMARY_TABS: { id: HubTab; label: string; title: string }[] = [
  {
    id: 'casino',
    label: 'Hunter',
    title: 'Scan and queue Stake casino challenges',
  },
  {
    id: 'autorun',
    label: 'Balance rules',
    title: 'Wallet / balance ladder: pick slots and stakes by balance thresholds',
  },
  { id: 'archive', label: 'History', title: 'Session review and bet history' },
]

interface ChallengeHubTabStripProps {
  tab: HubTab
  onTabChange: (tab: HubTab) => void
}

export const ChallengeHubTabStrip = memo(function ChallengeHubTabStrip({
  tab,
  onTabChange,
}: ChallengeHubTabStripProps) {
  return (
    <div className="challenge-hub-tabs" role="tablist" aria-label="Challenge workspace">
      {PRIMARY_TABS.map((item) => {
        const selected = tab === item.id
        return (
          <button
            key={item.id}
            id={`hub-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`hub-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            title={item.title}
            onClick={() => onTabChange(item.id)}
            onKeyDown={(event) => {
              const index = PRIMARY_TABS.findIndex((entry) => entry.id === item.id)
              const nextIndex = event.key === 'ArrowRight'
                ? (index + 1) % PRIMARY_TABS.length
                : event.key === 'ArrowLeft'
                  ? (index + PRIMARY_TABS.length - 1) % PRIMARY_TABS.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? PRIMARY_TABS.length - 1
                      : -1
              if (nextIndex < 0) return
              event.preventDefault()
              const next = PRIMARY_TABS[nextIndex]
              onTabChange(next.id)
              document.getElementById(`hub-tab-${next.id}`)?.focus()
            }}
            className={`challenge-hub-tab ${selected ? 'is-active' : ''}`.trim()}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
})
