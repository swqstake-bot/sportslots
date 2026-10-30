import { memo, useCallback, useEffect, useState } from 'react'
import TelegramChallengeHunter from '../TelegramChallengeHunter'
import ForumChallengeView from '../ForumChallengeView'
import { SectionCard } from '../ui/SectionCard'
import { PromotionsView } from './PromotionsView'
import { startPromotionCompletionWatcher } from '../../utils/promotionCompletionWatcher'
import { useStakeSiteStore } from '../../../../store/stakeSiteStore'
import type { CasinoChallengeSelection } from '../../types'
import type { HubStatsPayload } from './hubTypes'
import { useUiStore } from '../../../../store/uiStore'
import { removeWorkspaceSession } from '../../../../store/workspaceSessionStore'

type PromoHubTab = 'casino' | 'forum' | 'telegram'

const TELEGRAM_GATE_KEY = 'slotbot_hub_telegram_enabled_v1'
const TELEGRAM_USAGE_KEY = 'slotbot_hub_telegram_usage_count_v1'

interface PromotionsHubViewProps {
  accessToken: string
  webSlots: any[]
  onDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  onSelectChallenge: (challenge: CasinoChallengeSelection) => void
  onHubStatsChange?: (payload: HubStatsPayload) => void
}

export const PromotionsHubView = memo(function PromotionsHubView({
  accessToken,
  webSlots,
  onDiscoveredSlots,
  onSelectChallenge,
  onHubStatsChange,
}: PromotionsHubViewProps) {
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const hasForum = preferredSite !== 'eu'
  const tab = useUiStore(s => s.promotionsHubTab)
  const setTab = useUiStore(s => s.setPromotionsHubTab)
  const [telegramVisited, setTelegramVisited] = useState(tab === 'telegram')
  if (tab === 'telegram' && !telegramVisited) setTelegramVisited(true)
  const TelegramChallengeHunterAny = TelegramChallengeHunter as any
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TELEGRAM_GATE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => startPromotionCompletionWatcher(preferredSite === 'eu' ? 'eu' : 'com'), [preferredSite])
  useEffect(() => {
    if (!hasForum && tab === 'forum') setTab('casino')
  }, [hasForum, tab, setTab])
  useEffect(() => {
    if (!telegramEnabled) removeWorkspaceSession('casino-telegram')
    return () => removeWorkspaceSession('casino-telegram')
  }, [telegramEnabled])

  useEffect(() => {
    try {
      localStorage.setItem(TELEGRAM_GATE_KEY, telegramEnabled ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [telegramEnabled])

  const openTab = useCallback((next: PromoHubTab) => {
    setTab(next)
    if (next === 'telegram') {
      try {
        const n = Number(localStorage.getItem(TELEGRAM_USAGE_KEY) || 0) + 1
        localStorage.setItem(TELEGRAM_USAGE_KEY, String(n))
      } catch {
        /* ignore */
      }
    }
  }, [setTab])

  useEffect(() => {
    function onOpenTab(ev: Event) {
      const wanted = String((ev as CustomEvent<any>)?.detail?.tab || '').toLowerCase()
      if (wanted === 'casino' || wanted === 'forum' || wanted === 'telegram' || wanted === 'promotions') {
        openTab(wanted === 'promotions' ? 'casino' : (wanted as PromoHubTab))
      }
    }
    window.addEventListener('promotions-hub-open-tab', onOpenTab as EventListener)
    return () => window.removeEventListener('promotions-hub-open-tab', onOpenTab as EventListener)
  }, [openTab])

  return (
    <div className="promo-page">
      <div className="promo-subtabs" role="tablist" aria-label="Promotion sources">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'casino'}
          className={`challenge-hub-tab ${tab === 'casino' ? 'is-active' : ''}`}
          onClick={() => openTab('casino')}
        >
          Casino
        </button>
        {hasForum && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'forum'}
            className={`challenge-hub-tab ${tab === 'forum' ? 'is-active' : ''}`}
            onClick={() => openTab('forum')}
          >
            Forum
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'telegram'}
          className={`challenge-hub-tab ${tab === 'telegram' ? 'is-active' : ''}`}
          onClick={() => openTab('telegram')}
        >
          Telegram
        </button>
      </div>

      {telegramVisited && <div hidden={tab !== 'telegram'} data-promotion-panel="telegram">
        <SectionCard>
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="challenge-hub-action" onClick={() => setTelegramEnabled((prev) => !prev)}>
              {telegramEnabled ? 'Telegram on' : 'Enable Telegram'}
            </button>
          </div>
          {telegramEnabled ? (
            <TelegramChallengeHunterAny
              accessToken={accessToken}
              webSlots={webSlots}
              onDiscoveredSlots={onDiscoveredSlots}
              onHubStatsChange={onHubStatsChange}
            />
          ) : (
            <p className="promo-note">Off until you enable it. Nothing is sent before the hunter is configured.</p>
          )}
        </SectionCard>
      </div>}
      {tab !== 'telegram' && (tab === 'forum' && hasForum ? (
        <>
          <PromotionsView accessToken={accessToken} webSlots={webSlots} source="forum" />
          <SectionCard>
            <ForumChallengeView
              accessToken={accessToken}
              webSlots={webSlots as any[]}
              onSelectChallenge={onSelectChallenge}
            />
          </SectionCard>
        </>
      ) : (
        <PromotionsView accessToken={accessToken} webSlots={webSlots} source="casino" />
      ))}
    </div>
  )
})
