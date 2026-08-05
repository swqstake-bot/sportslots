import {
  recomputeCasinoAggregate,
  entryStableKey,
} from '../utils/casinoStatsEngine'

function buildRatesSig(rates) {
  return JSON.stringify(
    Object.keys(rates || {})
      .sort()
      .map((k) => [k, Number(rates?.[k]) || 0])
  )
}

/** Content fingerprint — in-place house reconcile changes wins without length change. */
function buildHistorySig(betHistory) {
  let out = ''
  for (let i = 0; i < betHistory.length; i += 1) {
    const e = betHistory[i]
    out += `${entryStableKey(e)}:${Number(e?.betAmount) || 0}:${Number(e?.winAmount) || 0}:${e?.houseBetReconciled ? 1 : 0};`
  }
  return out
}

self.onmessage = (event) => {
  const payload = event?.data || {}
  const reqId = Number(payload?.reqId) || 0
  const betHistory = Array.isArray(payload?.betHistory) ? payload.betHistory : []
  const currencyRates = payload?.currencyRates && typeof payload.currencyRates === 'object' ? payload.currencyRates : {}
  try {
    // Always full recompute: placeBet→house patches mid-list; incremental append missed those
    // and briefly showed doubled wins when FIFO painted onto the wrong pending row.
    const agg = recomputeCasinoAggregate(betHistory, currencyRates)
    self.postMessage({
      reqId,
      ok: true,
      agg,
      _meta: {
        count: betHistory.length,
        ratesSig: buildRatesSig(currencyRates),
        historySig: buildHistorySig(betHistory),
      },
    })
  } catch {
    self.postMessage({
      reqId,
      ok: true,
      agg: recomputeCasinoAggregate(betHistory, currencyRates),
    })
  }
}
