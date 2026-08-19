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
    label: 'Balance',
    title: 'Wallet / balance ladder: pick slots and stakes by balance thresholds',
  },
  { id: 'archive', label: 'Archive', title: 'Session review and bet history' },
]

interface ChallengeHubTabStripProps {
  tab: HubTab
  onTabChange: (tab: HubTab) => void
  resourceMode?: boolean
  onToggleResourceMode?: () => void
}

export const ChallengeHubTabStrip = memo(function ChallengeHubTabStrip({
  tab,
  onTabChange,
  resourceMode = false,
  onToggleResourceMode,
}: ChallengeHubTabStripProps) {
  return (
    <div className="challenge-hub-tabs" role="tablist" aria-label="Challenge sources">
      {PRIMARY_TABS.map((item) => {
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
      {onToggleResourceMode ? (
        <button
          type="button"
          className={`challenge-hub-tab ${resourceMode ? 'is-active' : ''}`.trim()}
          title="Minimal UI: P/L, bet speed, top multis"
          onClick={onToggleResourceMode}
        >
          Resource
        </button>
      ) : null}
    </div>
  )
})
