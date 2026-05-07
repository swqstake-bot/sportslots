import {
  createEmptyCasinoAggregate,
  applyCasinoSpinToAggregate,
  recomputeCasinoAggregate,
  entryStableKey,
} from '../utils/casinoStatsEngine'

let cachedAgg = createEmptyCasinoAggregate()
let cachedCount = 0
let cachedLastKey = ''
let cachedRatesSig = ''

function buildRatesSig(rates) {
  return JSON.stringify(
    Object.keys(rates || {})
      .sort()
      .map((k) => [k, Number(rates?.[k]) || 0])
  )
}

self.onmessage = (event) => {
  const payload = event?.data || {}
  const reqId = Number(payload?.reqId) || 0
  const betHistory = Array.isArray(payload?.betHistory) ? payload.betHistory : []
  const currencyRates = payload?.currencyRates && typeof payload.currencyRates === 'object' ? payload.currencyRates : {}
  try {
    const nextRatesSig = buildRatesSig(currencyRates)
    const ratesChanged = nextRatesSig !== cachedRatesSig
    const canAppend = !ratesChanged && betHistory.length >= cachedCount
    const prevKeyExpected = cachedCount > 0 ? entryStableKey(betHistory[cachedCount - 1]) : ''
    const orderStable = cachedCount === 0 || prevKeyExpected === cachedLastKey

    if (!canAppend || !orderStable) {
      cachedAgg = recomputeCasinoAggregate(betHistory, currencyRates)
    } else if (betHistory.length > cachedCount) {
      let nextAgg = cachedAgg
      for (let i = cachedCount; i < betHistory.length; i += 1) {
        nextAgg = applyCasinoSpinToAggregate(nextAgg, betHistory[i], currencyRates)
      }
      cachedAgg = nextAgg
    }

    cachedCount = betHistory.length
    cachedLastKey = betHistory.length ? entryStableKey(betHistory[betHistory.length - 1]) : ''
    cachedRatesSig = nextRatesSig
    self.postMessage({ reqId, ok: true, agg: cachedAgg })
  } catch {
    cachedAgg = recomputeCasinoAggregate(betHistory, currencyRates)
    cachedCount = betHistory.length
    cachedLastKey = betHistory.length ? entryStableKey(betHistory[betHistory.length - 1]) : ''
    cachedRatesSig = buildRatesSig(currencyRates)
    self.postMessage({ reqId, ok: true, agg: cachedAgg })
  }
}
