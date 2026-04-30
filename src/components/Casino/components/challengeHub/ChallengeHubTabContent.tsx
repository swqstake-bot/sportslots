import { memo, type Dispatch, type SetStateAction } from 'react'
import AutoChallengeHunter from '../AutoChallengeHunter'
import TelegramChallengeHunter from '../TelegramChallengeHunter'
import ForumChallengeView from '../ForumChallengeView'
import { SectionCard } from '../ui/SectionCard'
import { PromotionsView } from './PromotionsView'
import { AutorunTab } from './AutorunTab'
import type { HubStatsPayload } from './hubTypes'
import type { HubTab } from './ChallengeHubTabStrip'
import type { CasinoChallengeSelection } from '../../types'

export interface ChallengeHubTabContentProps {
  tab: HubTab
  accessToken: string
  webSlots: any[]
  onDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  onSelectChallenge: (challenge: CasinoChallengeSelection) => void
  onHubStatsChange: (payload: HubStatsPayload) => void
  telegramEnabled: boolean
  setTelegramEnabled: Dispatch<SetStateAction<boolean>>
  telegramUsage: number
}

/**
 * Renders only the active hub tab to avoid hidden-but-mounted heavy trees (faster tab switches, cleaner focus).
 */
export const ChallengeHubTabContent = memo(function ChallengeHubTabContent({
  tab,
  accessToken,
  webSlots,
  onDiscoveredSlots,
  onSelectChallenge,
  onHubStatsChange,
  telegramEnabled,
  setTelegramEnabled,
  telegramUsage,
}: ChallengeHubTabContentProps) {
  const TelegramChallengeHunterAny = TelegramChallengeHunter as any

  return (
    <div
      id={`hub-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`hub-tab-${tab}`}
      className="min-w-0"
    >
      {tab === 'casino' && (
        <SectionCard title="Casino challenges">
          <AutoChallengeHunter
            accessToken={accessToken}
            webSlots={webSlots as any}
            onDiscoveredSlots={onDiscoveredSlots}
            onHubStatsChange={onHubStatsChange}
          />
        </SectionCard>
      )}

      {tab === 'autorun' && (
        <SectionCard title="Autorun">
          <AutorunTab
            accessToken={accessToken}
            webSlots={webSlots as { slug: string; name?: string; providerId: string }[]}
            onHubStatsChange={onHubStatsChange}
          />
        </SectionCard>
      )}

      {tab === 'telegram' && (
        <SectionCard title="Telegram challenges">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              {telegramEnabled
                ? 'Telegram features are on. Add credentials in the hunter below when ready.'
                : 'Telegram is off — enable when your channel and API settings are ready.'}
              {telegramUsage > 0 && (
                <span className="ml-1.5 text-[0.7rem] opacity-80">(tab opens: {telegramUsage})</span>
              )}
            </p>
            <button type="button" className="challenge-hub-action" onClick={() => setTelegramEnabled((prev) => !prev)}>
              {telegramEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          {telegramEnabled ? (
            <TelegramChallengeHunterAny
              accessToken={accessToken}
              webSlots={webSlots as any}
              onDiscoveredSlots={onDiscoveredSlots}
              onHubStatsChange={onHubStatsChange}
            />
          ) : (
            <div className="rounded border border-[var(--border)] bg-[var(--bg-deep)] p-3 text-xs text-[var(--text-muted)]">
              Turn on Telegram when you want to run challenges from the linked channel. Nothing is sent until the hunter
              is configured.
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'forum' && (
        <SectionCard title="Forum challenges">
          <ForumChallengeView accessToken={accessToken} webSlots={webSlots as any} onSelectChallenge={onSelectChallenge} />
        </SectionCard>
      )}

      {tab === 'promotions' && (
        <SectionCard title="Promotions">
          <PromotionsView accessToken={accessToken} webSlots={webSlots as any} />
        </SectionCard>
      )}
    </div>
  )
})
