import { buildUsdSpinDelta } from '../utils/casinoStatsEngine'

let totals = { wagered: 0, payout: 0, profit: 0, bestMulti: 0 }

function postState(reqId) {
  self.postMessage({ reqId, ok: true, totals })
}

self.onmessage = (event) => {
  const payload = event?.data || {}
  const reqId = Number(payload?.reqId) || 0
  const type = String(payload?.type || '').toLowerCase()
  if (type === 'reset') {
    totals = { wagered: 0, payout: 0, profit: 0, bestMulti: 0 }
    postState(reqId)
    return
  }
  if (type !== 'spin') {
    postState(reqId)
    return
  }
  try {
    const betMinor = Number(payload?.betMinor) || 0
    const winMinor = Number(payload?.winMinor) || 0
    const currency = String(payload?.currencyCode || 'usd')
    const rates = payload?.rates && typeof payload.rates === 'object' ? payload.rates : {}
    const delta = buildUsdSpinDelta(betMinor, winMinor, currency, rates) || { wagered: 0, payout: 0, profit: 0 }
    const spinBestMulti = Number(payload?.multiplier)
    const bestMulti = Number.isFinite(spinBestMulti) && spinBestMulti > totals.bestMulti ? spinBestMulti : totals.bestMulti
    totals = {
      wagered: totals.wagered + delta.wagered,
      payout: totals.payout + delta.payout,
      profit: totals.profit + delta.profit,
      bestMulti,
    }
    postState(reqId)
  } catch {
    self.postMessage({ reqId, ok: false })
  }
}
