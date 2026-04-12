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
 * All hub tab bodies live here so parent ChallengeHubView can skip re-rendering this tree when only
 * aggregated KPI stats change (setHubStatsBySource) — e.g. avoids redundant work in AutoChallengeHunter.
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
  const visibleStyle = (visible: boolean) => ({ display: visible ? 'block' : 'none' })
  return (
    <>
      <div style={visibleStyle(tab === 'casino')}>
        <SectionCard title="Casino Challenges">
          <AutoChallengeHunter
            accessToken={accessToken}
            webSlots={webSlots as any}
            onDiscoveredSlots={onDiscoveredSlots}
            onHubStatsChange={onHubStatsChange}
          />
        </SectionCard>
      </div>

      <div style={visibleStyle(tab === 'autorun')}>
        <SectionCard title="Autorun">
          <AutorunTab
            accessToken={accessToken}
            webSlots={webSlots as { slug: string; name?: string; providerId: string }[]}
            onHubStatsChange={onHubStatsChange}
          />
        </SectionCard>
      </div>

      <div style={visibleStyle(tab === 'telegram')}>
        <SectionCard title="Telegram Challenges">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-[var(--text-muted)]">
              Status: {telegramEnabled ? 'enabled' : 'disabled'} · Tab opens: {telegramUsage} · Decision gate:{' '}
              {telegramUsage >= 5 ? 'keep as core tab candidate' : 'observe usage, maybe move to Advanced'}
            </div>
            <button type="button" className="challenge-hub-action" onClick={() => setTelegramEnabled((prev) => !prev)}>
              {telegramEnabled ? 'Disable Telegram Tab' : 'Enable Telegram Tab'}
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
              Telegram is gracefully disabled. Enable it when API/channel credentials are ready.
            </div>
          )}
        </SectionCard>
      </div>

      <div style={visibleStyle(tab === 'forum')}>
        <SectionCard title="Forum Challenges">
          <ForumChallengeView accessToken={accessToken} webSlots={webSlots as any} onSelectChallenge={onSelectChallenge} />
        </SectionCard>
      </div>

      <div style={visibleStyle(tab === 'promotions')}>
        <SectionCard title="Promotions">
          <PromotionsView accessToken={accessToken} webSlots={webSlots as any} />
        </SectionCard>
      </div>
    </>
  )
})
