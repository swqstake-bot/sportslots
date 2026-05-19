import { useCallback, useEffect, useState } from 'react'
import { ChallengeHubBetListPanel } from './challengeHub/ChallengeHubBetListPanel'
import { ChallengeHubBetListProvider } from './challengeHub/ChallengeHubBetListContext'
import { ChallengeHubNotificationCenter } from './challengeHub/ChallengeHubNotificationCenter'
import { ChallengeHubTabStrip, type HubTab } from './challengeHub/ChallengeHubTabStrip'
import { ChallengeHubTabContent } from './challengeHub/ChallengeHubTabContent'
import type { HubStatsPayload } from './challengeHub/hubTypes'
import type { CasinoChallengeSelection } from '../types'
import { useInAppNotificationStore } from '../../../store/inAppNotificationStore'

interface ChallengeHubViewProps {
  accessToken: string
  webSlots: any[]
  onDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  onSelectChallenge: (challenge: CasinoChallengeSelection) => void
  onHubStatsChange?: (payload: HubStatsPayload) => void
}

const TELEGRAM_GATE_KEY = 'slotbot_hub_telegram_enabled_v1'
const TELEGRAM_USAGE_KEY = 'slotbot_hub_telegram_usage_count_v1'

export function ChallengeHubView({
  accessToken,
  webSlots,
  onDiscoveredSlots,
  onSelectChallenge,
  onHubStatsChange,
}: ChallengeHubViewProps) {
  const [tab, setTab] = useState<HubTab>('casino')
  const [, setHubStatsBySource] = useState<Record<string, HubStatsPayload>>({})
  const [telegramEnabled, setTelegramEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TELEGRAM_GATE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [telegramUsage, setTelegramUsage] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(TELEGRAM_USAGE_KEY) || 0)
      return Number.isFinite(n) && n >= 0 ? n : 0
    } catch {
      return 0
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(TELEGRAM_GATE_KEY, telegramEnabled ? '1' : '0')
    } catch {
      // ignore persistence errors in UI preference
    }
  }, [telegramEnabled])

  const handleTabChange = useCallback((next: HubTab) => {
    setTab(next)
    if (next === 'telegram') {
      setTelegramUsage((prev) => {
        const n = prev + 1
        try {
          localStorage.setItem(TELEGRAM_USAGE_KEY, String(n))
        } catch {
          // ignore persistence errors in usage counter
        }
        return n
      })
    }
  }, [])

  useEffect(() => {
    function onExternalOpenTab(ev: Event) {
      const detail = (ev as CustomEvent<any>)?.detail || {}
      const wanted = String(detail.tab || '').toLowerCase()
      if (
        wanted === 'casino' ||
        wanted === 'autorun' ||
        wanted === 'telegram' ||
        wanted === 'forum' ||
        wanted === 'promotions' ||
        wanted === 'archive'
      ) {
        setTab(wanted as HubTab)
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

  return (
    <div className="challenge-hub-root flex flex-col gap-2.5">
      <div className="challenge-hub-topbar">
        <ChallengeHubTabStrip tab={tab} onTabChange={handleTabChange} />
        <div className="challenge-hub-topbar-inbox">
          <ChallengeHubNotificationCenter />
        </div>
      </div>

      <ChallengeHubBetListProvider>
        <div className="challenge-hub-canvas">
          <div className="challenge-hub-workbench">
            <div className="min-w-0">
              <ChallengeHubTabContent
                tab={tab}
                accessToken={accessToken}
                webSlots={webSlots}
                onDiscoveredSlots={onDiscoveredSlots}
                onSelectChallenge={onSelectChallenge}
                onHubStatsChange={handleHubStatsChange}
                telegramEnabled={telegramEnabled}
                setTelegramEnabled={setTelegramEnabled}
                telegramUsage={telegramUsage}
              />
            </div>

            <div className="challenge-hub-side-column">
              <ChallengeHubBetListPanel accessToken={accessToken} />
            </div>
          </div>
        </div>
      </ChallengeHubBetListProvider>
    </div>
  )
}
