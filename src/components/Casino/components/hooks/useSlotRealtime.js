import { useEffect, useRef } from 'react'
import { toMinor } from '../../utils/formatAmount'
import { isDebugHouseBetsEnabled } from '../../api/stakeBalanceSubscription'
import { subscribeToHouseBets } from '../../api/stakeRealtimeFacade'
import { houseBetMatchesSessionSlot } from '../../utils/slotSlugMatching'
import { useUserStore } from '../../../../store/userStore'
import { formatHouseBetShareIdForRow } from '../../utils/stakeBetShareId'

let slotBetIdLogCount = 0

function logSlotBetId(detail) {
  if (slotBetIdLogCount >= 40) return
  slotBetIdLogCount += 1
  try {
    console.warn('[slot-bet-id]', detail)
  } catch (_) {}
}

export function useSlotRealtime({
  accessToken,
  effectiveTarget,
  subscribeHouseBetsForHistory = true,
  slot,
  setWsBalance,
  addToBetHistory,
}) {
  const targetCur = String(effectiveTarget || '').toLowerCase()
  const storeBalanceMajor = useUserStore((s) => s.balances[targetCur])
  const addToBetHistoryRef = useRef(addToBetHistory)
  addToBetHistoryRef.current = addToBetHistory
  const slotRef = useRef(slot)
  slotRef.current = slot

  useEffect(() => {
    if (!accessToken || !targetCur) return
    if (storeBalanceMajor == null || !Number.isFinite(storeBalanceMajor)) return
    setWsBalance(toMinor(storeBalanceMajor, targetCur))
  }, [accessToken, targetCur, storeBalanceMajor, setWsBalance])

  useEffect(() => {
    if (!accessToken) return
    if (!subscribeHouseBetsForHistory && !isDebugHouseBetsEnabled()) return

    try {
      console.warn('[SlotControl] houseBets subscription init', {
        slot: slot.slug,
        providerId: slot.providerId,
        subscribeHouseBetsForHistory,
        debugHouseBets: isDebugHouseBetsEnabled(),
        effectiveTarget,
      })
    } catch (_) {}

    let cancelled = false
    let sub = null
    subscribeToHouseBets(accessToken, (b) => {
      const currentSlot = slotRef.current
      const matches = houseBetMatchesSessionSlot(b, currentSlot.slug, currentSlot.name)
      const rawShare = b?.shareIid ?? b?.iid ?? b?.houseTopId ?? null
      const shareIid = formatHouseBetShareIdForRow(rawShare)

      if (!subscribeHouseBetsForHistory) return
      if (!matches) {
        logSlotBetId({
          phase: 'slug-miss',
          slotSlug: currentSlot.slug,
          gameSlug: b?.gameSlug,
          gameName: b?.gameName,
          rawShare,
        })
        return
      }

      const curr = (b?.currency || 'usd').toLowerCase()
      const betAmountMajor = Number(b?.amountMajor ?? b?.amount) || 0
      const payoutMajorRaw = Number(b?.payoutMajor ?? b?.payout) || 0
      const payoutMultiplier = Number(b?.payoutMultiplier) || 0

      let payoutMajorToUse = payoutMajorRaw
      if (betAmountMajor > 0 && payoutMultiplier > 0 && payoutMajorRaw >= 0) {
        const derivedFromRaw = payoutMajorRaw / betAmountMajor
        const derivedFromNetPlusStake = (payoutMajorRaw + betAmountMajor) / betAmountMajor
        const tol = 0.02
        const rawDist = Math.abs(derivedFromRaw - payoutMultiplier)
        const netStakeDist = Math.abs(derivedFromNetPlusStake - payoutMultiplier)
        if (netStakeDist + tol < rawDist) payoutMajorToUse = payoutMajorRaw + betAmountMajor
      }

      const betAmount = toMinor(betAmountMajor, curr)
      const winAmount = toMinor(payoutMajorToUse, curr)
      const currencyCode = (b?.currency || '').toUpperCase() || null

      logSlotBetId({
        phase: 'house→history',
        slotSlug: currentSlot.slug,
        gameSlug: b?.gameSlug,
        rawShare,
        shareIid,
        betAmount,
        winAmount,
        source: b?.source,
      })

      addToBetHistoryRef.current({
        betAmount,
        winAmount,
        isBonus: false,
        balance: undefined,
        currencyCode,
        roundId: shareIid || b?.id,
        shareIid,
        iid: shareIid,
        houseTopId: b?.houseTopId ?? null,
        payoutMultiplier: payoutMultiplier > 0 ? payoutMultiplier : undefined,
        source: String(b?.source || 'housebets').toLowerCase(),
      })
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
      try {
        sub?.disconnect?.()
      } catch (_) {}
    }
  }, [accessToken, slot.slug, slot.name, slot.providerId, effectiveTarget, subscribeHouseBetsForHistory])
}
