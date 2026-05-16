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

function resolveUsdMajor(minorAmount, currencyCode, rates, snapshotMajor) {
  if (snapshotMajor != null && Number.isFinite(Number(snapshotMajor))) {
    return Number(snapshotMajor)
  }
  return null
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
  const winUsd = resolveUsdMajor(winMinor, currencyCode, rates, entry?.winUsdSnapshotMajor)

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
  const list = Array.isArray(entries) ? entries : []
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
  const currentBalanceCurrency = a.lastCurrency || balanceView?.effectiveTarget || 'usd'
  const currentBalanceUsd = currentBalanceRaw != null
    ? resolveLiveUsdMajor(currentBalanceRaw, currentBalanceCurrency, balanceView?.rates || {})
    : null
  const sessionStartBalanceUsd = balanceView?.sessionStartBalance != null
    ? resolveLiveUsdMajor(balanceView.sessionStartBalance, balanceView?.effectiveTarget || 'usd', balanceView?.rates || {})
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
    currentBalanceCurrency,
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
