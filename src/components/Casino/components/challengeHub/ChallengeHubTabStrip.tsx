import { memo } from 'react'

export type HubTab = 'casino' | 'autorun' | 'telegram' | 'forum' | 'promotions' | 'archive'

const HUB_TABS: { id: HubTab; label: string; title: string }[] = [
  {
    id: 'casino',
    label: 'Bets & KPI',
    title: 'Challenge bet lists and KPIs (manual/overview). Bonus Hunt is available under Play → Bonus Hunt.',
  },
  {
    id: 'autorun',
    label: 'Autorun',
    title: 'Automatic challenge hunter (Stake RGS). Queue and active spins are memory-only; filters and presets stay in localStorage.',
  },
  { id: 'telegram', label: 'Telegram', title: 'Challenges from Telegram channels' },
  { id: 'forum', label: 'Forum', title: 'Forum challenge view' },
  { id: 'promotions', label: 'Promotions', title: 'Stake promotions and campaigns' },
  { id: 'archive', label: 'Archive', title: 'Session review, trends, top games and exports from stored bet history' },
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
            title={item.title}
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
