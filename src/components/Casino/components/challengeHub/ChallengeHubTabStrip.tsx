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
    <div className="challenge-hub-tabs">
      {HUB_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTabChange(item.id)}
          className={`challenge-hub-tab ${tab === item.id ? 'is-active' : ''}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
})
