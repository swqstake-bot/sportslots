import { memo } from 'react'

export type HubTab = 'casino' | 'autorun' | 'telegram' | 'forum' | 'promotions'

const HUB_TABS: { id: HubTab; label: string; title: string }[] = [
  {
    id: 'casino',
    label: 'Wetten & KPI',
    title: 'Challenge-Betlisten und KPIs (manuell / Übersicht). Bonus Hunt für Slot-Jagd liegt unter Play → Bonus Hunt.',
  },
  {
    id: 'autorun',
    label: 'Autorun',
    title: 'Automatischer Challenge-Hunter (Stake RGS). Warteschlange und laufende Spins sind Arbeitsspeicher; Filter & Presets bleiben in localStorage.',
  },
  { id: 'telegram', label: 'Telegram', title: 'Challenges aus Telegram-Kanälen' },
  { id: 'forum', label: 'Forum', title: 'Forum-Challenge-Ansicht' },
  { id: 'promotions', label: 'Promotions', title: 'Stake-Promos & Aktionen' },
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
