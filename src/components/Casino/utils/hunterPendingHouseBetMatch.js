import { hunterBetCurrenciesMatch } from './currencyMeta'
import { normalizeBetSlugForHouseMatch, houseBetSlugMatchesSessionSlug } from './slotSlugMatching'

/** Pending-Einträge älter: aus Queue entfernen (sonst wächst sie endlos, Matching wird langsam). */
export const PENDING_HOUSEBET_MAX_AGE_MS = 35000
/** houseBets oft vor HTTP-Response — bis Pending mit Multi da ist, Events kurz puffern. */
export const HOUSEBET_RETRY_BUFFER_MAX_MS = 25000
export const HOUSEBET_RETRY_BUFFER_MAX = 40

export function normalizeHunterMultiByProvider(rawMulti, providerId) {
  const m = Number(rawMulti)
  if (!Number.isFinite(m) || m <= 0) return 0
  const pid = String(providerId || '').toLowerCase()
  if (pid === 'mascot' || pid === 'hub88') {
    return m / 1000
  }
  return m
}

export function prunePendingHouseBetMap(pendingMap, now) {
  if (!pendingMap || typeof pendingMap !== 'object') return
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q)) {
      delete pendingMap[runId]
      continue
    }
    while (q.length > 0 && now - q[0].at > PENDING_HOUSEBET_MAX_AGE_MS) {
      q.shift()
    }
    if (q.length === 0) delete pendingMap[runId]
  }
}

export function houseBetStakeMajorMatchesPending(pendingMajor, bItem) {
  const hb = Number(bItem?.amountMajor ?? bItem?.amount)
  const p = Number(pendingMajor)
  if (!Number.isFinite(hb) || hb <= 0) return false
  if (!Number.isFinite(p) || p <= 0) return false
  const rel = Math.abs(p - hb) / Math.max(hb, p, 1e-12)
  return rel <= 0.03 || Math.abs(p - hb) <= 1e-9
}

export function houseBetPayoutMultiplierMatchesPending(pendingMulti, bItem) {
  const hm = Number(bItem?.payoutMultiplier)
  const pm = Number(pendingMulti)
  if (!Number.isFinite(pm) || pm < 0) return false
  if (!Number.isFinite(hm) || hm < 0) return false
  if (hm < 1e-8 && pm < 1e-8) return true
  const rel = Math.abs(pm - hm) / Math.max(pm, hm, 1e-9)
  return rel <= 0.05 || Math.abs(pm - hm) <= 0.1
}

export function collectPendingHouseBetCandidates(pendingMap, payloadSlug, payloadCurr, currencyStrict) {
  const out = []
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q)) continue
    for (let i = 0; i < q.length; i++) {
      const p = q[i]
      if (p == null || p.multi == null) continue
      if (!houseBetSlugMatchesSessionSlug(payloadSlug, p.slug)) continue
      if (currencyStrict) {
        if (!payloadCurr || !hunterBetCurrenciesMatch(p.currency, payloadCurr)) {
          continue
        }
      }
      out.push({ runId, idx: i, p, at: Number(p.at) || 0 })
    }
  }
  return out
}

function pickOldestPendingEntry(entries) {
  if (!entries.length) return null
  return entries.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at
    return String(a.runId).localeCompare(String(b.runId))
  })[0]
}

function houseBetReceivedMs(bItem) {
  const t = Date.parse(String(bItem?.receivedAt || ''))
  return Number.isFinite(t) ? t : null
}

function pickPendingClosestToHouseBetTime(entries, bItem) {
  if (!entries.length) return null
  if (entries.length === 1) return entries[0]
  const evtMs = houseBetReceivedMs(bItem)
  if (evtMs == null) return pickOldestPendingEntry(entries)
  let best = entries[0]
  let bestDist = Math.abs((best.at || 0) - evtMs)
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i]
    const d = Math.abs((e.at || 0) - evtMs)
    if (d < bestDist) {
      best = e
      bestDist = d
    } else if (d === bestDist) {
      if (e.at < best.at || (e.at === best.at && String(e.runId) < String(best.runId))) best = e
    }
  }
  return best
}

function trySpliceSinglePendingHouseBet(pendingMap, payloadSlug, payloadCurr, bItem, currencyStrict) {
  const candidates = collectPendingHouseBetCandidates(
    pendingMap,
    payloadSlug,
    payloadCurr,
    currencyStrict
  )
  if (candidates.length !== 1) return null
  const chosen = candidates[0]
  if (!houseBetStakeMajorMatchesPending(chosen.p.betAmountMajor, bItem)) return null
  const q = pendingMap[chosen.runId]
  if (!Array.isArray(q) || chosen.idx < 0 || chosen.idx >= q.length) return null
  const [removed] = q.splice(chosen.idx, 1)
  if (q.length === 0) delete pendingMap[chosen.runId]
  return removed
}

function selectPendingEntryForHouseBet(candidates, bItem) {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  const hbMult = Number(bItem?.payoutMultiplier)
  const hasHbMult = Number.isFinite(hbMult) && hbMult >= 0

  const byAmount = candidates.filter(({ p }) => houseBetStakeMajorMatchesPending(p.betAmountMajor, bItem))

  if (byAmount.length === 1) return byAmount[0]

  if (byAmount.length > 1 && hasHbMult) {
    const byAmtMult = byAmount.filter(({ p }) => houseBetPayoutMultiplierMatchesPending(p.multi, bItem))
    if (byAmtMult.length === 1) return byAmtMult[0]
    if (byAmtMult.length > 1) return pickPendingClosestToHouseBetTime(byAmtMult, bItem)
    const scored = byAmount
      .map((c) => ({ c, dist: Math.abs(Number(c.p.multi) - hbMult) }))
      .sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist
        if (a.c.at !== b.c.at) return a.c.at - b.c.at
        return String(a.c.runId).localeCompare(String(b.c.runId))
      })
    return scored[0].c
  }

  if (byAmount.length > 1 && !hasHbMult) {
    return pickOldestPendingEntry(byAmount)
  }

  if (byAmount.length === 0) {
    if (hasHbMult) {
      const byMult = candidates.filter(({ p }) => houseBetPayoutMultiplierMatchesPending(p.multi, bItem))
      if (byMult.length === 1) return byMult[0]
      if (byMult.length > 1) return pickPendingClosestToHouseBetTime(byMult, bItem)
    }
  }

  if (hasHbMult && hbMult >= 15 && candidates.length > 0) {
    const scored = candidates
      .map((c) => ({ c, dist: Math.abs(Number(c.p.multi) - hbMult) }))
      .sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist
        if (a.c.at !== b.c.at) return a.c.at - b.c.at
        return String(a.c.runId).localeCompare(String(b.c.runId))
      })
    const best = scored[0]
    const rel = best.dist / Math.max(hbMult, 1e-9)
    if (rel <= 0.04 || best.dist <= 0.5) return best.c
  }

  return null
}

function pickPendingWhenAmbiguous(candidates, bItem) {
  if (!candidates.length) return null
  const byAmount = candidates.filter(({ p }) => houseBetStakeMajorMatchesPending(p.betAmountMajor, bItem))
  if (byAmount.length === 1) return byAmount[0]
  if (byAmount.length > 1) return pickOldestPendingEntry(byAmount)
  return pickOldestPendingEntry(candidates)
}

export function splicePendingHouseBetMatch(pendingMap, payloadSlug, payloadCurr, bItem) {
  if (!pendingMap || typeof pendingMap !== 'object' || bItem == null) return null
  const trySplice = (currencyStrict) => {
    const fast = trySpliceSinglePendingHouseBet(
      pendingMap,
      payloadSlug,
      payloadCurr,
      bItem,
      currencyStrict
    )
    if (fast) return fast
    const candidates = collectPendingHouseBetCandidates(pendingMap, payloadSlug, payloadCurr, currencyStrict)
    const chosen = selectPendingEntryForHouseBet(candidates, bItem) ?? pickPendingWhenAmbiguous(candidates, bItem)
    if (!chosen) return null
    const q = pendingMap[chosen.runId]
    if (!Array.isArray(q) || chosen.idx < 0 || chosen.idx >= q.length) return null
    const [removed] = q.splice(chosen.idx, 1)
    if (q.length === 0) delete pendingMap[chosen.runId]
    return removed
  }
  if (payloadCurr) {
    const strict = trySplice(true)
    if (strict) return strict
    return trySplice(false)
  }
  return trySplice(false)
}

export function splicePendingHouseBetByProviderBetId(pendingMap, payloadSlug, providerBetId) {
  const wanted = String(providerBetId || '').trim()
  if (!wanted || !pendingMap || typeof pendingMap !== 'object') return null
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q) || q.length === 0) continue
    for (let i = 0; i < q.length; i++) {
      const p = q[i]
      const pBetId = String(p?.providerBetId || '').trim()
      if (!pBetId || pBetId !== wanted) continue
      const pSlug = String(p?.slug || '').trim()
      if (payloadSlug && pSlug && !houseBetSlugMatchesSessionSlug(payloadSlug, pSlug)) continue
      const [removed] = q.splice(i, 1)
      if (q.length === 0) delete pendingMap[runId]
      return removed
    }
  }
  return null
}

export function splicePendingHouseBetMatchWithoutSlug(pendingMap, payloadCurr, bItem) {
  if (!pendingMap || typeof pendingMap !== 'object' || bItem == null) return null
  const trySplice = (currencyStrict) => {
    const sluglessCandidates = []
    for (const runId of Object.keys(pendingMap)) {
      const q = pendingMap[runId]
      if (!Array.isArray(q)) continue
      for (let i = 0; i < q.length; i++) {
        const p = q[i]
        if (p == null || p.multi == null) continue
        if (currencyStrict) {
          if (!payloadCurr || !hunterBetCurrenciesMatch(p.currency, payloadCurr)) {
            continue
          }
        }
        sluglessCandidates.push({ runId, idx: i, p, at: Number(p.at) || 0 })
      }
    }
    if (sluglessCandidates.length === 1) {
      const chosen = sluglessCandidates[0]
      if (houseBetStakeMajorMatchesPending(chosen.p.betAmountMajor, bItem)) {
        const q = pendingMap[chosen.runId]
        if (Array.isArray(q) && chosen.idx >= 0 && chosen.idx < q.length) {
          const [removed] = q.splice(chosen.idx, 1)
          if (q.length === 0) delete pendingMap[chosen.runId]
          return removed
        }
      }
    }
    const candidates = []
    for (const runId of Object.keys(pendingMap)) {
      const q = pendingMap[runId]
      if (!Array.isArray(q)) continue
      for (let i = 0; i < q.length; i++) {
        const p = q[i]
        if (p == null || p.multi == null) continue
        if (currencyStrict) {
          if (!payloadCurr || !hunterBetCurrenciesMatch(p.currency, payloadCurr)) {
            continue
          }
        }
        candidates.push({ runId, idx: i, p, at: Number(p.at) || 0 })
      }
    }
    const chosen = selectPendingEntryForHouseBet(candidates, bItem) ?? pickPendingWhenAmbiguous(candidates, bItem)
    if (!chosen) return null
    const q = pendingMap[chosen.runId]
    if (!Array.isArray(q) || chosen.idx < 0 || chosen.idx >= q.length) return null
    const [removed] = q.splice(chosen.idx, 1)
    if (q.length === 0) delete pendingMap[chosen.runId]
    return removed
  }
  if (payloadCurr) {
    const strict = trySplice(true)
    if (strict) return strict
    return trySplice(false)
  }
  return trySplice(false)
}

export function trimPendingQueues(pendingMap, maxPerRun) {
  const cap = maxPerRun ?? 80
  if (!pendingMap || typeof pendingMap !== 'object') return
  for (const runId of Object.keys(pendingMap)) {
    const q = pendingMap[runId]
    if (!Array.isArray(q)) continue
    while (q.length > cap) q.shift()
    if (q.length === 0) delete pendingMap[runId]
  }
}

export function hasPendingHouseBetForPayloadSlug(pendingMap, payloadSlug) {
  if (payloadSlug == null || String(payloadSlug).trim() === '') return false
  if (!pendingMap || typeof pendingMap !== 'object') return false
  const ps = String(payloadSlug).toLowerCase()
  for (const rid of Object.keys(pendingMap)) {
    const q = pendingMap[rid]
    if (!Array.isArray(q)) continue
    for (const p of q) {
      const s = normalizeBetSlugForHouseMatch(p?.slug)
      if (s && houseBetSlugMatchesSessionSlug(ps, s)) return true
    }
  }
  return false
}

/** Race: WebSocket houseBet vor placeBet-HTTP — passende Events wieder in die Queue. */
export function flushHouseBetRetryBufferForSlug(retryBufRef, queueRef, slugNorm, scheduleFn) {
  const buf = retryBufRef.current
  if (!buf.length) return
  const keep = []
  let pushed = 0
  for (const entry of buf) {
    const ps = normalizeBetSlugForHouseMatch(entry.bItem?.gameSlug)
    if (houseBetSlugMatchesSessionSlug(ps, slugNorm)) {
      queueRef.current.push(entry.bItem)
      pushed++
    } else {
      keep.push(entry)
    }
  }
  retryBufRef.current = keep
  if (pushed) scheduleFn?.()
}
