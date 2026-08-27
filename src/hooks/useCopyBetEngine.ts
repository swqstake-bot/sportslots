import { useEffect, useRef } from 'react'
import { StakeApi } from '../api/client'
import { Queries } from '../api/queries'
import { fetchCurrencyRates } from '../components/Casino/api/stakeChallenges'
import { placeSportBetWithPolicy } from '../services/sportsRuntime'
import { useCopyBetStore, type CopyFeedRow } from '../store/copyBetStore'
import { useUserStore } from '../store/userStore'
import {
  currencyToUsd,
  matchCopyFilters,
  parseSportBet,
  resolveCopyStakeUsd,
  usdToCurrency,
  type FeedBoardRow,
} from '../utils/copyBetFilter'

function sleep(ms: number, signal: { cancelled: boolean }) {
  return new Promise<void>((resolve) => {
    const start = Date.now()
    const tick = () => {
      if (signal.cancelled || Date.now() - start >= ms) {
        resolve()
        return
      }
      setTimeout(tick, 150)
    }
    tick()
  })
}

function slipKey(ids: string[]): string {
  return [...ids].sort().join('|')
}

async function fetchBoard(feed: 'all' | 'highroller', limit: number): Promise<FeedBoardRow[]> {
  if (feed === 'highroller') {
    const res = await StakeApi.query<any>(Queries.HighrollerSportBets, { limit })
    return Array.isArray(res?.data?.highrollerSportBets) ? res.data.highrollerSportBets : []
  }
  const res = await StakeApi.query<any>(Queries.AllSportBets, { limit })
  return Array.isArray(res?.data?.allSportBets) ? res.data.allSportBets : []
}

export function useCopyBetEngine() {
  const isRunning = useCopyBetStore((s) => s.isRunning)
  const runningRef = useRef(false)

  useEffect(() => {
    if (!isRunning) {
      runningRef.current = false
      return
    }
    runningRef.current = true
    const signal = { cancelled: false }

    void (async () => {
      const store = useCopyBetStore.getState()
      store.resetCounters()
      store.addLog('Copy feed started', 'info')
      const seen = new Set<string>()
      const placedSlips = new Set<string>()
      const copyTimes: number[] = []
      let primed = false
      let rates: Record<string, number> = {}
      let lastRateAt = 0
      const refreshRates = async () => {
        try {
          rates = (await fetchCurrencyRates('')) ?? rates
          lastRateAt = Date.now()
        } catch {
          if (!lastRateAt) store.addLog('FX rates missing — USDT/USDC treated 1:1', 'warning')
        }
      }
      await refreshRates()

      while (runningRef.current && useCopyBetStore.getState().isRunning) {
        const { settings } = useCopyBetStore.getState()
        if (Date.now() - lastRateAt > 10 * 60 * 1000) await refreshRates()
        const ownName = useUserStore.getState().user?.name || ''
        const feeds: Array<'all' | 'highroller'> =
          settings.feed === 'both' ? ['highroller', 'all'] : [settings.feed]
        const preview: CopyFeedRow[] = []
        const previewSeen = new Set<string>()
        let newCount = 0
        try {
          for (const feed of feeds) {
            const rows = await fetchBoard(feed, 40)
            for (const row of rows) {
              const parsed = parseSportBet(row)
              if (!parsed) continue
              const stakeUsd = currencyToUsd(parsed.amount, parsed.currency, rates)
              const skip = matchCopyFilters(parsed, settings, stakeUsd, ownName)
              const previewId = parsed.iid || parsed.id
              if (previewId && previewSeen.has(previewId)) continue
              if (previewId) previewSeen.add(previewId)
              preview.push({
                id: parsed.id,
                iid: parsed.iid,
                user: parsed.hidden ? 'Hidden' : parsed.user || '—',
                hidden: parsed.hidden,
                odds: parsed.odds,
                stakeUsd,
                currency: parsed.currency,
                amount: parsed.amount,
                legs: parsed.legs,
                sport: parsed.sport,
                event: parsed.event,
                matched: !skip,
                skipReason: skip || undefined,
              })
              const dedupe = parsed.iid || parsed.id
              if (!dedupe) continue

              if (!primed && settings.ignoreExistingOnStart) {
                seen.add(dedupe)
                continue
              }

              if (seen.has(dedupe)) continue
              seen.add(dedupe)
              if (seen.size > 4000) {
                const drop = [...seen].slice(0, 1500)
                for (const k of drop) seen.delete(k)
              }
              newCount += 1
              if (skip) continue
              const key = slipKey(parsed.outcomeIds)
              if (placedSlips.has(key)) {
                useCopyBetStore.getState().addLog(`Skip duplicate slip ${parsed.event.slice(0, 48)}`, 'info')
                continue
              }
              const copyUsd = resolveCopyStakeUsd(settings, stakeUsd)
              const cryptoAmount = usdToCurrency(copyUsd, settings.currency, rates)
              if (settings.scanOnly) {
                useCopyBetStore.getState().addLog(
                  `Scan hit ${parsed.user} ${parsed.odds.toFixed(2)}× $${stakeUsd.toFixed(0)} ${parsed.event.slice(0, 72)}`,
                  'info'
                )
                preview[preview.length - 1] = { ...preview[preview.length - 1], copied: true }
                continue
              }
              const now = Date.now()
              const maxPerMin = Math.max(1, Number(settings.maxCopiesPerMinute) || 8)
              for (let i = copyTimes.length - 1; i >= 0; i -= 1) {
                if (now - copyTimes[i] > 60_000) copyTimes.splice(i, 1)
              }
              if (copyTimes.length >= maxPerMin) {
                useCopyBetStore.getState().addLog(`Rate limit ${maxPerMin}/min — skip ${parsed.event.slice(0, 48)}`, 'warning')
                continue
              }
              const balance = useUserStore.getState().balances[settings.currency] ?? 0
              if (balance < cryptoAmount) {
                useCopyBetStore.getState().addLog(
                  `Skip ${parsed.user}: balance ${balance.toFixed(4)} ${settings.currency} < ${cryptoAmount.toFixed(4)}`,
                  'warning'
                )
                continue
              }
              useCopyBetStore.getState().addLog(
                `Copy ${parsed.user} ${parsed.odds.toFixed(2)}× ${parsed.legs} legs $${stakeUsd.toFixed(0)} → $${copyUsd.toFixed(2)} ${parsed.event.slice(0, 72)}`,
                'info'
              )
              try {
                const placed = await placeSportBetWithPolicy(
                  {
                    amount: Number(cryptoAmount.toFixed(8)),
                    currency: settings.currency,
                    outcomeIds: parsed.outcomeIds,
                    betType: 'sports',
                    oddsChange: settings.oddsChange,
                  },
                  { maxAttempts: 2 }
                )
                if (!placed.bet) throw new Error('No bet returned')
                placedSlips.add(key)
                copyTimes.push(Date.now())
                useCopyBetStore.getState().bumpCopied()
                useCopyBetStore.getState().addLog(`Placed ${parsed.odds.toFixed(2)}× ${parsed.event.slice(0, 64)}`, 'success')
                preview[preview.length - 1] = { ...preview[preview.length - 1], copied: true }
                await sleep(Math.max(400, Number(settings.copyDelayMs) || 1200), signal)
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err)
                useCopyBetStore.getState().addLog(`Place failed: ${msg.slice(0, 160)}`, 'error')
              }
            }
          }
          if (!primed && settings.ignoreExistingOnStart) {
            primed = true
            useCopyBetStore.getState().addLog(
              `Primed ${seen.size} board bets — copying only new slips after this`,
              'info'
            )
          }
          if (newCount) useCopyBetStore.getState().bumpScanned(newCount)
          useCopyBetStore.getState().setLastFeed(preview)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          useCopyBetStore.getState().addLog(`Feed error: ${msg.slice(0, 160)}`, 'error')
        }
        const wait = Math.max(1200, Number(useCopyBetStore.getState().settings.pollMs) || 2500)
        await sleep(wait, signal)
      }
      useCopyBetStore.getState().addLog('Copy feed stopped', 'info')
    })()

    return () => {
      runningRef.current = false
      signal.cancelled = true
    }
  }, [isRunning])
}
