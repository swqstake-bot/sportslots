import { useCallback, useEffect, useRef, useState } from 'react'
import { StakeApi } from '../api/client'
import { Queries } from '../api/queries'
import { calculateVipInfo, type VipProgressInfo } from '../utils/vipProgress'
import { extractWeeklyWagerUsd, type ActiveRaffle } from '../utils/weeklyWager'

const POLL_MS = 30_000

export interface StakeAccountMeta {
  weeklyWagerUsd: number | null
  vip: VipProgressInfo | null
}

export function useStakeAccountMeta(enabled: boolean) {
  const [meta, setMeta] = useState<StakeAccountMeta>({ weeklyWagerUsd: null, vip: null })
  const [isLoading, setIsLoading] = useState(false)
  const inFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled || inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    try {
      const [vipRes, raffleRes] = await Promise.all([
        StakeApi.query<{
          user?: { flagProgress?: { flag?: string; progress?: number } | null }
        }>(Queries.VipProgressMeta).catch(() => ({ data: undefined })),
        StakeApi.query<{ activeRaffles?: ActiveRaffle[] }>(Queries.ActiveRaffles, {
          isAuthenticated: true,
        }).catch(() => ({ data: undefined })),
      ])

      const flagProgress = vipRes.data?.user?.flagProgress
      const vip =
        flagProgress?.flag != null && flagProgress.progress != null
          ? calculateVipInfo(flagProgress.flag, flagProgress.progress)
          : null

      const weeklyWagerUsd = extractWeeklyWagerUsd(raffleRes.data?.activeRaffles)

      setMeta({ weeklyWagerUsd, vip })
    } catch (err) {
      console.warn('[StakeAccountMeta] refresh failed:', err)
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setMeta({ weeklyWagerUsd: null, vip: null })
      return
    }
    void refresh()
    const interval = setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [enabled, refresh])

  return { meta, isLoading, refresh }
}
