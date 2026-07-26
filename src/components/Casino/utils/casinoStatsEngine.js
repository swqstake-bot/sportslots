import { convertMinorToUsdMajor, netMinor } from './monetaryContract'

export function createEmptyCasinoAggregate() {
  return {
    spins: 0,
    totalWageredUsdMajor: 0,
    totalWonUsdMajor: 0,
    winCount: 0,
    lossCount: 0,
    breakEvenCount: 0,
    fxMissingCount: 0,
    fxValuatedCount: 0,
    biggestWinUsdMajor: 0,
    biggestMultiplier: 0,
    multiOver100xCount: 0,
    multiOver100xSum: 0,
    lastBalance: null,
    lastCurrency: null,
    lastEntryKey: null,
  }
}

function toEntryKey(entry) {
  if (!entry || typeof entry !== 'object') return ''
  if (entry.roundId != null && String(entry.roundId).trim()) return `round:${String(entry.roundId)}`
  if (entry.id != null && String(entry.id).trim()) return `id:${String(entry.id)}`
  const ts = Number(entry.addedAt ?? 0)
  const slot = String(entry.slotSlug || '')
  return `ts:${Number.isFinite(ts) ? ts : 0}:${slot}`
}

const BET_SOURCE_PRIORITY = {
  housebets: 4,
  mybetupdated: 4,
  http_fallback: 2,
  placebet: 1,
}

function betEntrySourceRank(entry) {
  const src = String(entry?.source || '').toLowerCase()
  let rank = BET_SOURCE_PRIORITY[src] ?? 0
  if (entry?.houseBetReconciled) rank += 2
  return rank
}

function betEntrySpinSignature(entry) {
  const curr = String(entry?.currencyCode || 'usd').toLowerCase()
  const bet = Number(entry?.betAmount) || 0
  const win = Number(entry?.isBonus && entry?.stoppedBonus ? 0 : entry?.winAmount) || 0
  return `${curr}|${bet}|${win}|${entry?.isBonus ? 1 : 0}`
}

/** Dedup für KPI-Aggregation: roundId bevorzugt, sonst Signatur-Fenster (placeBet + houseBets). */
export function dedupeBetHistoryForAggregate(entries) {
  const list = Array.isArray(entries) ? entries : []
  const result = []
  const roundIndex = new Map()
  /** placeBet→house echo window — keep real consecutive same-stake losses apart. */
  const SIG_WINDOW_MS = 2500

  for (const entry of list) {
    const rid = entry?.roundId != null ? String(entry.roundId).trim() : ''
    const sig = betEntrySpinSignature(entry)
    const ts = Number(entry?.addedAt) || 0
    const entrySource = String(entry?.source || '').toLowerCase()

    let sigDupIdx = -1
    for (let i = result.length - 1; i >= 0; i--) {
      const row = result[i]
      if (ts - (Number(row?.addedAt) || 0) > SIG_WINDOW_MS) break
      if (betEntrySpinSignature(row) !== sig) continue
      const rowSource = String(row?.source || '').toLowerCase()
      // Never collapse two placeBets (consecutive same-stake losses).
      if (entrySource === 'placebet' && rowSource === 'placebet') continue
      sigDupIdx = i
      break
    }
    if (sigDupIdx >= 0) {
      if (betEntrySourceRank(entry) >= betEntrySourceRank(result[sigDupIdx])) {
        const prevRid = result[sigDupIdx]?.roundId != null ? String(result[sigDupIdx].roundId).trim() : ''
        result[sigDupIdx] = entry
        if (prevRid) roundIndex.delete(prevRid)
        if (rid) roundIndex.set(rid, sigDupIdx)
      }
      continue
    }

    if (rid) {
      const existingIdx = roundIndex.get(rid)
      if (existingIdx != null) {
        if (betEntrySourceRank(entry) >= betEntrySourceRank(result[existingIdx])) {
          result[existingIdx] = entry
        }
        continue
      }
      roundIndex.set(rid, result.length)
    }
    result.push(entry)
  }
  return result
}

function resolveUsdMajor(minorAmount, currencyCode, rates, snapshotMajor) {
  if (snapshotMajor != null && Number.isFinite(Number(snapshotMajor))) {
    return Number(snapshotMajor)
  }
  const conv = convertMinorToUsdMajor(minorAmount, currencyCode, rates || {})
  const usd = Number(conv?.usd)
  return Number.isFinite(usd) ? usd : null
}

function resolveLiveUsdMajor(minorAmount, currencyCode, rates) {
  const conv = convertMinorToUsdMajor(minorAmount, currencyCode, rates || {})
  const usd = Number(conv?.usd)
  return Number.isFinite(usd) ? usd : null
}

export function applyCasinoSpinToAggregate(prev, entry, rates = {}) {
  const next = { ...(prev || createEmptyCasinoAggregate()) }
  const betMinor = Number(entry?.betAmount) || 0
  const isStoppedBonus = !!entry?.stoppedBonus
  const winMinorRaw = Number(entry?.winAmount) || 0
  const winMinor = isStoppedBonus ? 0 : winMinorRaw
  const currencyCode = String(entry?.currencyCode || 'usd').toLowerCase()
  const betUsd = resolveUsdMajor(betMinor, currencyCode, rates, entry?.betUsdSnapshotMajor)
  // Stop-on-bonus: nie Win-USD aus altem Snapshot zählen (Trigger-Spin raw win).
  const winUsd = isStoppedBonus
    ? 0
    : resolveUsdMajor(winMinor, currencyCode, rates, entry?.winUsdSnapshotMajor)

  next.spins += 1

  const hasBetUsd = typeof betUsd === 'number' && Number.isFinite(betUsd)
  const hasWinUsd = typeof winUsd === 'number' && Number.isFinite(winUsd)
  if (hasBetUsd && hasWinUsd) {
    next.totalWageredUsdMajor += betUsd
    next.totalWonUsdMajor += winUsd
    if (winUsd > next.biggestWinUsdMajor) next.biggestWinUsdMajor = winUsd
    next.fxValuatedCount += 1
  } else if (betMinor > 0 || winMinor > 0) {
    next.fxMissingCount += 1
  }

  const spinNetMinor = netMinor(winMinor, betMinor)
  if (spinNetMinor > 0) next.winCount += 1
  else if (spinNetMinor < 0) next.lossCount += 1
  else next.breakEvenCount += 1

  if (betMinor > 0 && winMinor > 0) {
    const m = winMinor / betMinor
    if (m > next.biggestMultiplier) next.biggestMultiplier = m
    if (m >= 100) {
      next.multiOver100xCount += 1
      next.multiOver100xSum += m
    }
  }

  if (entry?.balance != null) next.lastBalance = entry.balance
  if (entry?.currencyCode) next.lastCurrency = entry.currencyCode
  next.lastEntryKey = toEntryKey(entry)
  return next
}

export function recomputeCasinoAggregate(entries, rates = {}) {
  const list = dedupeBetHistoryForAggregate(Array.isArray(entries) ? entries : [])
  let agg = createEmptyCasinoAggregate()
  for (const entry of list) {
    agg = applyCasinoSpinToAggregate(agg, entry, rates)
  }
  return agg
}

export function aggregateToStatsSnapshot(agg, balanceView = {}) {
  const a = agg || createEmptyCasinoAggregate()
  const currentBalanceRaw =
    balanceView?.balanceFromPlaceBet ?? a.lastBalance ?? balanceView?.wsBalance ?? null
  // Session target only — never last spin currency (ARS↔SOL flicker on live balance FX).
  const balanceCurrency = String(balanceView?.effectiveTarget || a.lastCurrency || 'usd').toLowerCase()
  const currentBalanceUsd = currentBalanceRaw != null
    ? resolveLiveUsdMajor(currentBalanceRaw, balanceCurrency, balanceView?.rates || {})
    : null
  const sessionStartBalanceUsd = balanceView?.sessionStartBalance != null
    ? resolveLiveUsdMajor(balanceView.sessionStartBalance, balanceCurrency, balanceView?.rates || {})
    : null
  return {
    spins: a.spins,
    totalWagered: Math.round(a.totalWageredUsdMajor * 100),
    totalWon: Math.round(a.totalWonUsdMajor * 100),
    winCount: a.winCount,
    lossCount: a.lossCount,
    breakEvenCount: a.breakEvenCount,
    fxMissingCount: a.fxMissingCount,
    fxValuatedCount: a.fxValuatedCount,
    biggestWin: Math.round(a.biggestWinUsdMajor * 100),
    biggestMultiplier: a.biggestMultiplier,
    multiOver100xCount: a.multiOver100xCount,
    multiOver100xSum: a.multiOver100xSum,
    currentBalance: currentBalanceUsd != null ? Math.round(currentBalanceUsd * 100) : null,
    sessionStartBalance: sessionStartBalanceUsd != null ? Math.round(sessionStartBalanceUsd * 100) : null,
    currentBalanceRaw,
    currentBalanceCurrency: 'usd',
  }
}

export function buildUsdSpinDelta(betMinor, winMinor, currencyCode, rates = {}) {
  const c = String(currencyCode || 'usd').toLowerCase()
  const betConv = convertMinorToUsdMajor(betMinor, c, rates || {})
  const winConv = convertMinorToUsdMajor(winMinor ?? 0, c, rates || {})
  const betUsd = Number(betConv?.usd)
  const payoutUsd = Number(winConv?.usd)
  if (!Number.isFinite(betUsd) || !Number.isFinite(payoutUsd)) return null
  return {
    wagered: betUsd,
    payout: Math.max(0, payoutUsd),
    profit: payoutUsd - betUsd,
  }
}

export function entryStableKey(entry) {
  return toEntryKey(entry)
}
