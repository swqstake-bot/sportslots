import { memo, useEffect, useRef, useState } from 'react'

export type HubTab = 'casino' | 'autorun' | 'telegram' | 'forum' | 'promotions' | 'archive'

const PRIMARY_TABS: { id: HubTab; label: string; title: string }[] = [
  {
    id: 'casino',
    label: 'Stake Challenges',
    title:
      'Stake casino challenges: queue, scan, and start runs. Bonus Hunt is a separate Casino tab (Casino → Bonus Hunt).',
  },
  {
    id: 'autorun',
    label: 'Balance rules',
    title: 'Wallet / balance ladder: pick slots and stakes by balance thresholds (not the same as challenge queue auto).',
  },
  { id: 'telegram', label: 'Telegram', title: 'Challenges from Telegram channels' },
  { id: 'forum', label: 'Forum', title: 'Forum challenge view' },
  { id: 'promotions', label: 'Promotions', title: 'Stake promotions and campaigns (Weekly Wrapped + Stake vs Eddie)' },
]

const MORE_TABS: { id: HubTab; label: string; title: string }[] = [
  { id: 'archive', label: 'Archive', title: 'Session review, trends, top games and exports from stored bet history' },
]

interface ChallengeHubTabStripProps {
  tab: HubTab
  onTabChange: (tab: HubTab) => void
}

export const ChallengeHubTabStrip = memo(function ChallengeHubTabStrip({ tab, onTabChange }: ChallengeHubTabStripProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const activeMore = MORE_TABS.find((t) => t.id === tab)

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [moreOpen])

  return (
    <div className="challenge-hub-tabs" role="tablist" aria-label="Challenge hub sections">
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

      <div className="challenge-hub-more" ref={moreRef}>
        <button
          type="button"
          id="hub-tab-more"
          role="tab"
          aria-selected={!!activeMore}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          title="Archive and more"
          className={`challenge-hub-tab challenge-hub-tab--more ${activeMore ? 'is-active' : ''} ${moreOpen ? 'is-open' : ''}`.trim()}
          onClick={() => setMoreOpen((o) => !o)}
        >
          {activeMore ? activeMore.label : 'More'}
          <span aria-hidden style={{ marginLeft: 4, opacity: 0.7 }}>
            ▾
          </span>
        </button>
        {moreOpen && (
          <div className="challenge-hub-more-menu" role="menu">
            {MORE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                id={`hub-tab-${item.id}`}
                title={item.title}
                className={`challenge-hub-more-item ${tab === item.id ? 'is-active' : ''}`.trim()}
                onClick={() => {
                  onTabChange(item.id)
                  setMoreOpen(false)
                }}
              >
                {item.label}
              </button>
            ))}
            {activeMore && (
              <button
                type="button"
                role="menuitem"
                className="challenge-hub-more-item challenge-hub-more-item--back"
                onClick={() => {
                  onTabChange('casino')
                  setMoreOpen(false)
                }}
              >
                ← Back to Stake Challenges
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
