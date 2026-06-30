import { useEffect } from 'react'
import { toMinor } from '../../utils/formatAmount'
import { isDebugHouseBetsEnabled } from '../../api/stakeBalanceSubscription'
import { subscribeToHouseBets } from '../../api/stakeRealtimeFacade'
import { houseBetMatchesSessionSlot } from '../../utils/slotSlugMatching'
import { useUserStore } from '../../../../store/userStore'

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

    let slotMatchDebugCount = 0
    let cancelled = false
    let sub = null
    subscribeToHouseBets(accessToken, (b) => {
      const matches = houseBetMatchesSessionSlot(b, slot.slug, slot.name)
      const shouldLog = isDebugHouseBetsEnabled() && matches && slotMatchDebugCount < 20
      if (shouldLog) {
        slotMatchDebugCount += 1
        console.warn('[houseBets→SlotControl]', {
          gameSlug: b?.gameSlug,
          gameName: b?.gameName,
          slotSlug: slot.slug,
          slotName: slot.name,
          matches,
          addToBet: subscribeHouseBetsForHistory,
          amount: b?.amount,
          payout: b?.payout,
        })
      }
      if (!subscribeHouseBetsForHistory) return
      if (!matches) return

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

        if (isDebugHouseBetsEnabled() && shouldLog) {
          const chosenDerived = betAmountMajor > 0 ? payoutMajorToUse / betAmountMajor : null
          console.warn('[houseBets→SlotControl][dbg-multi]', {
            slotSlug: slot.slug,
            gameSlug: b?.gameSlug,
            currency: b?.currency,
            id: b?.id,
            amount: betAmountMajor,
            payoutRaw: payoutMajorRaw,
            payoutMultiplier,
            derivedFromRaw,
            derivedFromNetPlusStake,
            rawDist,
            netStakeDist,
            payoutMajorToUse,
            chosenDerived,
          })
        }
      }

      const betAmount = Number.isFinite(Number(b?.amountMinor))
        ? Number(b.amountMinor)
        : toMinor(betAmountMajor, curr)
      const winAmount = Number.isFinite(Number(b?.payoutMinor))
        ? Number(b.payoutMinor)
        : toMinor(payoutMajorToUse, curr)
      const currencyCode = (b?.currency || '').toUpperCase() || null
      addToBetHistory({ betAmount, winAmount, isBonus: false, balance: undefined, currencyCode, roundId: b?.id, source: b?.source || 'housebets' })
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
  }, [accessToken, slot.slug, slot.name, slot.providerId, effectiveTarget, addToBetHistory, subscribeHouseBetsForHistory])
}
