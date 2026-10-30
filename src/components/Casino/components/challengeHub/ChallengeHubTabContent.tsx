import { memo, useState } from 'react'
import AutoChallengeHunter from '../AutoChallengeHunter'
import { SectionCard } from '../ui/SectionCard'
import { AutorunTab } from './AutorunTab'
import { BetArchiveTab } from './BetArchiveTab'
import type { HubStatsPayload } from './hubTypes'
import type { HubTab } from './ChallengeHubTabStrip'
import type { CasinoChallengeSelection } from '../../types'

export interface ChallengeHubTabContentProps {
  tab: HubTab
  accessToken: string
  webSlots: any[]
  onDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  onSelectChallenge?: (challenge: CasinoChallengeSelection) => void
  onHubStatsChange: (payload: HubStatsPayload) => void
  resourceMode?: boolean
}

/** Keep visited automation panels mounted; reviewing history must not stop a run. */
export const ChallengeHubTabContent = memo(function ChallengeHubTabContent({
  tab,
  accessToken,
  webSlots,
  onDiscoveredSlots,
  onSelectChallenge,
  onHubStatsChange,
  resourceMode = false,
}: ChallengeHubTabContentProps) {
  const casinoVisible = resourceMode || tab === 'casino'
  const [autorunVisited, setAutorunVisited] = useState(tab === 'autorun')
  if (tab === 'autorun' && !autorunVisited) setAutorunVisited(true)

  const otherTabPanel = (() => {
    if (resourceMode) return null
    switch (tab) {
      case 'casino':
        return null
      case 'autorun':
        return null
      case 'archive':
        return (
          <div id="hub-panel-archive" role="tabpanel" aria-labelledby="hub-tab-archive" className="min-w-0 min-h-0">
            <SectionCard>
              <BetArchiveTab accessToken={accessToken} />
            </SectionCard>
          </div>
        )
      default:
        return null
    }
  })()

  return (
    <>
      <div
        id="hub-panel-casino"
        role="tabpanel"
        aria-labelledby="hub-tab-casino"
        aria-hidden={!casinoVisible}
        className={casinoVisible ? 'min-w-0 min-h-0' : 'hidden'}
      >
        <SectionCard>
          <AutoChallengeHunter
            accessToken={accessToken}
            webSlots={webSlots as any}
            onDiscoveredSlots={onDiscoveredSlots}
            onSelectChallenge={onSelectChallenge}
            onHubStatsChange={onHubStatsChange}
            resourceMode={resourceMode}
          />
        </SectionCard>
      </div>
      {autorunVisited && <div id="hub-panel-autorun" role="tabpanel" aria-labelledby="hub-tab-autorun" className="min-w-0 min-h-0" hidden={resourceMode || tab !== 'autorun'}><SectionCard><AutorunTab accessToken={accessToken} webSlots={webSlots as { slug: string; name?: string; providerId: string }[]} onHubStatsChange={onHubStatsChange} /></SectionCard></div>}
      {otherTabPanel}
    </>
  )
})
