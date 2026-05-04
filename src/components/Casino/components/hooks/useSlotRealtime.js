import { useEffect } from 'react'
import { toMinor } from '../../utils/formatAmount'
import { isDebugHouseBetsEnabled } from '../../api/stakeBalanceSubscription'
import { subscribeToHouseBets, subscribeToStakeBalance } from '../../api/stakeRealtimeFacade'
import { houseBetSlugMatchesSessionSlug } from '../../utils/slotSlugMatching'

export function useSlotRealtime({
  accessToken,
  effectiveTarget,
  fillBetHistoryFromPlaceBet,
  slot,
  setWsBalance,
  addToBetHistory,
}) {
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    let balanceSub = null
    subscribeToStakeBalance(accessToken, (payload) => {
      if (!payload?.currency) return
      const curr = (payload.currency || '').toLowerCase()
      if (curr === String(effectiveTarget || '').toLowerCase()) {
        // SlotControl expects balances in minor units for toUsdCents/toUnits.
        const amountMinor = payload?.amountMinor
        const next = amountMinor != null ? Number(amountMinor) : null
        setWsBalance(Number.isFinite(next) ? next : null)
      }
    }).then((s) => {
      if (cancelled) {
        try {
          s?.disconnect?.()
        } catch (_) {}
        return
      }
      balanceSub = s
    })
    return () => {
      cancelled = true
      try {
        balanceSub?.disconnect?.()
      } catch (_) {}
    }
  }, [accessToken, effectiveTarget, setWsBalance])

  useEffect(() => {
    if (!accessToken) return
    if (fillBetHistoryFromPlaceBet && !isDebugHouseBetsEnabled()) return

    try {
      console.warn('[SlotControl] houseBets subscription init', {
        slot: slot.slug,
        providerId: slot.providerId,
        fillBetHistoryFromPlaceBet,
        debugHouseBets: isDebugHouseBetsEnabled(),
        effectiveTarget,
      })
    } catch (_) {}

    let slotMatchDebugCount = 0
    let cancelled = false
    let sub = null
    subscribeToHouseBets(accessToken, (b) => {
      const slug = String(b?.gameSlug || '')
      const matches = slug && houseBetSlugMatchesSessionSlug(slug, slot.slug)
      const shouldLog = isDebugHouseBetsEnabled() && matches && slotMatchDebugCount < 20
      if (shouldLog) {
        slotMatchDebugCount += 1
        console.warn('[houseBets→SlotControl]', {
          gameSlug: b?.gameSlug,
          slotSlug: slot.slug,
          matches,
          addToBet: !fillBetHistoryFromPlaceBet,
          amount: b?.amount,
          payout: b?.payout,
        })
      }
      if (fillBetHistoryFromPlaceBet) return
      if (!slug || !matches) return

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
      addToBetHistory({ betAmount, winAmount, isBonus: false, balance: undefined, currencyCode, roundId: b?.id })
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
  }, [accessToken, slot.slug, slot.providerId, effectiveTarget, addToBetHistory, fillBetHistoryFromPlaceBet])
}

