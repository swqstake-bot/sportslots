import { memo } from 'react'
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

/** Casino hunter stays mounted (hidden off-tab) so active hunts keep running. Other tabs mount on demand. */
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

  const otherTabPanel = (() => {
    if (resourceMode) return null
    switch (tab) {
      case 'casino':
        return null
      case 'autorun':
        return (
          <div id="hub-panel-autorun" role="tabpanel" aria-labelledby="hub-tab-autorun" className="min-w-0 min-h-0">
            <SectionCard>
              <AutorunTab
                accessToken={accessToken}
                webSlots={webSlots as { slug: string; name?: string; providerId: string }[]}
                onHubStatsChange={onHubStatsChange}
              />
            </SectionCard>
          </div>
        )
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
      {otherTabPanel}
    </>
  )
})
