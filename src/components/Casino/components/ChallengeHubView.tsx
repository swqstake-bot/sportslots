import { useCallback, useEffect, useState } from 'react'
import { SESSION_ONLY_HUB_AND_LOGGER } from '../../../config/sessionData'
import { ensureChallengeHubSessionReset, resetChallengeHubRecentBets } from '../utils/challengeHubLiveFeed'
import { clearHubHouseBetRetryBuffer } from '../utils/challengeHubBetIdPatch'
import { clearTopEntries } from '../utils/topDomain'
import {
  isChallengeHubResourceMode,
  setChallengeHubResourceMode,
  subscribeChallengeHubResourceMode,
} from '../utils/challengeHubResourceMode'
import { ChallengeHubBetListPanel } from './challengeHub/ChallengeHubBetListPanel'
import { ChallengeHubBetListProvider } from './challengeHub/ChallengeHubBetListContext'
import { ChallengeHubNotificationCenter } from './challengeHub/ChallengeHubNotificationCenter'
import { ChallengeHubTabStrip, type HubTab } from './challengeHub/ChallengeHubTabStrip'
import { ChallengeHubTabContent } from './challengeHub/ChallengeHubTabContent'
import type { HubStatsPayload } from './challengeHub/hubTypes'
import type { CasinoChallengeSelection } from '../types'
import { useInAppNotificationStore } from '../../../store/inAppNotificationStore'
import { useStakeSiteStore } from '../../../store/stakeSiteStore'
import { useUiStore } from '../../../store/uiStore'
import { startPromotionCompletionWatcher } from '../utils/promotionCompletionWatcher'

interface ChallengeHubViewProps {
  accessToken: string
  webSlots: any[]
  onDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  onSelectChallenge: (challenge: CasinoChallengeSelection) => void
  onHubStatsChange?: (payload: HubStatsPayload) => void
}

export function ChallengeHubView({
  accessToken,
  webSlots,
  onDiscoveredSlots,
  onHubStatsChange,
}: ChallengeHubViewProps) {
  const [tab, setTab] = useState<HubTab>('casino')
  const preferredSite = useStakeSiteStore((s) => s.preferredSite)
  const [, setHubStatsBySource] = useState<Record<string, HubStatsPayload>>({})
  const [resourceMode, setResourceMode] = useState(() => isChallengeHubResourceMode())
  const [sideCollapsed, setSideCollapsed] = useState(() => {
    try {
      return localStorage.getItem('challengeHubBetSideCollapsed') !== '0'
    } catch {
      return true
    }
  })
  useEffect(() => {
    if (!SESSION_ONLY_HUB_AND_LOGGER) return
    ensureChallengeHubSessionReset(() => {
      resetChallengeHubRecentBets()
      clearHubHouseBetRetryBuffer()
      clearTopEntries()
    })
  }, [])

  useEffect(() => subscribeChallengeHubResourceMode(setResourceMode), [])

  useEffect(() => startPromotionCompletionWatcher(preferredSite === 'eu' ? 'eu' : 'com'), [preferredSite])

  useEffect(() => {
    try {
      localStorage.setItem('challengeHubBetSideCollapsed', sideCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [sideCollapsed])

  const handleTabChange = useCallback((next: HubTab) => {
    setTab(next)
  }, [])

  useEffect(() => {
    function onExternalOpenTab(ev: Event) {
      const wanted = String((ev as CustomEvent<any>)?.detail?.tab || '').toLowerCase()
      if (wanted === 'casino' || wanted === 'autorun' || wanted === 'archive') {
        setTab(wanted as HubTab)
        return
      }
      if (wanted === 'telegram' || wanted === 'forum' || wanted === 'promotions') {
        useUiStore.getState().setCasinoMode('promotions')
        window.dispatchEvent(new CustomEvent('promotions-hub-open-tab', { detail: { tab: wanted } }))
      }
    }
    window.addEventListener('challenge-hub-open-tab', onExternalOpenTab as EventListener)
    return () => window.removeEventListener('challenge-hub-open-tab', onExternalOpenTab as EventListener)
  }, [])

  const handleHubStatsChange = useCallback((payload: HubStatsPayload) => {
    if (!payload?.source) return
    setHubStatsBySource((prev) => {
      const prevSource = prev[payload.source]
      if (prevSource && Number(payload.completed || 0) > Number(prevSource.completed || 0)) {
        try {
          useInAppNotificationStore.getState().push({
            source: 'challengeHub',
            kind: 'run_completed',
            title: 'Run completed',
            body: `${payload.source}: ${payload.completed} completed`,
            severity: 'success',
            meta: { source: payload.source },
          })
        } catch {
          // ignore
        }
      }
      return { ...prev, [payload.source]: payload }
    })
    onHubStatsChange?.(payload)
  }, [onHubStatsChange])

  const hideSide = sideCollapsed || resourceMode

  return (
    <div className={`challenge-hub-root flex flex-col gap-2.5 min-h-0${resourceMode ? ' is-resource-mode' : ''}`}>
      <div className="challenge-hub-topbar shrink-0">
        {!resourceMode ? (
          <ChallengeHubTabStrip
            tab={tab}
            onTabChange={handleTabChange}
            resourceMode={resourceMode}
            onToggleResourceMode={() => setChallengeHubResourceMode(true)}
          />
        ) : (
          <div className="challenge-hub-resource-title">Resource mode</div>
        )}
        <div className="challenge-hub-topbar-inbox">
          {resourceMode ? (
            <button
              type="button"
              className="challenge-hub-action is-active"
              title="Exit resource mode"
              onClick={() => setChallengeHubResourceMode(false)}
            >
              Full UI
            </button>
          ) : (
            <button
              type="button"
              className={`challenge-hub-action${sideCollapsed ? '' : ' is-active'}`}
              title={sideCollapsed ? 'Show live bet feed' : 'Hide live bet feed'}
              onClick={() => setSideCollapsed((c) => !c)}
            >
              Feed
            </button>
          )}
          <ChallengeHubNotificationCenter />
        </div>
      </div>

      <ChallengeHubBetListProvider>
        <div className="challenge-hub-canvas min-h-0 flex-1">
          <div className={`challenge-hub-workbench${hideSide ? ' is-side-collapsed' : ''}`}>
            <div className="challenge-hub-main-column min-w-0 min-h-0">
              <ChallengeHubTabContent
                tab={resourceMode ? 'casino' : tab}
                accessToken={accessToken}
                webSlots={webSlots}
                onDiscoveredSlots={onDiscoveredSlots}
                onHubStatsChange={handleHubStatsChange}
                resourceMode={resourceMode}
              />
            </div>

            {!hideSide && (
              <div className="challenge-hub-side-column min-h-0">
                <ChallengeHubBetListPanel
                  accessToken={accessToken}
                  onHide={() => setSideCollapsed(true)}
                />
              </div>
            )}
          </div>
        </div>
      </ChallengeHubBetListProvider>
    </div>
  )
}
