import { toMinor } from './formatAmount'
import { subscribeToHouseBets } from '../api/stakeRealtimeFacade'
import {
  formatStakeShareBetId,
  areStakeShareIdsEquivalent,
  isPersistableStakeHouseBetShareId,
  pickStakeHouseBetShareRawId,
} from './stakeBetShareId'
import { normalizeBetSlugForHouseMatch, houseBetSlugMatchesSessionSlug } from './slotSlugMatching'
import {
  HOUSEBET_RETRY_BUFFER_MAX_MS,
  HOUSEBET_RETRY_BUFFER_MAX,
  prunePendingHouseBetMap,
  splicePendingHouseBetMatch,
  splicePendingHouseBetByProviderBetId,
  splicePendingHouseBetMatchWithoutSlug,
  hasPendingHouseBetForPayloadSlug,
} from './hunterPendingHouseBetMatch'
import {
  patchHubFeedEntryFromHouseBet,
  patchHubFeedRunFromHouseBet,
} from './challengeHubBetIdPatch'
import { setHouseShareIdLookup } from './hunterHouseBetShareIdMap'

export const HOUSEBET_EVENT_QUEUE_MAX = 500
export const HOUSEBET_WORKER_MAX_EVENTS = 20

let hunterCoordinatorActive = false

/** BetListPanel skips applyHouseBetToHubFeed while hunter owns houseBet matching. */
export function isHunterHouseBetCoordinatorActive() {
  return hunterCoordinatorActive
}

/**
 * @param {object} ctx
 * @returns {() => void} cleanup
 */
export function attachHunterHouseBetCoordinator(ctx) {
  const {
    accessToken,
    log,
    debugBetIdMatch,
    refs,
    shouldPersistOverallBetId,
    loadBestBetIdMap,
    persistBestBetIdMap,
    persistBestMultiMap,
  } = ctx

  const {
    pendingHouseBetMatchRef,
    houseBetEventQueueRef,
    houseBetWorkerScheduledRef,
    houseBetRetryBufferRef,
    scheduleHouseBetWorkerRef,
    activeRunsRef,
    activeRunsUiDirtyRef,
    runBestMultiSyncRef,
    houseShareIdByProviderBetIdRef,
    houseBetDeferredUiTimersRef,
    bestMultiBySlotRef,
    bumpHunterStorageRef,
    setActiveRuns,
    setBestMultiBySlotRef,
  } = refs

  if (!accessToken) return () => {}

  hunterCoordinatorActive = false

  if (debugBetIdMatch) {
    console.warn('[AutoChallengeHunter] houseBets subscription init', {
      hasAccessToken: !!accessToken,
    })
  }

  let cancelled = false
  let sub = null

  function shouldCoordinatorStayActive() {
    const ar = activeRunsRef.current || {}
    if (Object.values(ar).some((r) => r?.status === 'running')) return true
    if (houseBetRetryBufferRef.current.length > 0) return true
    const pm = pendingHouseBetMatchRef.current
    for (const rid of Object.keys(pm || {})) {
      const v = pm[rid]
      if (Array.isArray(v) && v.length) return true
    }
    return false
  }

  const runWorkerTick = () => {
    houseBetWorkerScheduledRef.current = false

    const rnow = Date.now()
    houseBetRetryBufferRef.current = houseBetRetryBufferRef.current.filter(
      (e) => rnow - e.at < HOUSEBET_RETRY_BUFFER_MAX_MS
    )
    if (houseBetRetryBufferRef.current.length > HOUSEBET_RETRY_BUFFER_MAX) {
      houseBetRetryBufferRef.current = houseBetRetryBufferRef.current.slice(-HOUSEBET_RETRY_BUFFER_MAX)
    }

    const q = houseBetEventQueueRef.current
    if (q.length === 0) {
      hunterCoordinatorActive = shouldCoordinatorStayActive()
      return
    }

    const batch = q.splice(0, HOUSEBET_WORKER_MAX_EVENTS)
    const bestBetByRunId = {}
    const multiUiByRunId = {}
    const betIdToPersistOverall = {}
    const batchRunBestMulti = {}

    for (const bItem of batch) {
      const payloadSlug = normalizeBetSlugForHouseMatch(bItem?.gameSlug)
      const payloadCurr = String(bItem?.currency || '').toLowerCase()

      const active = activeRunsRef.current || {}
      const runningSlugList = Object.values(active)
        .filter((r) => r?.status === 'running' && r?.slotSlug)
        .map((r) => normalizeBetSlugForHouseMatch(r.slotSlug))
      const pendingMap = pendingHouseBetMatchRef.current
      const hasRunningForHouseBet = payloadSlug
        ? runningSlugList.some((s) => houseBetSlugMatchesSessionSlug(payloadSlug, s)) ||
          hasPendingHouseBetForPayloadSlug(pendingMap, payloadSlug)
        : Object.values(active).some((r) => r?.status === 'running') ||
          Object.keys(pendingMap || {}).some(
            (rid) => Array.isArray(pendingMap[rid]) && pendingMap[rid].length > 0
          )
      if (!hasRunningForHouseBet) continue

      const directProviderBetId = String(bItem?.betId || '').trim()
      const p =
        splicePendingHouseBetByProviderBetId(pendingMap, payloadSlug, directProviderBetId) ||
        (payloadSlug
          ? splicePendingHouseBetMatch(pendingMap, payloadSlug, payloadCurr, bItem)
          : splicePendingHouseBetMatchWithoutSlug(pendingMap, payloadCurr, bItem))

      if (p) {
        const runId = p.runId
        const rawId = pickStakeHouseBetShareRawId(bItem)
        const shareId = rawId ? formatStakeShareBetId(rawId) : null

        const spinM = Number(p.multi) || 0
        const houseBetCurr = String(bItem?.currency || p.currency || '').toLowerCase()
        const stakeMajor = Number(bItem?.amountMajor ?? bItem?.amount ?? p.betAmountMajor ?? 0)
        const houseBetMulti = Number(bItem?.payoutMultiplier)
        const effectiveMulti =
          Number.isFinite(houseBetMulti) && houseBetMulti >= 0 ? houseBetMulti : spinM
        const trackMulti = Math.max(spinM, effectiveMulti)
        const prevBest = Math.max(
          activeRunsRef.current[runId]?.bestMultiRun ?? 0,
          batchRunBestMulti[runId] ?? 0
        )
        batchRunBestMulti[runId] = Math.max(prevBest, trackMulti)

        const prevUiM = multiUiByRunId[runId]?.multi ?? 0
        if (trackMulti > prevUiM) {
          multiUiByRunId[runId] = {
            multi: trackMulti,
            storageSlug: p.storageSlug,
            slug: p.slug,
            spinSeq: p.spinSeq,
          }
        } else if (!multiUiByRunId[runId]) {
          multiUiByRunId[runId] = {
            multi: trackMulti,
            storageSlug: p.storageSlug,
            slug: p.slug,
            spinSeq: p.spinSeq,
          }
        }

        if (shareId) {
          if (directProviderBetId) {
            setHouseShareIdLookup(houseShareIdByProviderBetIdRef, directProviderBetId, shareId)
          }
          bestBetByRunId[runId] = shareId
          const key = p.storageSlug != null ? p.storageSlug : p.slug
          if (
            isPersistableStakeHouseBetShareId(shareId) &&
            shouldPersistOverallBetId(p.slug, key, trackMulti, bestMultiBySlotRef.current)
          ) {
            betIdToPersistOverall[key] = shareId
          }
        }

        if (p.feedEntryId) {
          const patchCurr = String(bItem?.currency || p.currency || houseBetCurr || 'usd').toLowerCase()
          const amountPatch =
            Number.isFinite(stakeMajor) && stakeMajor > 0
              ? {
                  betAmount: toMinor(stakeMajor, patchCurr),
                  winAmount: toMinor(
                    stakeMajor * Math.max(0, Number(effectiveMulti) || 0),
                    patchCurr
                  ),
                  multiplier: Math.max(0, Number(effectiveMulti) || 0),
                  currencyCode: patchCurr.toUpperCase(),
                }
              : { currencyCode: patchCurr.toUpperCase() }
          patchHubFeedEntryFromHouseBet(p.feedEntryId, bItem, amountPatch)
          if (p.spinSeq != null) {
            const mk = `${runId}:${p.spinSeq}`
            const tid = houseBetDeferredUiTimersRef.current.get(mk)
            if (tid != null) {
              clearTimeout(tid)
              houseBetDeferredUiTimersRef.current.delete(mk)
            }
          }
        }
      }

      if (!p && hasRunningForHouseBet) {
        const rawShareFallback = pickStakeHouseBetShareRawId(bItem)
        const shareIdFallback = rawShareFallback ? formatStakeShareBetId(rawShareFallback) : null
        if (shareIdFallback) {
          const candidateRuns = Object.values(active).filter((r) => {
            if (!r || r.status !== 'running') return false
            const runSlug = normalizeBetSlugForHouseMatch(r.slotSlug)
            if (!houseBetSlugMatchesSessionSlug(payloadSlug, runSlug)) return false
            if (!payloadCurr) return true
            const runCurr = String(r.runCurrency || '').toLowerCase()
            return !runCurr || runCurr === payloadCurr
          })
          if (candidateRuns.length === 1) {
            const targetRun = candidateRuns[0]
            const targetRunId = targetRun.id
            if (targetRunId && !areStakeShareIdsEquivalent(targetRun.bestBetId, shareIdFallback)) {
              bestBetByRunId[targetRunId] = shareIdFallback
            }
            const hbMultiFallback = Number(bItem?.payoutMultiplier)
            if (targetRunId && Number.isFinite(hbMultiFallback) && hbMultiFallback > 0) {
              const prevUiMFallback = multiUiByRunId[targetRunId]?.multi ?? 0
              if (hbMultiFallback > prevUiMFallback) {
                multiUiByRunId[targetRunId] = {
                  multi: hbMultiFallback,
                  storageSlug: targetRun.slotSlug,
                  slug: targetRun.slotSlug,
                  spinSeq: null,
                }
              }
            }
            if (targetRunId) {
              patchHubFeedRunFromHouseBet(targetRunId, bItem)
            }
          }
        }
        const dedupeKey = pickStakeHouseBetShareRawId(bItem) || bItem?.id
        if (dedupeKey) {
          const buf = houseBetRetryBufferRef.current
          if (!buf.some((e) => e.key === dedupeKey)) {
            buf.push({ key: dedupeKey, bItem, at: Date.now() })
            if (buf.length > HOUSEBET_RETRY_BUFFER_MAX) buf.shift()
          }
        }
      }
    }

    const runIds = [...new Set([...Object.keys(bestBetByRunId), ...Object.keys(multiUiByRunId)])]
    if (runIds.length) {
      for (const runId of runIds) {
        const m = multiUiByRunId[runId]
        if (m && m.multi != null && Number.isFinite(Number(m.multi))) {
          const prevS = runBestMultiSyncRef.current[runId] ?? 0
          runBestMultiSyncRef.current[runId] = Math.max(Number(prevS) || 0, Number(m.multi))
        }
      }

      setActiveRuns((prev) => {
        const next = { ...prev }
        for (const runId of runIds) {
          const run = next[runId]
          if (!run || run.status !== 'running') continue
          const refRun = activeRunsUiDirtyRef.current ? activeRunsRef.current?.[runId] : null
          const baseRun = refRun ? { ...run, ...refRun } : run
          const m = multiUiByRunId[runId]
          const nextBest =
            m && m.multi != null && Number.isFinite(Number(m.multi))
              ? Math.max(baseRun.bestMultiRun ?? 0, Number(m.multi))
              : baseRun.bestMultiRun
          const bid = bestBetByRunId[runId]
          next[runId] = {
            ...baseRun,
            bestBetId: bid != null ? bid : baseRun.bestBetId ?? null,
            bestMultiRun: nextBest,
          }
        }
        activeRunsRef.current = next
        return next
      })

      for (const runId of runIds) {
        const m = multiUiByRunId[runId]
        if (!m || m.multi == null || !Number.isFinite(Number(m.multi))) continue
        const slugKey = m.storageSlug != null ? m.storageSlug : m.slug
        setBestMultiBySlotRef.current((prev) => {
          const cur = prev[slugKey] ?? 0
          const nm = Number(m.multi)
          if (nm <= cur) return prev
          const nmap = { ...prev, [slugKey]: nm }
          persistBestMultiMap(nmap)
          return nmap
        })
      }

      try {
        const keys = Object.keys(betIdToPersistOverall)
        if (keys.length) {
          const bestBetIdMap = loadBestBetIdMap()
          const merged = { ...bestBetIdMap }
          for (const k of keys) {
            const v = betIdToPersistOverall[k]
            if (v && isPersistableStakeHouseBetShareId(v)) merged[k] = v
          }
          persistBestBetIdMap(merged)
          bumpHunterStorageRef.current?.()
        }
      } catch (_) {}

      if (debugBetIdMatch) {
        log(`houseBets: Bet ID + best multi for ${runIds.length} run(s) (after houseBets).`)
      }
    }

    if (houseBetEventQueueRef.current.length > 0) {
      houseBetWorkerScheduledRef.current = true
      setTimeout(runWorkerTick, 0)
    }

    hunterCoordinatorActive = shouldCoordinatorStayActive()
  }

  const scheduleHouseBetWorker = () => {
    if (houseBetWorkerScheduledRef.current) return
    houseBetWorkerScheduledRef.current = true
    setTimeout(runWorkerTick, 0)
  }
  scheduleHouseBetWorkerRef.current = scheduleHouseBetWorker

  const shouldEnqueueHouseBet = () => {
    hunterCoordinatorActive = shouldCoordinatorStayActive()
    return hunterCoordinatorActive
  }

  subscribeToHouseBets(accessToken, (b) => {
    const betType = String(b?.betType || '')
    if (/sport/i.test(betType)) return
    if (!shouldEnqueueHouseBet()) return
    const now = Date.now()
    prunePendingHouseBetMap(pendingHouseBetMatchRef.current, now)
    houseBetEventQueueRef.current.push(b)
    if (houseBetEventQueueRef.current.length > HOUSEBET_EVENT_QUEUE_MAX) {
      houseBetEventQueueRef.current.splice(
        0,
        houseBetEventQueueRef.current.length - HOUSEBET_EVENT_QUEUE_MAX
      )
    }
    scheduleHouseBetWorker()
  }).then((s) => {
    if (cancelled) {
      try {
        s?.disconnect?.()
      } catch (_) {}
      return
    }
    sub = s
  })

  return () => {
    cancelled = true
    hunterCoordinatorActive = false
    scheduleHouseBetWorkerRef.current = () => {}
    houseBetRetryBufferRef.current = []
    try {
      sub?.disconnect?.()
    } catch (_) {}
  }
}
