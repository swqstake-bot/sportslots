import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChallengeHubBetListPanel } from './challengeHub/ChallengeHubBetListPanel'
import { ChallengeHubHeroBar } from './challengeHub/ChallengeHubHeroBar'
import { ChallengeHubTabStrip, type HubTab } from './challengeHub/ChallengeHubTabStrip'
import { ChallengeHubTabContent } from './challengeHub/ChallengeHubTabContent'
import type { HubStatsPayload } from './challengeHub/hubTypes'
import type { CasinoChallengeSelection } from '../types'

interface ChallengeHubViewProps {
  accessToken: string
  webSlots: any[]
  onDiscoveredSlots: (added: { slug: string; name: string; providerId: string; thumbnailUrl?: string }[]) => void
  onSelectChallenge: (challenge: CasinoChallengeSelection) => void
}

const TELEGRAM_GATE_KEY = 'slotbot_hub_telegram_enabled_v1'
const TELEGRAM_USAGE_KEY = 'slotbot_hub_telegram_usage_count_v1'

export function ChallengeHubView({ accessToken, webSlots, onDiscoveredSlots, onSelectChallenge }: ChallengeHubViewProps) {
  const [tab, setTab] = useState<HubTab>('casino')
  const [hubStatsBySource, setHubStatsBySource] = useState<Record<string, HubStatsPayload>>({})
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
      if (wanted === 'casino' || wanted === 'telegram' || wanted === 'forum' || wanted === 'promotions') {
        setTab(wanted as HubTab)
      }
    }
    window.addEventListener('challenge-hub-open-tab', onExternalOpenTab as EventListener)
    return () => window.removeEventListener('challenge-hub-open-tab', onExternalOpenTab as EventListener)
  }, [])

  const aggregated = useMemo(() => {
    const values = Object.values(hubStatsBySource)
    return values.reduce(
      (acc, item) => ({
        queued: acc.queued + (Number(item.queued) || 0),
        running: acc.running + (Number(item.running) || 0),
        completed: acc.completed + (Number(item.completed) || 0),
        bestMulti: Math.max(acc.bestMulti, Number(item.bestMulti) || 0),
      }),
      { queued: 0, running: 0, completed: 0, bestMulti: 0 }
    )
  }, [hubStatsBySource])

  const handleHubStatsChange = useCallback((payload: HubStatsPayload) => {
    if (!payload?.source) return
    setHubStatsBySource((prev) => ({ ...prev, [payload.source]: payload }))
  }, [])

  return (
    <div className="challenge-hub-root space-y-4">
      <ChallengeHubHeroBar aggregated={aggregated} />

      <ChallengeHubTabStrip tab={tab} onTabChange={handleTabChange} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
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

        <ChallengeHubBetListPanel />
      </div>
    </div>
  )
}
