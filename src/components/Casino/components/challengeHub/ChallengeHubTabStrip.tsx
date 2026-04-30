import { memo } from 'react'

export type HubTab = 'casino' | 'autorun' | 'telegram' | 'forum' | 'promotions'

const HUB_TABS: { id: HubTab; label: string }[] = [
  { id: 'casino', label: 'Casino' },
  { id: 'autorun', label: 'Autorun' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'forum', label: 'Forum' },
  { id: 'promotions', label: 'Promotions' },
]

interface ChallengeHubTabStripProps {
  tab: HubTab
  onTabChange: (tab: HubTab) => void
}

export const ChallengeHubTabStrip = memo(function ChallengeHubTabStrip({ tab, onTabChange }: ChallengeHubTabStripProps) {
  return (
    <div className="challenge-hub-tabs" role="tablist" aria-label="Challenge hub sections">
      {HUB_TABS.map((item) => {
        const selected = tab === item.id
        return (
          <button
            key={item.id}
            id={`hub-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(item.id)}
            className={`challenge-hub-tab ${selected ? 'is-active' : ''}`.trim()}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
})
