import { convertToUsd, normalizeAmount } from '../../utils/monetaryContract'

export interface StatsInput {
  amount: number
  payout: number
  currency: string
  source?: string
  timestamp?: number
}

export interface DeterministicStats {
  count: number
  totalWageredUsd: number
  totalPayoutUsd: number
  netUsd: number
  roiPercent: number
  winCount: number
  lossCount: number
  evenCount: number
  fxMissingCount: number
  fxCoveragePercent: number
}

export function computeDeterministicStats(entries: StatsInput[], rates: Record<string, number>): DeterministicStats {
  let totalWageredUsd = 0
  let totalPayoutUsd = 0
  let winCount = 0
  let lossCount = 0
  let evenCount = 0
  let fxMissingCount = 0

  for (const row of entries || []) {
    const amount = Number(row?.amount || 0)
    const payout = Number(row?.payout || 0)
    const currency = String(row?.currency || '').toLowerCase()

    const amountConv = convertToUsd(amount, currency, 'major', rates)
    const payoutConv = convertToUsd(payout, currency, 'major', rates)
    if (amountConv.fxStatus === 'ok' && payoutConv.fxStatus === 'ok') {
      totalWageredUsd += amountConv.usdAmount || 0
      totalPayoutUsd += payoutConv.usdAmount || 0
    } else if (amount > 0 || payout > 0) {
      fxMissingCount += 1
    }

    const amountMinor = normalizeAmount(amount, currency, 'major').amountMinor
    const payoutMinor = normalizeAmount(payout, currency, 'major').amountMinor
    const netMinor = payoutMinor - amountMinor
    if (netMinor > 0) winCount += 1
    else if (netMinor < 0) lossCount += 1
    else evenCount += 1
  }

  const count = entries?.length || 0
  const netUsd = totalPayoutUsd - totalWageredUsd
  const roiPercent = totalWageredUsd > 0 ? (netUsd / totalWageredUsd) * 100 : 0
  const valued = Math.max(0, count - fxMissingCount)
  const fxCoveragePercent = count > 0 ? (valued / count) * 100 : 100

  return {
    count,
    totalWageredUsd,
    totalPayoutUsd,
    netUsd,
    roiPercent,
    winCount,
    lossCount,
    evenCount,
    fxMissingCount,
    fxCoveragePercent,
  }
}

export function replayStats(entries: StatsInput[], rates: Record<string, number>) {
  const timeline: Array<{ index: number; netUsd: number }> = []
  let cumulative = 0
  for (let i = 0; i < entries.length; i += 1) {
    const row = entries[i]
    const amountConv = convertToUsd(row.amount, row.currency, 'major', rates)
    const payoutConv = convertToUsd(row.payout, row.currency, 'major', rates)
    if (amountConv.usdAmount != null && payoutConv.usdAmount != null) {
      cumulative += payoutConv.usdAmount - amountConv.usdAmount
    }
    timeline.push({ index: i + 1, netUsd: cumulative })
  }
  return timeline
}

